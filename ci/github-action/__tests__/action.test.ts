import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import {
  extractStellarAddress,
  parseRuleConfig,
  evaluatePullRequest,
  type PullRequestPayload,
} from "../src/evaluator";

const VALID_ADDR = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

describe("FlowPulse GitHub Action Evaluator", () => {
  it("extracts Stellar address from various formatting styles", () => {
    expect(extractStellarAddress(`stellar: ${VALID_ADDR}`)).toBe(VALID_ADDR);
    expect(extractStellarAddress(`stellar address: \`${VALID_ADDR}\``)).toBe(VALID_ADDR);
    expect(extractStellarAddress(`Stellar=${VALID_ADDR}`)).toBe(VALID_ADDR);
    expect(extractStellarAddress(`Please send payout to ${VALID_ADDR} thanks!`)).toBe(VALID_ADDR);
    expect(extractStellarAddress("no address here")).toBeNull();
    expect(extractStellarAddress(null)).toBeNull();
    expect(extractStellarAddress("G1234invalid")).toBeNull();
  });

  it("parses .flowpulse.yml configuration structure", () => {
    const yaml = `
version: 1
rules:
  - name: Core feature bounty
    label: bounty-approved
    amount: 150
    token: XLM
    duration_hours: 48
  - name: Docs bounty
    label: area: docs
    amount: 50
    duration_hours: 24
`;
    const config = parseRuleConfig(yaml);
    expect(config.rules.length).toBe(2);
    expect(config.rules[0].name).toBe("Core feature bounty");
    expect(config.rules[0].label).toBe("bounty-approved");
    expect(config.rules[0].amount).toBe("150");
    expect(config.rules[0].token).toBe("XLM");
    expect(config.rules[0].duration_hours).toBe(48);

    expect(config.rules[1].name).toBe("Docs bounty");
    expect(config.rules[1].label).toBe("area: docs");
    expect(config.rules[1].amount).toBe("50");
  });

  it("evaluates a merged PR against fixture payload successfully", () => {
    const fixturePath = path.resolve(__dirname, "../fixtures/pull_request_merged.json");
    const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
    const pr = raw.pull_request;

    const prPayload: PullRequestPayload = {
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      author: pr.user.login,
      merged: pr.merged,
      mergedAt: pr.merged_at,
      labels: pr.labels.map((l: { name: string }) => l.name),
      body: pr.body,
    };

    const config = {
      rules: [
        {
          name: "Bounty Approved",
          label: "bounty-approved",
          amount: "100",
          duration_hours: 48,
        },
      ],
    };

    const result = evaluatePullRequest(config, prPayload);
    expect(result.matched).toBe(true);
    expect(result.ruleName).toBe("Bounty Approved");
    expect(result.amount).toBe("100");
    expect(result.durationHours).toBe(48);
    expect(result.recipientAddress).toBe(VALID_ADDR);
  });

  it("rejects unmerged pull requests", () => {
    const prPayload: PullRequestPayload = {
      number: 10,
      title: "closed PR",
      url: "https://github.com/test/test/pull/10",
      author: "alice",
      merged: false,
      labels: ["bounty-approved"],
      body: `stellar: ${VALID_ADDR}`,
    };

    const config = {
      rules: [{ name: "Rule 1", label: "bounty-approved", amount: "50" }],
    };

    const result = evaluatePullRequest(config, prPayload);
    expect(result.matched).toBe(false);
    expect(result.reason).toContain("closed without being merged");
  });

  it("fails matching gracefully if author did not provide Stellar address", () => {
    const prPayload: PullRequestPayload = {
      number: 11,
      title: "no address PR",
      url: "https://github.com/test/test/pull/11",
      author: "bob",
      merged: true,
      labels: ["bounty-approved"],
      body: "Fixed a bug with zero address attached.",
    };

    const config = {
      rules: [{ name: "Rule 1", label: "bounty-approved", amount: "50" }],
    };

    const result = evaluatePullRequest(config, prPayload);
    expect(result.matched).toBe(false);
    expect(result.recipientAddress).toBeNull();
    expect(result.reason).toContain("no valid Stellar address found");
  });
});
