/**
 * Dependency manifest parsing for split tables.
 * Supports Cargo.toml, package.json, and Cargo.lock / package-lock.json (top-level only).
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

export function parseManifest(text: string, filename = ""): Manifest {
  const t = text.trim();
  if (filename.endsWith(".json") || t.startsWith("{")) return parsePackageJson(t);
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
