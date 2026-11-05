// Register vs plugin tree: every named artifact exists, and every plugin artifact is named.

import type { Check, Failure } from "./types.ts";

export const artifactChecks: Check = {
  classes: ["missing-artifact", "unregistered-artifact"],
  async run(ctx) {
    const out: Failure[] = [];
    const named = new Set<string>();
    const shipped = new Set(ctx.pluginArtifacts);
    for (const row of ctx.register.rows) {
      for (const a of row.artifacts) {
        named.add(a);
        if (!shipped.has(a)) out.push({ class: "missing-artifact", item: row.id, message: `${a} has no shipped content` });
      }
    }
    for (const a of ctx.register.originals) {
      named.add(a);
      if (!shipped.has(a)) out.push({ class: "missing-artifact", item: a, message: `${a} is listed under originals: but has no shipped content` });
    }
    for (const a of ctx.pluginArtifacts) {
      if (!named.has(a)) out.push({ class: "unregistered-artifact", item: a, message: "no row names it and originals: does not list it" });
    }
    return out;
  },
};
