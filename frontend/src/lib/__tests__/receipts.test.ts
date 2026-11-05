import { describe, expect, it } from "vitest";
import { Account, Keypair, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { canonical, makeReceipt, sha256Hex, verifyEnvelope, verifyReceipt } from "../receipts";

describe("RFC-8785 canonicalization", () => {
  it("sorts keys and normalizes numbers (spec examples)", () => {
    expect(canonical({ b: 2, a: 1, c: { z: true, y: null } })).toBe('{"a":1,"b":2,"c":{"y":null,"z":true}}');
    expect(canonical({ n: 1.0, e: 1e21, s: "€" })).toBe('{"e":1e+21,"n":1,"s":"€"}');
  });
  it("serializes bigint as decimal strings", () => {
    expect(canonical({ v: 12345678901234567890n })).toBe('{"v":"12345678901234567890"}');
  });
  it("hashes with SHA-256", async () => {
    expect(await sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

function signedEnvelope(kp: Keypair) {
  const tx = new TransactionBuilder(new Account(kp.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: "2" }))
    .setTimeout(0)
    .build();
  tx.sign(kp);
  return { xdr: tx.toXDR(), hash: Array.from(tx.hash(), (b) => b.toString(16).padStart(2, "0")).join("") };
}

describe("receipts", () => {
  it("verifies Ed25519 envelope signatures", () => {
    const kp = Keypair.random();
    const env = signedEnvelope(kp);
    const v = verifyEnvelope(env.xdr, Networks.TESTNET);
    expect(v.txHash).toBe(env.hash);
    expect(v.sigs).toHaveLength(1);
    expect(v.sigs[0]).toMatchObject({ signer: kp.publicKey(), valid: true });
    // Same envelope on a different network has a different hash → signature invalid.
    expect(verifyEnvelope(env.xdr, Networks.PUBLIC).sigs[0].valid).toBe(false);
  });

  it("detects any tampering with the receipt body", async () => {
    const kp = Keypair.random();
    const env = signedEnvelope(kp);
    const r = await makeReceipt({
      contract_id: "CTEST",
      function: "withdraw",
      args: { id: 1n },
      tx_hash: env.hash,
      ledger: 42,
      ledger_close_time: "2026-01-01T00:00:00.000Z",
      source: kp.publicKey(),
      envelope_xdr: env.xdr,
    });
    const ok = await verifyReceipt(r);
    expect(ok.digestMatches).toBe(true);
    expect(ok.bitDiff).toBe(0);
    expect(ok.signaturesValid).toBe(true);
    expect(ok.txHashMatches).toBe(true);

    const bad = await verifyReceipt({ ...r, receipt: { ...r.receipt, ledger: 43 } });
    expect(bad.digestMatches).toBe(false);
    expect(bad.bitDiff).toBeGreaterThan(0);
  });
});
