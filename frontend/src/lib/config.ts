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

/** Circle USDC testnet issuer & Stellar Asset Contract */
export const USDC_ISSUER = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const USDC_ASSET = new Asset("USDC", USDC_ISSUER);
export const USDC_SAC = USDC_ASSET.contractId(Networks.TESTNET);

export interface TokenInfo {
  contractId: string;
  code: string;
  decimals: number;
  name: string;
  issuer?: string;
}

export const TOKENS: Record<string, TokenInfo> = {
  [XLM_SAC]: {
    contractId: XLM_SAC,
    code: "XLM",
    decimals: 7,
    name: "Stellar Lumens",
  },
  [USDC_SAC]: {
    contractId: USDC_SAC,
    code: "USDC",
    decimals: 7,
    name: "USD Coin (Testnet)",
    issuer: USDC_ISSUER,
  },
};

export const SUPPORTED_TOKENS: TokenInfo[] = [
  TOKENS[XLM_SAC],
  TOKENS[USDC_SAC],
];

export function tokenMeta(address: string): TokenInfo {
  return (
    TOKENS[address] ?? {
      contractId: address,
      code: address.slice(0, 4) + "…",
      decimals: 7,
      name: "Unknown SAC Token",
    }
  );
}
