/**
 * Dependency manifest parsing for split tables.
 * Supports Cargo.toml, package.json, Cargo.lock, and package-lock.json (with transitive dependencies option).
 */

export const MAX_SPLIT_ROWS = 32;

export type Ecosystem = "cargo" | "npm";

export interface Dependency {
  name: string;
  version: string;
  ecosystem: Ecosystem;
  kind: "normal" | "dev" | "build" | "peer";
}

export interface Manifest {
  ecosystem: Ecosystem;
  name?: string;
  deps: Dependency[];
}

export interface ParseManifestOptions {
  includeTransitive?: boolean;
  maxRows?: number;
}

export function parseManifest(text: string, filename = "", options?: ParseManifestOptions): Manifest {
  const t = text.trim();
  const lowerFile = filename.toLowerCase();

  if (lowerFile.endsWith("cargo.lock") || (lowerFile.endsWith(".lock") && t.includes("[[package]]"))) {
    return parseCargoLock(t, options);
  }

  if (
    lowerFile.endsWith("package-lock.json") ||
    (lowerFile.endsWith(".json") && t.includes('"lockfileVersion"'))
  ) {
    return parsePackageLockJson(t, options);
  }

  if (lowerFile.endsWith(".json") || t.startsWith("{")) {
    return parsePackageJson(t);
  }

  if (t.includes("[[package]]") && !t.includes("[package]") && !t.includes("[workspace]")) {
    return parseCargoLock(t, options);
  }

  return parseCargoToml(t);
}

export function parsePackageJson(text: string): Manifest {
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("package.json is not valid JSON");
  }
  const groups: [string, Dependency["kind"]][] = [
    ["dependencies", "normal"],
    ["peerDependencies", "peer"],
    ["devDependencies", "dev"],
  ];
  const deps: Dependency[] = [];
  const seen = new Set<string>();
  for (const [field, kind] of groups) {
    const g = j[field] as Record<string, string> | undefined;
    if (!g || typeof g !== "object") continue;
    for (const [name, version] of Object.entries(g)) {
      if (seen.has(name)) continue;
      seen.add(name);
      deps.push({ name, version: String(version), ecosystem: "npm", kind });
    }
  }
  return { ecosystem: "npm", name: typeof j.name === "string" ? j.name : undefined, deps };
}

/**
 * Parses Cargo.lock and optionally includes transitive dependencies.
 * De-duplicates and caps at maxRows (default MAX_SPLIT_ROWS = 32).
 */
export function parseCargoLock(text: string, options?: ParseManifestOptions): Manifest {
  const includeTransitive = options?.includeTransitive ?? false;
  const maxRows = options?.maxRows ?? MAX_SPLIT_ROWS;

  interface RawPackage {
    name: string;
    version: string;
    source?: string;
    dependencies: string[];
  }

  const packages: RawPackage[] = [];
  let current: Partial<RawPackage> | null = null;
  let inDependencies = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;

    if (line === "[[package]]") {
      if (current && current.name && current.version) {
        packages.push({
          name: current.name,
          version: current.version,
          source: current.source,
          dependencies: current.dependencies ?? [],
        });
      }
      current = { dependencies: [] };
      inDependencies = false;
      continue;
    }

    if (!current) continue;

    if (inDependencies) {
      if (line === "]") {
        inDependencies = false;
        continue;
      }
      const depMatch = line.match(/^"([^"]+)"/);
      if (depMatch) {
        const depRaw = depMatch[1].trim();
        const depName = depRaw.split(" ")[0];
        current.dependencies!.push(depName);
      }
      continue;
    }

    const kv = line.match(/^("?)([A-Za-z0-9_\-]+)\1\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[2];
    const val = kv[3].trim();

    if (key === "name") {
      current.name = unquote(val);
    } else if (key === "version") {
      current.version = unquote(val);
    } else if (key === "source") {
      current.source = unquote(val);
    } else if (key === "dependencies") {
      if (val === "[") {
        inDependencies = true;
      } else if (val.startsWith("[") && val.endsWith("]")) {
        const inner = val.slice(1, -1).trim();
        if (inner) {
          const list = inner.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
          current.dependencies = list.map((d) => d.split(" ")[0]);
        }
      }
    }
  }

  if (current && current.name && current.version) {
    packages.push({
      name: current.name,
      version: current.version,
      source: current.source,
      dependencies: current.dependencies ?? [],
    });
  }

  if (packages.length === 0) {
    return { ecosystem: "cargo", deps: [] };
  }

  // Root packages are local packages without external source specification
  const rootPackages = packages.filter((p) => !p.source);
  const primaryRoot = rootPackages[0] ?? packages[0];
  const rootNames = new Set(rootPackages.map((p) => p.name));

  const deps: Dependency[] = [];
  const seen = new Set<string>();

  const pushDep = (name: string, version: string) => {
    if (seen.has(name) || rootNames.has(name)) return;
    seen.add(name);
    deps.push({
      name,
      version,
      ecosystem: "cargo",
      kind: "normal",
    });
  };

  if (!includeTransitive) {
    // Only direct dependencies of the root packages
    const directDeps = new Set<string>();
    for (const r of rootPackages) {
      for (const d of r.dependencies) {
        directDeps.add(d);
      }
    }
    for (const pkg of packages) {
      if (directDeps.has(pkg.name)) {
        pushDep(pkg.name, pkg.version);
        if (deps.length >= maxRows) break;
      }
    }
  } else {
    // All unique transitive dependencies across the entire lock graph
    for (const pkg of packages) {
      pushDep(pkg.name, pkg.version);
      if (deps.length >= maxRows) break;
    }
  }

  return {
    ecosystem: "cargo",
    name: primaryRoot?.name,
    deps: deps.slice(0, maxRows),
  };
}

/**
 * Parses package-lock.json (v1, v2, v3 formats) and optionally includes transitive dependencies.
 * De-duplicates and caps at maxRows (default MAX_SPLIT_ROWS = 32).
 */
export function parsePackageLockJson(text: string, options?: ParseManifestOptions): Manifest {
  const includeTransitive = options?.includeTransitive ?? false;
  const maxRows = options?.maxRows ?? MAX_SPLIT_ROWS;

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("package-lock.json is not valid JSON");
  }

  const rootName = typeof j.name === "string" ? j.name : undefined;
  const deps: Dependency[] = [];
  const seen = new Set<string>();

  const pushDep = (name: string, version: string, kind: Dependency["kind"] = "normal") => {
    if (!name || seen.has(name) || name === rootName) return;
    seen.add(name);
    deps.push({
      name,
      version: String(version || "*"),
      ecosystem: "npm",
      kind,
    });
  };

  // Modern npm lockfile format: v2 / v3 using "packages"
  if (j.packages && typeof j.packages === "object") {
    const pkgs = j.packages as Record<string, Record<string, unknown>>;
    const rootPkg = pkgs[""] || {};
    const directDeps = (rootPkg.dependencies || {}) as Record<string, string>;
    const directDevDeps = (rootPkg.devDependencies || {}) as Record<string, string>;
    const directPeerDeps = (rootPkg.peerDependencies || {}) as Record<string, string>;

    if (!includeTransitive) {
      for (const [name, reqVer] of Object.entries(directDeps)) {
        const resolved = pkgs[`node_modules/${name}`]?.version;
        pushDep(name, String(resolved || reqVer), "normal");
        if (deps.length >= maxRows) break;
      }
      for (const [name, reqVer] of Object.entries(directPeerDeps)) {
        if (deps.length >= maxRows) break;
        const resolved = pkgs[`node_modules/${name}`]?.version;
        pushDep(name, String(resolved || reqVer), "peer");
      }
      for (const [name, reqVer] of Object.entries(directDevDeps)) {
        if (deps.length >= maxRows) break;
        const resolved = pkgs[`node_modules/${name}`]?.version;
        pushDep(name, String(resolved || reqVer), "dev");
      }
    } else {
      // Collect all packages from node_modules/*
      for (const [pathKey, val] of Object.entries(pkgs)) {
        if (!pathKey || pathKey === "" || !val || typeof val !== "object") continue;
        const lastIndex = pathKey.lastIndexOf("node_modules/");
        if (lastIndex === -1) continue;
        const rawPkgName = pathKey.slice(lastIndex + "node_modules/".length);
        if (!rawPkgName) continue;

        const isDev = Boolean(val.dev);
        const isPeer = Boolean(val.peer);
        const kind: Dependency["kind"] = isPeer ? "peer" : isDev ? "dev" : "normal";
        const ver = typeof val.version === "string" ? val.version : "*";

        pushDep(rawPkgName, ver, kind);
        if (deps.length >= maxRows) break;
      }
    }
  } else if (j.dependencies && typeof j.dependencies === "object") {
    // Legacy npm lockfile format: v1
    const depsTree = j.dependencies as Record<string, Record<string, unknown>>;

    const walkV1 = (tree: Record<string, Record<string, unknown>>) => {
      for (const [name, node] of Object.entries(tree)) {
        if (!node || typeof node !== "object") continue;
        const ver = typeof node.version === "string" ? node.version : "*";
        const isDev = Boolean(node.dev);
        pushDep(name, ver, isDev ? "dev" : "normal");
        if (deps.length >= maxRows) return;

        if (includeTransitive && node.dependencies && typeof node.dependencies === "object") {
          walkV1(node.dependencies as Record<string, Record<string, unknown>>);
          if (deps.length >= maxRows) return;
        }
      }
    };

    walkV1(depsTree);
  }

  return {
    ecosystem: "npm",
    name: rootName,
    deps: deps.slice(0, maxRows),
  };
}

/**
 * Minimal TOML reader covering the dependency tables used in practice:
 *   [dependencies] foo = "1"  |  foo = { version = "1", ... }  |  foo.workspace = true
 *   [dependencies.foo] version = "1"
 *   [workspace.dependencies], [dev-dependencies], [build-dependencies],
 *   [target.'cfg(..)'.dependencies]
 */
export function parseCargoToml(text: string): Manifest {
  const deps: Dependency[] = [];
  const seen = new Set<string>();
  let section = "";
  let pkgName: string | undefined;
  let tableDep: { name: string; kind: Dependency["kind"] } | null = null;

  const kindOf = (sec: string): Dependency["kind"] | null => {
    if (/(^|\.)dev-dependencies$/.test(sec)) return "dev";
    if (/(^|\.)build-dependencies$/.test(sec)) return "build";
    if (/(^|\.)dependencies$/.test(sec)) return "normal";
    return null;
  };
  const push = (name: string, version: string, kind: Dependency["kind"]) => {
    if (seen.has(name)) return;
    seen.add(name);
    deps.push({ name, version, ecosystem: "cargo", kind });
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line || line.startsWith("#")) continue;

    const header = line.match(/^\[\s*([^\]]+?)\s*\]$/);
    if (header) {
      section = header[1].replace(/\s+/g, "");
      tableDep = null;
      // [dependencies.foo] style
      const m = section.match(/^(.*dependencies)\.("?)([A-Za-z0-9_\-]+)\2$/);
      if (m) {
        const k = kindOf(m[1]);
        if (k) {
          tableDep = { name: m[3], kind: k };
          push(m[3], "*", k);
        }
      }
      continue;
    }

    const kv = line.match(/^("?)([A-Za-z0-9_\-.]+)\1\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[2];
    const value = kv[3].trim();

    if (section === "package" && key === "name") {
      pkgName = unquote(value);
      continue;
    }
    if (tableDep) {
      if (key === "version") {
        const d = deps.find((x) => x.name === tableDep!.name);
        if (d) d.version = unquote(value);
      }
      continue;
    }
    const kind = kindOf(section);
    if (!kind) continue;

    const name = key.split(".")[0];
    if (value.startsWith('"') || value.startsWith("'")) push(name, unquote(value), kind);
    else if (value.startsWith("{")) {
      const ver = value.match(/version\s*=\s*["']([^"']+)["']/);
      const ws = /workspace\s*=\s*true/.test(value);
      const path = /path\s*=/.test(value);
      push(name, ver ? ver[1] : ws ? "workspace" : path ? "path" : "*", kind);
    } else if (key.endsWith(".workspace")) push(name, "workspace", kind);
    else if (key.endsWith(".version")) push(name, unquote(value), kind);
  }
  return { ecosystem: "cargo", name: pkgName, deps };
}

function unquote(s: string) {
  return s.replace(/^["']|["']$/g, "");
}

/** Evenly divide `bps` across n rows; remainder goes to the first rows. */
export function equalWeights(n: number, bps: number): number[] {
  if (n === 0) return [];
  const base = Math.floor(bps / n);
  const rem = bps - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Registry URL for a dependency (for linking). */
export function registryUrl(d: Pick<Dependency, "name" | "ecosystem">) {
  return d.ecosystem === "cargo" ? `https://crates.io/crates/${d.name}` : `https://www.npmjs.com/package/${d.name}`;
}

/** Fetch a manifest from a public GitHub repo (tries Cargo.toml then package.json). */
export async function fetchRepoManifest(repo: string): Promise<{ text: string; file: string }> {
  const slug = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) throw new Error("Use owner/repo or a github.com URL");
  for (const file of ["Cargo.toml", "package.json"]) {
    for (const branch of ["HEAD"]) {
      const res = await fetch(`https://raw.githubusercontent.com/${slug}/${branch}/${file}`);
      if (res.ok) return { text: await res.text(), file };
    }
  }
  throw new Error(`No Cargo.toml or package.json at the root of ${slug}`);
}
