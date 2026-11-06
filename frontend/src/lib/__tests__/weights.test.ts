import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  allocateWeightsByDownloads,
  fetchCrateDownloads,
  fetchNpmDownloads,
  fetchPackageDownloads,
  suggestDependencyWeights,
  type Dependency,
} from "../manifest";

describe("allocateWeightsByDownloads", () => {
  it("returns empty array for empty inputs", () => {
    expect(allocateWeightsByDownloads([])).toEqual([]);
  });

  it("allocates entire targetBps to a single package", () => {
    expect(allocateWeightsByDownloads([12345], 9000)).toEqual([9000]);
    expect(allocateWeightsByDownloads([0], 9000)).toEqual([9000]);
  });

  it("strictly sums to targetBps across varied download counts with no drift", () => {
    const downloads = [1000, 2500, 50, 8000, 12000, 300];
    const targetBps = 9000;
    const minFloorBps = 50;
    const weights = allocateWeightsByDownloads(downloads, targetBps, minFloorBps);

    expect(weights.length).toBe(downloads.length);
    const sum = weights.reduce((acc, w) => acc + w, 0);
    expect(sum).toBe(targetBps);

    // Each element respects the minFloorBps
    weights.forEach((w) => {
      expect(w).toBeGreaterThanOrEqual(minFloorBps);
    });

    // Higher downloads get higher or equal weights
    expect(weights[4]).toBeGreaterThan(weights[3]);
    expect(weights[3]).toBeGreaterThan(weights[1]);
    expect(weights[1]).toBeGreaterThan(weights[0]);
  });

  it("falls back to equal distribution when all downloads are 0", () => {
    const downloads = [0, 0, 0, 0];
    const targetBps = 9000;
    const weights = allocateWeightsByDownloads(downloads, targetBps);
    expect(weights).toEqual([2250, 2250, 2250, 2250]);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(targetBps);
  });

  it("handles negative or NaN downloads gracefully", () => {
    const downloads = [-100, NaN, 1000, 2000];
    const targetBps = 9000;
    const minFloorBps = 50;
    const weights = allocateWeightsByDownloads(downloads, targetBps, minFloorBps);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(targetBps);
    expect(weights[0]).toBe(minFloorBps);
    expect(weights[1]).toBe(minFloorBps);
    expect(weights[2]).toBeGreaterThan(minFloorBps);
    expect(weights[3]).toBeGreaterThan(weights[2]);
  });

  it("scales down floor safely when n * minFloorBps exceeds targetBps", () => {
    // 100 items with floor 100 = 10000 > 9000
    const downloads = new Array(100).fill(10);
    const weights = allocateWeightsByDownloads(downloads, 9000, 100);
    expect(weights.length).toBe(100);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(9000);
    weights.forEach((w) => {
      expect(w).toBe(90);
    });
  });

  it("distributes fractional remainders using Hamilton-Hare Largest Remainder Method", () => {
    // Let n = 3, targetBps = 1000, minFloorBps = 100
    // unreserved = 700
    // downloads = [100, 200, 400], sum = 700
    // quotas:
    // dep 0: (100 / 700) * 700 = 100.0 (remainder 0)
    // dep 1: (200 / 700) * 700 = 200.0 (remainder 0)
    // dep 2: (400 / 700) * 700 = 400.0 (remainder 0)
    // alloc = [100 + 100, 100 + 200, 100 + 400] = [200, 300, 500]
    const weights = allocateWeightsByDownloads([100, 200, 400], 1000, 100);
    expect(weights).toEqual([200, 300, 500]);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(1000);
  });
});

describe("download count fetchers", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("fetchCrateDownloads parses crates.io JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        crate: {
          downloads: 482910,
        },
      }),
    } as unknown as Response);

    const downloads = await fetchCrateDownloads("soroban-sdk");
    expect(downloads).toBe(482910);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://crates.io/api/v1/crates/soroban-sdk");
    globalThis.fetch = originalFetch;
  });

  it("fetchCrateDownloads returns 0 on HTTP failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as unknown as Response);

    const downloads = await fetchCrateDownloads("unknown-crate");
    expect(downloads).toBe(0);
    globalThis.fetch = originalFetch;
  });

  it("fetchNpmDownloads parses api.npmjs.org JSON response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        downloads: 125099,
        package: "express",
      }),
    } as unknown as Response);

    const downloads = await fetchNpmDownloads("express");
    expect(downloads).toBe(125099);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.npmjs.org/downloads/point/last-month/express");
    globalThis.fetch = originalFetch;
  });

  it("fetchPackageDownloads dispatches correctly according to ecosystem", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("crates.io")) {
        return {
          ok: true,
          json: async () => ({ crate: { downloads: 500 } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ downloads: 1500 }),
      };
    });

    const crateDl = await fetchPackageDownloads({ name: "serde", ecosystem: "cargo" });
    const npmDl = await fetchPackageDownloads({ name: "lodash", ecosystem: "npm" });

    expect(crateDl).toBe(500);
    expect(npmDl).toBe(1500);
    globalThis.fetch = originalFetch;
  });

  it("suggestDependencyWeights aggregates downloads in parallel and calculates weights", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes("soroban-sdk")) {
        return { ok: true, json: async () => ({ crate: { downloads: 3000 } }) };
      }
      if (url.includes("ed25519-dalek")) {
        return { ok: true, json: async () => ({ crate: { downloads: 7000 } }) };
      }
      return { ok: false };
    });

    const deps: Pick<Dependency, "name" | "ecosystem">[] = [
      { name: "soroban-sdk", ecosystem: "cargo" },
      { name: "ed25519-dalek", ecosystem: "cargo" },
    ];

    const weights = await suggestDependencyWeights(deps, 9000, 50);
    expect(weights.length).toBe(2);
    expect(weights.reduce((a, b) => a + b, 0)).toBe(9000);
    expect(weights[1]).toBeGreaterThan(weights[0]);
    globalThis.fetch = originalFetch;
  });
});
