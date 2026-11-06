import { describe, expect, it } from "vitest";
import { decodeContractEvent, mergeEventsWithReceipts, type DecodedPayoutEvent } from "../events";
import { Address, xdr } from "@stellar/stellar-sdk";
import type { Receipt } from "../receipts";

const TEST_ADDR_1 = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const TEST_ADDR_2 = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

describe("Event-Sourced Payout History Helper", () => {
  it("decodes a Withdrawn event correctly", () => {
    const raw = {
      id: "0000000001",
      contractId: "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7ZQVNCZOQ",
      txHash: "abcd1234ef567890",
      ledger: 105230,
      ledgerClosedAt: "2026-11-06T12:00:00Z",
      topic: [
        xdr.ScVal.scvSymbol("withdrawn"),
        xdr.ScVal.scvU64(xdr.Uint64(42n)),
        new Address(TEST_ADDR_1).toScVal(),
      ],
      value: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("amount"),
          val: xdr.ScVal.scvI128(new xdr.Int128Parts({ lo: xdr.Uint64(5000000n), hi: xdr.Int64(0n) })),
        }),
      ]),
    };

    const decoded = decodeContractEvent(raw);
    expect(decoded).not.toBeNull();
    expect(decoded?.topicName).toBe("withdrawn");
    expect(decoded?.functionLabel).toBe("Stream Withdrawal");
    expect(decoded?.streamId).toBe(42);
    expect(decoded?.amount).toBe("5000000");
    expect(decoded?.account).toBe(TEST_ADDR_1);
    expect(decoded?.source).toBe("rpc");
  });

  it("decodes a Created event correctly", () => {
    const raw = {
      id: "0000000002",
      contractId: "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7ZQVNCZOQ",
      txHash: "tx_created_999",
      ledger: 105240,
      ledgerClosedAt: "2026-11-06T12:05:00Z",
      topic: [
        xdr.ScVal.scvSymbol("created"),
        xdr.ScVal.scvU64(xdr.Uint64(10n)),
        new Address(TEST_ADDR_1).toScVal(),
        new Address(TEST_ADDR_2).toScVal(),
      ],
      value: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("deposit"),
          val: xdr.ScVal.scvI128(new xdr.Int128Parts({ lo: xdr.Uint64(10000000n), hi: xdr.Int64(0n) })),
        }),
      ]),
    };

    const decoded = decodeContractEvent(raw);
    expect(decoded).not.toBeNull();
    expect(decoded?.topicName).toBe("created");
    expect(decoded?.functionLabel).toBe("Opened micro-stream");
    expect(decoded?.streamId).toBe(10);
    expect(decoded?.account).toBe(TEST_ADDR_1);
    expect(decoded?.counterparty).toBe(TEST_ADDR_2);
    expect(decoded?.amount).toBe("10000000");
  });

  it("decodes a Distributed event from CascadeSplitter", () => {
    const raw = {
      id: "0000000003",
      contractId: "CB4D5KRYM6CB7OWQ6TWYRR3Z4T7ZQVNCZOQ",
      txHash: "tx_distributed_777",
      ledger: 105250,
      ledgerClosedAt: "2026-11-06T12:10:00Z",
      topic: [
        xdr.ScVal.scvSymbol("distributed"),
        new Address(TEST_ADDR_1).toScVal(),
        new Address(TEST_ADDR_2).toScVal(),
      ],
      value: xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol("amount"),
          val: xdr.ScVal.scvI128(new xdr.Int128Parts({ lo: xdr.Uint64(25000000n), hi: xdr.Int64(0n) })),
        }),
      ]),
    };

    const decoded = decodeContractEvent(raw);
    expect(decoded).not.toBeNull();
    expect(decoded?.topicName).toBe("distributed");
    expect(decoded?.functionLabel).toBe("Cascade distribution");
    expect(decoded?.account).toBe(TEST_ADDR_1);
    expect(decoded?.counterparty).toBe(TEST_ADDR_2);
    expect(decoded?.amount).toBe("25000000");
  });

  it("gracefully returns null for unknown or invalid topics", () => {
    const invalid = {
      id: "000",
      contractId: "C1",
      topic: [],
      value: null,
    };
    expect(decodeContractEvent(invalid)).toBeNull();
  });

  it("merges RPC events with local receipts and de-duplicates by txHash", () => {
    const rpcEvent: DecodedPayoutEvent = {
      id: "ev1",
      txHash: "hash_shared",
      contractId: "C1",
      ledger: 100,
      ledgerClosedAt: "2026-11-06T10:00:00Z",
      topicName: "withdrawn",
      functionLabel: "Stream Withdrawal",
      account: "GADDR1",
      source: "rpc",
    };

    const receipt1: Receipt = {
      digest: { alg: "SHA-256", canonicalization: "RFC8785", value: "sha256-1" },
      receipt: {
        schema: "flowpulse.receipt/v1",
        network: "testnet",
        network_passphrase: "Test SDF Network ; September 2015",
        contract_id: "C1",
        function: "withdraw_all",
        args: {},
        tx_hash: "hash_shared",
        ledger: 100,
        ledger_close_time: "2026-11-06T10:00:00Z",
        source: "GADDR1",
        envelope_xdr: "AAAA...",
      },
    };

    const receipt2: Receipt = {
      digest: { alg: "SHA-256", canonicalization: "RFC8785", value: "sha256-2" },
      receipt: {
        schema: "flowpulse.receipt/v1",
        network: "testnet",
        network_passphrase: "Test SDF Network ; September 2015",
        contract_id: "C1",
        function: "create_stream",
        args: {},
        tx_hash: "hash_local_only",
        ledger: 90,
        ledger_close_time: "2026-11-06T09:00:00Z",
        source: "GADDR1",
        envelope_xdr: "BBBB...",
      },
    };

    const items = mergeEventsWithReceipts([rpcEvent], [receipt1, receipt2]);

    expect(items.length).toBe(2);
    const sharedItem = items.find((i) => i.txHash === "hash_shared");
    expect(sharedItem).toBeDefined();
    expect(sharedItem?.receipt).toBe(receipt1);
    expect(sharedItem?.source).toBe("rpc");

    const localItem = items.find((i) => i.txHash === "hash_local_only");
    expect(localItem).toBeDefined();
    expect(localItem?.source).toBe("receipt");

    expect(items[0].txHash).toBe("hash_shared");
    expect(items[1].txHash).toBe("hash_local_only");
  });
});
