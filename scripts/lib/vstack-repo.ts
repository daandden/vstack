// Reads the repo-level files of a vstack checkout: pins.yaml, decision-register.yaml, house-style.yaml, and the plugin tree.

import { basename, dirname, join, relative } from "node:path";
import { lstatSync, readdirSync, readFileSync, readlinkSync, existsSync } from "node:fs";
import { gitBlobSha, type TreeEntry, type UpstreamRef, type UpstreamTree } from "./upstreams.ts";
import { HouseStyleError, parseHouseStyle, type HouseStyle, type HouseStyleProblem } from "./house-style.ts";

export const DISPOSITIONS = ["adopt", "adapt", "merge", "reject"] as const;
export const KINDS = ["skill", "principle", "playbook", "agent"] as const;
/** How an Upstream's newest Pin is found: the highest `v<semver>` release tag, or the newest default-branch commit touching `path`. */
export const PIN_KINDS = ["tag", "commit"] as const;
export type PinKind = (typeof PIN_KINDS)[number];

/** The only Upstream file an adopt artifact never ships (ADR 0001). */
export const NEVER_SHIPPED = "agents/openai.yaml";

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
  /** Base marks an Upstream whose non-reject skill rows define Matt skills. */
  role?: string;
  pin: string;
  pin_kind: PinKind;
  /** The part of the repo vstack takes from, no slashes at either end; "" is the whole repo. */
  path: string;
  items: ItemPattern[];
}

export type UpstreamItem = TreeEntry & { kind: ItemPattern["kind"] };

/** Upstream items in a tree: entries matching one of the Pin's `items:` patterns, each with the first matching kind. */
export function upstreamItems(pin: Pin, tree: UpstreamTree): UpstreamItem[] {
  const out: UpstreamItem[] = [];
  for (const e of tree.entries) {
    const pattern = pin.items.find((p) => p.type === e.type && p.regex.test(e.path));
    if (pattern) out.push({ ...e, kind: pattern.kind });
  }
  return out;
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
  utility: string[];
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
  return parsePins(readYaml(file), file);
}

/** Validates a parsed pins.yaml; `file` names it in errors. */
export function parsePins(doc: any, file: string): Map<string, Pin> {
  const ups = doc?.upstreams;
  if (!ups || typeof ups !== "object") throw new ConfigError(`${file}: missing upstreams:`);
  const pins = new Map<string, Pin>();
  for (const [key, v] of Object.entries<any>(ups)) {
    if (typeof v?.repo !== "string" || typeof v?.pin !== "string" || !Array.isArray(v?.items)) {
      throw new ConfigError(`${file}: upstream ${key} needs repo, pin, and items`);
    }
    if (!(PIN_KINDS as readonly unknown[]).includes(v.pin_kind)) {
      throw new ConfigError(`${file}: upstream ${key} needs pin_kind ${PIN_KINDS.join(" or ")}`);
    }
    if (v.path !== undefined && typeof v.path !== "string") throw new ConfigError(`${file}: upstream ${key} has a path that is not text`);
    const items = v.items.map((it: any) => {
      if (typeof it?.match !== "string" || !["tree", "blob"].includes(it?.type) || !KINDS.includes(it?.kind)) {
        throw new ConfigError(`${file}: upstream ${key} has an item pattern without match, type (tree|blob), or kind`);
      }
      return { match: it.match, type: it.type, kind: it.kind, regex: globRegex(it.match) };
    });
    const path = String(v.path ?? "").replace(/^\/+|\/+$/g, "");
    pins.set(key, { key, repo: v.repo, pin: String(v.pin), pin_kind: v.pin_kind, path, items, ...(typeof v.role === "string" ? { role: v.role } : {}) });
  }
  return pins;
}

export function loadRegister(root: string): Register {
  const file = join(root, "decision-register.yaml");
  return parseRegister(readYaml(file), file);
}

/** Reads a parsed decision-register.yaml; `file` names it in errors. */
export function parseRegister(doc: any, file: string): Register {
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
  const utility = doc.utility ?? [];
  if (!Array.isArray(utility) || !utility.every((a: unknown) => typeof a === "string")) {
    throw new ConfigError(`${file}: utility: must be a list of skill paths`);
  }
  return { rows, originals, utility };
}

/** Reads house-style.yaml. Row and rule problems come back for check-register to report; a missing file is a ConfigError. */
export function loadHouseStyle(root: string, upstreams: ReadonlySet<string>): { houseStyle: HouseStyle; problems: HouseStyleProblem[] } {
  const file = join(root, "house-style.yaml");
  const doc = readYaml(file);
  try {
    return parseHouseStyle(doc, upstreams);
  } catch (e) {
    if (e instanceof HouseStyleError) throw new ConfigError(`${file}: ${e.message}`);
    throw e;
  }
}

export function isHeld(row: Row): boolean {
  return row.held_at !== undefined;
}

/** Source and distribution files, including symlinks, but not recognized local cache files. */
export function* artifactFiles(root: string, artifact: string): Generator<string> {
  function* walk(abs: string): Generator<string> {
    const st = lstatSync(abs);
    if (st.isDirectory()) {
      for (const entry of readdirSync(abs)) yield* walk(join(abs, entry));
    } else if (
      !IGNORED_NAMES.has(basename(abs)) &&
      !(st.isFile() && basename(dirname(abs)) === "__pycache__" && /\.py[co]$/.test(basename(abs)))
    ) {
      yield relative(root, abs);
    }
  }
  yield* walk(join(root, artifact));
}

/**
 * Source-bearing units under `plugin/`: each child of a top-level directory
 * and each top-level file except the manifest. Empty and cache-only trees are not units.
 */
export function listPluginArtifacts(root: string): string[] {
  const plugin = join(root, "plugin");
  if (!existsSync(plugin)) return [];
  const units: string[] = [];
  for (const top of readdirSync(plugin, { withFileTypes: true })) {
    if (IGNORED_NAMES.has(top.name)) continue;
    if (top.isDirectory()) {
      for (const child of readdirSync(join(plugin, top.name))) {
        const artifact = `plugin/${top.name}/${child}`;
        if (!artifactFiles(root, artifact).next().done) units.push(artifact);
      }
    } else if (top.name !== "package.json") {
      const artifact = `plugin/${top.name}`;
      if (!artifactFiles(root, artifact).next().done) units.push(artifact);
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
  const directory = lstatSync(abs).isDirectory();
  for (const file of artifactFiles(root, artifact)) {
    const path = join(root, file);
    out.set(directory ? relative(abs, path) : basename(path), hash(path));
  }
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
