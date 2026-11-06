import { useEffect, useMemo, useState } from "react";
import { StrKey } from "@stellar/stellar-sdk";
import { useApp } from "../state";
import { splitter, type Payout } from "../lib/contracts";
import { config, XLM_SAC } from "../lib/config";
import { cleanError, sv } from "../lib/soroban";
import { equalWeights, fetchRepoManifest, parseManifest, registryUrl, resolveMaintainerFundingAddress, suggestDependencyWeights, type Dependency, type Manifest } from "../lib/manifest";
import { fromUnits, shortAddr, toUnits } from "../lib/format";
import { Banner } from "../components/Shell";
import { CopyButton, Empty, Field, Icon, SectionTitle, Spinner } from "../components/ui";

interface Row {
  key: string;
  label: string;
  recipient: string;
  bps: number;
  ecosystem?: Dependency["ecosystem"];
  resolvedFromFunding?: boolean;
}

const MAX_SPLITS = 32;
const SAMPLE = `[package]
name = "flowpulse-core"

[dependencies]
soroban-sdk = "29.0.1"
ed25519-dalek = "2"
serde_json = "1.0"
tiny-keccak = { version = "2.0", features = ["sha3"] }

[dev-dependencies]
proptest = "1"
`;

export function CascadesPage() {
  const { address, runTx, version, connect } = useApp();
  const [source, setSource] = useState<"paste" | "github">("paste");
  const [text, setText] = useState(SAMPLE);
  const [repo, setRepo] = useState("");
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [onChain, setOnChain] = useState<Row[] | null>(null);
  const [loadingChain, setLoadingChain] = useState(false);
  const [includeDev, setIncludeDev] = useState(false);
  const [suggestingWeights, setSuggestingWeights] = useState(false);

  // Preview / distribute
  const [owner, setOwner] = useState(config.readSource); // demo table until a wallet connects
  const [amount, setAmount] = useState("100");
  const [preview, setPreview] = useState<Payout[] | null>(null);
  const [previewErr, setPreviewErr] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (address) setOwner(address);
  }, [address]);

  // Load the connected account's published table.
  useEffect(() => {
    if (!address) {
      setOnChain(null);
      return;
    }
    setLoadingChain(true);
    splitter
      .get(address)
      .then((list) => {
        const r = list.map((s, i) => ({ key: `chain-${i}`, label: s.label, recipient: s.recipient, bps: Number(s.bps) }));
        setOnChain(r);
        if (r.length) setRows(r);
      })
      .catch(() => setOnChain([]))
      .finally(() => setLoadingChain(false));
  }, [address, version]);

  function applyManifest(m: Manifest) {
    setManifest(m);
    const deps = m.deps.filter((d) => includeDev || d.kind === "normal" || d.kind === "peer").slice(0, MAX_SPLITS);
    // Default: 90% across deps, 10% reserve for the project itself.
    const w = equalWeights(deps.length, 9000);
    const initialRows: Row[] = deps.map((d, i) => {
      const existing = rows.find((r) => r.label === d.name);
      return {
        key: `${d.name}-${i}`,
        label: d.name,
        recipient: existing?.recipient ?? "",
        bps: w[i],
        ecosystem: d.ecosystem,
        resolvedFromFunding: existing?.resolvedFromFunding,
      };
    });
    setRows(initialRows);

    // Non-blocking auto-resolution of maintainer Stellar addresses from FUNDING.json
    deps.forEach(async (d, i) => {
      if (initialRows[i].recipient) return;
      try {
        const addr = await resolveMaintainerFundingAddress(d);
        if (addr) {
          setRows((current) =>
            current.map((r, idx) =>
              idx === i && !r.recipient
                ? { ...r, recipient: addr, resolvedFromFunding: true }
                : r
            )
          );
        }
      } catch {
        // Silent and non-blocking
      }
    });
  }

  function parse() {
    setParseError(null);
    try {
      const m = parseManifest(text);
      if (m.deps.length === 0) throw new Error("No dependencies found");
      applyManifest(m);
    } catch (e) {
      setParseError((e as Error).message);
    }
  }

  async function fetchRepo() {
    setParseError(null);
    setFetching(true);
    try {
      const { text: t } = await fetchRepoManifest(repo.trim());
      setText(t);
      const m = parseManifest(t);
      if (m.deps.length === 0) throw new Error("No dependencies found");
      applyManifest(m);
    } catch (e) {
      setParseError((e as Error).message);
    } finally {
      setFetching(false);
    }
  }

  const allocated = rows.reduce((a, r) => a + (r.bps || 0), 0);
  const reserve = 10000 - allocated;
  const issues = useMemo(() => {
    const out: string[] = [];
    if (rows.length > MAX_SPLITS) out.push(`At most ${MAX_SPLITS} splits`);
    if (allocated > 10000) out.push("Weights exceed 100%");
    const missing = rows.filter((r) => !r.recipient).length;
    if (missing) out.push(`${missing} row(s) need a Stellar address`);
    if (rows.some((r) => r.recipient && !StrKey.isValidEd25519PublicKey(r.recipient) && !StrKey.isValidContract(r.recipient)))
      out.push("Invalid Stellar address in table");
    if (rows.some((r) => r.recipient === address)) out.push("You can't split to yourself");
    const seen = new Set<string>();
    if (rows.some((r) => r.recipient && (seen.has(r.recipient) || !seen.add(r.recipient)))) out.push("Duplicate recipient");
    if (rows.some((r) => r.bps <= 0)) out.push("Each split needs a weight above 0%");
    return out;
  }, [rows, allocated, address]);

  const dirty = JSON.stringify(rows.map(({ label, recipient, bps }) => [label, recipient, bps])) !==
    JSON.stringify((onChain ?? []).map(({ label, recipient, bps }) => [label, recipient, bps]));

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function publish() {
    if (!address) return;
    await runTx({
      title: "Publish split table",
      contractId: config.cascadeSplitterId,
      method: "set_splits",
      args: [sv.addr(address), sv.splits(rows.map((r) => ({ recipient: r.recipient, bps: r.bps, label: r.label })))],
      display: {
        owner: address,
        splits: rows.map((r) => `${r.label}=${(r.bps / 100).toFixed(2)}%→${shortAddr(r.recipient)}`).join(", "),
        reserve_bps: String(reserve),
      },
    });
  }

  async function runPreview() {
    setPreview(null);
    setPreviewErr(null);
    setPreviewing(true);
    try {
      if (!StrKey.isValidEd25519PublicKey(owner) && !StrKey.isValidContract(owner)) throw new Error("Enter a valid owner address");
      setPreview(await splitter.preview(owner, toUnits(amount)));
    } catch (e) {
      setPreviewErr(cleanError(String((e as Error).message)));
    } finally {
      setPreviewing(false);
    }
  }

  async function distribute() {
    if (!address) return;
    const units = toUnits(amount);
    await runTx({
      title: "Distribute through cascade",
      contractId: config.cascadeSplitterId,
      method: "distribute",
      args: [sv.addr(address), sv.addr(owner), sv.addr(XLM_SAC), sv.i128(units)],
      display: { from: address, owner, token: "XLM", amount: `${units} stroops (${fromUnits(units)} XLM)` },
    });
  }

  const labelOf = (addr: string) => (addr === owner ? "owner (reserve)" : rows.find((r) => r.recipient === addr)?.label);

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="panel p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="chip">
            <Icon name="inventory_2" className="!text-[14px]" /> {manifest?.name ?? (onChain?.length ? "On-chain table" : "No manifest loaded")} ·{" "}
            {manifest?.ecosystem === "npm" ? "npm" : "crates.io"}
          </span>
          {loadingChain ? <span className="chip"><Spinner className="size-3" /> loading</span> : onChain?.length ? <span className="chip-ok">● Published</span> : <span className="chip">draft</span>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="label">Allocated</div>
            <div className="font-display text-3xl font-semibold tracking-tight text-ink">{(allocated / 100).toFixed(2)}%</div>
          </div>
          <div>
            <div className="label">Reserve (yours)</div>
            <div className={`font-display text-3xl font-semibold tracking-tight ${reserve < 0 ? "text-err" : "text-ink"}`}>{(reserve / 100).toFixed(2)}%</div>
          </div>
          <div>
            <div className="label">Upstream</div>
            <div className="font-display text-3xl font-semibold tracking-tight text-ink">{rows.length}</div>
          </div>
          <div>
            <div className="label">Cascade depth</div>
            <div className="font-display text-3xl font-semibold tracking-tight text-ink">≤ 3</div>
          </div>
        </div>
        <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-line-faint">
          {rows.map((r, i) => (
            <div key={r.key} className={i % 3 === 0 ? "bg-cobalt" : i % 3 === 1 ? "bg-cobalt-hover/70" : "bg-ok"} style={{ width: `${Math.max(0, r.bps) / 100}%` }} title={`${r.label} ${(r.bps / 100).toFixed(2)}%`} />
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Source */}
        <section>
          <SectionTitle icon="description">Dependency source</SectionTitle>
          <div className="panel">
            <div className="flex border-b border-line-faint">
              {(
                [
                  ["paste", "Paste manifest"],
                  ["github", "GitHub repo"],
                ] as const
              ).map(([k, l]) => (
                <button key={k} onClick={() => setSource(k)} className={`flex-1 border-b-2 px-3 py-2.5 text-sm ${source === k ? "border-cobalt text-cobalt" : "border-transparent text-lead hover:text-ink-2"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="space-y-3 p-4">
              {source === "paste" ? (
                <>
                  <textarea
                    className="input h-56 resize-y py-2 font-mono text-xs"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    spellCheck={false}
                    aria-label="Cargo.toml or package.json"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-primary" onClick={parse}>
                      <Icon name="account_tree" /> Build split table
                    </button>
                    <label className="btn-secondary cursor-pointer">
                      <Icon name="upload_file" /> Upload
                      <input
                        type="file"
                        accept=".toml,.json"
                        className="hidden"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) setText(await f.text());
                        }}
                      />
                    </label>
                  </div>
                </>
              ) : (
                <>
                  <Field label="Public repository" hint="Reads Cargo.toml or package.json from the default branch">
                    <input className="input font-mono text-xs" placeholder="stellar/rs-soroban-sdk" value={repo} onChange={(e) => setRepo(e.target.value)} />
                  </Field>
                  <button className="btn-primary" onClick={fetchRepo} disabled={fetching || !repo}>
                    {fetching ? <Spinner /> : <Icon name="cloud_download" />} Fetch &amp; build
                  </button>
                </>
              )}
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="checkbox" className="size-4 accent-cobalt" checked={includeDev} onChange={(e) => setIncludeDev(e.target.checked)} />
                Include dev / build dependencies
              </label>
              {parseError && <div className="text-sm text-err">{parseError}</div>}
              {manifest && (
                <div className="font-mono text-[11px] text-lead">
                  Parsed {manifest.deps.length} deps · using {rows.length}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Split architecture */}
        <section>
          <SectionTitle
            icon="lan"
            aside={
              rows.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-ghost px-2 py-1 text-xs"
                    disabled={suggestingWeights}
                    onClick={async () => {
                      setSuggestingWeights(true);
                      try {
                        const w = await suggestDependencyWeights(rows.map((r) => ({ name: r.label, ecosystem: r.ecosystem ?? "cargo" })));
                        setRows((rs) => rs.map((r, i) => ({ ...r, bps: w[i] ?? r.bps })));
                      } finally {
                        setSuggestingWeights(false);
                      }
                    }}
                    title="Suggest proportional weights based on download counts"
                  >
                    {suggestingWeights ? <Spinner className="size-3" /> : <Icon name="auto_graph" className="!text-[16px]" />} Suggest weights
                  </button>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setRows((rs) => { const w = equalWeights(rs.length, 9000); return rs.map((r, i) => ({ ...r, bps: w[i] })); })}>
                    <Icon name="balance" className="!text-[16px]" /> Equalize
                  </button>
                </div>
              )
            }
          >
            Split architecture
          </SectionTitle>

          {rows.length === 0 ? (
            <Empty icon="account_tree" title="No splits yet">
              Paste a Cargo.toml / package.json or fetch a repo to generate one row per dependency.
            </Empty>
          ) : (
            <div className="panel p-3">
              <div className="flex items-center gap-3 rounded-sm border border-line bg-vellum p-3">
                <span className="flex size-9 items-center justify-center rounded-sm border border-line bg-paper">
                  <Icon name="deployed_code" className="text-cobalt" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-sm font-semibold text-ink">{manifest?.name ?? "your project"}</span>
                    <span className="chip-accent">ROOT 100%</span>
                  </div>
                  <div className="truncate font-mono text-[11px] text-lead">{address ? shortAddr(address, 6, 6) : "connect wallet to publish"}</div>
                </div>
              </div>

              <div className="relative ml-4 mt-2 space-y-2 border-l border-line pl-4">
                {rows.map((r, i) => (
                  <div key={r.key} className="relative rounded-sm border border-line bg-paper p-3">
                    <span className="absolute -left-4 top-6 h-px w-4 bg-line" />
                    <div className="flex items-center gap-2">
                      <input
                        className="min-w-0 flex-1 bg-transparent font-mono text-sm font-semibold text-ink outline-none"
                        value={r.label}
                        maxLength={64}
                        onChange={(e) => update(i, { label: e.target.value })}
                        aria-label="Label"
                      />
                      {r.ecosystem && (
                        <a className="chip hover:border-ink" href={registryUrl({ name: r.label, ecosystem: r.ecosystem })} target="_blank" rel="noreferrer">
                          {r.ecosystem === "cargo" ? "crate" : "npm"} ↗
                        </a>
                      )}
                      {r.resolvedFromFunding && (
                        <span className="chip-ok flex items-center gap-1 text-[10px]" title="Prefilled from repository FUNDING.json">
                          <Icon name="verified" className="!text-[12px]" /> resolved from FUNDING.json
                        </span>
                      )}
                      {!r.recipient && (
                        <button
                          type="button"
                          className="btn-ghost px-1.5 py-0.5 text-[10px] text-cobalt hover:underline"
                          onClick={async () => {
                            const addr = await resolveMaintainerFundingAddress({ name: r.label, ecosystem: r.ecosystem ?? "cargo" });
                            if (addr) update(i, { recipient: addr, resolvedFromFunding: true });
                          }}
                        >
                          <Icon name="search" className="!text-[12px]" /> Resolve FUNDING.json
                        </button>
                      )}
                      <div className="flex items-center rounded-sm border border-cobalt/30 bg-cobalt/5">
                        <input
                          className="w-16 bg-transparent px-1.5 py-1 text-right font-mono text-sm text-cobalt outline-none"
                          inputMode="decimal"
                          value={(r.bps / 100).toString()}
                          onChange={(e) => update(i, { bps: Math.round(Math.max(0, Number(e.target.value) || 0) * 100) })}
                          aria-label="Weight percent"
                        />
                        <span className="pr-1.5 font-mono text-xs text-cobalt">%</span>
                      </div>
                      <button className="btn-ghost p-1" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`}>
                        <Icon name="close" className="!text-[18px]" />
                      </button>
                    </div>
                    <input
                      className={`input mt-2 h-8 font-mono text-[11px] ${r.recipient && !StrKey.isValidEd25519PublicKey(r.recipient) && !StrKey.isValidContract(r.recipient) ? "border-err" : ""}`}
                      placeholder="Maintainer Stellar address (G…)"
                      value={r.recipient}
                      onChange={(e) => update(i, { recipient: e.target.value.trim() })}
                      spellCheck={false}
                    />
                  </div>
                ))}
                <div className="relative rounded-sm border border-dashed border-line p-3">
                  <span className="absolute -left-4 top-6 h-px w-4 bg-line" />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-mono text-sm text-ink-2">Unallocated reserve</div>
                      <div className="font-mono text-[11px] text-lead">stays with the root owner</div>
                    </div>
                    <span className={reserve < 0 ? "chip-err" : "chip"}>{(reserve / 100).toFixed(2)}%</span>
                  </div>
                </div>
              </div>

              <button
                className="btn-secondary mt-3 w-full"
                disabled={rows.length >= MAX_SPLITS}
                onClick={() => setRows((rs) => [...rs, { key: `new-${Date.now()}`, label: "upstream", recipient: "", bps: 500 }])}
              >
                <Icon name="add_circle" /> Add dependency split
              </button>

              {issues.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-warn">
                  {issues.map((m) => (
                    <li key={m} className="flex items-center gap-1"><Icon name="warning" className="!text-[14px]" />{m}</li>
                  ))}
                </ul>
              )}
              {address ? (
                <button className="btn-primary mt-3 w-full py-2.5" disabled={issues.length > 0 || !dirty} onClick={publish}>
                  <Icon name="publish" /> {onChain?.length ? "Update" : "Publish"} split table on Soroban
                </button>
              ) : (
                <button className="btn-primary mt-3 w-full py-2.5" onClick={connect}>
                  <Icon name="account_balance_wallet" /> Connect to publish
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Preview & distribute */}
      <section>
        <SectionTitle icon="call_split">Fund a cascade</SectionTitle>
        <div className="panel grid gap-4 p-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="space-y-3">
            <Field label="Project owner (split table)" hint="Any account that published a table — funds cascade through its upstreams">
              <input className="input font-mono text-xs" value={owner} onChange={(e) => setOwner(e.target.value.trim())} placeholder="G…" />
            </Field>
            <Field label="Amount (XLM)">
              <input className="input font-mono" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-secondary" onClick={runPreview} disabled={previewing}>
                {previewing ? <Spinner /> : <Icon name="science" />} Preview
              </button>
              <button className="btn-primary" onClick={distribute} disabled={!address}>
                <Icon name="send" /> Distribute
              </button>
            </div>
            {previewErr && <Banner tone="err">{previewErr}</Banner>}
          </div>
          <div>
            <div className="label mb-2">On-chain dry run (CascadeSplitter.preview)</div>
            {!preview ? (
              <div className="rounded-sm border border-dashed border-line p-6 text-center text-sm text-lead">Run a preview to see exactly where each stroop lands.</div>
            ) : (
              <div className="overflow-hidden rounded-sm border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-vellum">
                    <tr className="border-b border-line">
                      <th className="label px-3 py-2 text-left">Recipient</th>
                      <th className="label px-3 py-2 text-center">Depth</th>
                      <th className="label px-3 py-2 text-right">XLM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p) => (
                      <tr key={p.recipient} className="row">
                        <td className="px-3 py-2">
                          <div className="font-mono text-xs text-ink">{labelOf(p.recipient) ?? shortAddr(p.recipient, 6, 6)}</div>
                          <div className="font-mono text-[10px] text-lead">{shortAddr(p.recipient, 6, 6)}</div>
                        </td>
                        <td className="px-3 py-2 text-center"><span className={Number(p.depth) === 0 ? "chip" : "chip-accent"}>L{Number(p.depth)}</span></td>
                        <td className="px-3 py-2 text-right font-mono text-ink">{fromUnits(BigInt(p.amount), 7, 4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Icon name="verified_user" className="text-cobalt" />
          <div>
            <div className="text-sm font-medium text-ink">CascadeSplitter v0.1 · Soroban testnet</div>
            <div className="font-mono text-[11px] text-lead">Unaudited — testnet only · {shortAddr(config.cascadeSplitterId, 6, 6)}</div>
          </div>
        </div>
        <CopyButton value={config.cascadeSplitterId} label="Copy contract ID" />
      </section>
    </div>
  );
}
