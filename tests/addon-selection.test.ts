import { afterEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import questions from "../addon-questions.json";
import { fakeHost } from "./support/extension-host.ts";

const model = { provider: "typesafe", id: "jev-latest", api: "typesafe", baseUrl: "https://judge.test/" };
const options = { models: [model], apiKeys: { "typesafe/jev-latest": "test-key" } };
const savedRun = { type: "custom_message", customType: "skill-prompt", details: { name: "implement" } };
const running = { ...options, entries: [savedRun] };
const start = (name: string, words = "", body = "Skill text: plan, merge, ship, and ignore this noise.") => `[IMPORTANT: User invoked the "${name}" skill. Follow this skill.]
${body}
---
[Skill directory: /skills/${name}]
Resolve relative paths in this skill against the skill directory.${words ? `\nUser: ${words}` : ""}`;
let fetchSpy: ReturnType<typeof spyOn>;
let readSpy: ReturnType<typeof spyOn>;
afterEach(() => { fetchSpy?.mockRestore(); readSpy?.mockRestore(); });
function endpoint(scores: Record<string, number>) {
  return spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ answers: Object.fromEntries(Object.entries(scores).map(([k, noul]) => [k, { type: "noul", noul }])) })) as unknown as typeof fetch);
}

describe("Addon selection", () => {
  test("plain chat, agent reads, non-Matt starts, and removed branch entries send no request", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    for (const prompt of ["Fix login", "Read skill://implement", start("open-pr", "Open a PR"), start("vstack-tmp", "Clean files")]) {
      expect(await fakeHost(options).emit("before_agent_start", { prompt })).toEqual([undefined]);
    }
    const entries = [savedRun];
    const host = fakeHost({ ...options, entries });
    entries.length = 0;
    expect(await host.emit("before_agent_start", { prompt: "Continue" })).toEqual([undefined]);
    expect(await fakeHost({ ...options, entries: [{ ...savedRun, details: { name: "open-pr" } }] }).emit("before_agent_start", { prompt: "Continue" })).toEqual([undefined]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("every Base skill can start a run from its header", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    const register: any = Bun.YAML.parse(fs.readFileSync(new URL("../decision-register.yaml", import.meta.url), "utf8"));
    const pins: any = Bun.YAML.parse(fs.readFileSync(new URL("../pins.yaml", import.meta.url), "utf8"));
    const names = new Set<string>(register.items.filter((row: any) => row.disposition !== "reject" && pins.upstreams[row.upstream]?.role === "Base").flatMap((row: any) => row.artifacts).filter((path: string) => /^plugin\/skills\/[^/]+$/.test(path)).map((path: string) => path.split("/")[2]));
    for (const name of names) expect((await fakeHost(options).emit("before_agent_start", { prompt: start(name, "Open a PR") }))[0]).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(names.size);
  });
  test("the start request contains only cleaned user words, not skill text", async () => {
    fetchSpy = endpoint({});
    await fakeHost(options).emit("before_agent_start", { prompt: start("implement", "Fix login \u001b[31mnow\u001b[0m ```noise``` <system-reminder>noise</system-reminder> abcdef1234567890") });
    const [url, init]: any = fetchSpy.mock.calls[0];
    expect(url).toBe("https://judge.test/v1/systemone");
    expect(init.headers.Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init.body);
    expect(body.state).toEqual({ request: "Fix login now abcdef1" });
    expect(body.questions).toEqual(questions);
    expect(Object.values(body.questions).every((q: any) => q.type === "noul")).toBe(true);
  });
  test("a skill body dialogue does not enter the start request", async () => {
    fetchSpy = endpoint({});
    const prompt = start("implement", "Fix login", "Example dialogue:\nUser: Ship the example\nAssistant: Plan the example");
    await fakeHost(options).emit("before_agent_start", { prompt });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init]: any = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).state).toEqual({ request: "Fix login" });
  });
  test("a bare skill start with a body dialogue sends no request", async () => {
    fetchSpy = endpoint({});
    const prompt = start("implement", "", "Example dialogue:\nUser: Ship the example\nAssistant: Plan the example");
    expect(await fakeHost(running).emit("before_agent_start", { prompt })).toEqual([undefined]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("a bare skill start sends no request, even with an earlier run", async () => {
    fetchSpy = endpoint({});
    for (const prompt of [start("implement"), '[IMPORTANT: User invoked the "implement" skill.]\nSkill text without a user line']) {
      expect(await fakeHost(running).emit("before_agent_start", { prompt })).toEqual([undefined]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("saved runs judge each cleaned follow-up, steering, and auto-continue prompt", async () => {
    fetchSpy = endpoint({});
    const host = fakeHost(running);
    for (const prompt of ["Follow up on login ```noise```", "Steer <system-reminder>noise</system-reminder> here", "Continue after compaction"]) await host.emit("before_agent_start", { prompt });
    expect(fetchSpy.mock.calls.map(([, init]: any) => JSON.parse(init.body).state.request)).toEqual(["Follow up on login", "Steer here", "Continue after compaction"]);
  });
  test("full-name pointers use the threshold and the precedence text, once per session", async () => {
    fetchSpy = endpoint({ "principle-prove-it-works": .75, "open-pr": .9, "principle-experience-first": .749 });
    const host = fakeHost(running);
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.customType).toBe("vstack-addons");
    expect(result.message.display).toBe(false);
    expect(result.message.content).toBe("Addons selected for this task: skill://principle-prove-it-works, skill://open-pr. Ignore any that do not fit. When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.");
    expect(await host.emit("before_agent_start", { prompt: "Again" })).toEqual([undefined]);
    expect((await fakeHost(running).emit("before_agent_start", { prompt: "Again" }))[0]).toBeDefined();
  });
  test("a resumed branch retains saved Addon pointers", async () => {
    fetchSpy = endpoint({ "open-pr": .9, "principle-prove-it-works": .9 });
    const host = fakeHost({ ...options, entries: [savedRun, { type: "custom_message", customType: "vstack-addons", content: "Addons selected for this task: skill://open-pr." }] });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.content).not.toContain("skill://open-pr");
    expect(result.message.content).toContain("skill://principle-prove-it-works");
  });
  test("there is no cap on picked Addons", async () => {
    fetchSpy = endpoint(Object.fromEntries(Object.keys(questions).map(name => [name, .75])));
    const [result]: any = await fakeHost(running).emit("before_agent_start", { prompt: "Do the work" });
    expect(result.message.content.match(/skill:\/\//g)).toHaveLength(Object.keys(questions).length);
  });
  test("the load gate uses Base roles and skips rejected rows and non-skill artifacts", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    const read = fs.readFileSync;
    readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, ...args: any[]) => {
      if (String(path).endsWith("pins.yaml")) return "upstreams: {custom: {role: Base}, other: {role: Enhancement}}";
      if (String(path).endsWith("decision-register.yaml")) return JSON.stringify({ items: [
        { upstream: "custom", disposition: "adapt", artifacts: ["plugin/skills/custom-matt", "plugin/agents/not-a-skill", "plugin/skills/not-a-dir/SKILL.md"] },
        { upstream: "custom", disposition: "reject", artifacts: ["plugin/skills/rejected-matt"] },
        { upstream: "other", disposition: "adapt", artifacts: ["plugin/skills/not-base"] },
      ] });
      return (read as any)(path, ...args);
    }) as any);
    const host = fakeHost(options);
    expect((await host.emit("before_agent_start", { prompt: start("custom-matt", "Open a PR") }))[0]).toBeDefined();
    for (const name of ["rejected-matt", "not-base", "not-a-skill", "not-a-dir", "implement"]) expect(await host.emit("before_agent_start", { prompt: start(name, "Open a PR") })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
  test("unreadable and invalid register or Pins skip silently", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    const read = fs.readFileSync;
    for (const file of ["decision-register.yaml", "pins.yaml"]) {
      for (const invalid of [false, true]) {
        readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, ...args: any[]) => {
          if (String(path).endsWith(file)) { if (invalid) return "items: ["; throw new Error("Cannot read"); }
          return (read as any)(path, ...args);
        }) as any);
        expect(await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
        readSpy.mockRestore();
      }
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("subagents, missing credentials, chat judges, and missing native models skip", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    for (const override of [{ agent: { kind: "sub", id: "Child", name: "worker", depth: 1 } }, { apiKeys: {} }, { nativeJudge: false }, { models: [{ ...model, api: "openai-completions" }] }, { models: [] }]) expect(await fakeHost({ ...running, ...override } as any).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("bad answer types and scores select nothing", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ answers: { "open-pr": { type: "boolean", noul: 1 }, "principle-prove-it-works": { type: "noul", noul: "1" } } }));
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
  });
  test("a failed request retries once, then skips silently", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockReset().mockRejectedValue(new Error("network"));
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  test("a successful retry returns the pointer", async () => {
    fetchSpy = endpoint({ "open-pr": .9 });
    fetchSpy.mockRejectedValueOnce(new Error("network"));
    expect((await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" }))[0]).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  test("the whole request has a four-second deadline even when fetch ignores abort", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation((() => new Promise(() => {})) as unknown as typeof fetch);
    const begin = performance.now();
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(performance.now() - begin).toBeLessThan(4500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 5000);
});
