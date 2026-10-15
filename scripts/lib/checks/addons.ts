
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAddonCatalog } from "../../../plugin/extensions/addon-catalog.ts";
import { mattSkillNames } from "../../../plugin/extensions/matt-skills.ts";
import { ConfigError } from "../vstack-repo.ts";
import { shippedSkillNames, textFiles } from "./scope.ts";
import type { Check, Failure } from "./types.ts";

export const addonChecks: Check = {
  classes: ["invalid-utility", "addon-slash-route", "addon-question-mismatch"],
  async run(ctx) {
    const out: Failure[] = [];
    const shipped = shippedSkillNames(ctx);
    const catalogPath = join(ctx.root, "addon-questions.json");
    let questions: Set<string>;
    try {
      questions = new Set(Object.keys(parseAddonCatalog(JSON.parse(readFileSync(catalogPath, "utf8"))).questions));
    } catch (error) {
      throw new ConfigError(`${catalogPath}: ${(error as Error).message}`);
    }
    const roleOf = (upstream: string) => ctx.pins.get(upstream)?.role;
    const skillsWithBaseRows = mattSkillNames(ctx.validRows, roleOf, []);
    const matt = mattSkillNames(ctx.validRows, roleOf, questions);
    const utility = new Set<string>();
    for (const path of ctx.register.utility) {
      const name = path.startsWith("plugin/skills/") ? path.slice("plugin/skills/".length) : "";
      if (!shipped.has(name)) {
        out.push({ class: "invalid-utility", item: path, message: "utility: entry does not name a shipped skill" });
      } else if (skillsWithBaseRows.has(name)) {
        out.push({ class: "invalid-utility", item: path, message: "utility: entry names a skill with a non-reject Base upstream row" });
      } else {
        utility.add(name);
      }
    }
    // A skill named by an invalid row is not classified, so that the bad row reports once.
    const valid = new Set(ctx.validRows);
    const unclassified = new Set(ctx.register.rows.filter((row) => !valid.has(row)).flatMap((row) => row.artifacts));
    const addons = new Set([...shipped].filter((name) => !matt.has(name) && !utility.has(name) && !unclassified.has(`plugin/skills/${name}`)));

    const files = existsSync(join(ctx.root, "plugin")) ? textFiles(ctx.root, "plugin") : [];
    if (existsSync(join(ctx.root, "README.md"))) files.push(...textFiles(ctx.root, "README.md"));
    for (const file of files) {
      const routed = new Set([...file.text.matchAll(/\/skill:([a-z0-9][a-z0-9-]*)/g)].map((match) => match[1]));
      for (const name of routed) {
        if (addons.has(name)) out.push({ class: "addon-slash-route", item: file.path, message: `/skill:${name} starts an Addon by name; use skill://${name}` });
      }
    }

    for (const name of [...questions].sort()) {
      if (!addons.has(name)) out.push({ class: "addon-question-mismatch", item: name, message: "key in the `questions` map of addon-questions.json does not name a shipped Addon" });
    }
    for (const name of [...addons].sort()) {
      if (!questions.has(name)) out.push({ class: "addon-question-mismatch", item: name, message: "shipped Addon has no key in the `questions` map of addon-questions.json" });
    }
    return out;
  },
};
