import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { canonical, downloadJson, jsonSafe, verifyReceipt, type Receipt, type Verification } from "../lib/receipts";
import { config } from "../lib/config";
import { shortAddr } from "../lib/format";
import { CopyButton, Icon, Sheet, Spinner } from "./ui";

/** Flip one bit of the first character of the function name to show tamper detection. */
function mutate(r: Receipt): Receipt {
  const fn = r.receipt.function;
  const flipped = String.fromCharCode(fn.charCodeAt(0) ^ 1) + fn.slice(1);
  return { ...r, receipt: { ...r.receipt, function: flipped } };
}

export function ReceiptModal() {
  const { receipt, openReceipt } = useApp();
  const [mode, setMode] = useState<"pretty" | "min">("pretty");
  const [tamper, setTamper] = useState(false);
  const [v, setV] = useState<Verification | null>(null);
  const [running, setRunning] = useState(false);
  const [runs, setRuns] = useState(0);

  const subject = useMemo(() => (receipt ? (tamper ? mutate(receipt) : receipt) : null), [receipt, tamper]);

  useEffect(() => {
    if (!subject) return;
    let off = false;
    setRunning(true);
    verifyReceipt(subject, { checkChain: true }).then((res) => {
      if (!off) {
        setV(res);
        setRunning(false);
      }
    });
    return () => {
      off = true;
    };
  }, [subject, runs]);

  useEffect(() => {
    if (!receipt) {
      setTamper(false);
      setMode("pretty");
      setV(null);
    }
  }, [receipt]);

  if (!receipt || !subject) return null;
  const body = mode === "pretty" ? JSON.stringify(jsonSafe(subject), null, 2) : canonical(subject.receipt);
  const r = subject.receipt;
  const allGood = v && v.digestMatches && v.signaturesValid && v.txHashMatches && v.anchor?.status === "anchored";

  return (
    <Sheet
      open
      wide
      onClose={() => openReceipt(null)}
      title={
        <span className="flex items-center gap-2">
          <Icon name="receipt_long" className="text-cobalt" /> JSON Audit Receipt
        </span>
      }
      eyebrow={
        <>
          <span className="chip-accent">AUDIT RECEIPT</span>
          <span className="chip">RFC-8785 JCS</span>
          <span className="chip">SHA-256</span>
        </>
      }
    >
      <p className="-mt-1 mb-4 text-sm text-lead">
        Self-authenticating record of <span className="font-mono text-ink-2">{r.function}</span> on Stellar {r.network}. Anyone can
        re-derive the digest, check the Ed25519 signature, and confirm the ledger anchor.
      </p>

      <div className="mb-4 grid gap-2 text-xs sm:grid-cols-3">
        <div className="rounded-sm border border-line bg-vellum p-2">
          <div className="label">Ledger</div>
          <div className="font-mono text-ink">#{r.ledger}</div>
        </div>
        <div className="rounded-sm border border-line bg-vellum p-2">
          <div className="label">Closed</div>
          <div className="font-mono text-ink">{r.ledger_close_time.replace("T", " ").replace(".000Z", "Z")}</div>
        </div>
        <div className="rounded-sm border border-line bg-vellum p-2">
          <div className="label">SHA-256</div>
          <div className="truncate font-mono text-cobalt">{receipt.digest.value.slice(0, 10)}…{receipt.digest.value.slice(-6)}</div>
        </div>
      </div>

      {/* Code viewer */}
      <div className="mb-4 overflow-hidden rounded-md border border-ink/80">
        <div className="flex items-center justify-between gap-2 bg-ink px-3 py-2">
          <div className="flex rounded-sm border border-white/15 p-0.5">
            {(["pretty", "min"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-xs px-2.5 py-1 font-mono text-[11px] ${mode === m ? "bg-cobalt text-white" : "text-white/60 hover:text-white"}`}
              >
                {m === "pretty" ? "Pretty" : "Minified (RFC-8785)"}
              </button>
            ))}
          </div>
          <span className="hidden font-mono text-[10px] text-white/50 sm:block">
            {v ? `${v.canonicalBytes} B canonical · ${Math.round((1 - v.canonicalBytes / v.prettyBytes) * 100)}% smaller` : ""}
          </span>
        </div>
        <pre
          className={`max-h-72 overflow-auto bg-[#0b1220] p-3 font-mono text-[11px] leading-relaxed text-[#c9d6ea] ${
            mode === "min" ? "break-all whitespace-pre-wrap" : ""
          }`}
        >
          {body}
        </pre>
      </div>

      {/* Verifier */}
      <div className="panel mb-4">
        <div className="panel-head">
          <div>
            <div className="font-mono text-xs font-semibold uppercase tracking-wide text-ink">Client-side checksum verifier</div>
            <div className="font-mono text-[10px] text-lead">WebCrypto SubtleCrypto SHA-256 · Ed25519</div>
          </div>
          <div className="flex items-center gap-2">
            {v && <span className="chip">{v.elapsedMs.toFixed(2)} ms</span>}
            <button className="btn-secondary px-2 py-1 text-xs" onClick={() => setRuns((n) => n + 1)} disabled={running}>
              {running ? <Spinner className="size-3" /> : <Icon name="refresh" className="!text-[16px]" />} Re-compute
            </button>
          </div>
        </div>
        <div className="space-y-3 p-4">
          {v && (
            <div
              className={`flex items-center justify-between rounded-sm border px-3 py-2 font-mono text-xs font-semibold ${
                v.digestMatches ? "border-ok/30 bg-ok-bg text-ok" : "border-err/30 bg-err-bg text-err"
              }`}
            >
              <span className="flex items-center gap-2">
                <Icon name={v.digestMatches ? "check_circle" : "gpp_bad"} fill />
                {v.digestMatches ? "DIGEST MATCHES RECEIPT" : "DIGEST MISMATCH — RECEIPT ALTERED"}
              </span>
              <span>{v.bitDiff}-BIT DIFF</span>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-sm border border-line p-2">
              <div className="label mb-1">Stated digest</div>
              <div className="break-all font-mono text-[11px] text-ink-2">{receipt.digest.value}</div>
            </div>
            <div className="rounded-sm border border-line p-2">
              <div className="label mb-1">Computed RFC-8785 digest</div>
              <div className={`break-all font-mono text-[11px] ${v?.digestMatches ? "text-ok" : "text-err"}`}>{v?.computedDigest ?? "…"}</div>
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-sm border border-dashed border-line px-3 py-2">
            <span className="text-sm text-ink-2">
              Simulate 1-bit payload mutation
              <span className="block font-mono text-[10px] text-lead">flips one bit in "function" to demonstrate tamper detection</span>
            </span>
            <input type="checkbox" className="size-4 accent-cobalt" checked={tamper} onChange={(e) => setTamper(e.target.checked)} />
          </label>
        </div>
      </div>

      {/* Badges */}
      <div className="label mb-2 flex items-center gap-1.5">
        <Icon name="shield" className="!text-[16px]" /> Deterministic verification badges
      </div>
      <div className="mb-4 space-y-2">
        <Badge
          icon="data_object"
          title="Canonical JSON formatted"
          sub="RFC 8785 JCS deterministic spec"
          state={v ? (v.digestMatches ? "PASSED" : "FAILED") : null}
        />
        <Badge
          icon="key"
          title="Ed25519 signature"
          sub={v?.signatures[0] ? `Signer ${shortAddr(v.signatures[0].signer, 6, 6)} over tx hash` : "Envelope signature over network-bound tx hash"}
          state={v ? (v.signaturesValid && v.txHashMatches ? "VALID" : "INVALID") : null}
        />
        <Badge
          icon="account_balance"
          title="Ledger anchor"
          sub={v?.anchor?.ledger ? `Horizon: tx in ledger #${v.anchor.ledger}` : "Horizon transaction lookup"}
          state={
            !v?.anchor ? null : v.anchor.status === "anchored" ? "SYNCED" : v.anchor.status === "error" ? "OFFLINE" : v.anchor.status === "not_found" ? "NOT FOUND" : "MISMATCH"
          }
        />
      </div>

      {allGood !== undefined && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary col-span-2" onClick={() => downloadJson(`receipt-${r.tx_hash.slice(0, 12)}.json`, receipt)}>
            <Icon name="download" /> Download receipt.json
          </button>
          <CopyButton value={JSON.stringify(receipt, null, 2)} label="Copy JSON" className="!py-2 !text-sm" />
          <a className="btn-secondary" target="_blank" rel="noreferrer" href={`${config.explorer}/tx/${r.tx_hash}`}>
            <Icon name="open_in_new" /> View on explorer
          </a>
        </div>
      )}
      <p className="mt-3 flex gap-2 text-xs text-lead">
        <Icon name="info" className="!text-[16px]" />
        Verify offline: canonicalize <code className="font-mono">receipt</code> with any RFC-8785 library, SHA-256 it, and compare to{" "}
        <code className="font-mono">digest.value</code>.
      </p>
    </Sheet>
  );
}

function Badge({ icon, title, sub, state }: { icon: string; title: string; sub: string; state: string | null }) {
  const good = state && ["PASSED", "VALID", "SYNCED"].includes(state);
  const neutral = state === "OFFLINE";
  return (
    <div className="flex items-center gap-3 rounded-sm border border-line p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-vellum">
        <Icon name={icon} className="text-cobalt" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-ink">{title}</div>
        <div className="truncate font-mono text-[11px] text-lead">{sub}</div>
      </div>
      {state === null ? <Spinner className="text-lead" /> : <span className={good ? "chip-ok" : neutral ? "chip" : "chip-err"}>{state}</span>}
    </div>
  );
}
