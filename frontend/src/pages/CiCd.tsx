import { useEffect, useState } from "react";
import { useApp } from "../state";
import {
  DEFAULT_RULE,
  evaluate,
  fetchMergedPRs,
  loadPaid,
  loadRules,
  markPaid,
  paidKey,
  saveRules,
  type BountyRule,
  type PullRequest,
  type RuleMatch,
} from "../lib/ci";
import { shortAddr, timeAgo } from "../lib/format";
import { Banner } from "../components/Shell";
import { NewStreamModal } from "../components/NewStreamModal";
import { Empty, Field, Icon, Pip, SectionTitle, Sheet } from "../components/ui";

export function CiCdPage() {
  const { version } = useApp();
  const [rules, setRules] = useState<BountyRule[]>(loadRules);
  const [editing, setEditing] = useState<BountyRule | null>(null);
  const [prs, setPrs] = useState<Record<string, PullRequest[]>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [paid, setPaid] = useState(loadPaid);
  const [paying, setPaying] = useState<RuleMatch | null>(null);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => saveRules(rules), [rules]);
  useEffect(() => setPaid(loadPaid()), [version]);

  const repos = [...new Set(rules.map((r) => r.repo).filter(Boolean))];

  async function sync() {
    for (const repo of repos) {
      setLoading((l) => ({ ...l, [repo]: true }));
      setErrors((e) => ({ ...e, [repo]: "" }));
      try {
        const list = await fetchMergedPRs(repo);
        setPrs((p) => ({ ...p, [repo]: list }));
      } catch (e) {
        setErrors((x) => ({ ...x, [repo]: (e as Error).message }));
      } finally {
        setLoading((l) => ({ ...l, [repo]: false }));
      }
    }
    setCheckedAt(Date.now());
  }

  useEffect(() => {
    if (repos.length) sync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repos.join(",")]);

  const matches = rules.flatMap((r) => evaluate(r, prs[r.repo] ?? []));
  const anyLoading = Object.values(loading).some(Boolean);

  return (
    <div className="space-y-6">
      <section className="panel p-4 md:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-wide text-ink">
            <Icon name="hub" className="text-cobalt" /> CI/CD automation matrix
          </span>
          <span className="chip-ok"><Pip tone="ok" /> GitHub REST</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat n={repos.length} label="Repos" sub="watched" />
          <Stat n={rules.filter((r) => r.enabled).length} label="Rules" sub="active" />
          <Stat n={matches.length} label="Matches" sub={`${matches.filter((m) => paid[paidKey(m)]).length} paid`} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 rounded-sm border border-line-faint bg-vellum px-3 py-2 font-mono text-[11px] text-lead">
          <span>{checkedAt ? `Last sync ${timeAgo(checkedAt)}` : "Not synced yet"}</span>
          <button className="text-cobalt hover:underline disabled:opacity-50" onClick={sync} disabled={anyLoading || !repos.length}>
            {anyLoading ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </section>

      <Banner tone="info">
        Contributors opt in by adding <code className="font-mono">stellar: G…</code> to their PR description. Merged PRs that match a rule
        can be paid as a bounty stream in one click. Headless webhook execution (GitHub Action) is on the roadmap.
      </Banner>

      <section>
        <SectionTitle
          icon="rule"
          aside={<span className="chip">{rules.filter((r) => r.enabled).length} running</span>}
        >
          Automated trigger rules
        </SectionTitle>
        {rules.length === 0 ? (
          <Empty icon="rule" title="No rules yet">Create a rule to watch a public repo for merged, labeled pull requests.</Empty>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {rules.map((r) => (
              <article key={r.id} className="panel p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-vellum">
                    <Icon name="merge" className="text-cobalt" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-lg font-semibold text-ink">{r.name}</div>
                    <div className="truncate font-mono text-xs text-lead">{r.repo || "no repo"}</div>
                  </div>
                  <button
                    onClick={() => setRules((rs) => rs.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)))}
                    className={r.enabled ? "chip-ok" : "chip"}
                  >
                    ● {r.enabled ? "Active" : "Paused"}
                  </button>
                </div>
                <div className="mt-3 space-y-1.5 rounded-sm border border-line-faint bg-vellum p-3 text-sm">
                  <div className="grid grid-cols-[64px_1fr] items-center gap-2">
                    <span className="label">Event</span>
                    <code className="truncate rounded-xs border border-line bg-paper px-1.5 py-0.5 font-mono text-xs">pull_request.closed == merged</code>
                  </div>
                  <div className="grid grid-cols-[64px_1fr] items-center gap-2">
                    <span className="label">Filter</span>
                    <span>{r.label ? <span className="chip-accent">{r.label}</span> : <span className="text-lead">any label</span>}</span>
                  </div>
                  <div className="grid grid-cols-[64px_1fr] items-center gap-2">
                    <span className="label text-cobalt">Action</span>
                    <span className="text-ink-2">Stream {r.amountXlm} XLM over {r.durationHours}h to PR author</span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[11px] text-lead">
                    {loading[r.repo] ? "syncing…" : errors[r.repo] ? <span className="text-err">{errors[r.repo]}</span> : `${evaluate(r, prs[r.repo] ?? []).length} matching PRs`}
                  </span>
                  <div className="flex gap-1">
                    <button className="btn-ghost p-1.5" onClick={() => setEditing(r)} aria-label="Edit rule"><Icon name="tune" className="!text-[18px]" /></button>
                    <button className="btn-ghost p-1.5" onClick={() => setRules((rs) => rs.filter((x) => x.id !== r.id))} aria-label="Delete rule"><Icon name="delete" className="!text-[18px]" /></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <button className="btn-primary mt-3 w-full py-3" onClick={() => setEditing({ ...DEFAULT_RULE, id: crypto.randomUUID() })}>
          <Icon name="add_circle" /> Create GitHub trigger rule
        </button>
      </section>

      <section>
        <SectionTitle icon="history" aside={<span className="label">evaluation log</span>}>
          Execution audit log
        </SectionTitle>
        {matches.length === 0 ? (
          <Empty icon="pending_actions" title="No matching merges">
            {repos.length ? "No recently merged PRs match your rules." : "Add a rule to start evaluating merged PRs."}
          </Empty>
        ) : (
          <div className="panel divide-y divide-line-faint">
            {matches.map((m) => {
              const k = paidKey(m);
              const tx = paid[k];
              return (
                <div key={`${m.rule.id}-${m.pr.number}`} className="flex flex-wrap items-center gap-3 p-3 hover:bg-vellum">
                  <Icon name={tx ? "check_circle" : m.pr.stellarAddress ? "pending" : "help"} className={tx ? "text-ok" : m.pr.stellarAddress ? "text-cobalt" : "text-lead"} />
                  <div className="min-w-0 flex-1">
                    <a href={m.pr.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-ink hover:underline">
                      #{m.pr.number} {m.pr.title}
                    </a>
                    <div className="truncate font-mono text-[11px] text-lead">
                      @{m.pr.author} · merged {timeAgo(Date.parse(m.pr.mergedAt))} · {m.pr.stellarAddress ? shortAddr(m.pr.stellarAddress) : "no Stellar address in PR"}
                    </div>
                  </div>
                  {tx ? (
                    <span className="chip-ok">Disbursed</span>
                  ) : m.pr.stellarAddress ? (
                    <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => setPaying(m)}>
                      <Icon name="bolt" className="!text-[16px]" /> Pay {m.rule.amountXlm} XLM
                    </button>
                  ) : (
                    <span className="chip-warn">Awaiting address</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {editing && (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            setRules((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]));
            setEditing(null);
          }}
        />
      )}

      {paying && (
        <PayBounty
          match={paying}
          onDone={(hash) => {
            if (hash) {
              markPaid(paidKey(paying), hash);
              setPaid(loadPaid());
            }
            setPaying(null);
          }}
        />
      )}
    </div>
  );
}

function PayBounty({ match, onDone }: { match: RuleMatch; onDone: (hash: string | null) => void }) {
  return (
    <NewStreamModal
      open
      onClose={() => onDone(null)}
      onSuccess={(o) => onDone(o.hash)}
      initial={{
        recipient: match.pr.stellarAddress ?? "",
        amount: match.rule.amountXlm,
        hours: match.rule.durationHours,
        title: `Bounty: ${match.rule.repo}#${match.pr.number}`,
        memo: `bounty ${match.rule.repo}#${match.pr.number} @${match.pr.author}`,
      }}
    />
  );
}

function RuleEditor({ rule, onClose, onSave }: { rule: BountyRule; onClose: () => void; onSave: (r: BountyRule) => void }) {
  const [r, setR] = useState(rule);
  const valid = /^[\w.-]+\/[\w.-]+$/.test(r.repo) && Number(r.amountXlm) > 0 && r.durationHours > 0;
  return (
    <Sheet open onClose={onClose} title={rule.repo ? "Edit rule" : "New trigger rule"} eyebrow={<span className="chip-accent">GITHUB · PR MERGE</span>}>
      <div className="space-y-3">
        <Field label="Rule name">
          <input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} />
        </Field>
        <Field label="Repository" hint="Public GitHub repo, owner/name">
          <input className="input font-mono text-xs" placeholder="stellar/js-stellar-sdk" value={r.repo} onChange={(e) => setR({ ...r, repo: e.target.value.trim().replace(/^https?:\/\/github\.com\//, "") })} />
        </Field>
        <Field label="Required label" hint="Leave empty to match every merged PR">
          <input className="input font-mono text-xs" value={r.label} onChange={(e) => setR({ ...r, label: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bounty (XLM)">
            <input className="input font-mono" inputMode="decimal" value={r.amountXlm} onChange={(e) => setR({ ...r, amountXlm: e.target.value })} />
          </Field>
          <Field label="Stream over (hours)">
            <input className="input font-mono" inputMode="numeric" value={r.durationHours} onChange={(e) => setR({ ...r, durationHours: Number(e.target.value) || 0 })} />
          </Field>
        </div>
        <button className="btn-primary w-full" disabled={!valid} onClick={() => onSave(r)}>
          <Icon name="save" /> Save rule
        </button>
      </div>
    </Sheet>
  );
}

function Stat({ n, label, sub }: { n: number; label: string; sub: string }) {
  return (
    <div className="rounded-sm border border-line p-3">
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-2xl font-semibold text-ink">{n}</span>
        <span className="label">{label}</span>
      </div>
      <div className="truncate text-xs text-lead">{sub}</div>
    </div>
  );
}

