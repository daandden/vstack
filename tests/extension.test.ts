import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import catalogFile from "../addon-questions.json";
import { parseAddonCatalog } from "../plugin/extensions/addon-catalog.ts";
import { mattSkillNames } from "../plugin/extensions/matt-skills.ts";
import { fakeHost } from "./support/extension-host.ts";
import { judge, judgeAnswers } from "./support/extension-mocks.ts";

describe("Addon catalog", () => {
  test("a brief_preamble for subagent briefs sits beside the preamble", () => {
    const { brief_preamble: _, ...withoutBriefPreamble } = catalogFile as Record<string, unknown>;
    expect(() => parseAddonCatalog(withoutBriefPreamble)).toThrow("brief_preamble must be a non-empty string");
    expect(() => parseAddonCatalog({ ...withoutBriefPreamble, brief_preamble: " " })).toThrow("brief_preamble must be a non-empty string");
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
    const options = {};
    const start = (name: string) => `[IMPORTANT: User invoked the "${name}" skill. Follow this skill.]\nSkill text.\n---\n[Skill directory: /skills/${name}]\nUser: Open a PR`;
    let readSpy: ReturnType<typeof spyOn>;
    afterEach(() => { readSpy?.mockRestore(); });

    test("typing a catalog skill with a Base row starts no Matt run", async () => {
      judgeAnswers({ [addon]: 1 });
      const read = fs.readFileSync;
      readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, ...args: any[]) => {
        if (String(path).endsWith("pins.yaml")) return "upstreams: {custom: {role: Base}}";
        if (String(path).endsWith("decision-register.yaml")) return JSON.stringify({ items: [
          { upstream: "custom", disposition: "merge", artifacts: [`plugin/skills/${addon}`, "plugin/skills/custom-matt"] },
        ] });
        return (read as any)(path, ...args);
      }) as any);
      const saved = { type: "custom_message", customType: "skill-prompt", details: { name: addon } };
      expect((await fakeHost(options).emit("before_agent_start", { prompt: start(addon) })).filter((result: any) => result?.message?.display)).toEqual([]);
      expect((await fakeHost({ ...options, entries: [saved] }).emit("before_agent_start", { prompt: "Continue" })).filter((result: any) => result?.message?.display)).toEqual([]);
      expect(judge.calls).toHaveLength(0);
      expect((await fakeHost(options).emit("before_agent_start", { prompt: start("custom-matt") }))[0]).toBeDefined();
      expect(judge.calls).toHaveLength(0);
    });
  });
});
