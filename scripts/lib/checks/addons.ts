
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { briefQuestions, parseAddonCatalog, type AddonCatalog } from "../../../plugin/extensions/addon-catalog.ts";
import { mattSkillNames } from "../../../plugin/extensions/matt-skills.ts";
import { ConfigError } from "../vstack-repo.ts";
import { shippedSkillNames, textFiles } from "./scope.ts";
import type { Check, Failure } from "./types.ts";

export const addonChecks: Check = {
  classes: ["invalid-utility", "addon-slash-route", "addon-question-mismatch", "brief-sample-mismatch"],
  async run(ctx) {
    const out: Failure[] = [];
    const shipped = shippedSkillNames(ctx);
    const catalogPath = join(ctx.root, "addon-questions.json");
    let catalog: AddonCatalog;
    try {
      catalog = parseAddonCatalog(JSON.parse(readFileSync(catalogPath, "utf8")));
    } catch (error) {
      throw new ConfigError(`${catalogPath}: ${(error as Error).message}`);
    }
    const questions = new Set(Object.keys(catalog.questions));
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
    out.push(...briefSampleFailures(ctx.root, new Set(Object.keys(briefQuestions(catalog)))));
    return out;
  },
};

/** Checks each sample in `sample-briefs.json`: a non-empty `prompt`, and labels that name a subagent question (ADR 0025). */
function briefSampleFailures(root: string, subagentQuestions: Set<string>): Failure[] {
  const path = join(root, "sample-briefs.json");
  if (!existsSync(path)) return [];
  let prompts: unknown;
  try {
    prompts = JSON.parse(readFileSync(path, "utf8")).prompts;
  } catch (error) {
    throw new ConfigError(`${path}: ${(error as Error).message}`);
  }
  if (!Array.isArray(prompts)) throw new ConfigError(`${path}: prompts must be an array`);
  const out: Failure[] = [];
  prompts.forEach((sample, index) => {
    const item = `sample-briefs.json:${typeof sample?.id === "string" && sample.id ? sample.id : `prompts[${index}]`}`;
    const fail = (message: string) => out.push({ class: "brief-sample-mismatch", item, message });
    if (typeof sample?.prompt !== "string" || !sample.prompt.trim()) fail("`prompt` must be a non-empty string");
    for (const field of ["expected", "allowed"] as const) {
      const labels: unknown = field === "allowed" ? sample?.allowed ?? [] : sample?.expected;
      if (!Array.isArray(labels)) {
        fail(`\`${field}\` must be an array of principle names`);
        continue;
      }
      for (const label of labels) {
        if (typeof label !== "string" || !subagentQuestions.has(label)) {
          fail(`\`${field}\` label ${label} names no subagent question (a principle in addon-questions.json other than principle-never-block-on-the-human)`);
        }
      }
    }
  });
  return out;
}
