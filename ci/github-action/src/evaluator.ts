import { extractStellarAddress } from "../../../frontend/src/lib/ci";

export { extractStellarAddress };

export interface BountyRuleConfig {
  name: string;
  label?: string;
  amount: string;
  token?: string;
  duration_hours?: number;
  enabled?: boolean;
}

export interface FlowPulseConfig {
  version?: number | string;
  rules: BountyRuleConfig[];
}

export interface PullRequestPayload {
  number: number;
  title: string;
  url: string;
  author: string;
  merged: boolean;
  mergedAt?: string | null;
  labels: string[];
  body?: string | null;
  stellarAddress?: string | null;
}

export interface EvaluationResult {
  matched: boolean;
  ruleName?: string;
  amount?: string;
  token?: string;
  durationHours?: number;
  recipientAddress?: string | null;
  reason?: string;
}

/**
 * Minimal robust parser for `.flowpulse.yml` configuration files without heavy external dependencies.
 */
export function parseRuleConfig(content: string): FlowPulseConfig {
  const lines = content.split(/\r?\n/);
  const rules: BountyRuleConfig[] = [];
  let currentRule: Partial<BountyRuleConfig> | null = null;
  let inRules = false;

  for (const raw of lines) {
    const line = raw.replace(/\s+#.*$/, "").trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("rules:")) {
      inRules = true;
      continue;
    }

    if (inRules) {
      if (trimmed.startsWith("- ")) {
        if (currentRule && currentRule.name && currentRule.amount) {
          rules.push(currentRule as BountyRuleConfig);
        }
        currentRule = {};
        const rest = trimmed.slice(2).trim();
        if (rest) {
          const kv = rest.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
          if (kv) {
            assignField(currentRule, kv[1], kv[2]);
          }
        }
        continue;
      }

      if (currentRule) {
        const kv = trimmed.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (kv) {
          assignField(currentRule, kv[1], kv[2]);
        }
      }
    }
  }

  if (currentRule && currentRule.name && currentRule.amount) {
    rules.push(currentRule as BountyRuleConfig);
  }

  return { rules };
}

function assignField(rule: Partial<BountyRuleConfig>, key: string, valStr: string) {
  const val = valStr.replace(/^["']|["']$/g, "").trim();
  switch (key) {
    case "name":
      rule.name = val;
      break;
    case "label":
      rule.label = val;
      break;
    case "amount":
      rule.amount = val;
      break;
    case "token":
      rule.token = val;
      break;
    case "duration_hours":
      rule.duration_hours = Number(val) || 24;
      break;
    case "enabled":
      rule.enabled = val.toLowerCase() !== "false";
      break;
  }
}

/**
 * Evaluates a closed Pull Request against parsed FlowPulse bounty rules.
 */
export function evaluatePullRequest(
  config: FlowPulseConfig,
  pr: PullRequestPayload
): EvaluationResult {
  if (!pr.merged) {
    return {
      matched: false,
      reason: "Pull Request was closed without being merged",
    };
  }

  const recipient = pr.stellarAddress || extractStellarAddress(pr.body);

  if (config.rules.length === 0) {
    return {
      matched: false,
      reason: "No rules configured in .flowpulse.yml",
    };
  }

  for (const rule of config.rules) {
    if (rule.enabled === false) continue;

    // Check label match if specified
    if (rule.label) {
      const hasLabel = pr.labels.some(
        (l) => l.toLowerCase() === rule.label!.toLowerCase()
      );
      if (!hasLabel) continue;
    }

    if (!recipient) {
      return {
        matched: false,
        ruleName: rule.name,
        amount: rule.amount,
        durationHours: rule.duration_hours ?? 24,
        recipientAddress: null,
        reason: `Matched rule '${rule.name}', but no valid Stellar address found in PR description`,
      };
    }

    return {
      matched: true,
      ruleName: rule.name,
      amount: rule.amount,
      token: rule.token ?? "XLM",
      durationHours: rule.duration_hours ?? 24,
      recipientAddress: recipient,
      reason: `Matched rule '${rule.name}' for author ${pr.author}`,
    };
  }

  return {
    matched: false,
    reason: "No rules matched the PR labels or conditions",
  };
}
