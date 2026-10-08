// Per-row proposals and replay: Hold omits a delta, never freezes a shared artifact.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { PlanBody, PlanRow } from "./update-plan.ts";

export interface MergeStep { id: string; drafts: Record<string, string>; conflicts: string[]; effectiveOld: PlanRow["effective_old"] }
const empty = Buffer.alloc(0);
function bytes(path: string): Buffer {
  if (!existsSync(path)) return empty;
  if (lstatSync(path).isSymbolicLink()) throw new Error(`merge needs a reviewed regular-file mapping: ${path}`);
  return readFileSync(path);
}
function put(path: string, data: Buffer) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data); }
function merge(local: Buffer, base: Buffer, incoming: Buffer, scratch: string): { data: Buffer; conflict: boolean } {
  if (incoming.equals(base)) return { data: local, conflict: false };
  if (local.equals(base) || local.equals(incoming)) return { data: incoming, conflict: false };
  mkdirSync(scratch, { recursive: true });
  for (const [name, data] of [["vstack", local], ["effectiveOld", base], ["Upstream", incoming]] as const) put(join(scratch, name), data);
  const r = Bun.spawnSync(["git", "merge-file", "-p", "--diff3", "-L", "vstack", "-L", "effectiveOld", "-L", "Upstream", ...["vstack", "effectiveOld", "Upstream"].map(n => join(scratch, n))], { stdout: "pipe", stderr: "pipe" });
  // merge-file reports the number of conflicts (up to 127), not just exit 1.
  if (r.exitCode < 0 || r.exitCode > 127) throw new Error(`git merge-file: ${r.stderr.toString()}`);
  return { data: Buffer.from(r.stdout), conflict: r.exitCode !== 0 };
}
function files(root: string): string[] {
  if (!existsSync(root)) return [];
  if (!lstatSync(root).isDirectory()) return [""];
  const out: string[] = [];
  function visit(dir: string) { for (const n of readdirSync(dir).sort()) { const p = join(dir, n); if (lstatSync(p).isDirectory()) visit(p); else out.push(relative(root, p)); } }
  visit(root); return out;
}
export function proposeMerges(p: PlanBody & { out: string }, baseline: string, maps: Record<string, Record<string, string>> = {}): { steps: MergeStep[] } {
  const steps: MergeStep[] = [];
  for (const row of p.rows) {
    if (!["adapt", "merge"].includes(row.disposition) || !row.sides) continue;
    const step: MergeStep = { id: row.id, drafts: {}, conflicts: [], effectiveOld: row.effective_old };
    for (const artifact of row.artifacts) {
      const original = join(baseline, artifact), target = join(p.out, "merge-steps", ...row.id.split("/"), artifact);
      rmSync(target, { recursive: true, force: true }); mkdirSync(dirname(target), { recursive: true });
      if (existsSync(original)) cpSync(original, target, { recursive: true, dereference: false });
      const directory = !existsSync(original) || lstatSync(original).isDirectory();
      for (const f of row.files) {
        const suffix = maps[row.id]?.[f.path] ?? (row.kind === "playbook" ? "SKILL.md" : directory ? f.path : "");
        if (suffix.startsWith("/") || suffix.split("/").includes("..")) throw new Error(`invalid file mapping ${row.id}: ${suffix}`);
        const local = suffix ? join(original, suffix) : original, dest = suffix ? join(target, suffix) : target;
        const result = merge(bytes(local), bytes(join(row.sides.old, f.path)), bytes(join(row.sides.new, f.path)), join(p.out, "merge-inputs"));
        if (result.conflict) step.conflicts.push(`${artifact}${suffix ? "/" + suffix : ""}`);
        if (f.status === "deleted" && !result.data.length) rmSync(dest, { force: true }); else put(dest, result.data);
      }
      step.drafts[artifact] = target;
    }
    steps.push(step);
  }
  return { steps };
}
export function replayStep(current: string, baseline: string, proposal: string, scratch: string) {
  const directory = lstatSync(baseline).isDirectory();
  for (const f of new Set([...files(baseline), ...files(proposal)])) {
    const b = f ? join(baseline, f) : baseline, n = f ? join(proposal, f) : proposal, c = f ? join(current, f) : current;
    const incoming = bytes(n);
    if (incoming.equals(bytes(b))) continue;
    if (/^(?:<{7}|={7}|>{7}|\|{7})(?: |$)/m.test(incoming.toString())) throw new Error(`unresolved merge conflict: ${n}`);
    const result = merge(bytes(c), bytes(b), incoming, scratch);
    if (result.conflict) { const conflict = join(scratch, "composition-conflict"); put(conflict, result.data); throw new Error(`accepted row steps conflict at ${c}; resolve the row draft: ${conflict}`); }
    if (directory && !existsSync(n) && !result.data.length) rmSync(c, { force: true }); else put(c, result.data);
  }
}
