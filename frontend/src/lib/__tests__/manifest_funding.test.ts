import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractStellarAddressFromFundingJson,
  extractGitHubRepoSlug,
  resolveMaintainerFundingAddress,
} from "../manifest";

describe("FUNDING.json Stellar address extraction", () => {
  it("extracts direct stellar field", () => {
    const raw = JSON.stringify({
      stellar: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
    });
    expect(extractStellarAddressFromFundingJson(raw)).toBe(
      "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"
    );
  });

  it("extracts from accounts array", () => {
    const raw = JSON.stringify({
      accounts: [
        { network: "ethereum", address: "0x1234567890abcdef" },
        { network: "stellar", address: "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF" },
      ],
    });
    expect(extractStellarAddressFromFundingJson(raw)).toBe(
      "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF"
    );
  });

  it("extracts from drips extension", () => {
    const raw = JSON.stringify({
      drips: {
        stellar: "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI",
      },
    });
    expect(extractStellarAddressFromFundingJson(raw)).toBe(
      "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI"
    );
  });

  it("returns null for invalid or missing Stellar addresses", () => {
    expect(extractStellarAddressFromFundingJson('{"ethereum": "0x123"}')).toBeNull();
    expect(extractStellarAddressFromFundingJson("invalid json")).toBeNull();
  });

  it("extracts GitHub repo slug from various URL formats", () => {
    expect(extractGitHubRepoSlug("https://github.com/stellar/rs-soroban-sdk")).toBe("stellar/rs-soroban-sdk");
    expect(extractGitHubRepoSlug("https://github.com/facebook/react.git")).toBe("facebook/react");
    expect(extractGitHubRepoSlug("git+https://github.com/serde-rs/json.git")).toBe("serde-rs/json");
    expect(extractGitHubRepoSlug("ssh://git@github.com/flow-pulse/contracts.git")).toBe("flow-pulse/contracts");
    expect(extractGitHubRepoSlug("https://gitlab.com/other/repo")).toBeNull();
  });
});

describe("resolveMaintainerFundingAddress with mocked fetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves address for Cargo dependency via crates.io and FUNDING.json", async () => {
    const mockStellar = "GBZXN7PIRZGNMHGA7MUUUF4GWPY5AYPV6LY4UV2GL6VJGIQRXFDNMADI";

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("crates.io/api/v1/crates/soroban-sdk")) {
        return {
          ok: true,
          json: async () => ({
            crate: { repository: "https://github.com/stellar/rs-soroban-sdk" },
          }),
        } as unknown as Response;
      }
      if (u.includes("raw.githubusercontent.com/stellar/rs-soroban-sdk/HEAD/.github/FUNDING.json")) {
        return {
          ok: true,
          text: async () => JSON.stringify({ stellar: mockStellar }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    const resolved = await resolveMaintainerFundingAddress({
      name: "soroban-sdk",
      ecosystem: "cargo",
    });

    expect(resolved).toBe(mockStellar);
  });

  it("resolves address for npm dependency via registry and root FUNDING.json", async () => {
    const mockStellar = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const u = url.toString();
      if (u.includes("registry.npmjs.org/stellar-sdk")) {
        return {
          ok: true,
          json: async () => ({
            repository: { url: "git+https://github.com/stellar/js-stellar-sdk.git" },
          }),
        } as unknown as Response;
      }
      if (u.includes(".github/FUNDING.json")) {
        return { ok: false, status: 404 } as unknown as Response;
      }
      if (u.includes("FUNDING.json")) {
        return {
          ok: true,
          text: async () =>
            JSON.stringify({
              accounts: [{ network: "stellar", address: mockStellar }],
            }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as unknown as Response;
    });

    const resolved = await resolveMaintainerFundingAddress({
      name: "stellar-sdk",
      ecosystem: "npm",
    });

    expect(resolved).toBe(mockStellar);
  });

  it("fails silently and returns null on network errors", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("Network offline");
    });

    const resolved = await resolveMaintainerFundingAddress({
      name: "unknown-pkg",
      ecosystem: "cargo",
    });

    expect(resolved).toBeNull();
  });
});
