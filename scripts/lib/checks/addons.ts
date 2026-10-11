
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ConfigError } from "../vstack-repo.ts";
import { shippedSkillNames, textFiles } from "./scope.ts";
import type { Check, Failure } from "./types.ts";

export const addonChecks: Check = {
  classes: ["invalid-utility", "addon-slash-route", "addon-question-mismatch"],
  async run(ctx) {
    const out: Failure[] = [];
    const shipped = shippedSkillNames(ctx);
    const mattPaths = new Set(ctx.register.rows
      .filter((row) => row.disposition !== "reject" && row.upstream && ctx.pins.get(row.upstream)?.role === "Base")
      .flatMap((row) => row.artifacts));
    const utility = new Set<string>();
    for (const path of ctx.register.utility) {
      const name = path.startsWith("plugin/skills/") ? path.slice("plugin/skills/".length) : "";
      if (!shipped.has(name)) {
        out.push({ class: "invalid-utility", item: path, message: "utility: entry does not name a shipped skill" });
      } else if (mattPaths.has(path)) {
        out.push({ class: "invalid-utility", item: path, message: "utility: entry names a skill with a non-reject Base upstream row" });
      } else {
        utility.add(name);
      }
    }
    const addons = new Set([...shipped].filter((name) => !mattPaths.has(`plugin/skills/${name}`) && !utility.has(name)));

    const files = existsSync(join(ctx.root, "plugin")) ? textFiles(ctx.root, "plugin") : [];
    if (existsSync(join(ctx.root, "README.md"))) files.push(...textFiles(ctx.root, "README.md"));
    for (const file of files) {
      const routed = new Set([...file.text.matchAll(/\/skill:([a-z0-9][a-z0-9-]*)/g)].map((match) => match[1]));
      for (const name of routed) {
        if (addons.has(name)) out.push({ class: "addon-slash-route", item: file.path, message: `/skill:${name} starts an Addon by name; use skill://${name}` });
      }
    }

    const catalogPath = join(ctx.root, "addon-questions.json");
    let catalog: unknown;
    try {
      catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
    } catch (error) {
      throw new ConfigError(`${catalogPath}: ${(error as Error).message}`);
    }
    if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
      throw new ConfigError(`${catalogPath}: expected an object keyed by Addon name`);
    }
    const questions = new Set(Object.keys(catalog));
    for (const name of [...questions].sort()) {
      if (!addons.has(name)) out.push({ class: "addon-question-mismatch", item: name, message: "addon-questions.json key does not name a shipped Addon" });
    }
    for (const name of [...addons].sort()) {
      if (!questions.has(name)) out.push({ class: "addon-question-mismatch", item: name, message: "shipped Addon has no key in addon-questions.json" });
    }
    return out;
  },
};
