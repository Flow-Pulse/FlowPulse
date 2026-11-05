/**
 * CI/CD bounty rules evaluated against public GitHub activity.
 *
 * v0.1 runs in the browser: rules are stored locally and evaluated against
 * the public GitHub REST API. Matching PRs whose author published a Stellar
 * address can be paid with one click (opens a bounty stream).
 * Headless webhook execution lives on the roadmap (see ci/github-action).
 */
import { StrKey } from "@stellar/stellar-sdk";

export interface BountyRule {
  id: string;
  name: string;
  repo: string; // owner/repo
  event: "pr_merged";
  /** Only PRs carrying this label match (empty = any merged PR). */
  label: string;
  /** XLM to stream to the author. */
  amountXlm: string;
  /** Stream duration in hours. */
  durationHours: number;
  enabled: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  author: string;
  mergedAt: string;
  labels: string[];
  stellarAddress: string | null;
}

export interface RuleMatch {
  rule: BountyRule;
  pr: PullRequest;
}

const KEY = "flowpulse.rules.v1";
const PAID_KEY = "flowpulse.paid.v1";

export const DEFAULT_RULE: Omit<BountyRule, "id"> = {
  name: "PR merge bounty",
  repo: "",
  event: "pr_merged",
  label: "bounty-approved",
  amountXlm: "50",
  durationHours: 48,
  enabled: true,
};

export function loadRules(): BountyRule[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveRules(rules: BountyRule[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rules));
  } catch {
    /* ignore */
  }
}

export function loadPaid(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(PAID_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markPaid(key: string, txHash: string) {
  try {
    const p = loadPaid();
    p[key] = txHash;
    localStorage.setItem(PAID_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export const paidKey = (m: RuleMatch) => `${m.rule.repo}#${m.pr.number}`;

/**
 * Contributors opt in by writing their address in the PR description, e.g.
 *   stellar: GABC...XYZ
 */
export function extractStellarAddress(text: string | null | undefined): string | null {
  if (!text) return null;
  const tagged = text.match(/stellar\s*(?:address)?\s*[:=]\s*`?(G[A-Z2-7]{55})`?/i);
  const any = tagged?.[1] ?? text.match(/\b(G[A-Z2-7]{55})\b/)?.[1];
  return any && StrKey.isValidEd25519PublicKey(any) ? any : null;
}

export async function fetchMergedPRs(repo: string, token?: string): Promise<PullRequest[]> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=30`,
    { headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
  );
  if (res.status === 404) throw new Error(`Repository ${repo} not found (or private)`);
  if (res.status === 403) throw new Error("GitHub API rate limit reached — try again later");
  if (!res.ok) throw new Error(`GitHub API error ${res.status}`);
  const rows: Array<{
    number: number;
    title: string;
    html_url: string;
    user: { login: string } | null;
    merged_at: string | null;
    labels: { name: string }[];
    body: string | null;
  }> = await res.json();
  return rows
    .filter((r) => r.merged_at)
    .map((r) => ({
      number: r.number,
      title: r.title,
      url: r.html_url,
      author: r.user?.login ?? "ghost",
      mergedAt: r.merged_at!,
      labels: r.labels.map((l) => l.name),
      stellarAddress: extractStellarAddress(r.body),
    }));
}

export function evaluate(rule: BountyRule, prs: PullRequest[]): RuleMatch[] {
  if (!rule.enabled) return [];
  return prs
    .filter((pr) => !rule.label || pr.labels.some((l) => l.toLowerCase() === rule.label.toLowerCase()))
    .map((pr) => ({ rule, pr }));
}
