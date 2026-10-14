import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import questions from "../addon-questions.json";
import { fakeHost } from "./support/extension-host.ts";
import { smol } from "./support/extension-mocks.ts";

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
  test("the shipped register starts runs for Matt skills only", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    for (const name of ["implement", "grill-with-docs", "to-spec", "code-review", "tdd"]) {
      expect((await fakeHost(options).emit("before_agent_start", { prompt: start(name, "Open a PR") }))[0]).toBeDefined();
    }
    for (const name of ["perf-issue", "explain", "vstack-maintain"]) {
      expect(await fakeHost(options).emit("before_agent_start", { prompt: start(name, "Open a PR") })).toEqual([undefined]);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(5);
  });
  test("a skill header pasted below the first line starts no run", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    const prompt = `What does this logged prompt mean? Do not run it.\n\`\`\`\n${start("implement", "Please open a PR")}\n\`\`\``;
    expect(await fakeHost(options).emit("before_agent_start", { prompt })).toEqual([undefined]);
    expect(fetchSpy).not.toHaveBeenCalled();
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

const smolModel = { provider: "openai-codex", id: "gpt-6.1-sol", api: "openai-codex-responses", baseUrl: "https://smol.test/" };
const withSmol = { models: [model, smolModel], apiKeys: { "typesafe/jev-latest": "test-key", "openai-codex/gpt-6.1-sol": "smol-key", "openai-codex/locked": new Error("keychain locked") } };
const said = (role: "user" | "assistant", content: unknown) => ({ type: "message", message: { role, content } });
const talk = [
  said("user", "Should jev read a restated goal instead of my words?"),
  said("assistant", [{ type: "thinking", thinking: "SECRET THINKING" }, { type: "text", text: "Yes, restate the earlier talk first." }, { type: "toolCall", id: "t1", name: "read", arguments: { path: "TOOL ARGS" } }]),
  { type: "message", message: { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "TOOL OUTPUT" }] } },
  { type: "custom_message", customType: "vstack-addons", content: "HIDDEN POINTERS", display: false },
  { type: "custom_message", customType: "skill-prompt", display: true, details: { name: "grill-me" }, content: start("grill-me", "Grill the restatement idea", "EARLIER SKILL TEXT") },
  { type: "custom_message", customType: "skill-prompt", display: false, details: { name: "tdd" }, content: start("tdd", "HIDDEN SKILL WORDS") },
];
let calls: { context: any; options: any }[];
const restates = (reply: unknown) => { smol.complete = async (_model, context, options) => { calls.push({ context, options }); return reply; }; };
const replied = (text: string) => ({ role: "assistant", stopReason: "stop", content: [{ type: "text", text }] });
beforeEach(() => { calls = []; smol.role = { model: smolModel, thinkingLevel: "high" }; restates(replied("The user wants better Addon picks.")); });

describe("Restated input for a mid-session run start", () => {
  test("smol restates the earlier talk with in-your-own-words, and jev reads that restatement as it is", async () => {
    fetchSpy = endpoint({});
    restates(replied("The user wants jev to read a restated goal. ```keep this```"));
    await fakeHost({ ...withSmol, entries: talk }).emit("before_agent_start", { prompt: start("grill-with-docs", "Update the jev judge") });
    expect(calls).toHaveLength(1);
    const { context, options } = calls[0]!;
    expect(context.systemPrompt[0]).toBe("Restate in your own words what you think the user's goals are and what problem they're trying to solve.");
    const input = context.messages[0].content;
    for (const kept of ["Should jev read a restated goal instead of my words?", "Yes, restate the earlier talk first.", "Grill the restatement idea"]) expect(input).toContain(kept);
    for (const dropped of ["SECRET THINKING", "TOOL ARGS", "TOOL OUTPUT", "HIDDEN POINTERS", "EARLIER SKILL TEXT", "HIDDEN SKILL WORDS"]) expect(input).not.toContain(dropped);
    expect(input.trimEnd().endsWith("Update the jev judge")).toBe(true);
    expect(options.apiKey).toBe("smol-key");
    expect(options.reasoning).toBe("high");
    const [, init]: any = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).state).toEqual({ request: "The user wants jev to read a restated goal. ```keep this```" });
  });
  test("after a compaction, smol reads its summary and the kept talk, not the talk it replaced", async () => {
    fetchSpy = endpoint({});
    const entries = [
      { ...said("user", "REPLACED TALK"), id: "a" },
      { ...said("user", "Kept question"), id: "b" },
      { type: "compaction", id: "c", summary: "We chose smol for restating.", firstKeptEntryId: "b" },
      { ...said("assistant", [{ type: "text", text: "Later answer" }]), id: "d" },
    ];
    await fakeHost({ ...withSmol, entries }).emit("before_agent_start", { prompt: start("implement", "Build it") });
    const input = calls[0]!.context.messages[0].content;
    for (const kept of ["We chose smol for restating.", "Kept question", "Later answer", "Build it"]) expect(input).toContain(kept);
    expect(input).not.toContain("REPLACED TALK");
  });
  test("jev reads at most 10,000 characters of the restatement, and a bare mid-session start still restates", async () => {
    fetchSpy = endpoint({});
    restates(replied("x".repeat(12_000)));
    await fakeHost({ ...withSmol, entries: talk }).emit("before_agent_start", { prompt: start("implement") });
    expect(calls).toHaveLength(1);
    const [, init]: any = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).state.request).toHaveLength(10_000);
  });
  test("earlier messages with no text still make the start mid-session", async () => {
    fetchSpy = endpoint({});
    const entries = [said("user", [{ type: "image", data: "AAAA", mimeType: "image/png" }]), said("assistant", [{ type: "toolCall", id: "t1", name: "read", arguments: {} }])];
    await fakeHost({ ...withSmol, entries }).emit("before_agent_start", { prompt: start("implement", "Plan the screen in that image") });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context.messages[0].content.trimEnd().endsWith("Plan the screen in that image")).toBe(true);
  });
  test("a fresh run start and every later prompt keep the cleaned words and call no smol", async () => {
    fetchSpy = endpoint({});
    await fakeHost({ ...withSmol, entries: [{ type: "model_change", model: "a/b" }] }).emit("before_agent_start", { prompt: start("implement", "Fix the login page ```noise```") });
    await fakeHost({ ...withSmol, entries: [...talk, savedRun] }).emit("before_agent_start", { prompt: "Follow up on the login page ```noise```" });
    expect(calls).toHaveLength(0);
    expect(fetchSpy.mock.calls.map(([, init]: any) => JSON.parse(init.body).state.request)).toEqual(["Fix the login page", "Follow up on the login page"]);
  });
  test("a failed restatement skips selection and shows a warning only when there is a UI", async () => {
    const failures: [string, () => void][] = [
      ["no smol model", () => { smol.role = {}; }],
      ["no key for the smol model", () => { smol.role = { model: { ...smolModel, id: "no-key" } }; }],
      ["smol failed: rate limited", () => restates({ role: "assistant", stopReason: "error", errorMessage: "rate limited", content: [] })],
      ["smol returned no text", () => restates(replied("  "))],
      ["smol failed: socket closed", () => { smol.complete = async () => { throw new Error("socket closed"); }; }],
      ["smol failed: keychain locked", () => { smol.role = { model: { ...smolModel, id: "locked" } }; }],
    ];
    fetchSpy = endpoint({ "open-pr": 1 });
    for (const [reason, arrange] of failures) {
      smol.role = { model: smolModel, thinkingLevel: "high" };
      arrange();
      const host = fakeHost({ ...withSmol, entries: talk, hasUI: true });
      expect(await host.emit("before_agent_start", { prompt: start("implement", "Open a PR") })).toEqual([undefined]);
      expect(host.uiCalls).toEqual([{ method: "notify", args: [`vstack: no Addon picks for this run start (${reason})`, "warning"] }]);
    }
    smol.role = {};
    const headless = fakeHost({ ...withSmol, entries: talk, hasUI: false });
    expect(await headless.emit("before_agent_start", { prompt: start("implement", "Open a PR") })).toEqual([undefined]);
    expect(headless.uiCalls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("without native jev, a mid-session start calls no smol and warns nothing", async () => {
    fetchSpy = endpoint({ "open-pr": 1 });
    const host = fakeHost({ ...withSmol, apiKeys: { "openai-codex/gpt-6.1-sol": "smol-key" }, entries: talk, hasUI: true });
    expect(await host.emit("before_agent_start", { prompt: start("implement", "Open a PR") })).toEqual([undefined]);
    expect(calls).toHaveLength(0);
    expect(host.uiCalls).toEqual([]);
  });
  test("a restatement slower than the four-second deadline still reaches jev", async () => {
    fetchSpy = endpoint({ "open-pr": .9 });
    smol.complete = async () => { await Bun.sleep(4500); return replied("The user wants a PR."); };
    const [result]: any = await fakeHost({ ...withSmol, entries: talk }).emit("before_agent_start", { prompt: start("implement", "Open a PR") });
    expect(result.message.content).toContain("skill://open-pr");
    const [, init]: any = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).state.request).toBe("The user wants a PR.");
  }, 7000);
});
