import { describe, expect, it } from "vitest";
import {
  equalWeights,
  MAX_SPLIT_ROWS,
  parseCargoLock,
  parseCargoToml,
  parseManifest,
  parsePackageJson,
  parsePackageLockJson,
} from "../manifest";

describe("parseCargoToml", () => {
  it("reads all common dependency forms", () => {
    const raw = `
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
`;
    const m = parseCargoToml(raw);
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
    const raw = JSON.stringify({
      name: "x",
      dependencies: { a: "^1" },
      peerDependencies: { b: "2" },
      devDependencies: { a: "1", c: "3" },
    });
    const m = parsePackageJson(raw);
    expect(m.ecosystem).toBe("npm");
    expect(m.deps.map((d) => `${d.name}:${d.kind}`)).toEqual(["a:normal", "b:peer", "c:dev"]);
  });

  it("errors on invalid json", () => {
    expect(() => parseManifest("{ nope", "package.json")).toThrow(/valid JSON/);
  });
});

describe("parseCargoLock", () => {
  const sampleCargoLock = `
version = 3

[[package]]
name = "my-crate"
version = "0.1.0"
dependencies = [
 "serde",
 "soroban-sdk 22.0.1",
]

[[package]]
name = "serde"
version = "1.0.197"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = [
 "serde_derive",
]

[[package]]
name = "serde_derive"
version = "1.0.197"
source = "registry+https://github.com/rust-lang/crates.io-index"
dependencies = [
 "proc-macro2",
 "quote",
 "syn",
]

[[package]]
name = "soroban-sdk"
version = "22.0.1"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "proc-macro2"
version = "1.0.86"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "quote"
version = "1.0.35"
source = "registry+https://github.com/rust-lang/crates.io-index"

[[package]]
name = "syn"
version = "2.0.66"
source = "registry+https://github.com/rust-lang/crates.io-index"
`;

  it("parses direct dependencies only by default", () => {
    const m = parseCargoLock(sampleCargoLock, { includeTransitive: false });
    expect(m.ecosystem).toBe("cargo");
    expect(m.name).toBe("my-crate");
    expect(m.deps.map((d) => d.name)).toEqual(["serde", "soroban-sdk"]);
    expect(m.deps.find((d) => d.name === "serde")?.version).toBe("1.0.197");
  });

  it("parses transitive dependencies when requested", () => {
    const m = parseCargoLock(sampleCargoLock, { includeTransitive: true });
    expect(m.ecosystem).toBe("cargo");
    const names = m.deps.map((d) => d.name);
    expect(names).toContain("serde");
    expect(names).toContain("serde_derive");
    expect(names).toContain("proc-macro2");
    expect(names).toContain("quote");
    expect(names).toContain("syn");
    expect(names).not.toContain("my-crate");
  });

  it("caps results at MAX_SPLIT_ROWS (32) and de-duplicates", () => {
    let bigLock = `
[[package]]
name = "root"
version = "0.1.0"
dependencies = []
`;
    for (let i = 0; i < 50; i++) {
      bigLock += `
[[package]]
name = "dep-${i}"
version = "1.0.${i}"
source = "registry+https://..."
`;
    }
    // Duplicate one
    bigLock += `
[[package]]
name = "dep-0"
version = "1.0.99"
source = "registry+https://..."
`;

    const m = parseCargoLock(bigLock, { includeTransitive: true });
    expect(m.deps.length).toBe(MAX_SPLIT_ROWS);
    expect(m.deps.length).toBeLessThanOrEqual(32);
    const seen = new Set(m.deps.map((d) => d.name));
    expect(seen.size).toBe(m.deps.length);
  });

  it("routes through parseManifest with filename detection", () => {
    const m = parseManifest(sampleCargoLock, "Cargo.lock", { includeTransitive: true });
    expect(m.ecosystem).toBe("cargo");
    expect(m.deps.length).toBeGreaterThan(2);
  });
});

describe("parsePackageLockJson", () => {
  const sampleV3Lock = JSON.stringify({
    name: "flowpulse-frontend",
    version: "0.1.0",
    lockfileVersion: 3,
    packages: {
      "": {
        name: "flowpulse-frontend",
        version: "0.1.0",
        dependencies: {
          "@stellar/stellar-sdk": "^17.4.0",
          react: "^19.3.1",
        },
        devDependencies: {
          typescript: "~5.9.3",
        },
      },
      "node_modules/@stellar/stellar-sdk": {
        version: "17.4.0",
        dependencies: {
          axios: "^1.7.0",
          eventsource: "^2.0.2",
        },
      },
      "node_modules/axios": {
        version: "1.7.9",
      },
      "node_modules/eventsource": {
        version: "2.0.2",
      },
      "node_modules/react": {
        version: "19.3.1",
      },
      "node_modules/typescript": {
        version: "5.9.3",
        dev: true,
      },
    },
  });

  it("extracts direct dependencies from v3 lockfile when includeTransitive is false", () => {
    const m = parsePackageLockJson(sampleV3Lock, { includeTransitive: false });
    expect(m.ecosystem).toBe("npm");
    expect(m.name).toBe("flowpulse-frontend");
    const names = m.deps.map((d) => d.name);
    expect(names).toEqual(["@stellar/stellar-sdk", "react", "typescript"]);
    const ts = m.deps.find((d) => d.name === "typescript");
    expect(ts?.kind).toBe("dev");
  });

  it("extracts transitive dependencies from v3 lockfile when includeTransitive is true", () => {
    const m = parsePackageLockJson(sampleV3Lock, { includeTransitive: true });
    expect(m.ecosystem).toBe("npm");
    const names = m.deps.map((d) => d.name);
    expect(names).toContain("@stellar/stellar-sdk");
    expect(names).toContain("axios");
    expect(names).toContain("eventsource");
    expect(names).toContain("react");
    expect(names).toContain("typescript");
    expect(names).not.toContain("flowpulse-frontend");
  });

  it("extracts transitive dependencies from v1 lockfile", () => {
    const sampleV1Lock = JSON.stringify({
      name: "v1-app",
      version: "1.0.0",
      lockfileVersion: 1,
      dependencies: {
        express: {
          version: "4.19.2",
          dependencies: {
            accepts: {
              version: "1.3.8",
              dependencies: {
                "mime-types": {
                  version: "2.1.35",
                },
              },
            },
          },
        },
      },
    });

    const direct = parsePackageLockJson(sampleV1Lock, { includeTransitive: false });
    expect(direct.deps.map((d) => d.name)).toEqual(["express"]);

    const transitive = parsePackageLockJson(sampleV1Lock, { includeTransitive: true });
    expect(transitive.deps.map((d) => d.name)).toEqual(["express", "accepts", "mime-types"]);
  });

  it("caps at maxRows and handles nested node_modules paths correctly", () => {
    const sampleNested = JSON.stringify({
      name: "nested-app",
      lockfileVersion: 2,
      packages: {
        "": { name: "nested-app" },
        "node_modules/a": { version: "1.0.0" },
        "node_modules/a/node_modules/b": { version: "2.0.0" },
        "node_modules/@scope/pkg": { version: "3.0.0" },
      },
    });

    const m = parsePackageLockJson(sampleNested, { includeTransitive: true, maxRows: 2 });
    expect(m.deps.length).toBe(2);
    expect(m.deps[0].name).toBe("a");
    expect(m.deps[1].name).toBe("b");
  });

  it("routes through parseManifest with package-lock.json", () => {
    const m = parseManifest(sampleV3Lock, "package-lock.json", { includeTransitive: true });
    expect(m.ecosystem).toBe("npm");
    expect(m.deps.map((d) => d.name)).toContain("axios");
  });
});

describe("equalWeights", () => {
  it("sums exactly to the target", () => {
    const w = equalWeights(7, 9000);
    expect(w.reduce((a, b) => a + b, 0)).toBe(9000);
    expect(Math.max(...w) - Math.min(...w)).toBeLessThanOrEqual(1);
  });
});
