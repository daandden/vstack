// Reads the repo-level files of a vstack checkout: pins.yaml, decision-register.yaml, and the plugin tree.

import { join, relative } from "node:path";
import { lstatSync, readdirSync, readFileSync, readlinkSync, existsSync } from "node:fs";
import { gitBlobSha, type UpstreamRef } from "./upstreams.ts";

export const DISPOSITIONS = ["adopt", "adapt", "merge", "reject"] as const;
export const KINDS = ["skill", "principle", "playbook", "agent"] as const;

/** Files never treated as content (macOS Finder noise). */
const IGNORED_NAMES = new Set([".DS_Store"]);

export class ConfigError extends Error {}

export interface ItemPattern {
  /** Path glob from the Upstream repo root; `*` matches within one path segment. */
  match: string;
  type: "tree" | "blob";
  kind: (typeof KINDS)[number];
  regex: RegExp;
}

export interface Pin extends UpstreamRef {
  pin: string;
  items: ItemPattern[];
}

export interface Row {
  /** Index in `items:`, for rows without a usable id. */
  index: number;
  raw: Record<string, unknown>;
  id: string;
  upstream?: string;
  kind?: string;
  path?: string;
  tree?: string;
  disposition?: string;
  artifacts: string[];
  held_at?: string;
  held_path?: string;
}

export interface Register {
  rows: Row[];
  originals: string[];
}

function readYaml(file: string): any {
  if (!existsSync(file)) throw new ConfigError(`${file} not found`);
  try {
    return Bun.YAML.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new ConfigError(`${file}: ${(e as Error).message}`);
  }
}

function globRegex(glob: string): RegExp {
  const body = glob
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^/]*");
  return new RegExp(`^${body}$`);
}

export function loadPins(root: string): Map<string, Pin> {
  const file = join(root, "pins.yaml");
  const doc = readYaml(file);
  const ups = doc?.upstreams;
  if (!ups || typeof ups !== "object") throw new ConfigError(`${file}: missing upstreams:`);
  const pins = new Map<string, Pin>();
  for (const [key, v] of Object.entries<any>(ups)) {
    if (typeof v?.repo !== "string" || typeof v?.pin !== "string" || !Array.isArray(v?.items)) {
      throw new ConfigError(`${file}: upstream ${key} needs repo, pin, and items`);
    }
    const items = v.items.map((it: any) => {
      if (typeof it?.match !== "string" || !["tree", "blob"].includes(it?.type) || !KINDS.includes(it?.kind)) {
        throw new ConfigError(`${file}: upstream ${key} has an item pattern without match, type (tree|blob), or kind`);
      }
      return { match: it.match, type: it.type, kind: it.kind, regex: globRegex(it.match) };
    });
    pins.set(key, { key, repo: v.repo, pin: String(v.pin), items });
  }
  return pins;
}

export function loadRegister(root: string): Register {
  const file = join(root, "decision-register.yaml");
  const doc = readYaml(file);
  if (!Array.isArray(doc?.items)) throw new ConfigError(`${file}: missing items:`);
  const str = (v: unknown) => (typeof v === "string" && v !== "" ? v : undefined);
  const rows = doc.items.map((raw: any, index: number): Row => {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      index,
      raw: r,
      id: str(r.id) ?? `items[${index}]`,
      upstream: str(r.upstream),
      kind: str(r.kind),
      path: str(r.path),
      tree: str(r.tree),
      disposition: str(r.disposition),
      artifacts: Array.isArray(r.artifacts) ? r.artifacts.filter((a: unknown) => typeof a === "string") : [],
      held_at: str(r.held_at),
      held_path: str(r.held_path),
    };
  });
  const originals = Array.isArray(doc.originals) ? doc.originals.filter((a: unknown) => typeof a === "string") : [];
  return { rows, originals };
}

export function isHeld(row: Row): boolean {
  return row.held_at !== undefined;
}

/**
 * Artifact units under `plugin/`: each child of a top-level directory (`plugin/skills/<name>`,
 * `plugin/agents/<file>`, `plugin/rules/<file>`, ...) and each top-level file except the manifest.
 */
export function listPluginArtifacts(root: string): string[] {
  const plugin = join(root, "plugin");
  if (!existsSync(plugin)) return [];
  const units: string[] = [];
  for (const top of readdirSync(plugin, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(top.name)) continue;
    if (top.isDirectory()) {
      for (const child of readdirSync(join(plugin, top.name))) {
        if (!IGNORED_NAMES.has(child)) units.push(`plugin/${top.name}/${child}`);
      }
    } else if (top.name !== "package.json") {
      units.push(`plugin/${top.name}`);
    }
  }
  return units.sort();
}

/** Files of an artifact (a directory or one file) with their git blob SHAs, keyed by path relative to the artifact. */
export function artifactBlobs(root: string, artifact: string): Map<string, string> {
  const abs = join(root, artifact);
  const out = new Map<string, string>();
  const hash = (file: string) => {
    const st = lstatSync(file);
    const bytes = st.isSymbolicLink() ? new TextEncoder().encode(readlinkSync(file)) : readFileSync(file);
    return gitBlobSha(bytes);
  };
  const st = lstatSync(abs);
  if (!st.isDirectory()) {
    out.set(artifact.slice(artifact.lastIndexOf("/") + 1), hash(abs));
    return out;
  }
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (IGNORED_NAMES.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.set(relative(abs, p), hash(p));
    }
  };
  walk(abs);
  return out;
}

export function readManifest(root: string): any {
  const file = join(root, "plugin", "package.json");
  if (!existsSync(file)) return undefined;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
