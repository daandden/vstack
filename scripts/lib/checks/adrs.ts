import { existsSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { ConfigError } from "../vstack-repo.ts";
import { git, resolveBase } from "./base.ts";
import type { Check, Failure } from "./types.ts";

const ADR_DIR = "docs/adr";
const KNOWN_0065 = new Set([
  "docs/adr/0065-flow-figures-get-color-roles-from-the-shared-role-pass.md",
  "docs/adr/0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session.md",
]);

function adrFiles(root: string, dir = ADR_DIR): string[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return adrFiles(root, path);
    return entry.name === ".DS_Store" ? [] : [path];
  }).sort();
}

function validName(name: string): boolean {
  const match = /^(\d{4})(\d{2})(\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.exec(name);
  if (!match) return false;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (year === 0 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1]!;
}

export const adrChecks: Check = {
  classes: ["invalid-adr-name", "duplicate-adr-number"],
  async run(ctx) {
    const base = resolveBase(ctx);
    ctx.notes.push(`ADR-name base: ${base.sha ?? "-"} ${base.label}`);
    const previous = base.sha ? git(ctx.root, ["ls-tree", "-r", "-z", "--name-only", base.sha, "--", ADR_DIR]) : undefined;
    if (previous && !previous.ok) throw new ConfigError(`cannot read ADR filenames at ${base.sha}`);
    const existing = new Set(previous?.out.split("\0") ?? []);
    const failures: Failure[] = [];
    const legacy = new Map<string, string[]>();
    for (const path of adrFiles(ctx.root)) {
      const name = basename(path);
      if (!existing.has(path) && !validName(name)) {
        failures.push({
          class: "invalid-adr-name",
          item: path,
          message: "New ADRs require YYYYMMDD-slug.md with a real local creation date and a lowercase, hyphen-separated slug. Keep existing filenames unchanged.",
        });
      }
      const number = /^(\d{4})-.*\.md$/.exec(name)?.[1];
      if (number) {
        const paths = legacy.get(number) ?? [];
        paths.push(path);
        legacy.set(number, paths);
      }
    }
    for (const [number, paths] of legacy) {
      if (paths.length < 2 || (number === "0065" && paths.length === KNOWN_0065.size && paths.every(path => KNOWN_0065.has(path)))) continue;
      failures.push({
        class: "duplicate-adr-number",
        item: number,
        message: `Duplicate legacy ADR number: ${paths.join(", ")}. Only the existing 0065 pair is accepted; new ADRs use YYYYMMDD-slug.md.`,
      });
    }
    return failures;
  },
};
