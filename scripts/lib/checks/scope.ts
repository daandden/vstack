// The shipped texts the House style lints read, each with the Disposition and Upstreams that decide which
// rows and rules apply (house-style.ts `inScope`/`selectRows`). Text-lint checks (House style, spawn lints,
// later page checks) start from lintTargets(ctx) so every lint sees artifacts the same way.

import { readdirSync, readFileSync, lstatSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { TextDisposition } from "../house-style.ts";
import type { CheckContext } from "./types.ts";

export interface TextFile {
  /** Repo-relative path, e.g. `plugin/skills/tdd/SKILL.md`. */
  path: string;
  text: string;
}

export interface LintTarget {
  /** The artifact unit, e.g. `plugin/skills/tdd`. */
  artifact: string;
  /** What a failure names: the one row id behind the artifact, else the artifact path (merges of several rows, originals). */
  item: string;
  disposition: TextDisposition;
  /** Upstreams of the rows behind the artifact; absent on an original. */
  upstreams?: string[];
  /** UTF-8 text files of the artifact (binary files are left out). */
  files: TextFile[];
}

/** Prose files: the asking and wording lints read only these. */
export const isMarkdown = (path: string) => /\.(md|mdc|markdown)$/i.test(path);

const IGNORED = new Set([".DS_Store"]);
const decoder = new TextDecoder("utf-8", { fatal: true });

function textFiles(root: string, artifact: string): TextFile[] {
  const out: TextFile[] = [];
  const add = (abs: string) => {
    const bytes = readFileSync(abs);
    if (bytes.includes(0)) return;
    try {
      out.push({ path: relative(root, abs), text: decoder.decode(bytes) });
    } catch {
      // not UTF-8 text
    }
  };
  const walk = (abs: string) => {
    if (IGNORED.has(basename(abs))) return;
    const st = lstatSync(abs);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) for (const e of readdirSync(abs)) walk(join(abs, e));
    else add(abs);
  };
  walk(join(root, artifact));
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** A row-backed artifact's Disposition: merge if any row merges, else adapt if any adapts, else adopt. */
function rowDisposition(dispositions: string[]): TextDisposition | undefined {
  if (dispositions.includes("merge")) return "merge";
  if (dispositions.includes("adapt")) return "adapt";
  if (dispositions.includes("adopt")) return "adopt";
  return undefined;
}

const cache = new WeakMap<CheckContext, LintTarget[]>();

/** Every registered plugin artifact that exists, with its Disposition, Upstreams, and text files. */
export function lintTargets(ctx: CheckContext): LintTarget[] {
  const hit = cache.get(ctx);
  if (hit) return hit;
  const originals = new Set(ctx.register.originals);
  const targets: LintTarget[] = [];
  for (const artifact of ctx.pluginArtifacts) {
    let target: Omit<LintTarget, "files"> | undefined;
    if (originals.has(artifact)) {
      target = { artifact, item: artifact, disposition: "original" };
    } else {
      const rows = ctx.validRows.filter((r) => r.artifacts.includes(artifact));
      const disposition = rowDisposition(rows.map((r) => r.disposition!));
      if (disposition) {
        target = {
          artifact,
          item: rows.length === 1 ? rows[0].id : artifact,
          disposition,
          upstreams: [...new Set(rows.map((r) => r.upstream!))],
        };
      }
    }
    // Unregistered artifacts, and artifacts only invalid rows name, are reported by other checks.
    if (target) targets.push({ ...target, files: textFiles(ctx.root, artifact) });
  }
  cache.set(ctx, targets);
  return targets;
}

/** Names of the skill directories vstack ships. */
export function shippedSkillNames(ctx: CheckContext): Set<string> {
  return new Set(ctx.pluginArtifacts.filter((a) => a.startsWith("plugin/skills/")).map((a) => a.slice("plugin/skills/".length)));
}
