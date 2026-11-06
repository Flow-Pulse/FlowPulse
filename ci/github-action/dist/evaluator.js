"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractStellarAddress = extractStellarAddress;
exports.parseRuleConfig = parseRuleConfig;
exports.evaluatePullRequest = evaluatePullRequest;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
/**
 * Extracts a Stellar Ed25519 public key (G...) from markdown text.
 * Matches patterns like:
 *   stellar: G...
 *   stellar address: G...
 *   stellar=G...
 *   bare G...
 */
function extractStellarAddress(text) {
    if (!text)
        return null;
    const tagged = text.match(/stellar\s*(?:address)?\s*[:=]\s*`?(G[A-Z2-7]{55})`?/i);
    const any = tagged?.[1] ?? text.match(/\b(G[A-Z2-7]{55})\b/)?.[1];
    if (!any)
        return null;
    try {
        return stellar_sdk_1.StrKey.isValidEd25519PublicKey(any) ? any : null;
    }
    catch {
        return /^G[A-Z2-7]{55}$/.test(any) ? any : null;
    }
}
/**
 * Minimal robust parser for `.flowpulse.yml` configuration files without heavy external dependencies.
 * Handles standard YAML structure:
 * ```yaml
 * version: 1
 * rules:
 *   - name: Core feature bounty
 *     label: bounty-approved
 *     amount: 100
 *     duration_hours: 48
 * ```
 */
function parseRuleConfig(content) {
    const lines = content.split(/\r?\n/);
    const rules = [];
    let currentRule = null;
    let inRules = false;
    for (const raw of lines) {
        const line = raw.replace(/\s+#.*$/, "").trimEnd();
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#"))
            continue;
        if (trimmed.startsWith("rules:")) {
            inRules = true;
            continue;
        }
        if (inRules) {
            if (trimmed.startsWith("- ")) {
                if (currentRule && currentRule.name && currentRule.amount) {
                    rules.push(currentRule);
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
        rules.push(currentRule);
    }
    return { rules };
}
function assignField(rule, key, valStr) {
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
function evaluatePullRequest(config, pr) {
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
        if (rule.enabled === false)
            continue;
        // Check label match if specified
        if (rule.label) {
            const hasLabel = pr.labels.some((l) => l.toLowerCase() === rule.label.toLowerCase());
            if (!hasLabel)
                continue;
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
