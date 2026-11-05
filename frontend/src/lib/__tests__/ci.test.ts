import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { evaluate, extractStellarAddress, DEFAULT_RULE, type PullRequest } from "../ci";

describe("extractStellarAddress", () => {
  const g = Keypair.random().publicKey();
  it("finds tagged and bare addresses", () => {
    expect(extractStellarAddress(`Fixes #1\n\nstellar: ${g}`)).toBe(g);
    expect(extractStellarAddress(`Stellar address = \`${g}\``)).toBe(g);
    expect(extractStellarAddress(`pay me at ${g} thanks`)).toBe(g);
  });
  it("rejects invalid checksums and empty bodies", () => {
    expect(extractStellarAddress("stellar: G" + "A".repeat(55))).toBeNull();
    expect(extractStellarAddress(null)).toBeNull();
  });
});

describe("evaluate", () => {
  const pr = (n: number, labels: string[]): PullRequest => ({ number: n, title: "t", url: "", author: "a", mergedAt: "", labels, stellarAddress: null });
  it("filters by label case-insensitively", () => {
    const rule = { ...DEFAULT_RULE, id: "r", repo: "o/r", label: "Bounty-Approved" };
    expect(evaluate(rule, [pr(1, ["bounty-approved"]), pr(2, [])]).map((m) => m.pr.number)).toEqual([1]);
    expect(evaluate({ ...rule, label: "" }, [pr(1, []), pr(2, [])])).toHaveLength(2);
    expect(evaluate({ ...rule, enabled: false }, [pr(1, ["bounty-approved"])])).toHaveLength(0);
  });
});
