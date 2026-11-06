import { useMemo, useState } from "react";
import { useApp } from "../state";
import { useStreams } from "../hooks/useStreams";
import { runway, status, streamedAtSmooth, withdrawableAt, type Stream } from "../lib/contracts";
import { config, tokenMeta } from "../lib/config";
import { sv } from "../lib/soroban";
import { duration, fromUnits, fromUnitsFixed, shortAddr, toUnits } from "../lib/format";
import { Banner } from "../components/Shell";
import { NewStreamModal } from "../components/NewStreamModal";
import { Empty, Icon, Pip, Sheet, Spinner, useNow } from "../components/ui";

type Filter = "all" | "in" | "out";

export function StreamsPage() {
  const { address } = useApp();
  const { streams, loading, error, scope, total, reload } = useStreams();
  const [filter, setFilter] = useState<Filter>("all");
  const [newOpen, setNewOpen] = useState(false);
  const now = useNow(100);
  const nowSec = now / 1000;

  const active = streams.filter((s) => status(s, nowSec) === "streaming");
  const inbound = streams.filter((s) => s.recipient === address);
  const outbound = streams.filter((s) => s.sender === address);

  const velocity = useMemo(() => {
    const set = scope === "mine" ? active.filter((s) => s.recipient === address) : active;
    return set.reduce((a, s) => a + s.rate_per_sec, 0n);
  }, [active, scope, address]);
  const outVelocity = scope === "mine" ? active.filter((s) => s.sender === address).reduce((a, s) => a + s.rate_per_sec, 0n) : 0n;

  const shown = filter === "in" ? inbound : filter === "out" ? outbound : streams;
  const maxRate = active.reduce((m, s) => (s.rate_per_sec > m ? s.rate_per_sec : m), 1n);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-24">
        {/* Velocity card */}
        <section className="panel p-4 md:p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl font-semibold leading-tight tracking-tight text-ink">
              {scope === "mine" ? "Inbound Streaming Velocity" : "Network Streaming Velocity"}
            </h1>
            <span className="chip-ok shrink-0">
              <Pip tone="ok" pulse={active.length > 0} /> {active.length} ACTIVE
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="tnum font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">+{fromUnitsFixed(velocity, 7, 4)}</span>
            <span className="font-mono text-sm text-cobalt">XLM / sec</span>
          </div>
          <div className="mt-2 font-mono text-xs text-lead">
            24h projected: <span className="text-cobalt">{fromUnits(velocity * 86400n, 7, 2)} XLM</span>
            {scope === "mine" && outVelocity > 0n && (
              <> · out: <span className="text-ink-2">{fromUnitsFixed(outVelocity, 7, 4)}/s</span></>
            )}
          </div>
          <div className="mt-4">
            <div className="mb-1.5 flex justify-between">
              <span className="label">Live drip flux · per stream</span>
              <span className="font-mono text-[10px] text-cobalt">{total?.toString() ?? "…"} streams on-chain</span>
            </div>
            <div className="flex h-16 items-end gap-1 rounded-sm border border-line-faint bg-vellum p-2">
              {active.length === 0 ? (
                <span className="m-auto font-mono text-[10px] text-lead">no active streams</span>
              ) : (
                active.slice(0, 24).map((s) => {
                  const h = 20 + Math.round((Number(s.rate_per_sec) / Number(maxRate)) * 80);
                  const tone = s.recipient === address ? "bg-ok" : "bg-cobalt";
                  return (
                    <div
                      key={s.id.toString()}
                      title={`#${s.id} · ${fromUnits(s.rate_per_sec)} XLM/s`}
                      className={`animate-drip flex-1 rounded-xs ${tone} opacity-80`}
                      style={{ height: `${h}%`, animationDelay: `${(Number(s.id) % 8) * 60}ms` }}
                    />
                  );
                })
              )}
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2">
          <button className="btn-primary py-3" onClick={() => setNewOpen(true)}>
            <Icon name="add_circle" /> New Stream
          </button>
          <button className="btn-secondary py-3" onClick={reload} disabled={loading}>
            {loading ? <Spinner /> : <Icon name="sync" />} Refresh
          </button>
        </div>

        <section className="panel p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Icon name="schedule" className="text-cobalt" /> Keeperless settlement
            </span>
            <span className="font-mono text-[11px] text-cobalt">every ledger</span>
          </div>
          <p className="text-sm text-lead">
            Accrual is a pure function of ledger close time — no cron or oracle. Recipients withdraw whenever they want; senders can
            top up or cancel and get unstreamed funds back.
          </p>
          <a className="mt-2 inline-block font-mono text-[11px] text-cobalt hover:underline" target="_blank" rel="noreferrer" href={`${config.explorer}/contract/${config.streamRouterId}`}>
            StreamRouter {shortAddr(config.streamRouterId, 6, 6)} ↗
          </a>
        </section>
      </div>

      <div>
        {scope === "public" && (
          <Banner tone="info">
            Showing the latest streams on the testnet StreamRouter. Connect Freighter to see and manage your own.
          </Banner>
        )}
        {error && <Banner tone="err">Could not load streams: {error}</Banner>}

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ["all", `All (${streams.length})`],
              ["in", `Inbound (${inbound.length})`],
              ["out", `Outbound (${outbound.length})`],
            ] as [Filter, string][]
          )
            .filter(([f]) => scope === "mine" || f === "all")
            .map(([f, label]) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 rounded-full border px-3 py-1 font-mono text-xs ${
                  filter === f ? "border-cobalt bg-cobalt text-white" : "border-line bg-paper text-ink-2 hover:border-ink"
                }`}
              >
                {label}
              </button>
            ))}
        </div>

        {loading && streams.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="panel h-36 animate-pulse bg-vellum" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <Empty icon="water_drop" title={scope === "mine" ? "No streams yet" : "No streams on-chain yet"}>
            Open a stream to fund a maintainer by the second. Need testnet XLM? Use Friendbot from the wallet menu.
          </Empty>
        ) : (
          <div className="space-y-3">
            {shown.map((s) => (
              <StreamCard key={s.id.toString()} s={s} me={address} now={now} />
            ))}
          </div>
        )}
      </div>

      <NewStreamModal open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  );
}

function StreamCard({ s, me, now }: { s: Stream; me: string | null; now: number }) {
  const { runTx } = useApp();
  const [topUp, setTopUp] = useState(false);
  const nowSec = now / 1000;
  const dir = me ? (s.recipient === me ? "in" : s.sender === me ? "out" : null) : null;
  const st = status(s, nowSec);
  const t = tokenMeta(s.token);
  const streamed = streamedAtSmooth(s, now);
  const pct = Number(s.deposit) ? (streamed / Number(s.deposit)) * 100 : 0;
  const withdrawable = withdrawableAt(s, nowSec);
  const counterparty = dir === "in" ? s.sender : s.recipient;

  const call = (method: string, title: string, args = [sv.u64(s.id)], display: Record<string, string> = { id: s.id.toString() }) =>
    runTx({ title, contractId: config.streamRouterId, method, args, display });

  return (
    <article className="panel p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-line bg-vellum">
          <Icon name={dir === "in" ? "south_west" : dir === "out" ? "north_east" : "swap_horiz"} className="text-cobalt" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ink">Stream #{s.id.toString()}</span>
            {dir && <span className={dir === "in" ? "chip-ok" : "chip-accent"}>{dir.toUpperCase()}</span>}
            {st === "streaming" ? (
              <span className="chip"><Pip tone="ok" pulse /> streaming</span>
            ) : st === "depleted" ? (
              <span className="chip-warn">depleted</span>
            ) : (
              <span className="chip">cancelled</span>
            )}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-lead">
            {dir === "in" ? "from" : dir === "out" ? "to" : `${shortAddr(s.sender)} →`} {shortAddr(counterparty, 6, 6)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`font-mono text-lg font-semibold ${dir === "in" ? "text-ok" : "text-cobalt"}`}>{fromUnits(s.rate_per_sec, t.decimals, 4)}</div>
          <div className="font-mono text-[10px] text-lead">{t.code} / sec</div>
        </div>
      </div>

      <div className="mt-3 rounded-sm border border-line-faint bg-vellum p-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="label">Total dripped</div>
            <div className="tnum font-mono text-sm text-ink">
              {(streamed / 10 ** t.decimals).toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} {t.code}
            </div>
          </div>
          <div>
            <div className="label">{st === "streaming" ? "Runway" : "Deposit"}</div>
            <div className="font-mono text-sm text-ink">
              {st === "streaming" ? duration(runway(s, nowSec)) : `${fromUnits(s.deposit, t.decimals, 2)} ${t.code}`}
            </div>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-line-faint">
          <div className="h-full bg-cobalt transition-[width] duration-100" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-lead">
          <span>{pct.toFixed(2)}% of {fromUnits(s.deposit, t.decimals, 2)} {t.code}</span>
          <span>withdrawn {fromUnits(s.withdrawn, t.decimals, 2)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-lead">started {new Date(Number(s.start_time) * 1000).toLocaleString()}</span>
        <div className="flex gap-2">
          {dir === "in" && (
            <button className="btn-primary px-2.5 py-1 text-xs" disabled={withdrawable <= 0n} onClick={() => call("withdraw", "Withdraw from stream")}>
              <Icon name="download" className="!text-[16px]" /> Withdraw {fromUnits(withdrawable, t.decimals, 2)}
            </button>
          )}
          {dir === "out" && st !== "cancelled" && (
            <>
              <button className="btn-secondary px-2.5 py-1 text-xs" onClick={() => setTopUp(true)}>
                <Icon name="add" className="!text-[16px]" /> Top up
              </button>
              <button className="btn-danger px-2.5 py-1 text-xs" onClick={() => call("cancel", "Cancel stream & refund")}>
                <Icon name="pause_circle" className="!text-[16px]" /> Cancel
              </button>
            </>
          )}
        </div>
      </div>
      {topUp && (
        <TopUpSheet
          tokenAddress={s.token}
          onClose={() => setTopUp(false)}
          onSubmit={async (units) => {
            const r = await call("top_up", `Top up ${t.code} stream`, [sv.u64(s.id), sv.i128(units)], {
              id: s.id.toString(),
              amount: `${units} stroops (${fromUnits(units, t.decimals)} ${t.code})`,
            });
            if (r) setTopUp(false);
          }}
        />
      )}
    </article>
  );
}

function TopUpSheet({ tokenAddress, onClose, onSubmit }: { tokenAddress: string; onClose: () => void; onSubmit: (units: bigint) => void }) {
  const t = tokenMeta(tokenAddress);
  const [v, setV] = useState("50");
  let units: bigint | null = null;
  try {
    units = toUnits(v, t.decimals);
  } catch {
    units = null;
  }
  return (
    <Sheet open onClose={onClose} title={`Top up ${t.code} stream`}>
      <label className="label mb-1.5 block">Amount ({t.code})</label>
      <input className="input mb-3 font-mono" value={v} onChange={(e) => setV(e.target.value)} inputMode="decimal" />
      <button className="btn-primary w-full" disabled={!units || units <= 0n} onClick={() => units && onSubmit(units)}>
        Review &amp; sign
      </button>
    </Sheet>
  );
}

