// Row-level checks: each register row on its own, against pins.yaml but no Upstream tree.

import { DISPOSITIONS, KINDS, isHeld, type Pin, type Row } from "../vstack-repo.ts";
import type { Check, Failure } from "./types.ts";

const SHA = /^[0-9a-f]{40}$/;

/** Problems that make a row's fields untrustworthy for the other checks. */
export function rowProblems(row: Row, pins: Map<string, Pin>, seenIds: Set<string>): Failure[] {
  const out: Failure[] = [];
  const bad = (message: string) => out.push({ class: "invalid-row", item: row.id, message });
  const r = row.raw;
  if (typeof r.id !== "string" || r.id === "") bad("id is missing");
  else if (seenIds.has(r.id)) bad("id is used by an earlier row");
  if (!row.upstream || !pins.has(row.upstream)) bad(`upstream ${JSON.stringify(r.upstream)} is not a key in pins.yaml`);
  if (!row.kind || !(KINDS as readonly string[]).includes(row.kind)) bad(`kind ${JSON.stringify(r.kind)} is not one of ${KINDS.join(", ")}`);
  if (typeof r.reason !== "string" || r.reason.trim() === "") bad("reason is missing");
  if (!Array.isArray(r.artifacts)) bad("artifacts is not a list");
  else if (row.artifacts.length !== r.artifacts.length || row.artifacts.some((a) => !a.startsWith("plugin/")))
    bad("every artifact is a path under plugin/");
  if (row.path !== undefined && (!row.tree || !SHA.test(row.tree))) bad("tree is not a full git object SHA");
  if ((row.held_at === undefined) !== (row.held_path === undefined)) bad("held_at and held_path are set and cleared together");
  if (!row.disposition || !(DISPOSITIONS as readonly string[]).includes(row.disposition)) {
    out.push({
      class: "invalid-disposition",
      item: row.id,
      message: `disposition ${JSON.stringify(r.disposition)} is not one of ${DISPOSITIONS.join(", ")}`,
    });
  }
  return out;
}

export const rowChecks: Check = {
  classes: ["invalid-row", "invalid-disposition", "reject-with-artifacts", "non-reject-without-artifacts", "absent-path"],
  async run(ctx) {
    const out: Failure[] = [];
    const seen = new Set<string>();
    for (const row of ctx.register.rows) {
      const problems = rowProblems(row, ctx.pins, seen);
      out.push(...problems);
      if (problems.length === 0 && row.disposition !== "reject" && row.artifacts.length === 0) {
        out.push({ class: "non-reject-without-artifacts", item: row.id, message: "non-reject row names no artifacts" });
      }
      if (typeof row.raw.id === "string") seen.add(row.raw.id);
      if (row.disposition === "reject" && row.artifacts.length > 0) {
        out.push({ class: "reject-with-artifacts", item: row.id, message: `reject row names ${row.artifacts.join(", ")}` });
      }
      if (row.path === undefined && !isHeld(row)) {
        out.push({ class: "absent-path", item: row.id, message: "path is absent and the row is not held" });
      }
    }
    return out;
  },
};
