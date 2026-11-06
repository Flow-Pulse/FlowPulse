import { useEffect, useState } from "react";
import { useApp, type TxOutcome } from "../state";
import { simulate, submit, cleanError, type SimReport } from "../lib/soroban";
import { signWithFreighter } from "../lib/wallet";
import { makeReceipt, saveReceipt } from "../lib/receipts";
import { config } from "../lib/config";
import { fromUnits, shortAddr } from "../lib/format";
import { toStellarCliCommand } from "../lib/cli";
import { CopyButton, Icon, KV, Sheet, Spinner } from "./ui";

type Phase = "simulating" | "ready" | "failed" | "signing" | "submitting" | "done" | "error";

export function TxDrawer() {
  const { pending, settle, address, connect, openReceipt, toast } = useApp();
  const [phase, setPhase] = useState<Phase>("simulating");
  const [sim, setSim] = useState<SimReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<TxOutcome | null>(null);
  const [showXdr, setShowXdr] = useState(false);

  const req = pending?.req;

  useEffect(() => {
    if (!req || !address) return;
    let off = false;
    setPhase("simulating");
    setSim(null);
    setError(null);
    setOutcome(null);
    setShowXdr(false);
    simulate(address, req.contractId, req.method, req.args)
      .then((r) => {
        if (off) return;
        setSim(r);
        setPhase(r.ok ? "ready" : "failed");
      })
      .catch((e) => {
        if (off) return;
        setError(cleanError(String(e.message ?? e)));
        setPhase("failed");
      });
    return () => {
      off = true;
    };
  }, [req, address]);

  if (!pending || !req) return null;

  const close = () => settle(phase === "done" ? outcome : null);

  async function signAndSend() {
    if (!sim?.prepared || !address || !req) return;
    try {
      setPhase("signing");
      const signed = await signWithFreighter(sim.prepared.toXDR(), address);
      setPhase("submitting");
      const res = await submit(signed);
      const receipt = await makeReceipt({
        contract_id: req.contractId,
        function: req.method,
        args: req.display,
        tx_hash: res.hash,
        ledger: res.ledger,
        ledger_close_time: new Date(res.createdAt).toISOString(),
        source: address,
        envelope_xdr: res.envelopeXdr,
      });
      saveReceipt(receipt);
      const out = { ...res, receipt };
      setOutcome(out);
      setPhase("done");
      toast(`${req.title} confirmed in ledger #${res.ledger}`);
    } catch (e) {
      setError(cleanError(String((e as Error).message ?? e)));
      setPhase("error");
    }
  }

  const fee = sim?.minResourceFee ? fromUnits(BigInt(sim.minResourceFee) + 100n, 7) : null;
  const busy = phase === "signing" || phase === "submitting" || phase === "simulating";

  const cliCommand = toStellarCliCommand({
    contractId: req.contractId,
    method: req.method,
    args: req.args,
    source: address ?? undefined,
  });

  return (
    <Sheet
      open
      onClose={busy ? () => {} : close}
      title={req.title}
      eyebrow={
        <>
          <span className="chip-accent">
            <Icon name="memory" className="!text-[14px]" />
            SOROBAN INVOKE
          </span>
          <span className="chip">TESTNET</span>
          {req.dryRun && <span className="chip-warn">DRY RUN</span>}
        </>
      }
    >
      {!address ? (
        <div className="space-y-3 text-sm text-lead">
          <p>Connect Freighter (set to Testnet) to simulate and sign this transaction.</p>
          <button className="btn-primary w-full" onClick={connect}>
            <Icon name="account_balance_wallet" /> Connect Freighter
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Invocation */}
          <div className="rounded-sm border border-line bg-vellum p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="label">Invocation</span>
              <a className="font-mono text-[11px] text-cobalt hover:underline" target="_blank" rel="noreferrer" href={`${config.explorer}/contract/${req.contractId}`}>
                {shortAddr(req.contractId, 6, 6)} ↗
              </a>
            </div>
            <div className="font-mono text-sm text-ink">
              <span className="text-cobalt">{req.method}</span>(
            </div>
            <div className="pl-4">
              {Object.entries(req.display).map(([k, v]) => (
                <div key={k} className="truncate font-mono text-[12px] text-ink-2">
                  <span className="text-lead">{k}:</span> {v}
                </div>
              ))}
            </div>
            <div className="font-mono text-sm text-ink">)</div>
            <div className="mt-3 flex items-center justify-between border-t border-line-faint pt-2">
              <span className="font-mono text-[10px] text-lead">Stellar CLI command</span>
              <CopyButton value={cliCommand} label="Copy CLI command" className="!py-0.5 text-[11px]" />
            </div>
          </div>

          {/* Simulation */}
          <div className="rounded-sm border border-line p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="label">Pre-flight simulation</span>
              {phase === "simulating" ? (
                <span className="chip"><Spinner className="size-3" /> RUNNING</span>
              ) : sim?.ok ? (
                <span className="chip-ok"><Icon name="check" className="!text-[14px]" /> PASSED</span>
              ) : (
                <span className="chip-err"><Icon name="error" className="!text-[14px]" /> FAILED</span>
              )}
            </div>
            {sim?.ok && (
              <div className="divide-y divide-line-faint">
                <KV k="Est. fee" v={`${fee} XLM`} />
                <KV k="CPU instructions" v={sim.instructions?.toLocaleString()} />
                <KV k="Read / write bytes" v={`${sim.readBytes?.toLocaleString()} / ${sim.writeBytes?.toLocaleString()}`} />
                <KV k="Footprint (ro / rw)" v={`${sim.footprint?.readOnly} / ${sim.footprint?.readWrite}`} />
                <KV k="Auth entries" v={sim.authRequired} />
                {sim.result !== undefined && sim.result !== null && <KV k="Return value" v={String(sim.result)} />}
                <KV k="Simulated at ledger" v={`#${sim.latestLedger}`} />
              </div>
            )}
            {(phase === "failed" || (sim && !sim.ok)) && (
              <div className="mt-2 rounded-sm border border-err/30 bg-err-bg p-3 font-mono text-xs text-err">
                {sim?.error ?? error}
              </div>
            )}
            {sim?.prepared && (
              <button className="mt-2 font-mono text-[11px] text-cobalt hover:underline" onClick={() => setShowXdr((s) => !s)}>
                {showXdr ? "Hide" : "Inspect"} raw XDR
              </button>
            )}
            {showXdr && sim?.prepared && (
              <div className="mt-2">
                <pre className="max-h-40 overflow-auto break-all whitespace-pre-wrap rounded-sm bg-ink p-2 font-mono text-[10px] text-white/80">
                  {sim.prepared.toXDR()}
                </pre>
                <CopyButton value={sim.prepared.toXDR()} label="Copy XDR" className="mt-2" />
              </div>
            )}
          </div>

          {phase === "error" && (
            <div className="rounded-sm border border-err/30 bg-err-bg p-3 text-sm text-err">{error}</div>
          )}

          {phase === "done" && outcome ? (
            <div className="space-y-3">
              <div className="rounded-sm border border-ok/30 bg-ok-bg p-3">
                <div className="flex items-center gap-2 font-medium text-ok">
                  <Icon name="verified" fill /> Confirmed in ledger #{outcome.ledger}
                </div>
                <a className="mt-1 block truncate font-mono text-xs text-ok hover:underline" target="_blank" rel="noreferrer" href={`${config.explorer}/tx/${outcome.hash}`}>
                  {outcome.hash} ↗
                </a>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button className="btn-secondary" onClick={() => { const r = outcome.receipt; close(); openReceipt(r); }}>
                  <Icon name="receipt_long" /> Audit receipt
                </button>
                <button className="btn-primary" onClick={close}>Done</button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={close} disabled={busy}>Cancel</button>
              <button className="btn-primary" onClick={signAndSend} disabled={!sim?.ok || busy}>
                {phase === "signing" ? (
                  <><Spinner /> Approve in Freighter</>
                ) : phase === "submitting" ? (
                  <><Spinner /> Broadcasting…</>
                ) : (
                  <><Icon name="draw" /> Sign &amp; submit</>
                )}
              </button>
            </div>
          )}
          <p className="text-center font-mono text-[10px] text-lead">
            Signed locally by Freighter · keys never leave your wallet
          </p>
        </div>
      )}
    </Sheet>
  );
}
