/**
 * RFC-8785 (JCS) audit receipts.
 *
 * Every transaction FlowPulse submits produces a receipt. The receipt body is
 * canonicalized with JCS, hashed with SHA-256 (WebCrypto), and carries the
 * signed transaction envelope so anyone can independently:
 *   1. recompute the canonical digest,
 *   2. verify the Ed25519 signature(s) over the network-bound tx hash,
 *   3. confirm the tx is anchored on-chain at the stated ledger (Horizon).
 */
import canonicalize from "canonicalize";
import { Keypair, StrKey, TransactionBuilder, type FeeBumpTransaction, type Transaction } from "@stellar/stellar-sdk";
import { config } from "./config";

export const RECEIPT_SCHEMA = "flowpulse.receipt/v1";

export interface ReceiptBody {
  schema: string;
  network: string;
  network_passphrase: string;
  contract_id: string;
  function: string;
  args: Record<string, string | number | boolean | unknown>;
  tx_hash: string;
  ledger: number;
  ledger_close_time: string;
  source: string;
  envelope_xdr: string;
}

export interface Receipt {
  receipt: ReceiptBody;
  digest: { alg: "SHA-256"; canonicalization: "RFC8785"; value: string };
}

/** JSON-safe conversion (bigint → decimal string) before canonicalization. */
export function jsonSafe(v: unknown): unknown {
  if (typeof v === "bigint") return v.toString();
  if (Array.isArray(v)) return v.map(jsonSafe);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, jsonSafe(x)]));
  }
  return v;
}

export function canonical(value: unknown): string {
  const out = canonicalize(jsonSafe(value));
  if (out === undefined) throw new Error("Value cannot be canonicalized");
  return out;
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeReceipt(body: Omit<ReceiptBody, "schema" | "network" | "network_passphrase">): Promise<Receipt> {
  const receipt: ReceiptBody = {
    schema: RECEIPT_SCHEMA,
    network: config.network,
    network_passphrase: config.networkPassphrase,
    ...body,
    args: jsonSafe(body.args) as ReceiptBody["args"],
  };
  return {
    receipt,
    digest: { alg: "SHA-256", canonicalization: "RFC8785", value: await sha256Hex(canonical(receipt)) },
  };
}

// ---------- Verification ----------

export interface SignatureCheck {
  signer: string;
  hint: string;
  valid: boolean;
}

export interface Verification {
  canonicalBytes: number;
  prettyBytes: number;
  computedDigest: string;
  digestMatches: boolean;
  bitDiff: number;
  txHash?: string;
  txHashMatches?: boolean;
  signatures: SignatureCheck[];
  signaturesValid: boolean;
  anchor?: { status: "anchored" | "mismatch" | "not_found" | "error"; ledger?: number; detail?: string };
  elapsedMs: number;
}

function hexBitDiff(a: string, b: string): number {
  if (a.length !== b.length) return a.length * 4;
  let bits = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

export function toHex(u8: Uint8Array): string {
  return Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Verify Ed25519 signatures on an envelope against its source account. */
export function verifyEnvelope(envelopeXdr: string, passphrase: string): { txHash: string; source: string; sigs: SignatureCheck[] } {
  const tx: Transaction | FeeBumpTransaction = TransactionBuilder.fromXDR(envelopeXdr, passphrase);
  const hash = tx.hash();
  const source = "innerTransaction" in tx ? tx.feeSource : (tx as Transaction).source;
  const candidates = [source].filter((s) => StrKey.isValidEd25519PublicKey(s));
  const sigs = tx.signatures.map((d) => {
    const hint = toHex(d.hint.value);
    for (const c of candidates) {
      const kp = Keypair.fromPublicKey(c);
      if (toHex(kp.signatureHint()) === hint) {
        return { signer: c, hint, valid: kp.verify(hash, d.signature) };
      }
    }
    return { signer: "unknown", hint, valid: false };
  });
  return { txHash: toHex(hash), source, sigs };
}

export async function verifyReceipt(r: Receipt, opts: { checkChain?: boolean } = {}): Promise<Verification> {
  const t0 = performance.now();
  const canon = canonical(r.receipt);
  const computed = await sha256Hex(canon);
  const v: Verification = {
    canonicalBytes: new TextEncoder().encode(canon).length,
    prettyBytes: new TextEncoder().encode(JSON.stringify(jsonSafe(r.receipt), null, 2)).length,
    computedDigest: computed,
    digestMatches: computed === r.digest?.value,
    bitDiff: hexBitDiff(computed, r.digest?.value ?? ""),
    signatures: [],
    signaturesValid: false,
    elapsedMs: 0,
  };

  try {
    const env = verifyEnvelope(r.receipt.envelope_xdr, r.receipt.network_passphrase);
    v.txHash = env.txHash;
    v.txHashMatches = env.txHash === r.receipt.tx_hash;
    v.signatures = env.sigs;
    v.signaturesValid = env.sigs.length > 0 && env.sigs.every((s) => s.valid);
  } catch {
    v.signatures = [];
  }
  v.elapsedMs = performance.now() - t0;

  if (opts.checkChain) {
    try {
      const res = await fetch(`${config.horizonUrl}/transactions/${r.receipt.tx_hash}`);
      if (res.status === 404) v.anchor = { status: "not_found" };
      else if (!res.ok) v.anchor = { status: "error", detail: `Horizon ${res.status}` };
      else {
        const j = await res.json();
        const ok = j.successful && j.ledger === r.receipt.ledger && j.envelope_xdr === r.receipt.envelope_xdr;
        v.anchor = { status: ok ? "anchored" : "mismatch", ledger: j.ledger };
      }
    } catch (e) {
      v.anchor = { status: "error", detail: String((e as Error).message) };
    }
  }
  return v;
}

export function parseReceipt(text: string): Receipt {
  const j = JSON.parse(text);
  if (!j?.receipt || !j?.digest?.value) throw new Error("Not a FlowPulse receipt (missing receipt/digest)");
  if (j.receipt.schema !== RECEIPT_SCHEMA) throw new Error(`Unsupported schema ${j.receipt.schema}`);
  return j as Receipt;
}

// ---------- Local receipt book ----------

const KEY = "flowpulse.receipts.v1";

export function loadReceipts(): Receipt[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveReceipt(r: Receipt) {
  try {
    const all = [r, ...loadReceipts().filter((x) => x.receipt.tx_hash !== r.receipt.tx_hash)].slice(0, 200);
    localStorage.setItem(KEY, JSON.stringify(all));
    window.dispatchEvent(new Event("flowpulse:receipts"));
  } catch {
    /* storage unavailable — receipt is still downloadable from the modal */
  }
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
