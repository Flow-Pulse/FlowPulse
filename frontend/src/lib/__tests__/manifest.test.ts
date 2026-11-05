import { describe, expect, it } from "vitest";
import { equalWeights, parseManifest } from "../manifest";

describe("parseCargoToml", () => {
  it("reads all common dependency forms", () => {
    const m = parseManifest(`
[package]
name = "demo"

[dependencies]
serde = "1.0"
tokio = { version = "1", features = ["full"] }
soroban-sdk.workspace = true
local = { path = "../local" }

[dependencies.rand]
version = "0.8"

[dev-dependencies]
proptest = "1"

[target.'cfg(unix)'.dependencies]
libc = "0.2" # comment
`);
    expect(m.name).toBe("demo");
    const byName = Object.fromEntries(m.deps.map((d) => [d.name, d]));
    expect(byName.serde.version).toBe("1.0");
    expect(byName.tokio.version).toBe("1");
    expect(byName["soroban-sdk"].version).toBe("workspace");
    expect(byName.local.version).toBe("path");
    expect(byName.rand.version).toBe("0.8");
    expect(byName.proptest.kind).toBe("dev");
    expect(byName.libc.kind).toBe("normal");
  });
});

describe("parsePackageJson", () => {
  it("reads deps, peer and dev deps without duplicates", () => {
    const m = parseManifest(
      JSON.stringify({ name: "x", dependencies: { a: "^1" }, peerDependencies: { b: "2" }, devDependencies: { a: "1", c: "3" } }),
    );
    expect(m.ecosystem).toBe("npm");
    expect(m.deps.map((d) => `${d.name}:${d.kind}`)).toEqual(["a:normal", "b:peer", "c:dev"]);
  });
  it("errors on invalid json", () => {
    expect(() => parseManifest("{ nope", "package.json")).toThrow(/valid JSON/);
  });
});

describe("equalWeights", () => {
  it("sums exactly to the target", () => {
    const w = equalWeights(7, 9000);
    expect(w.reduce((a, b) => a + b, 0)).toBe(9000);
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1);
  });
});
