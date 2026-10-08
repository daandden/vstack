// Register vs plugin tree: every named artifact exists, and every plugin artifact is named.

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Check, Failure } from "./types.ts";

export const artifactChecks: Check = {
  classes: ["missing-artifact", "unregistered-artifact"],
  async run(ctx) {
    const out: Failure[] = [];
    const named = new Set<string>();
    for (const row of ctx.register.rows) {
      for (const a of row.artifacts) {
        named.add(a);
        if (!existsSync(join(ctx.root, a))) out.push({ class: "missing-artifact", item: row.id, message: `${a} does not exist` });
      }
    }
    for (const a of ctx.register.originals) {
      named.add(a);
      if (!existsSync(join(ctx.root, a))) out.push({ class: "missing-artifact", item: a, message: `${a} is listed under originals: and does not exist` });
    }
    for (const a of ctx.pluginArtifacts) {
      if (!named.has(a)) out.push({ class: "unregistered-artifact", item: a, message: "no row names it and originals: does not list it" });
    }
    return out;
  },
};
