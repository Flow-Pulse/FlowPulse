/** Live checks against the deployed testnet contracts. Run with: INTEGRATION=1 pnpm test */
declare const process: { env: Record<string, string | undefined> };
import { describe, expect, it } from "vitest";
import { Keypair } from "@stellar/stellar-sdk";
import { router, splitter } from "../contracts";
import { config, XLM_SAC } from "../config";
import { simulate, sv } from "../soroban";

const live = process.env.INTEGRATION ? describe : describe.skip;

live("testnet contracts", () => {
  it("reads streams from StreamRouter", async () => {
    const n = await router.count();
    expect(typeof n).toBe("bigint");
    if (n > 0n) {
      const s = await router.get(0n);
      expect(s.id).toBe(0n);
      expect(typeof s.rate_per_sec).toBe("bigint");
      expect(s.sender).toMatch(/^G/);
    }
  }, 30_000);

  it("previews a cascade with no table (pays owner in full)", async () => {
    const fresh = Keypair.random().publicKey();
    const p = await splitter.preview(fresh, 1_000n);
    expect(p).toHaveLength(1);
    expect(p[0].amount).toBe(1_000n);
  }, 30_000);

  it("simulates create_stream with resource report", async () => {
    const r = await simulate(config.readSource, config.streamRouterId, "create_stream", [
      sv.addr(config.readSource),
      sv.addr("GCXIGW2A5ZZJZJDEYTUSAVAPPZEXIWCWOD65JX4FW4BWETE77UJ3H3CZ"),
      sv.addr(XLM_SAC),
      sv.i128(10n),
      sv.i128(1_000n),
    ]);
    expect(r.ok).toBe(true);
    expect(r.instructions).toBeGreaterThan(0);
    expect(r.prepared).toBeDefined();
  }, 30_000);

  it("simulates set_splits with struct encoding", async () => {
    const r = await simulate(config.readSource, config.cascadeSplitterId, "set_splits", [
      sv.addr(config.readSource),
      sv.splits([{ recipient: "GCXIGW2A5ZZJZJDEYTUSAVAPPZEXIWCWOD65JX4FW4BWETE77UJ3H3CZ", bps: 2500, label: "soroban-sdk" }]),
    ]);
    expect(r.error).toBeUndefined();
    expect(r.ok).toBe(true);
  }, 30_000);
});

import { makeReceipt, verifyReceipt } from "../receipts";

live("receipts against a real testnet transaction", () => {
  it("digest, Ed25519 signature, and Horizon anchor all verify", async () => {
    const res = await fetch(`${config.horizonUrl}/accounts/${config.readSource}/transactions?order=desc&limit=1`);
    const tx = (await res.json())._embedded.records[0];
    const r = await makeReceipt({
      contract_id: config.streamRouterId,
      function: "create_stream",
      args: {},
      tx_hash: tx.hash,
      ledger: tx.ledger,
      ledger_close_time: tx.created_at,
      source: tx.source_account,
      envelope_xdr: tx.envelope_xdr,
    });
    const v = await verifyReceipt(r, { checkChain: true });
    expect(v.digestMatches).toBe(true);
    expect(v.txHashMatches).toBe(true);
    expect(v.signaturesValid).toBe(true);
    expect(v.anchor?.status).toBe("anchored");
  }, 30_000);
});
