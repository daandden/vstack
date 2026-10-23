import { afterEach, beforeEach, describe, expect, jest, spyOn, test } from "bun:test";
import * as fs from "node:fs";
import * as judgmentModule from "@oh-my-pi/pi-coding-agent/judgment";
import catalogFile from "../addon-questions.json";
import { parseAddonCatalog } from "../plugin/extensions/addon-catalog.ts";
import { fakeHost } from "./support/extension-host.ts";
import { judge, judgeAnswers, smol } from "./support/extension-mocks.ts";

const catalog = parseAddonCatalog(catalogFile);
const questions = catalog.questions;

const options = {};
const savedRun = { type: "custom_message", customType: "skill-prompt", details: { name: "implement" } };
const running = { ...options, entries: [savedRun] };
const start = (name: string, words = "", body = "Skill text: plan, merge, ship, and ignore this noise.") => `[IMPORTANT: User invoked the "${name}" skill. Follow this skill.]
${body}
---
[Skill directory: /skills/${name}]
Resolve relative paths in this skill against the skill directory.${words ? `\nUser: ${words}` : ""}`;
let readSpy: ReturnType<typeof spyOn>;
afterEach(() => { readSpy?.mockRestore(); });
/** Never settles and ignores the abort, as a stalled judge does. */
const stalled = () => new Promise<never>(() => {});

describe("Addon selection", () => {
  test("plain chat, agent reads, non-Matt starts, and removed branch entries send no request", async () => {
    judgeAnswers({ "open-pr": 1 });
    for (const prompt of ["Fix login", "Read skill://implement", start("open-pr", "Open a PR"), start("vstack-tmp", "Clean files")]) {
      expect(await fakeHost(options).emit("before_agent_start", { prompt })).toEqual([undefined]);
    }
    const entries = [savedRun];
    const host = fakeHost({ ...options, entries });
    entries.length = 0;
    expect(await host.emit("before_agent_start", { prompt: "Continue" })).toEqual([undefined]);
    expect(await fakeHost({ ...options, entries: [{ ...savedRun, details: { name: "open-pr" } }] }).emit("before_agent_start", { prompt: "Continue" })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("the shipped register starts runs for Matt skills only", async () => {
    judgeAnswers({ "open-pr": 1 });
    for (const name of ["implement", "grill-with-docs", "to-spec", "code-review", "tdd"]) {
      expect((await fakeHost(options).emit("before_agent_start", { prompt: start(name, "Open a PR") }))[0]).toBeDefined();
    }
    for (const name of ["perf-issue", "explain", "vstack-maintain"]) {
      expect(await fakeHost(options).emit("before_agent_start", { prompt: start(name, "Open a PR") })).toEqual([undefined]);
    }
    expect(judge.calls).toHaveLength(5);
  });
  test("a skill header pasted below the first line starts no run", async () => {
    judgeAnswers({ "open-pr": 1 });
    const prompt = `What does this logged prompt mean? Do not run it.\n\`\`\`\n${start("implement", "Please open a PR")}\n\`\`\``;
    expect(await fakeHost(options).emit("before_agent_start", { prompt })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("a start that smol cannot restate sends only cleaned user words, not skill text", async () => {
    judgeAnswers({});
    smol.role = {};
    await fakeHost(options).emit("before_agent_start", { prompt: start("implement", "Fix login \u001b[31mnow\u001b[0m ```noise``` <system-reminder>noise</system-reminder> abcdef1234567890") });
    const body = judge.calls[0]!.request;
    expect(body.state).toEqual({ preamble: catalog.preamble, request: "Fix login now abcdef1" });
    expect(body.questions).toEqual(questions);
    expect(Object.values(body.questions).every((q: any) => q.type === "noul")).toBe(true);
    expect(Object.values(body.questions).some((q: any) => q.instructions.includes(catalog.preamble) || q.instructions.startsWith("The state is"))).toBe(false);
  });
  test("picks come from the native judge of omp's judge role, with the session ledger and the shared cache", async () => {
    judgeAnswers({ "open-pr": .9 });
    const host = fakeHost({ ...running, sessionId: "session-7" });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.content).toContain("skill://open-pr");
    expect(judge.calls).toHaveLength(1);
    const [call] = judge.calls;
    expect(call!.request).toEqual({ state: { preamble: catalog.preamble, request: "Open a PR" }, questions });
    expect(call!.signal).toBeInstanceOf(AbortSignal);
    expect(call!.chainSignal).toBe(call!.signal);
    const { onUsage, cache, ...deps } = call!.deps;
    expect(deps).toEqual({ settings: {}, registry: host.ctx.modelRegistry, sessionId: "session-7", purpose: "vstack-addons" });
    expect(onUsage).toBeInstanceOf(Function);
    expect(judge.journaled).toEqual([host.ctx.sessionManager]);
    expect(cache).toBeDefined();
    expect(cache).toBe(judgmentModule.sharedJudgmentCache());
  });
  test("a judge role whose first candidate is not native gives no picks and sends no judgment", async () => {
    for (const kind of ["local", "chat"]) {
      judgeAnswers({ "open-pr": 1 });
      judge.kind = kind;
      expect(await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
      expect(judge.resolved).toHaveLength(1);
      expect(judge.calls).toHaveLength(0);
    }
  });
  test("a skill body dialogue enters neither the restatement input nor the fallback request", async () => {
    judgeAnswers({});
    const prompt = start("implement", "Fix login", "Example dialogue:\nUser: Ship the example\nAssistant: Plan the example");
    await fakeHost(withSmol).emit("before_agent_start", { prompt });
    expect(calls.map(({ context }) => context.messages[0].content)).toEqual(["New words: Fix login"]);
    smol.role = {};
    await fakeHost(withSmol).emit("before_agent_start", { prompt });
    expect(judge.calls).toHaveLength(2);
    expect(judge.calls[1]!.request.state).toEqual({ preamble: catalog.preamble, request: "Fix login" });
  });
  test("a bare skill start with a body dialogue sends no request", async () => {
    judgeAnswers({});
    const prompt = start("implement", "", "Example dialogue:\nUser: Ship the example\nAssistant: Plan the example");
    expect(await fakeHost(running).emit("before_agent_start", { prompt })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("a bare skill start sends no request, even with an earlier run", async () => {
    judgeAnswers({});
    for (const prompt of [start("implement"), '[IMPORTANT: User invoked the "implement" skill.]\nSkill text without a user line']) {
      expect(await fakeHost(running).emit("before_agent_start", { prompt })).toEqual([undefined]);
    }
    expect(judge.calls).toHaveLength(0);
  });
  test("saved runs judge each cleaned follow-up, steering, and auto-continue prompt", async () => {
    judgeAnswers({});
    const host = fakeHost(running);
    for (const prompt of ["Follow up on login ```noise```", "Steer <system-reminder>noise</system-reminder> here", "Continue after compaction"]) await host.emit("before_agent_start", { prompt });
    expect(judge.calls.map(call => call.request.state.request)).toEqual(["Follow up on login", "Steer here", "Continue after compaction"]);
  });
  test("full-name pointers use the threshold and the precedence text, once per session", async () => {
    judgeAnswers({ "principle-prove-it-works": .7, "open-pr": .9, "principle-experience-first": .699 });
    const entries: unknown[] = [savedRun];
    const host = fakeHost({ ...options, entries });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.customType).toBe("vstack-addons");
    expect(result.message.display).toBe(false);
    expect(result.message.content).toBe("Addons selected for this task: skill://principle-prove-it-works, skill://open-pr. Ignore any that do not fit. When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.");
    // omp saves an accepted hook message on the branch as a custom_message entry.
    entries.push({ type: "custom_message", ...result.message });
    expect(await host.emit("before_agent_start", { prompt: "Again" })).toEqual([undefined]);
    expect((await fakeHost(running).emit("before_agent_start", { prompt: "Again" }))[0]).toBeDefined();
  });
  test("picks that omp discarded, such as from a cancelled prompt, return on the retry", async () => {
    judgeAnswers({ "open-pr": .9 });
    const host = fakeHost(running);
    expect((await host.emit("before_agent_start", { prompt: "Open a PR" }))[0]).toBeDefined();
    const [retry]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(retry?.message.content).toContain("skill://open-pr");
  });
  test("a pointer sent on another branch of the same session is not sent again", async () => {
    judgeAnswers({ "open-pr": .9, "principle-prove-it-works": .9 });
    const otherBranch = { type: "custom_message", customType: "vstack-addons", content: "Addons selected for this task: skill://open-pr." };
    const host = fakeHost({ ...options, entries: [savedRun], sessionEntries: [savedRun, otherBranch] });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.content).not.toContain("skill://open-pr");
    expect(result.message.content).toContain("skill://principle-prove-it-works");
  });
  test("a resumed branch retains saved Addon pointers", async () => {
    judgeAnswers({ "open-pr": .9, "principle-prove-it-works": .9 });
    const host = fakeHost({ ...options, entries: [savedRun, { type: "custom_message", customType: "vstack-addons", content: "Addons selected for this task: skill://open-pr." }] });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Open a PR" });
    expect(result.message.content).not.toContain("skill://open-pr");
    expect(result.message.content).toContain("skill://principle-prove-it-works");
  });
  test("an Addon delivered earlier in the session is left out of the request", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const otherBranch = { type: "custom_message", customType: "vstack-addons", content: "Addons selected for this task: skill://open-pr." };
    const kept = { type: "custom_message", customType: "vstack-addons", content: "Addons selected for this task: skill://principle-experience-first." };
    await fakeHost({ ...options, entries: [savedRun, kept], sessionEntries: [savedRun, otherBranch, kept] }).emit("before_agent_start", { prompt: "Open a PR" });
    const asked = Object.keys(judge.calls[0]!.request.questions);
    expect(asked).not.toContain("open-pr");
    expect(asked).not.toContain("principle-experience-first");
    expect(asked).toEqual(Object.keys(questions).filter(name => name !== "open-pr" && name !== "principle-experience-first"));
  });
  test("no request and no restatement when every Addon was delivered earlier in the session", async () => {
    judgeAnswers({ "open-pr": .9 });
    const delivered = { type: "custom_message", customType: "vstack-addons", content: `Addons selected for this task: ${Object.keys(questions).map(name => `skill://${name}`).join(", ")}.` };
    expect(await fakeHost({ ...options, entries: [savedRun, delivered] }).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
    expect(await fakeHost({ ...withSmol, entries: [...talk, delivered] }).emit("before_agent_start", { prompt: start("implement", "Open a PR") })).toEqual([undefined]);
    expect(calls).toHaveLength(0);
    expect(judge.calls).toHaveLength(0);
  });
  test("there is no cap on picked Addons", async () => {
    judgeAnswers(Object.fromEntries(Object.keys(questions).map(name => [name, .7])));
    const [result]: any = await fakeHost(running).emit("before_agent_start", { prompt: "Do the work" });
    expect(result.message.content.match(/skill:\/\//g)).toHaveLength(Object.keys(questions).length);
  });
  test("the load gate uses Base roles and skips rejected rows and non-skill artifacts", async () => {
    judgeAnswers({ "open-pr": 1 });
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
    expect(judge.calls).toHaveLength(1);
  });
  test("unreadable and invalid register or Pins skip silently", async () => {
    judgeAnswers({ "open-pr": 1 });
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
    expect(judge.calls).toHaveLength(0);
  });
  test("a judge role without a native judge skips before any judgment", async () => {
    judgeAnswers({ "open-pr": 1 });
    expect(await fakeHost({ ...running, nativeJudge: false }).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
    expect(judge.resolved).toHaveLength(0);
    expect(judge.calls).toHaveLength(0);
  });
  test("bad answer types and scores select nothing", async () => {
    judgeAnswers({});
    judge.respond = async () => ({ answers: { "open-pr": { type: "boolean", noul: 1 }, "principle-prove-it-works": { type: "noul", noul: "1" } } });
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
  });
  test("a judge error skips silently after one judge call, with no vstack retry", async () => {
    judgeAnswers({ "open-pr": .9 });
    judge.respond = async () => { throw new Error("no API key for typesafe/jev-latest"); };
    expect(await fakeHost(running).emit("before_agent_start", { prompt: "Open a PR" })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(1);
  });
  test("a prompt that is not restated has a silent four-second deadline even when the judge ignores the abort", async () => {
    judgeAnswers({});
    judge.respond = stalled;
    const begin = performance.now();
    const host = fakeHost({ ...running, hasUI: true });
    expect(await host.emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(performance.now() - begin).toBeGreaterThanOrEqual(3900);
    expect(performance.now() - begin).toBeLessThan(4500);
    expect(judge.calls).toHaveLength(1);
    expect(judge.calls[0]!.signal?.aborted).toBe(true);
    expect(host.uiCalls).toEqual([]);
  }, 5000);
});

describe("Principle picks in subagent sessions", () => {
  // The 20 principle questions of a subagent brief: every principle except never-block-on-the-human (ADR 0025).
  const briefQuestionNames = [
    "principle-attack-the-premise", "principle-boundary-discipline", "principle-build-the-lever", "principle-encode-lessons-in-structure",
    "principle-encode-the-domain", "principle-experience-first", "principle-explain-the-number", "principle-foundational-thinking",
    "principle-guard-the-context-window", "principle-laziness-protocol", "principle-make-operations-idempotent",
    "principle-migrate-callers-then-delete-legacy-apis", "principle-minimize-reader-load", "principle-outcome-oriented-execution",
    "principle-prove-it-works", "principle-redesign-from-first-principles", "principle-separate-before-serializing-shared-state",
    "principle-sequence-verifiable-units", "principle-subtract-before-you-add", "principle-type-system-discipline",
  ];
  const child = (name: string, id = "0-Child", parentId = "Main", entries: unknown[] = []) =>
    fakeHost({ ...options, entries, agent: { kind: "sub", id, name, depth: 1, parentId } });
  // omp's subagent-user-prompt template puts this line before every assignment.
  const brief = (assignment: string) => `Complete assignment thoroughly:\n\n${assignment}`;
  /** A main session's before_agent_start fires before any subagent starts. Its own judge call is not under test. */
  async function registerMainSession(main: ReturnType<typeof fakeHost>) {
    await main.emit("before_agent_start", { prompt: "Plan the next step" });
    judge.calls = [];
  }

  test("a judged agent in a Matt run gets principle picks from its cleaned brief, with no precedence sentence", async () => {
    judgeAnswers({ "principle-prove-it-works": .9, "principle-guard-the-context-window": .7, "principle-explain-the-number": .699 });
    await registerMainSession(fakeHost(running));
    const [result]: any = await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser \u001b[31mnow\u001b[0m <system-reminder>noise</system-reminder> abcdef1234567890") });
    expect(result.message).toEqual({ customType: "vstack-addons", display: false, attribution: "agent",
      content: "Addons selected for this task: skill://principle-guard-the-context-window, skill://principle-prove-it-works. Ignore any that do not fit." });
    const body = judge.calls[0]!.request;
    expect(body.state).toEqual({ request: "Fix the parser now abcdef1", preamble: catalog.brief_preamble });
    expect(Object.keys(body.questions)).toEqual(briefQuestionNames);
    for (const name of briefQuestionNames) expect(body.questions[name]).toEqual(questions[name]);
  });
  test("a long brief reaches the Addon judge cut to 10,000 characters, with its task data at the end", async () => {
    judgeAnswers({});
    await registerMainSession(fakeHost(running));
    await child("vstack-explorer").emit("before_agent_start", { prompt: brief(`Role template. ${"Read the code. ".repeat(1000)}Task data at the end.`) });
    const { request } = judge.calls[0]!.request.state;
    expect(request).toHaveLength(10_000);
    expect(request.startsWith("Role template.")).toBe(true);
    expect(request.endsWith("Task data at the end.")).toBe(true);
  });
  test("the brief request has the four-second deadline, and a judge error skips silently after one judge call", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    expect((await child("vstack-verifier").emit("before_agent_start", { prompt: brief("Verify PR #12") }))[0]).toBeDefined();
    judge.calls = [];
    judge.respond = async () => { throw new Error("network"); };
    expect(await child("vstack-verifier").emit("before_agent_start", { prompt: brief("Verify PR #12") })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(1);
    judge.calls = [];
    judge.respond = stalled;
    const begin = performance.now();
    expect(await child("vstack-verifier").emit("before_agent_start", { prompt: brief("Verify PR #12") })).toEqual([undefined]);
    expect(performance.now() - begin).toBeGreaterThanOrEqual(3900);
    expect(performance.now() - begin).toBeLessThan(4500);
    expect(judge.calls).toHaveLength(1);
    expect(judge.calls[0]!.signal?.aborted).toBe(true);
  }, 6000);
  test("the diagram drawer, the comment critic, omp's own agents, and /tan clones get no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    for (const name of ["vstack-diagram-drawer", "vstack-comment-critic", "task", "scout", "worker", "sub"]) {
      expect(await child(name).emit("before_agent_start", { prompt: brief("Fix the parser") })).toEqual([undefined]);
    }
    expect(judge.calls).toHaveLength(0);
  });
  test("a child of a main session outside a Matt run, or of an unknown session, gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(options));
    expect(await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser") })).toEqual([undefined]);
    await registerMainSession(fakeHost(running));
    expect(await child("vstack-worker", "0-Child", "Unknown").emit("before_agent_start", { prompt: brief("Fix the parser") })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("a nested child follows the top-level session, also below an agent that gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const entries: unknown[] = [savedRun];
    await registerMainSession(fakeHost({ ...options, entries }));
    expect((await child("vstack-worker", "0-Worker").emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    expect(await child("task", "1-Task").emit("before_agent_start", { prompt: brief("Look around") })).toEqual([undefined]);
    for (const parentId of ["0-Worker", "1-Task"]) {
      expect((await child("vstack-explorer", `${parentId}.0-Explore`, parentId).emit("before_agent_start", { prompt: brief("Find the fact") }))[0]).toBeDefined();
    }
    // The top-level session's active branch no longer holds the run.
    entries.length = 0;
    judge.calls = [];
    expect(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("only the first prompt of a subagent session, its brief, is judged, also when omp dropped and resent it", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    const entries: unknown[] = [];
    const worker = child("vstack-worker", "0-Child", "Main", entries);
    for (let attempt = 0; attempt < 2; attempt++) expect((await worker.emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    // omp saves the accepted brief and the reply on the subagent's branch.
    entries.push(said("user", brief("Build ticket 3")), said("assistant", "Ticket 3 is built."));
    for (const prompt of ["Yield your result now.", "Also check the README."]) expect(await worker.emit("before_agent_start", { prompt })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(2);
  });
  test("a child started after its top-level session shut down gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const main = fakeHost(running);
    await registerMainSession(main);
    await main.emit("session_shutdown");
    expect(await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser") })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(0);
  });
  test("a later top-level session with the same agent id does not serve the descendants of one that shut down", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const old = fakeHost(running);
    await registerMainSession(old);
    expect((await child("vstack-worker", "0-Worker").emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    await registerMainSession(old);
    await old.emit("session_shutdown");
    await registerMainSession(fakeHost(running));
    expect(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") })).toEqual([undefined]);
    expect((await child("vstack-worker", "1-Worker").emit("before_agent_start", { prompt: brief("Build ticket 4") }))[0]).toBeDefined();
    expect(judge.calls).toHaveLength(1);
  });
  test("a top-level session that switches to another session file does not serve the descendants it started before", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const main = fakeHost(running);
    await registerMainSession(main);
    expect((await child("vstack-worker", "0-Worker").emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    await main.emit("session_switch", { reason: "new" });
    await registerMainSession(main);
    expect(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") })).toEqual([undefined]);
    expect((await child("vstack-worker", "1-Worker").emit("before_agent_start", { prompt: brief("Build ticket 4") }))[0]).toBeDefined();
    expect(judge.calls).toHaveLength(1);
  });
  test("a subagent that shut down leaves no record, so a child that names it as parent gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    const worker = child("vstack-worker", "0-Worker");
    expect((await worker.emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    await worker.emit("session_shutdown");
    expect(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") })).toEqual([undefined]);
    expect(judge.calls).toHaveLength(1);
  });
});

const smolModel = { provider: "openai-codex", id: "gpt-6.1-sol", api: "openai-codex-responses", baseUrl: "https://smol.test/" };
const withSmol = { models: [smolModel], apiKeys: { "openai-codex/gpt-6.1-sol": "smol-key", "openai-codex/locked": new Error("keychain locked") } };
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
/** Each way smol can fail, with the reason that the warning names. */
const restatementFailures: [string, () => void][] = [
  ["no smol model", () => { smol.role = {}; }],
  ["no key for the smol model", () => { smol.role = { model: { ...smolModel, id: "no-key" } }; }],
  ["smol failed: rate limited", () => restates({ role: "assistant", stopReason: "error", errorMessage: "rate limited", content: [] })],
  ["smol returned no text", () => restates(replied("  "))],
  ["smol failed: socket closed", () => { smol.complete = async () => { throw new Error("socket closed"); }; }],
  ["smol failed: keychain locked", () => { smol.role = { model: { ...smolModel, id: "locked" } }; }],
];
const restateInstruction = fs.readFileSync(new URL("../plugin/skills/in-your-own-words/SKILL.md", import.meta.url), "utf8").replace(/^---\n[\s\S]*?\n---\n/, "").trim();

describe("Restated input for a mid-session run start", () => {
  test("smol restates the earlier talk with in-your-own-words, and the Addon judge reads that restatement as it is", async () => {
    judgeAnswers({});
    restates(replied("The user wants jev to read a restated goal. ```keep this```"));
    await fakeHost({ ...withSmol, entries: talk }).emit("before_agent_start", { prompt: start("grill-with-docs", "Update the jev judge") });
    expect(calls).toHaveLength(1);
    const { context, options } = calls[0]!;
    expect(context.systemPrompt[0]).toBe(restateInstruction);
    const input = context.messages[0].content;
    for (const kept of ["Should jev read a restated goal instead of my words?", "Yes, restate the earlier talk first.", "Grill the restatement idea"]) expect(input).toContain(kept);
    for (const dropped of ["SECRET THINKING", "TOOL ARGS", "TOOL OUTPUT", "HIDDEN POINTERS", "EARLIER SKILL TEXT", "HIDDEN SKILL WORDS"]) expect(input).not.toContain(dropped);
    expect(input.trimEnd().endsWith("Update the jev judge")).toBe(true);
    expect(options.apiKey).toBe("smol-key");
    expect(options.reasoning).toBe("high");
    expect(judge.calls[0]!.request.state).toEqual({ preamble: catalog.preamble, request: "The user wants jev to read a restated goal. ```keep this```" });
  });
  test("after a compaction, smol reads its summary and the kept talk, not the talk it replaced", async () => {
    judgeAnswers({});
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
  test("the Addon judge reads at most 10,000 characters of the restatement, and a bare mid-session start still restates", async () => {
    judgeAnswers({});
    restates(replied("x".repeat(12_000)));
    await fakeHost({ ...withSmol, entries: talk }).emit("before_agent_start", { prompt: start("implement") });
    expect(calls).toHaveLength(1);
    expect(judge.calls[0]!.request.state.request).toHaveLength(10_000);
  });
  test("earlier messages with no text still make the start mid-session", async () => {
    judgeAnswers({});
    const entries = [said("user", [{ type: "image", data: "AAAA", mimeType: "image/png" }]), said("assistant", [{ type: "toolCall", id: "t1", name: "read", arguments: {} }])];
    await fakeHost({ ...withSmol, entries }).emit("before_agent_start", { prompt: start("implement", "Plan the screen in that image") });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.context.messages[0].content.trimEnd().endsWith("Plan the screen in that image")).toBe(true);
  });
  test("every later prompt in a run keeps the cleaned words and calls no smol", async () => {
    judgeAnswers({});
    for (const entries of [[savedRun], [...talk, savedRun]]) await fakeHost({ ...withSmol, entries }).emit("before_agent_start", { prompt: "Follow up on the login page ```noise```" });
    expect(calls).toHaveLength(0);
    expect(judge.calls.map(call => call.request.state.request)).toEqual(["Follow up on the login page", "Follow up on the login page"]);
  });
  test("a failed restatement skips selection and shows a warning only when there is a UI", async () => {
    judgeAnswers({ "open-pr": 1 });
    for (const [reason, arrange] of restatementFailures) {
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
    expect(judge.calls).toHaveLength(0);
  });
  test("without a native judge, a fresh or mid-session start calls no smol and warns nothing", async () => {
    judgeAnswers({ "open-pr": 1 });
    for (const entries of [[], talk]) {
      const host = fakeHost({ ...withSmol, nativeJudge: false, entries, hasUI: true });
      expect(await host.emit("before_agent_start", { prompt: start("implement", "Open a PR") })).toEqual([undefined]);
      expect(host.uiCalls).toEqual([]);
    }
    expect(calls).toHaveLength(0);
  });
});

describe("Restated input for a fresh run start", () => {
  test("smol restates only the new words, and the Addon judge reads that restatement as it is", async () => {
    judgeAnswers({});
    restates(replied("The user wants the jev judge updated. ```keep this```"));
    await fakeHost({ ...withSmol, entries: [{ type: "model_change", model: "a/b" }] }).emit("before_agent_start", { prompt: start("grill-with-docs", " Update the jev judge ```noise``` ") });
    expect(calls).toHaveLength(1);
    const { context, options } = calls[0]!;
    expect(context.systemPrompt[0]).toBe(restateInstruction);
    expect(context.messages).toEqual([{ role: "user", content: "New words: Update the jev judge ```noise```", timestamp: expect.any(Number) }]);
    expect(options.reasoning).toBe("high");
    expect(judge.calls[0]!.request.state).toEqual({ preamble: catalog.preamble, request: "The user wants the jev judge updated. ```keep this```" });
  });
  test("a fresh start with no words calls neither smol nor the Addon judge and warns nothing", async () => {
    judgeAnswers({ "open-pr": 1 });
    for (const prompt of [start("implement"), start("implement", "   ")]) {
      const host = fakeHost({ ...withSmol, hasUI: true });
      expect(await host.emit("before_agent_start", { prompt })).toEqual([undefined]);
      expect(host.uiCalls).toEqual([]);
    }
    expect(calls).toHaveLength(0);
    expect(judge.calls).toHaveLength(0);
  });
  test("a fresh start whose words clean to nothing still sends its raw words to smol, and the Addon judge reads the restatement", async () => {
    judgeAnswers({});
    restates(replied("The user wants a README typo fixed."));
    for (const words of ["<request>Fix README typo</request>", "<system-reminder>noise</system-reminder>"]) {
      await fakeHost(withSmol).emit("before_agent_start", { prompt: start("implement", words) });
    }
    expect(calls.map(({ context }) => context.messages[0].content)).toEqual(["New words: <request>Fix README typo</request>", "New words: <system-reminder>noise</system-reminder>"]);
    expect(judge.calls.map(call => call.request.state.request)).toEqual(["The user wants a README typo fixed.", "The user wants a README typo fixed."]);
  });
  test("when smol fails on a fresh start whose words clean to nothing, the Addon judge gets no request and the warning says no picks", async () => {
    judgeAnswers({ "open-pr": .9 });
    for (const [reason, arrange] of restatementFailures) {
      smol.role = { model: smolModel, thinkingLevel: "high" };
      arrange();
      const host = fakeHost({ ...withSmol, hasUI: true });
      expect(await host.emit("before_agent_start", { prompt: start("implement", "<request>Fix README typo</request>") })).toEqual([undefined]);
      expect(host.uiCalls).toEqual([{ method: "notify", args: [`vstack: no Addon picks for this run start (${reason})`, "warning"] }]);
    }
    expect(judge.calls).toHaveLength(0);
  });
  test("when smol fails on a fresh start, the Addon judge reads the cleaned words, with a warning only when there is a UI", async () => {
    judgeAnswers({ "open-pr": .9 });
    for (const [reason, arrange] of restatementFailures) {
      smol.role = { model: smolModel, thinkingLevel: "high" };
      arrange();
      const host = fakeHost({ ...withSmol, hasUI: true });
      const [result]: any = await host.emit("before_agent_start", { prompt: start("implement", "Open a PR <system-reminder>noise</system-reminder>") });
      expect(result.message.content).toContain("skill://open-pr");
      expect(host.uiCalls).toEqual([{ method: "notify", args: [`vstack: Addon picks from your words, restatement failed (${reason})`, "warning"] }]);
    }
    expect(judge.calls.map(call => call.request.state.request)).toEqual(Array(restatementFailures.length).fill("Open a PR"));
    smol.role = {};
    const headless = fakeHost({ ...withSmol, hasUI: false });
    expect((await headless.emit("before_agent_start", { prompt: start("implement", "Open a PR") }))[0]).toBeDefined();
    expect(headless.uiCalls).toEqual([]);
    const read = fs.readFileSync;
    readSpy = spyOn(fs, "readFileSync").mockImplementation(((path: any, ...args: any[]) => {
      if (String(path).endsWith("in-your-own-words/SKILL.md")) throw new Error("Cannot read");
      return (read as any)(path, ...args);
    }) as any);
    const unreadable = fakeHost({ ...withSmol, hasUI: true });
    readSpy.mockRestore();
    expect((await unreadable.emit("before_agent_start", { prompt: start("implement", "Open a PR") }))[0]).toBeDefined();
    expect(unreadable.uiCalls).toEqual([{ method: "notify", args: ["vstack: Addon picks from your words, restatement failed (in-your-own-words is unreadable)", "warning"] }]);
  });
});

describe("The 25-second cap on a restated run start", () => {
  /** Lets the handler's promise chain run between fake-timer steps. */
  const settle = async () => { for (let step = 0; step < 50; step++) await Promise.resolve(); };
  afterEach(() => jest.useRealTimers());
  async function expectCapAt25Seconds(host: ReturnType<typeof fakeHost>) {
    let result: unknown[] | undefined;
    void host.emit("before_agent_start", { prompt: start("implement", "Open a PR") }).then(value => { result = value; });
    await settle();
    jest.advanceTimersByTime(24_999);
    await settle();
    expect(result).toBeUndefined();
    expect(host.uiCalls).toEqual([]);
    jest.advanceTimersByTime(1);
    await settle();
    expect(result).toEqual([undefined]);
    expect(host.uiCalls).toEqual([{ method: "notify", args: ["vstack: no Addon picks for this run start (timed out)", "warning"] }]);
  }
  test("a fresh or mid-session start whose smol never answers gets no picks, a timed-out warning, and no fallback request", async () => {
    judgeAnswers({ "open-pr": .9 });
    smol.complete = (_model, context, options) => { calls.push({ context, options }); return new Promise(() => {}); };
    jest.useFakeTimers();
    for (const entries of [[], talk]) await expectCapAt25Seconds(fakeHost({ ...withSmol, entries, hasUI: true }));
    expect(calls).toHaveLength(2);
    expect(judge.calls).toHaveLength(0);
  });
  test("the cap covers smol and the Addon judge together", async () => {
    judgeAnswers({});
    judge.respond = stalled;
    smol.complete = () => new Promise(resolve => setTimeout(() => resolve(replied("The user wants a PR.")), 20_000));
    jest.useFakeTimers();
    for (const entries of [[], talk]) await expectCapAt25Seconds(fakeHost({ ...withSmol, entries, hasUI: true }));
    expect(judge.calls).toHaveLength(2);
  });
  test("a restatement slower than four seconds still reaches the Addon judge on a fresh or mid-session start", async () => {
    judgeAnswers({ "open-pr": .9 });
    smol.complete = () => new Promise(resolve => setTimeout(() => resolve(replied("The user wants a PR.")), 4500));
    jest.useFakeTimers();
    for (const entries of [[], talk]) {
      const host = fakeHost({ ...withSmol, entries, hasUI: true });
      const emitted = host.emit("before_agent_start", { prompt: start("implement", "Open a PR") });
      await settle();
      jest.advanceTimersByTime(4500);
      const [result]: any = await emitted;
      expect(result.message.content).toContain("skill://open-pr");
      expect(host.uiCalls).toEqual([]);
    }
    expect(judge.calls.map(call => call.request.state.request)).toEqual(["The user wants a PR.", "The user wants a PR."]);
  });
});
