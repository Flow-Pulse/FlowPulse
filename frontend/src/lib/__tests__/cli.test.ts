import { describe, it, expect } from "vitest";
import { toStellarCliCommand, formatCliValue } from "../cli";
import { sv } from "../soroban";

const ROUTER_ID = "CA45PGMYO5CNRPCMW3THPKI26PK2CU3JU4XTJZJ3HZ4KLEFRKUQXUTWK";
const SPLITTER_ID = "CA4U6VUIFA33SQA5QCQYMFNEQTNN6XV43EAZ67IKXOB434V5GI5KB2SY";
const ADDR_A = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";
const ADDR_B = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const TOKEN_ADDR = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";

describe("toStellarCliCommand", () => {
  describe("StreamRouter methods", () => {
    it("generates CLI command for create_stream", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "create_stream",
        args: [
          sv.addr(ADDR_A),
          sv.addr(ADDR_B),
          sv.addr(TOKEN_ADDR),
          sv.i128(100000n),
          sv.i128(5000000n),
        ],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- create_stream --sender ${ADDR_A} --recipient ${ADDR_B} --token ${TOKEN_ADDR} --rate_per_sec 100000 --deposit 5000000`
      );
    });

    it("generates CLI command for withdraw", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "withdraw",
        args: [sv.u64(12)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- withdraw --id 12`
      );
    });

    it("generates CLI command for withdraw_all", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "withdraw_all",
        args: [sv.addr(ADDR_B)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- withdraw_all --recipient ${ADDR_B}`
      );
    });

    it("generates CLI command for top_up", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "top_up",
        args: [sv.u64(12), sv.i128(2000000n)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- top_up --id 12 --amount 2000000`
      );
    });

    it("generates CLI command for cancel", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "cancel",
        args: [sv.u64(12)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- cancel --id 12`
      );
    });

    it("generates CLI command for withdrawable", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "withdrawable",
        args: [sv.u64(12)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- withdrawable --id 12`
      );
    });

    it("generates CLI command for get_stream", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "get_stream",
        args: [sv.u64(12)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- get_stream --id 12`
      );
    });

    it("generates CLI command for streams_by_sender", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "streams_by_sender",
        args: [sv.addr(ADDR_A)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- streams_by_sender --sender ${ADDR_A}`
      );
    });

    it("generates CLI command for streams_by_recipient", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "streams_by_recipient",
        args: [sv.addr(ADDR_B)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- streams_by_recipient --recipient ${ADDR_B}`
      );
    });

    it("generates CLI command for stream_count", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "stream_count",
        args: [],
      });
      expect(cmd).toBe(`stellar contract invoke --id ${ROUTER_ID} -- stream_count`);
    });
  });

  describe("CascadeSplitter methods", () => {
    it("generates CLI command for set_splits", () => {
      const splits = [
        { recipient: ADDR_B, bps: 5000, label: "serde" },
      ];
      const cmd = toStellarCliCommand({
        contractId: SPLITTER_ID,
        method: "set_splits",
        args: [sv.addr(ADDR_A), sv.splits(splits)],
      });
      expect(cmd).toContain(`stellar contract invoke --id ${SPLITTER_ID} -- set_splits --owner ${ADDR_A} --splits `);
      expect(cmd).toContain('"bps":5000');
      expect(cmd).toContain('"label":"serde"');
      expect(cmd).toContain(`"recipient":"${ADDR_B}"`);
    });

    it("generates CLI command for get_splits", () => {
      const cmd = toStellarCliCommand({
        contractId: SPLITTER_ID,
        method: "get_splits",
        args: [sv.addr(ADDR_A)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${SPLITTER_ID} -- get_splits --owner ${ADDR_A}`
      );
    });

    it("generates CLI command for preview", () => {
      const cmd = toStellarCliCommand({
        contractId: SPLITTER_ID,
        method: "preview",
        args: [sv.addr(ADDR_A), sv.i128(10000000n)],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${SPLITTER_ID} -- preview --owner ${ADDR_A} --amount 10000000`
      );
    });

    it("generates CLI command for distribute", () => {
      const cmd = toStellarCliCommand({
        contractId: SPLITTER_ID,
        method: "distribute",
        args: [
          sv.addr(ADDR_A),
          sv.addr(ADDR_B),
          sv.addr(TOKEN_ADDR),
          sv.i128(10000000n),
        ],
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${SPLITTER_ID} -- distribute --from ${ADDR_A} --owner ${ADDR_B} --token ${TOKEN_ADDR} --amount 10000000`
      );
    });
  });

  describe("Flags and formatting options", () => {
    it("includes --network and --source when supplied", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "withdraw",
        args: [sv.u64(99)],
        source: ADDR_A,
        network: "testnet",
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} --source ${ADDR_A} --network testnet -- withdraw --id 99`
      );
    });

    it("accepts plain record objects as arguments", () => {
      const cmd = toStellarCliCommand({
        contractId: ROUTER_ID,
        method: "top_up",
        args: { id: 10, amount: "5000" },
      });
      expect(cmd).toBe(
        `stellar contract invoke --id ${ROUTER_ID} -- top_up --id 10 --amount 5000`
      );
    });

    it("safely escapes shell values with spaces", () => {
      expect(formatCliValue("hello world")).toBe("'hello world'");
      expect(formatCliValue(123)).toBe("123");
      expect(formatCliValue(456n)).toBe("456");
    });
  });
});
