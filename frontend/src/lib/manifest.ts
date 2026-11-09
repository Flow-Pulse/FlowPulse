/**
 * Dependency manifest parsing for split tables.
 * Supports Cargo.toml, package.json, and Cargo.lock / package-lock.json (with transitive dependencies option).
 */

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

export interface ParseOptions {
  includeTransitive?: boolean;
  maxDeps?: number;
}

export const MAX_SPLIT_ROWS = 32;

export function parseManifest(text: string, filename = "", options: ParseOptions = {}): Manifest {
  const t = text.trim();
  const lower = filename.toLowerCase();

  if (lower.endsWith("cargo.lock") || (!lower.endsWith(".toml") && t.includes("[[package]]"))) {
    return parseCargoLock(t, options);
  }

  if (lower.endsWith("package-lock.json")) {
    return parsePackageLock(t, options);
  }

  if (lower.endsWith(".json") || t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t);
      if (parsed && typeof parsed === "object" && ("lockfileVersion" in parsed || "packages" in parsed)) {
        return parsePackageLock(t, options);
      }
    } catch {
      // Let parsePackageJson throw standard error
    }
    return parsePackageJson(t);
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

interface CargoLockPackage {
  name: string;
  version: string;
  source?: string;
  dependencies: string[];
}

/**
 * Parse Cargo.lock format.
 * Extracts direct dependencies by default, or all transitive dependencies if includeTransitive is true.
 * Deduplicates package names and caps output at maxDeps (default 32).
 */
export function parseCargoLock(text: string, options: ParseOptions = {}): Manifest {
  const maxDeps = options.maxDeps ?? MAX_SPLIT_ROWS;
  const includeTransitive = options.includeTransitive ?? false;

  const packages: CargoLockPackage[] = [];
  let current: Partial<CargoLockPackage> | null = null;
  let inDeps = false;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    if (!line) continue;

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
      inDeps = false;
      continue;
    }

    if (!current) continue;

    if (line === "dependencies = [" || line.startsWith("dependencies = [")) {
      inDeps = true;
      const inline = line.match(/dependencies\s*=\s*\[(.*)\]/);
      if (inline) {
        for (const depStr of inline[1].split(",")) {
          const s = depStr.trim().replace(/^["']|["']$/g, "");
          if (s) current.dependencies!.push(s);
        }
        inDeps = false;
      }
      continue;
    }

    if (inDeps) {
      if (line === "]") {
        inDeps = false;
        continue;
      }
      const depName = line.replace(/,$/, "").trim().replace(/^["']|["']$/g, "");
      if (depName) current.dependencies!.push(depName);
      continue;
    }

    const kv = line.match(/^("?)([A-Za-z0-9_\-]+)\1\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[2];
    const val = unquote(kv[3].trim());

    if (key === "name") current.name = val;
    else if (key === "version") current.version = val;
    else if (key === "source") current.source = val;
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

  // Root package is the member without source, or the first package
  const rootPkg = packages.find((p) => !p.source) ?? packages[0];
  const rootName = rootPkg.name;

  const directNames = new Set(
    rootPkg.dependencies.map((d) => d.split(" ")[0]),
  );

  const deps: Dependency[] = [];
  const seen = new Set<string>();
  seen.add(rootName);

  // 1. Direct dependencies from root package
  for (const pkg of packages) {
    if (directNames.has(pkg.name) && !seen.has(pkg.name)) {
      seen.add(pkg.name);
      deps.push({
        name: pkg.name,
        version: pkg.version,
        ecosystem: "cargo",
        kind: "normal",
      });
      if (deps.length >= maxDeps) break;
    }
  }

  // 2. Transitive dependencies if requested
  if (includeTransitive && deps.length < maxDeps) {
    for (const pkg of packages) {
      if (!seen.has(pkg.name)) {
        seen.add(pkg.name);
        deps.push({
          name: pkg.name,
          version: pkg.version,
          ecosystem: "cargo",
          kind: "normal",
        });
        if (deps.length >= maxDeps) break;
      }
    }
  }

  return {
    ecosystem: "cargo",
    name: rootName,
    deps,
  };
}

/**
 * Parse package-lock.json format (v1, v2, v3).
 * Extracts direct dependencies by default, or all transitive dependencies if includeTransitive is true.
 * Deduplicates package names and caps output at maxDeps (default 32).
 */
export function parsePackageLock(text: string, options: ParseOptions = {}): Manifest {
  const maxDeps = options.maxDeps ?? MAX_SPLIT_ROWS;
  const includeTransitive = options.includeTransitive ?? false;

  let j: Record<string, unknown>;
  try {
    j = JSON.parse(text);
  } catch {
    throw new Error("package-lock.json is not valid JSON");
  }

  const rootName = typeof j.name === "string" ? j.name : undefined;
  const deps: Dependency[] = [];
  const seen = new Set<string>();
  if (rootName) seen.add(rootName);

  const cleanPkgName = (pkgPath: string): string => {
    const idx = pkgPath.lastIndexOf("node_modules/");
    if (idx !== -1) {
      return pkgPath.slice(idx + "node_modules/".length);
    }
    return pkgPath;
  };

  // v2 / v3 lockfile format with j.packages
  if (j.packages && typeof j.packages === "object") {
    const pkgs = j.packages as Record<string, Record<string, unknown>>;
    const rootPkg = pkgs[""] ?? {};
    const directDeps = {
      ...((rootPkg.dependencies as Record<string, string>) ?? {}),
      ...((rootPkg.devDependencies as Record<string, string>) ?? {}),
      ...((rootPkg.peerDependencies as Record<string, string>) ?? {}),
    };

    // 1. Direct dependencies
    for (const [depName, verRange] of Object.entries(directDeps)) {
      if (seen.has(depName)) continue;
      seen.add(depName);

      let exactVer = String(verRange);
      const pkgEntry = pkgs[`node_modules/${depName}`];
      if (pkgEntry && typeof pkgEntry.version === "string") {
        exactVer = pkgEntry.version;
      }

      deps.push({
        name: depName,
        version: exactVer,
        ecosystem: "npm",
        kind: "normal",
      });
      if (deps.length >= maxDeps) break;
    }

    // 2. Transitive dependencies
    if (includeTransitive && deps.length < maxDeps) {
      for (const [pathKey, pkg] of Object.entries(pkgs)) {
        if (!pathKey || pathKey === "" || !pathKey.includes("node_modules/")) continue;
        const name = cleanPkgName(pathKey);
        if (seen.has(name)) continue;
        seen.add(name);

        const ver = pkg && typeof pkg.version === "string" ? pkg.version : "*";
        deps.push({
          name,
          version: ver,
          ecosystem: "npm",
          kind: "normal",
        });
        if (deps.length >= maxDeps) break;
      }
    }

    return { ecosystem: "npm", name: rootName, deps };
  }

  // v1 lockfile format with j.dependencies
  if (j.dependencies && typeof j.dependencies === "object") {
    const depMap = j.dependencies as Record<string, Record<string, unknown>>;

    // 1. Direct dependencies (top level of dependencies)
    for (const [depName, depObj] of Object.entries(depMap)) {
      if (seen.has(depName)) continue;
      seen.add(depName);
      const ver = depObj?.version ? String(depObj.version) : "*";
      deps.push({
        name: depName,
        version: ver,
        ecosystem: "npm",
        kind: "normal",
      });
      if (deps.length >= maxDeps) break;
    }

    // 2. Transitive dependencies
    if (includeTransitive && deps.length < maxDeps) {
      const collectTransitive = (obj: Record<string, Record<string, unknown>>) => {
        for (const [name, val] of Object.entries(obj)) {
          if (!seen.has(name)) {
            seen.add(name);
            deps.push({
              name,
              version: val?.version ? String(val.version) : "*",
              ecosystem: "npm",
              kind: "normal",
            });
            if (deps.length >= maxDeps) return;
          }
          if (val && typeof val.dependencies === "object") {
            collectTransitive(val.dependencies as Record<string, Record<string, unknown>>);
            if (deps.length >= maxDeps) return;
          }
        }
      };

      for (const val of Object.values(depMap)) {
        if (val && typeof val.dependencies === "object") {
          collectTransitive(val.dependencies as Record<string, Record<string, unknown>>);
          if (deps.length >= maxDeps) break;
        }
      }
    }

    return { ecosystem: "npm", name: rootName, deps };
  }

  return { ecosystem: "npm", name: rootName, deps: [] };
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

/** Fetch a manifest from a public GitHub repo. */
export async function fetchRepoManifest(
  repo: string,
  options: ParseOptions = {},
): Promise<{ text: string; file: string }> {
  const slug = repo.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "").replace(/\/$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(slug)) throw new Error("Use owner/repo or a github.com URL");
  const files = options.includeTransitive
    ? ["Cargo.lock", "package-lock.json", "Cargo.toml", "package.json"]
    : ["Cargo.toml", "package.json", "Cargo.lock", "package-lock.json"];
  for (const file of files) {
    for (const branch of ["HEAD", "main", "master"]) {
      const res = await fetch(`https://raw.githubusercontent.com/${slug}/${branch}/${file}`);
      if (res.ok) return { text: await res.text(), file };
    }
  }
  throw new Error(`No manifest or lockfile found at the root of ${slug}`);
}
