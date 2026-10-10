// A user finds a skill through ask-vstack (#105): every shipped skill except the principle-* skills needs a
// `/skill:<name>` route in plugin/skills/ask-vstack/SKILL.md, ask-vstack included.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { shippedSkillNames } from "./scope.ts";
import type { Check, Failure } from "./types.ts";

const ROUTER = "ask-vstack";
const ROUTER_FILE = `plugin/skills/${ROUTER}/SKILL.md`;

export const routeChecks: Check = {
  classes: ["unrouted-skill"],
  async run(ctx) {
    const file = join(ctx.root, ROUTER_FILE);
    const text = existsSync(file) ? readFileSync(file, "utf8") : "";
    const routed = new Set([...text.matchAll(/\/skill:([a-z0-9][a-z0-9-]*)/g)].map((m) => m[1]));
    const out: Failure[] = [];
    for (const name of [...shippedSkillNames(ctx)].sort()) {
      if (name.startsWith("principle-") || routed.has(name)) continue;
      out.push({ class: "unrouted-skill", item: `plugin/skills/${name}`, message: `${ROUTER_FILE} does not name /skill:${name}` });
    }
    return out;
  },
};
