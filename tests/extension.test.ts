import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import catalogFile from "../addon-questions.json";
import { parseAddonCatalog } from "../plugin/extensions/addon-catalog.ts";
import { mattSkillNames } from "../plugin/extensions/matt-skills.ts";
import { fakeHost } from "./support/extension-host.ts";

describe("Addon catalog", () => {
  test("a brief_preamble for subagent briefs sits beside the preamble", () => {
    const { brief_preamble: _, ...withoutBriefPreamble } = catalogFile as Record<string, unknown>;
    expect(() => parseAddonCatalog(withoutBriefPreamble)).toThrow("brief_preamble must be a non-empty string");
    expect(() => parseAddonCatalog({ ...withoutBriefPreamble, brief_preamble: " " })).toThrow("brief_preamble must be a non-empty string");
    expect(parseAddonCatalog(catalogFile).brief_preamble).toBe("The state's `request` is a task brief that a coding agent wrote for a subagent. Read \"the user\" in a question as the brief's author. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation in the question. If torn, answer no.");
  });
});

describe("Matt skill class", () => {
  const roleOf = (upstream: string) => ({ base: "Base", other: "Enhancement" })[upstream];
  const rows = [
    { upstream: "base", disposition: "adopt", artifacts: ["plugin/skills/tdd"] },
    { upstream: "base", disposition: "merge", artifacts: ["plugin/skills/session"] },
    { upstream: "other", disposition: "adapt", artifacts: ["plugin/skills/session"] },
  ];

  test("a skill with a non-reject Base row and a catalog key is an Addon", () => {
    expect([...mattSkillNames(rows, roleOf, ["session"])]).toEqual(["tdd"]);
  });

  test("a skill with a non-reject Base row and no catalog key is a Matt skill", () => {
    expect([...mattSkillNames(rows, roleOf, [])].sort()).toEqual(["session", "tdd"]);
  });

  describe("the extension", () => {
    const addon = Object.keys(parseAddonCatalog(catalogFile).questions)[0]!;
    const model = { provider: "typesafe", id: "jev-latest", api: "typesafe", baseUrl: "https://judge.test/" };
    const options = { models: [model], apiKeys: { "typesafe/jev-latest": "test-key" } };
    const start = (name: string) => `[IMPORTANT: User invoked the "${name}" skill. Follow this skill.]\nSkill text.\n---\n[Skill directory: /skills/${name}]\nUser: Open a PR`;
    let fetchSpy: ReturnType<typeof spyOn>;
    let readSpy: ReturnType<typeof spyOn>;
    afterEach(() => { fetchSpy?.mockRestore(); readSpy?.mockRestore(); });

    test("typing a catalog skill with a Base row starts no Matt run", async () => {
      fetchSpy = spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ answers: { [addon]: { type: "noul", noul: 1 } } })) as unknown as typeof fetch);
      const read = fs.readFileSync;
      readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, ...args: any[]) => {
        if (String(path).endsWith("pins.yaml")) return "upstreams: {custom: {role: Base}}";
        if (String(path).endsWith("decision-register.yaml")) return JSON.stringify({ items: [
          { upstream: "custom", disposition: "merge", artifacts: [`plugin/skills/${addon}`, "plugin/skills/custom-matt"] },
        ] });
        return (read as any)(path, ...args);
      }) as any);
      const saved = { type: "custom_message", customType: "skill-prompt", details: { name: addon } };
      expect(await fakeHost(options).emit("before_agent_start", { prompt: start(addon) })).toEqual([undefined]);
      expect(await fakeHost({ ...options, entries: [saved] }).emit("before_agent_start", { prompt: "Continue" })).toEqual([undefined]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect((await fakeHost(options).emit("before_agent_start", { prompt: start("custom-matt") }))[0]).toBeDefined();
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
