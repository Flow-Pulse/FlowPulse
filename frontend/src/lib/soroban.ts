import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { config } from "./config";

export const server = new rpc.Server(config.rpcUrl);

/** Retry transient network failures (public testnet RPC can be flaky). */
export async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const msg = String((e as Error)?.message ?? e);
      // Contract errors are deterministic; don't retry them.
      if (/HostError|Error\(Contract/.test(msg)) throw e;
      await new Promise((r) => setTimeout(r, 600 * (i + 1)));
    }
  }
  throw last;
}

// ---------- ScVal helpers ----------

export const sv = {
  addr: (a: string) => new Address(a).toScVal(),
  u64: (n: bigint | number) => nativeToScVal(BigInt(n), { type: "u64" }),
  u32: (n: number) => nativeToScVal(n, { type: "u32" }),
  i128: (n: bigint) => nativeToScVal(n, { type: "i128" }),
  str: (s: string) => nativeToScVal(s, { type: "string" }),
  /** Vec<Split> — struct fields must be sorted by key in the ScMap. */
  splits: (rows: { recipient: string; bps: number; label: string }[]) =>
    xdr.ScVal.scvVec(
      rows.map((r) =>
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("bps"), val: sv.u32(r.bps) }),
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("label"), val: sv.str(r.label) }),
          new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("recipient"), val: sv.addr(r.recipient) }),
        ]),
      ),
    ),
};

// ---------- Simulation ----------

export interface SimReport {
  ok: boolean;
  result?: unknown;
  error?: string;
  minResourceFee?: string;
  instructions?: number;
  readBytes?: number;
  writeBytes?: number;
  footprint?: { readOnly: number; readWrite: number };
  latestLedger?: number;
  authRequired?: number;
  prepared?: Transaction;
}

function buildTx(source: Account, contractId: string, method: string, args: xdr.ScVal[]) {
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: config.networkPassphrase,
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(180)
    .build();
}

/** Read-only contract call via simulation. Nothing is signed or submitted. */
export async function read<T>(contractId: string, method: string, args: xdr.ScVal[] = []): Promise<T> {
  const tx = buildTx(new Account(config.readSource, "0"), contractId, method, args);
  const sim = await withRetry(() => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) throw new Error(cleanError(sim.error));
  if (!sim.result) throw new Error("Simulation returned no result");
  return scValToNative(sim.result.retval) as T;
}

/** Dry-run a state-changing call as `source` and report costs/footprint. */
export async function simulate(
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[],
): Promise<SimReport> {
  const account = await withRetry(() => server.getAccount(source)).catch(() => {
    throw new Error("Source account not found on testnet. Fund it with Friendbot first.");
  });
  const tx = buildTx(account as Account, contractId, method, args);
  const sim = await withRetry(() => server.simulateTransaction(tx));
  if (rpc.Api.isSimulationError(sim)) {
    return { ok: false, error: cleanError(sim.error), latestLedger: sim.latestLedger };
  }
  const data = sim.transactionData.build();
  const res = data.resources;
  const fp = res.footprint;
  return {
    ok: true,
    result: sim.result ? scValToNative(sim.result.retval) : undefined,
    minResourceFee: sim.minResourceFee,
    instructions: res.instructions,
    readBytes: res.diskReadBytes,
    writeBytes: res.writeBytes,
    footprint: { readOnly: fp.readOnly.length, readWrite: fp.readWrite.length },
    latestLedger: sim.latestLedger,
    authRequired: sim.result?.auth?.length ?? 0,
    prepared: rpc.assembleTransaction(tx, sim).build(),
  };
}

export interface Submitted {
  hash: string;
  ledger: number;
  createdAt: number;
  envelopeXdr: string;
  returnValue: unknown;
}

/** Submit a signed envelope and wait for it to land in a ledger. */
export async function submit(signedXdr: string): Promise<Submitted> {
  const tx = TransactionBuilder.fromXDR(signedXdr, config.networkPassphrase);
  const sent = await withRetry(() => server.sendTransaction(tx));
  if (sent.status === "ERROR") {
    throw new Error(`Transaction rejected: ${sent.errorResult?.result.type ?? "unknown"}`);
  }
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const got = await server.getTransaction(sent.hash).catch(() => null);
    if (!got || got.status === rpc.Api.GetTransactionStatus.NOT_FOUND) continue;
    if (got.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      return {
        hash: sent.hash,
        ledger: got.ledger,
        createdAt: Number(got.createdAt) * 1000,
        envelopeXdr: signedXdr,
        returnValue: got.returnValue ? scValToNative(got.returnValue) : undefined,
      };
    }
    throw new Error(`Transaction failed on-chain (${sent.hash.slice(0, 8)}…)`);
  }
  throw new Error(`Timed out waiting for ${sent.hash}`);
}

const CONTRACT_ERRORS: Record<string, Record<number, string>> = {
  router: {
    1: "Amount must be greater than zero",
    2: "Rate must be positive and not exceed the deposit",
    3: "Stream not found",
    4: "Not authorized",
    5: "Stream is already cancelled",
    6: "Nothing to withdraw yet",
    7: "You can't stream to yourself",
    8: "Account has reached the stream index limit",
  },
  splitter: {
    1: "Amount must be greater than zero",
    2: "Too many splits (max 32)",
    3: "Weights exceed 100%",
    4: "Each split needs a non-zero weight",
    5: "You can't split to yourself",
    6: "Duplicate recipient in split table",
  },
};

export function cleanError(raw: string): string {
  const m = raw.match(/Error\(Contract, #(\d+)\)/);
  if (m) {
    const code = Number(m[1]);
    const hint = /create_stream|withdraw|top_up|cancel|get_stream/.test(raw)
      ? CONTRACT_ERRORS.router[code]
      : /set_splits|distribute|preview/.test(raw)
        ? CONTRACT_ERRORS.splitter[code]
        : CONTRACT_ERRORS.router[code] ?? CONTRACT_ERRORS.splitter[code];
    return `${hint ?? "Contract error"} (#${code})`;
  }
  if (/balance is not sufficient|resulting balance is not within the allowed range/i.test(raw))
    return "Insufficient token balance";
  const first = raw.split("\n").find((l) => l.trim()) ?? raw;
  return first.length > 200 ? first.slice(0, 200) + "…" : first;
}

export async function latestLedger() {
  return withRetry(() => server.getLatestLedger());
}

export async function feeStats() {
  return withRetry(() => server.getFeeStats());
}
