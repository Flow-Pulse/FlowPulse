import { useMemo, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { useApp, type TxOutcome } from "../state";
import { config, XLM_SAC } from "../lib/config";
import { sv } from "../lib/soroban";
import { duration as fmtDuration, fromUnits, toUnits } from "../lib/format";
import { Field, Icon, Sheet } from "./ui";

const UNITS = { minutes: 60, hours: 3600, days: 86400 } as const;

export function NewStreamModal({
  open,
  onClose,
  initial,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: (o: TxOutcome) => void;
  initial?: { recipient?: string; amount?: string; hours?: number; title?: string; memo?: string };
}) {
  const { address, runTx, connect } = useApp();
  const [recipient, setRecipient] = useState(initial?.recipient ?? "");
  const [amount, setAmount] = useState(initial?.amount ?? "100");
  const [dur, setDur] = useState(String(initial?.hours ?? 24));
  const [unit, setUnit] = useState<keyof typeof UNITS>("hours");

  const calc = useMemo(() => {
    try {
      if (!StrKey.isValidEd25519PublicKey(recipient.trim()) && !StrKey.isValidContract(recipient.trim()))
        return { error: "Enter a valid Stellar address (G… or C…)" };
      if (recipient.trim() === address) return { error: "You can't stream to yourself" };
      const deposit = toUnits(amount);
      if (deposit <= 0n) return { error: "Amount must be greater than zero" };
      const secs = Math.round(Number(dur) * UNITS[unit]);
      if (!Number.isFinite(secs) || secs < 1) return { error: "Duration must be at least 1 second" };
      const rate = deposit / BigInt(secs);
      if (rate <= 0n) return { error: "Duration too long for this amount (rate rounds to zero)" };
      // Rate rounds down; the stream runs slightly longer than requested.
      const actualSecs = Number(deposit / rate);
      return { deposit, rate, secs: actualSecs };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [recipient, amount, dur, unit, address]);

  async function go(dryRun: boolean) {
    if (!address || "error" in calc) return;
    const r = await runTx({
      title: initial?.title ?? (dryRun ? "Dry-run: new micro-stream" : "Open micro-stream"),
      contractId: config.streamRouterId,
      method: "create_stream",
      args: [sv.addr(address), sv.addr(recipient.trim()), sv.addr(XLM_SAC), sv.i128(calc.rate!), sv.i128(calc.deposit!)],
      display: {
        sender: address,
        recipient: recipient.trim(),
        token: `XLM (${XLM_SAC.slice(0, 6)}…)`,
        rate_per_sec: `${calc.rate} stroops (${fromUnits(calc.rate!)} XLM/s)`,
        deposit: `${calc.deposit} stroops (${fromUnits(calc.deposit!)} XLM)`,
        ...(initial?.memo ? { memo: initial.memo } : {}),
      },
      dryRun,
    });
    if (r) {
      onSuccess?.(r);
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={initial?.title ?? "New micro-stream"} eyebrow={<span className="chip-accent">STREAM ROUTER</span>}>
      <div className="space-y-4">
        <Field label="Recipient (maintainer / project)" hint="Stellar account G… or contract C…">
          <input className="input font-mono text-xs" placeholder="GABC…" value={recipient} onChange={(e) => setRecipient(e.target.value)} spellCheck={false} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deposit (XLM)">
            <input className="input font-mono" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Stream over">
            <div className="flex">
              <input className="input rounded-r-none font-mono" inputMode="decimal" value={dur} onChange={(e) => setDur(e.target.value)} />
              <select className="input w-auto rounded-l-none border-l-0 pr-7" value={unit} onChange={(e) => setUnit(e.target.value as keyof typeof UNITS)}>
                {Object.keys(UNITS).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </Field>
        </div>

        <div className="rounded-sm border border-line bg-vellum p-3">
          {"error" in calc ? (
            <div className="flex items-center gap-2 text-sm text-lead">
              <Icon name="info" className="!text-[18px]" /> {calc.error}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="label">Velocity</div>
                <div className="font-mono text-lg text-cobalt">{fromUnits(calc.rate!)}</div>
                <div className="font-mono text-[10px] text-lead">XLM / sec</div>
              </div>
              <div>
                <div className="label">Runway</div>
                <div className="font-mono text-lg text-ink">{fmtDuration(calc.secs!)}</div>
                <div className="font-mono text-[10px] text-lead">until deposit is drained</div>
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-lead">
          Funds are escrowed in the StreamRouter contract. The recipient can withdraw accrued XLM at any second; you can top up or cancel
          (unstreamed funds are refunded).
        </p>
        {!address ? (
          <button className="btn-primary w-full" onClick={connect}>
            <Icon name="account_balance_wallet" /> Connect Freighter to continue
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button className="btn-secondary" disabled={"error" in calc} onClick={() => go(true)}>
              <Icon name="science" /> Dry run
            </button>
            <button className="btn-primary" disabled={"error" in calc} onClick={() => go(false)}>
              <Icon name="bolt" /> Review &amp; sign
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
