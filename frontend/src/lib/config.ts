import { Asset, Networks } from "@stellar/stellar-sdk";

const env = import.meta.env;

export const config = {
  network: "testnet" as const,
  networkPassphrase: Networks.TESTNET,
  rpcUrl: env.VITE_RPC_URL ?? "https://soroban-testnet.stellar.org",
  horizonUrl: env.VITE_HORIZON_URL ?? "https://horizon-testnet.stellar.org",
  streamRouterId:
    env.VITE_STREAM_ROUTER_ID ?? "CA45PGMYO5CNRPCMW3THPKI26PK2CU3JU4XTJZJ3HZ4KLEFRKUQXUTWK",
  cascadeSplitterId:
    env.VITE_CASCADE_SPLITTER_ID ?? "CA4U6VUIFA33SQA5QCQYMFNEQTNN6XV43EAZ67IKXOB434V5GI5KB2SY",
  /**
   * Funded testnet account used only as the *source* of read-only simulations
   * (no signatures, nothing is submitted). Any existing account works.
   */
  readSource: env.VITE_READ_SOURCE ?? "GBH4QJRI4J66KHXNVJNUCETHL2UKNKWCXE2IJNRFGJRTSTUXWGDP5Y7Q",
  explorer: "https://stellar.expert/explorer/testnet",
};

/** Native XLM Stellar Asset Contract on testnet. */
export const XLM_SAC = Asset.native().contractId(Networks.TESTNET);

export const TOKENS: Record<string, { code: string; decimals: number }> = {
  [XLM_SAC]: { code: "XLM", decimals: 7 },
};

export function tokenMeta(address: string) {
  return TOKENS[address] ?? { code: address.slice(0, 4) + "…", decimals: 7 };
}
