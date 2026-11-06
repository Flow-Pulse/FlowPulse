import { describe, expect, it, vi, beforeEach } from "vitest";
import { SUPPORTED_TOKENS, tokenMeta, XLM_SAC, USDC_SAC, USDC_ISSUER } from "../config";
import { hasTrustline, tokenBalance } from "../wallet";

describe("Token Metadata and Trustline Support", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns verified metadata for native XLM SAC", () => {
    const meta = tokenMeta(XLM_SAC);
    expect(meta.code).toBe("XLM");
    expect(meta.decimals).toBe(7);
    expect(meta.name).toBe("Stellar Lumens");
    expect(meta.contractId).toBe(XLM_SAC);
  });

  it("returns verified metadata for testnet USDC SAC", () => {
    const meta = tokenMeta(USDC_SAC);
    expect(meta.code).toBe("USDC");
    expect(meta.decimals).toBe(7);
    expect(meta.name).toBe("USD Coin (Testnet)");
    expect(meta.issuer).toBe(USDC_ISSUER);
    expect(meta.contractId).toBe(USDC_SAC);
  });

  it("registers both XLM and USDC in SUPPORTED_TOKENS", () => {
    expect(SUPPORTED_TOKENS.length).toBe(2);
    expect(SUPPORTED_TOKENS.some((t) => t.code === "XLM")).toBe(true);
    expect(SUPPORTED_TOKENS.some((t) => t.code === "USDC")).toBe(true);
  });

  it("falls back to truncated contract address for unregistered tokens", () => {
    const randomContract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const meta = tokenMeta(randomContract);
    expect(meta.code).toBe("CAAA…");
    expect(meta.decimals).toBe(7);
  });

  it("hasTrustline identifies presence or absence of asset trustline", async () => {
    const targetAddr = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: "native", balance: "100.0000000" },
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: USDC_ISSUER,
            balance: "50.0000000",
          },
        ],
      }),
    } as unknown as Response);

    const hasUsdc = await hasTrustline(targetAddr, "USDC", USDC_ISSUER);
    expect(hasUsdc).toBe(true);

    const hasOther = await hasTrustline(targetAddr, "EURC", USDC_ISSUER);
    expect(hasOther).toBe(false);
  });

  it("tokenBalance extracts USDC balance from account record", async () => {
    const targetAddr = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          { asset_type: "native", balance: "250.5000000" },
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            asset_issuer: USDC_ISSUER,
            balance: "1234.5600000",
          },
        ],
      }),
    } as unknown as Response);

    const usdcBal = await tokenBalance(targetAddr, USDC_SAC);
    expect(usdcBal).toBe("1234.5600000");

    const xlmBal = await tokenBalance(targetAddr, XLM_SAC);
    expect(xlmBal).toBe("250.5000000");
  });
});
