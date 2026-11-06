import { useEffect, useMemo, useState } from "react";
import { useApp } from "../state";
import { useStreams } from "../hooks/useStreams";
import { splitter, status, streamedAt, streamedAtSmooth, withdrawableAt } from "../lib/contracts";
import { config, XLM_SAC, tokenMeta, SUPPORTED_TOKENS } from "../lib/config";
import { sv } from "../lib/soroban";
import { fromUnits, shortAddr, timeAgo } from "../lib/format";
import { loadReceipts, parseReceipt, type Receipt } from "../lib/receipts";
import { fetchContractEvents, mergeEventsWithReceipts, type DecodedPayoutEvent } from "../lib/events";
import { xlmBalance } from "../lib/wallet";
import { Banner } from "../components/Shell";
import { CopyButton, Empty, Icon, Pip, SectionTitle, useNow } from "../components/ui";

const FWD_KEY = "flowpulse.autoforward.v1";

function usePayoutLedger(address?: string) {
  const [receipts, setReceipts] = useState<Receipt[]>(loadReceipts);
  const [rpcEvents, setRpcEvents] = useState<DecodedPayoutEvent[]>([]);
  const [loadingRpc, setLoadingRpc] = useState(false);

  useEffect(() => {
    const on = () => setReceipts(loadReceipts());
    window.addEventListener("flowpulse:receipts", on);
    return () => window.removeEventListener("flowpulse:receipts", on);
  }, []);

  useEffect(() => {
    if (!address) {
      setRpcEvents([]);
      return;
    }
    setLoadingRpc(true);
    fetchContractEvents(address)
      .then((evs) => setRpcEvents(evs))
      .catch(() => {})
      .finally(() => setLoadingRpc(false));
  }, [address]);

  const items = useMemo(() => mergeEventsWithReceipts(rpcEvents, receipts), [rpcEvents, receipts]);
  return { items, loadingRpc, receiptCount: receipts.length };
}

export function EarningsPage() {
  const { address, connect, runTx, openReceipt, toast, version } = useApp();
  const { streams, scope } = useStreams();
  const { items: ledgerItems, loadingRpc, receiptCount } = usePayoutLedger(address ?? undefined);
  const now = useNow(100);
  const nowSec = now / 1000;
  const [balance, setBalance] = useState<string | null>(null);
  const [hasTable, setHasTable] = useState(false);
  const [tokenFilter, setTokenFilter] = useState<string>("all");
  const [fwd, setFwd] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(FWD_KEY) ?? "0");
    } catch {
      return 0;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(FWD_KEY, String(fwd));
    } catch {
      /* ignore */
    }
  }, [fwd]);

  useEffect(() => {
    if (!address) return;
    xlmBalance(address).then(setBalance);
    splitter.get(address).then((s) => setHasTable(s.length > 0)).catch(() => setHasTable(false));
  }, [address, version]);

  const mine = scope === "mine";
  const incoming = mine
    ? streams.filter((s) => s.recipient === address && (tokenFilter === "all" || s.token === tokenFilter))
    : [];
  const outgoing = mine
    ? streams.filter((s) => s.sender === address && (tokenFilter === "all" || s.token === tokenFilter))
    : [];

  const unclaimedSmooth = incoming.reduce((a, s) => a + Math.max(0, streamedAtSmooth(s, now) - Number(s.withdrawn)), 0);
  const unclaimed = incoming.reduce((a, s) => a + withdrawableAt(s, nowSec), 0n);
  const rateIn = incoming.filter((s) => status(s, nowSec) === "streaming").reduce((a, s) => a + s.rate_per_sec, 0n);
  const lifetimeIn = incoming.reduce((a, s) => a + streamedAt(s, nowSec), 0n);
  const downstream = outgoing.reduce((a, s) => a + streamedAt(s, nowSec), 0n);
  const sponsors = new Set(incoming.map((s) => s.sender)).size;

  const sources = useMemo(() => {
    const m = new Map<string, bigint>();
    incoming.forEach((s) => m.set(s.sender, (m.get(s.sender) ?? 0n) + streamedAt(s, nowSec)));
    const total = [...m.values()].reduce((a, b) => a + b, 0n);
    return [...m.entries()]
      .sort((a, b) => Number(b[1] - a[1]))
      .slice(0, 5)
      .map(([k, v]) => ({ sender: k, amount: v, pct: total ? Number((v * 10000n) / total) / 100 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streams, Math.floor(nowSec / 5)]);

  async function claim() {
    if (!address) return;
    const out = await runTx({
      title: "Instant claim — all streams",
      contractId: config.streamRouterId,
      method: "withdraw_all",
      args: [sv.addr(address)],
      display: { recipient: address, streams: String(incoming.length) },
    });
    if (!out || !fwd || !hasTable) return;
    const claimed = BigInt(String(out.returnValue ?? "0"));
    const amount = (claimed * BigInt(fwd)) / 100n;
    if (amount <= 0n) return;
    toast(`Forwarding ${fwd}% (${fromUnits(amount, 7, 4)} XLM) to your cascade`);
    await runTx({
      title: `Auto-drip ${fwd}% to upstream cascade`,
      contractId: config.cascadeSplitterId,
      method: "distribute",
      args: [sv.addr(address), sv.addr(address), sv.addr(XLM_SAC), sv.i128(amount)],
      display: { from: address, owner: address, token: "XLM", amount: `${amount} stroops (${fromUnits(amount)} XLM)` },
    });
  }

  if (!address) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <Empty icon="account_balance_wallet" title="Maintainer vault">
          Connect Freighter to see streams paying you, claim everything in one signature, and keep verifiable receipts.
          <div className="mt-4">
            <button className="btn-primary" onClick={connect}>
              <Icon name="account_balance_wallet" /> Connect Freighter
            </button>
          </div>
        </Empty>
        <div className="mt-6">
          <VerifyUpload onOpen={openReceipt} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="space-y-4">
        <section className="panel p-4 md:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="chip-ok"><Pip tone="ok" pulse={rateIn > 0n} /> {rateIn > 0n ? "LIVE ACCRUAL" : "IDLE"}</span>
            <span className="chip"><Icon name="verified" className="!text-[14px] text-cobalt" /> Soroban p30</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="label">Unclaimed streaming balance</div>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setTokenFilter("all")}
                className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${tokenFilter === "all" ? "border-cobalt bg-cobalt text-white" : "border-line bg-vellum text-ink-2"}`}
              >
                All
              </button>
              {SUPPORTED_TOKENS.map((t) => (
                <button
                  key={t.contractId}
                  type="button"
                  onClick={() => setTokenFilter(t.contractId)}
                  className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${tokenFilter === t.contractId ? "border-cobalt bg-cobalt text-white" : "border-line bg-vellum text-ink-2"}`}
                >
                  {t.code}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tnum font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
              {(unclaimedSmooth / 1e7).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
            </span>
            <span className="font-mono text-sm text-cobalt">{tokenFilter === "all" ? "XLM/USDC" : tokenMeta(tokenFilter).code}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-lead">
            <span className="chip-ok">+{fromUnits(rateIn * 60n, 7, 4)} XLM/min</span>
            from {incoming.length} stream{incoming.length === 1 ? "" : "s"}
          </div>
          <button className="btn-primary mt-4 w-full py-4 text-lg" disabled={unclaimed <= 0n} onClick={claim}>
            <Icon name="bolt" fill /> Instant claim to Stellar wallet
          </button>
          <div className="mt-2 flex justify-between font-mono text-[11px] text-lead">
            <span>One tx · withdraw_all()</span>
            <span className="text-cobalt">~5s finality</span>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Tile label="Lifetime in" icon="savings" value={fromUnits(lifetimeIn, 7, 2)} unit="XLM" sub="all inbound streams" />
          <Tile label="Downstream" icon="call_made" value={fromUnits(downstream, 7, 2)} unit="XLM" sub="streamed out" tone="ok" />
          <Tile label="Sponsors" icon="handshake" value={String(sponsors)} sub="unique senders" />
          <Tile label="Wallet" icon="account_balance_wallet" value={balance ? Number(balance).toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"} unit="XLM" sub="testnet balance" />
        </div>

        <section className="panel">
          <div className="panel-head">
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Icon name="link" className="text-cobalt" /> Connected wallet</span>
            <span className="chip-accent">● Freighter</span>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between gap-2 rounded-sm border border-line bg-vellum px-3 py-2">
              <span className="truncate font-mono text-xs text-cobalt">{shortAddr(address, 8, 8)}</span>
              <CopyButton value={address} />
            </div>
            <div className="rounded-sm border border-line p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-medium text-ink"><Icon name="sync_alt" className="text-ok" /> Auto-drip cascades</span>
                <select className="input h-8 w-24 font-mono text-xs" value={fwd} onChange={(e) => setFwd(Number(e.target.value))} disabled={!hasTable}>
                  {[0, 10, 20, 30, 50].map((p) => (
                    <option key={p} value={p}>{p ? `${p}%` : "off"}</option>
                  ))}
                </select>
              </div>
              <p className="mt-1 text-xs text-lead">
                {hasTable
                  ? "After each claim, forward this share through your published split table to upstream maintainers."
                  : "Publish a split table on the Cascades tab to forward part of each claim upstream."}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="space-y-6">
        <section className="panel">
          <div className="panel-head">
            <span className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Icon name="donut_large" className="text-cobalt" /> Revenue sources</span>
            <span className="label">by sponsor</span>
          </div>
          <div className="p-4">
            {sources.length === 0 ? (
              <p className="text-sm text-lead">No inbound streams yet. Share your address with sponsors, or attach it to PRs for CI bounties.</p>
            ) : (
              <>
                <div className="mb-3 flex h-2 overflow-hidden rounded-full bg-line-faint">
                  {sources.map((s, i) => (
                    <div key={s.sender} className={["bg-cobalt", "bg-cobalt-hover/70", "bg-ok", "bg-lead", "bg-warn"][i]} style={{ width: `${s.pct}%` }} />
                  ))}
                </div>
                <div className="space-y-2">
                  {sources.map((s, i) => (
                    <div key={s.sender} className="flex items-center gap-3 rounded-sm border border-line-faint p-2.5">
                      <span className={`size-2 rounded-full ${["bg-cobalt", "bg-cobalt-hover/70", "bg-ok", "bg-lead", "bg-warn"][i]}`} />
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink">{shortAddr(s.sender, 6, 6)}</span>
                      <span className="font-mono text-sm text-ink">{fromUnits(s.amount, 7, 2)} XLM</span>
                      <span className="w-12 text-right font-mono text-[11px] text-lead">{s.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <SectionTitle
            icon="history"
            aside={
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-lead">
                {loadingRpc && <Pip tone="ok" pulse />}
                <span>{ledgerItems.length} transactions</span>
                <span className="text-line">·</span>
                <span>{receiptCount} local receipts</span>
              </span>
            }
          >
            Payout ledger
          </SectionTitle>
          {ledgerItems.length === 0 ? (
            <Empty icon="receipt_long" title="No history found">
              {loadingRpc
                ? "Querying Soroban contract events from RPC..."
                : "No on-chain events or local receipts found for this address."}
            </Empty>
          ) : (
            <div className="panel divide-y divide-line-faint">
              {ledgerItems.slice(0, 30).map((item) => (
                <div
                  key={item.key}
                  className="flex w-full items-center justify-between gap-3 p-3 text-left transition-colors hover:bg-vellum"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none"
                    onClick={() => {
                      if (item.receipt) {
                        openReceipt(item.receipt);
                      } else if (item.txHash) {
                        window.open(`${config.explorer}/tx/${item.txHash}`, "_blank");
                      }
                    }}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-vellum">
                      <Icon name={ICON[item.functionName] ?? "receipt_long"} className="text-cobalt" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">
                          {LABEL[item.functionName] ?? item.title}
                        </span>
                        {item.amount && (
                          <span className="font-mono text-xs font-semibold text-cobalt">
                            {fromUnits(BigInt(item.amount), 7, 2)} XLM
                          </span>
                        )}
                      </div>
                      <div className="truncate font-mono text-[11px] text-lead">
                        {timeAgo(item.timestamp)} · tx {item.txHash ? `${item.txHash.slice(0, 8)}…` : "unrecorded"}
                      </div>
                    </div>
                  </button>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.receipt ? (
                      <button
                        type="button"
                        onClick={() => openReceipt(item.receipt!)}
                        className="chip-ok flex items-center gap-1 text-[10px]"
                        title="Click to view RFC-8785 signed receipt"
                      >
                        <Icon name="verified" className="!text-[12px]" /> Receipt
                      </button>
                    ) : (
                      <a
                        href={`${config.explorer}/tx/${item.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="chip flex items-center gap-1 text-[10px] text-lead hover:text-ink-2"
                        title="View transaction on Stellar Expert"
                      >
                        <Icon name="link" className="!text-[12px]" /> RPC Event ↗
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <VerifyUpload onOpen={openReceipt} />
      </div>
    </div>
  );
}

const LABEL: Record<string, string> = {
  withdraw_all: "Instant claim (all streams)",
  withdraw: "Stream withdrawal",
  create_stream: "Opened micro-stream",
  top_up: "Stream top-up",
  cancel: "Stream cancelled",
  set_splits: "Published split table",
  distribute: "Cascade distribution",
};
const ICON: Record<string, string> = {
  withdraw_all: "bolt",
  withdraw: "download",
  create_stream: "water_drop",
  top_up: "add_circle",
  cancel: "pause_circle",
  set_splits: "account_tree",
  distribute: "call_split",
};

function Tile({ label, icon, value, unit, sub, tone }: { label: string; icon: string; value: string; unit?: string; sub: string; tone?: "ok" }) {
  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-center justify-between">
        <span className="label">{label}</span>
        <Icon name={icon} className="!text-[18px] text-cobalt" />
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`truncate font-display text-xl font-semibold ${tone === "ok" ? "text-ok" : "text-ink"}`}>{value}</span>
        {unit && <span className="font-mono text-[10px] text-lead">{unit}</span>}
      </div>
      <div className="truncate font-mono text-[10px] text-lead">{sub}</div>
    </div>
  );
}

function VerifyUpload({ onOpen }: { onOpen: (r: Receipt) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const open = (t: string) => {
    try {
      setErr(null);
      onOpen(parseReceipt(t));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  return (
    <section className="panel">
      <div className="panel-head">
        <span className="flex items-center gap-2 font-display text-lg font-semibold text-ink"><Icon name="fact_check" className="text-cobalt" /> Verify a receipt</span>
        <span className="label">offline · client-side</span>
      </div>
      <div className="space-y-2 p-4">
        <textarea className="input h-24 py-2 font-mono text-[11px]" placeholder='Paste receipt.json ({"receipt": …, "digest": …})' value={text} onChange={(e) => setText(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary" disabled={!text.trim()} onClick={() => open(text)}>
            <Icon name="verified" /> Verify
          </button>
          <label className="btn-secondary cursor-pointer">
            <Icon name="upload_file" /> Upload file
            <input type="file" accept=".json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) open(await f.text()); }} />
          </label>
        </div>
        {err && <Banner tone="err">{err}</Banner>}
      </div>
    </section>
  );
}
