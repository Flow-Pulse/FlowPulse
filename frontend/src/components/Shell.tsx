import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApp } from "../state";
import { feeStats, latestLedger } from "../lib/soroban";
import { fundWithFriendbot, xlmBalance } from "../lib/wallet";
import { fromUnits, shortAddr } from "../lib/format";
import { config } from "../lib/config";
import { CopyButton, Icon, Pip, Spinner } from "./ui";

export type Route = "streams" | "cascades" | "ci" | "earnings";

export const NAV: { id: Route; label: string; icon: string }[] = [
  { id: "streams", label: "Live Streams", icon: "bolt" },
  { id: "cascades", label: "Cascades", icon: "account_tree" },
  { id: "ci", label: "CI/CD Repos", icon: "terminal" },
  { id: "earnings", label: "Earnings", icon: "account_balance_wallet" },
];

function useNetwork() {
  const [ledger, setLedger] = useState<number | null>(null);
  const [fee, setFee] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let off = false;
    const tick = async () => {
      try {
        const l = await latestLedger();
        if (!off) {
          setLedger(l.sequence);
          setOnline(true);
        }
      } catch {
        if (!off) setOnline(false);
      }
    };
    tick();
    feeStats()
      .then((f) => !off && setFee(fromUnits(BigInt(f.sorobanInclusionFee.p50), 7)))
      .catch(() => {});
    const t = setInterval(tick, 5000);
    return () => {
      off = true;
      clearInterval(t);
    };
  }, []);
  return { ledger, fee, online };
}

function WalletButton() {
  const { address, connect, connecting, disconnect, toast, version } = useApp();
  const [open, setOpen] = useState(false);
  const [bal, setBal] = useState<string | null>(null);
  const [funding, setFunding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (address) xlmBalance(address).then(setBal);
  }, [address, version, funding]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  if (!address) {
    return (
      <button className="btn-primary px-3 py-1.5" onClick={connect} disabled={connecting}>
        {connecting ? <Spinner /> : <Icon name="account_balance_wallet" />}
        <span className="hidden sm:inline">Connect Freighter</span>
        <span className="sm:hidden">Connect</span>
      </button>
    );
  }
  return (
    <div className="relative" ref={ref}>
      <button className="btn-secondary px-2.5 py-1.5" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Pip tone="ok" />
        <span className="font-mono text-xs">{shortAddr(address)}</span>
        <Icon name="expand_more" className="!text-[18px]" />
      </button>
      {open && (
        <div className="floating absolute right-0 z-40 mt-2 w-72 rounded-md bg-paper p-3">
          <div className="label mb-1">Freighter · Testnet</div>
          <div className="mb-2 break-all font-mono text-xs text-ink">{address}</div>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="label">Balance</span>
            <span className="font-mono text-sm text-ink">{bal === null ? "unfunded" : `${Number(bal).toLocaleString()} XLM`}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <CopyButton value={address} />
            <button
              className="btn-secondary px-2 py-1 text-xs"
              disabled={funding}
              onClick={async () => {
                setFunding(true);
                try {
                  await fundWithFriendbot(address);
                  toast("Funded with 10,000 testnet XLM");
                } catch (e) {
                  toast((e as Error).message, "err");
                } finally {
                  setFunding(false);
                }
              }}
            >
              {funding ? <Spinner className="size-3" /> : <Icon name="water_drop" className="!text-[16px]" />} Friendbot
            </button>
            <a className="btn-ghost col-span-1 px-2 py-1 text-xs" target="_blank" rel="noreferrer" href={`${config.explorer}/account/${address}`}>
              Explorer ↗
            </a>
            <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { disconnect(); setOpen(false); }}>
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Shell({ route, onRoute, children }: { route: Route; onRoute: (r: Route) => void; children: ReactNode }) {
  const { ledger, fee, online } = useNetwork();
  const { walletError, networkWarning, toasts } = useApp();

  return (
    <div className="min-h-dvh pb-24 md:pb-10">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <a href="#/streams" className="flex min-w-0 items-center gap-2.5">
            <img src="/favicon.svg" alt="" className="size-8 shrink-0" />
            <div className="min-w-0">
              <div className="font-display text-lg font-semibold leading-tight tracking-tight text-ink">FlowPulse</div>
              <div className="flex items-center gap-1.5 truncate font-mono text-[10px] uppercase tracking-wide text-lead">
                <Pip tone={online ? "ok" : "err"} pulse={online} /> Soroban Testnet
                {ledger && <span className="hidden sm:inline">· Ledger #{ledger.toLocaleString()}</span>}
              </div>
            </div>
          </a>
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#/${n.id}`}
                onClick={() => onRoute(n.id)}
                className={`flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm ${
                  route === n.id ? "bg-cobalt/8 text-cobalt" : "text-lead hover:bg-vellum hover:text-ink-2"
                }`}
              >
                <Icon name={n.icon} className="!text-[18px]" />
                {n.label}
              </a>
            ))}
          </nav>
          <WalletButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-4 md:px-6 md:pt-6">
        <div className="panel mb-4 flex items-center justify-between gap-3 px-3 py-2 font-mono text-[11px] text-lead">
          <span className="flex items-center gap-1.5 truncate">
            <Pip tone="ok" /> SOROBAN INCLUSION FEE (p50) <span className="text-cobalt">{fee ?? "…"} XLM</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            <Icon name="deployed_code" className="!text-[16px] text-cobalt" />
            Ledger <span className="text-ink-2">#{ledger?.toLocaleString() ?? "…"}</span>
          </span>
        </div>
        {walletError && <Banner tone="err">{walletError}</Banner>}
        {networkWarning && (
          <Banner tone="warn">Freighter is set to {networkWarning}. Switch it to Testnet to sign FlowPulse transactions.</Banner>
        )}
        {children}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper md:hidden" aria-label="Primary">
        <div className="grid grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((n) => (
            <a
              key={n.id}
              href={`#/${n.id}`}
              onClick={() => onRoute(n.id)}
              className={`m-1 flex flex-col items-center gap-0.5 rounded-sm py-2 font-mono text-[10px] ${
                route === n.id ? "bg-cobalt/8 text-cobalt" : "text-lead"
              }`}
            >
              <Icon name={n.icon} />
              {n.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`floating pointer-events-auto flex max-w-md items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm ${t.tone === "err" ? "text-err" : "text-ink"}`}>
            <Icon name={t.tone === "err" ? "error" : "check_circle"} className={t.tone === "err" ? "" : "text-ok"} fill />
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Banner({ tone, children }: { tone: "err" | "warn" | "info"; children: ReactNode }) {
  const cls = {
    err: "border-err/30 bg-err-bg text-err",
    warn: "border-warn/30 bg-warn-bg text-warn",
    info: "border-cobalt/30 bg-cobalt/5 text-ink-2",
  }[tone];
  return (
    <div className={`mb-4 flex items-start gap-2 rounded-sm border px-3 py-2 text-sm ${cls}`}>
      <Icon name={tone === "info" ? "info" : "warning"} className="!text-[18px]" />
      <div>{children}</div>
    </div>
  );
}
