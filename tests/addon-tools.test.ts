import { expect, test } from "bun:test";
import { fakeHost } from "./support/extension-host.ts";
import { judge, judgeAnswers } from "./support/extension-mocks.ts";

const start = (name: string, words = "") => `[IMPORTANT: User invoked the "${name}" skill. Follow this skill.]
Skill instructions.
---
[Skill directory: /skills/${name}]
Resolve relative paths in this skill against the skill directory.${words ? `\nUser: ${words}` : ""}`;

test("typed Matt run waits for gathered ticket intent before selecting Addons", async () => {
  judgeAnswers({ "open-pr": .9 });
  const host = fakeHost();
  const [instruction]: any = await host.emit("before_agent_start", { prompt: start("implement", "#42") });
  expect(judge.calls).toHaveLength(0);
  expect(instruction.message.display).toBe(true);
  const result = await host.callTool("inject_addons", { intent: "Issue 42: open a PR for the resolved login fix" });
  expect(judge.calls).toHaveLength(1);
  expect(judge.calls[0]!.request.state.request).toBe("Issue 42: open a PR for the resolved login fix");
  expect(result.content).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text", text: expect.stringContaining("skill://open-pr") })]));
});

test("principle tool includes every main principle while Addon tool can select both kinds", async () => {
  judgeAnswers({ "principle-never-block-on-the-human": .7, "principle-prove-it-works": .9, "open-pr": 1 });
  const principleHost = fakeHost();
  const principles = await principleHost.callTool("inject_principles", { intent: "Build the ticket without waiting for the human and prove it works" });
  const asked = Object.keys(judge.calls[0]!.request.questions);
  expect(asked.every(name => name.startsWith("principle-"))).toBe(true);
  expect(asked).toContain("principle-never-block-on-the-human");
  const principleText = principles.content.map((part: any) => part.text).join("\n");
  expect(principleText).toContain("skill://principle-never-block-on-the-human");
  expect(principleText).not.toContain("skill://open-pr");
  const addons = await fakeHost().callTool("inject_addons", { intent: "Prove the work and open a PR" });
  const addonText = addons.content.map((part: any) => part.text).join("\n");
  expect(addonText).toContain("skill://open-pr");
  expect(addonText).toContain("skill://principle-prove-it-works");
});

test("typed Matt runs make both tools available to the main agent", async () => {
  const host = fakeHost({ nativeJudge: false });
  await host.emit("before_agent_start", { prompt: start("implement") });
  expect(host.pi.getActiveTools()).toContain("read");
  expect(host.pi.getActiveTools()).toContain("inject_addons");
  expect(host.pi.getActiveTools()).toContain("inject_principles");
});

test("concurrent tool calls deliver each selected Addon once and rejudge only undelivered choices", async () => {
  judgeAnswers({ "open-pr": .9, "principle-prove-it-works": .9 });
  const host = fakeHost();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const answer = judge.respond;
  judge.respond = async (request, signal) => { await gate; return answer(request, signal); };
  const first = host.callTool("inject_addons", { intent: "Open a PR and prove it works" });
  const second = host.callTool("inject_addons", { intent: "Open a PR and prove it works" });
  for (let turn = 0; turn < 20; turn++) await Promise.resolve();
  release();
  const results = await Promise.all([first, second]);
  const delivered = results.map(result => result.content.map((part: any) => part.text).join("\n")).join("\n");
  expect(delivered.split("skill://open-pr")).toHaveLength(2);
  expect(delivered.split("skill://principle-prove-it-works")).toHaveLength(2);
  expect(host.saved).toHaveLength(1);
  expect(Object.keys(judge.calls[1]!.request.questions)).not.toContain("open-pr");
  expect(Object.keys(judge.calls[1]!.request.questions)).not.toContain("principle-prove-it-works");
});

test("cancelled selections save no late picks and do not block waiting calls", async () => {
  judgeAnswers({ "open-pr": .9 });
  const host = fakeHost();
  let release!: () => void;
  let started!: () => void;
  const late = new Promise<void>(resolve => { release = resolve; });
  const inFlight = new Promise<void>(resolve => { started = resolve; });
  const answer = judge.respond;
  let firstRequest = true;
  judge.respond = async (request, signal) => {
    if (firstRequest) { firstRequest = false; started(); await late; }
    return answer(request, signal);
  };
  const cancelFirst = new AbortController();
  const cancelWaiting = new AbortController();
  const first = host.callTool("inject_addons", { intent: "Open the PR" }, cancelFirst.signal);
  await inFlight;
  const waiting = host.callTool("inject_addons", { intent: "Open the PR" }, cancelWaiting.signal);
  cancelWaiting.abort();
  cancelFirst.abort();
  const retry = host.callTool("inject_addons", { intent: "Open the PR" });
  let timer: ReturnType<typeof setTimeout>;
  const results = await Promise.race([
    Promise.all([first, waiting, retry]),
    new Promise<undefined>(resolve => { timer = setTimeout(() => resolve(undefined), 1000); }),
  ]);
  clearTimeout(timer!);
  release();
  const settled = results ?? await Promise.all([first, waiting, retry]);
  expect(results).toBeDefined();
  expect(settled[0].content[0].text).not.toContain("skill://open-pr");
  expect(settled[1].content[0].text).not.toContain("skill://open-pr");
  expect(settled[2].content[0].text).toContain("skill://open-pr");
  expect(host.saved).toHaveLength(1);
  expect(judge.calls[0]!.signal?.aborted).toBe(true);
});

test("a saved session with all principle Addons delivered makes no further principle judgment", async () => {
  judgeAnswers({});
  judge.respond = async request => ({
    answers: Object.fromEntries(Object.keys(request.questions).map(name => [name, { type: "noul", noul: .9 }])),
  });
  const firstSession = fakeHost();
  await firstSession.callTool("inject_principles", { intent: "Implement the selected ticket" });
  const resumed = fakeHost({ sessionEntries: firstSession.saved });
  const second = await resumed.callTool("inject_principles", { intent: "Continue on another branch" });
  expect(judge.calls).toHaveLength(1);
  expect(second.content[0].text).not.toContain("skill://");
  expect(resumed.saved).toHaveLength(0);
});

test("only typed Matt starts display instructions, including bare starts without a native judge", async () => {
  judgeAnswers({ "open-pr": 1 });
  for (const name of ["implement", "implement-spec", "to-spec", "to-tickets", "grill-with-docs", "code-review", "tdd"]) {
    const [result]: any = await fakeHost({ nativeJudge: false }).emit("before_agent_start", { prompt: start(name) });
    expect(result.message.display).toBe(true);
    const [tool, other] = name.startsWith("implement") ? ["inject_principles", "inject_addons"] : ["inject_addons", "inject_principles"];
    expect(result.message.content).toContain(tool);
    expect(result.message.content).not.toContain(other);
  }
  for (const prompt of ["Fix login", "Read skill://implement", start("explain"), start("vstack-maintain"), `Explain this pasted header:\n${start("implement")}`]) {
    expect(await fakeHost().emit("before_agent_start", { prompt })).toEqual([undefined]);
  }
  const host = fakeHost({ entries: [{ type: "custom_message", customType: "skill-prompt", details: { name: "implement" } }] });
  expect(await host.emit("before_agent_start", { prompt: "Continue after compaction" })).toEqual([undefined]);
  expect(judge.calls).toHaveLength(0);
});

test("tools clean supplied intent to ten thousand characters and apply the selection threshold", async () => {
  judgeAnswers({ "open-pr": .7, "principle-prove-it-works": .699 });
  const host = fakeHost();
  const result = await host.callTool("inject_addons", { intent: `Fix login \u001b[31mnow\u001b[0m <system-reminder>noise</system-reminder> abcdef1234567890 ${"Read the code. ".repeat(1000)}Task data at the end.` });
  const request = judge.calls[0]!.request.state.request;
  expect(request).toHaveLength(10_000);
  expect(request.startsWith("Fix login now abcdef1")).toBe(true);
  expect(request.endsWith("Task data at the end.")).toBe(true);
  expect(result.content[0].text).toContain("skill://open-pr");
  expect(result.content[0].text).not.toContain("skill://principle-prove-it-works");
  expect(result.content[0].text).toContain("those steps win");
});

test("saved Addon entries across branches and old hook messages prevent redelivery after resume", async () => {
  judgeAnswers({ "open-pr": 1, "principle-prove-it-works": 1, "principle-experience-first": 1 });
  const host = fakeHost({ sessionEntries: [
    { type: "custom_message", customType: "vstack-addons", content: "skill://open-pr" },
    { type: "custom", customType: "vstack-addons", data: "skill://principle-prove-it-works" },
  ] });
  const result = await host.callTool("inject_addons", { intent: "Open the PR and prove it works" });
  expect(result.content[0].text).not.toContain("skill://open-pr");
  expect(result.content[0].text).not.toContain("skill://principle-prove-it-works");
  expect(result.content[0].text).toContain("skill://principle-experience-first");
  const asked = Object.keys(judge.calls[0]!.request.questions);
  expect(asked).not.toContain("open-pr");
  expect(asked).not.toContain("principle-prove-it-works");
});

test("unavailable and non-native judges give no picks, and a judge error does not poison the next call", async () => {
  judgeAnswers({ "open-pr": 1 });
  expect((await fakeHost({ nativeJudge: false }).callTool("inject_addons", { intent: "Open a PR" })).content[0].text).not.toContain("skill://");
  expect(judge.calls).toHaveLength(0);
  judge.kind = "chat";
  expect((await fakeHost().callTool("inject_addons", { intent: "Open a PR" })).content[0].text).not.toContain("skill://");
  expect(judge.calls).toHaveLength(0);
  const host = fakeHost();
  judge.kind = "native";
  judge.respond = async () => { throw new Error("network"); };
  expect((await host.callTool("inject_addons", { intent: "Open a PR" })).content[0].text).not.toContain("skill://");
  expect(judge.calls).toHaveLength(1);
  expect(host.saved).toHaveLength(0);
  judgeAnswers({ "open-pr": 1 });
  expect((await host.callTool("inject_addons", { intent: "Open a PR" })).content[0].text).toContain("skill://open-pr");
});

test("tool selection retains the four-second deadline even when the judge ignores abort", async () => {
  judgeAnswers({});
  judge.respond = () => new Promise(() => {});
  const host = fakeHost();
  const begin = performance.now();
  const result = await host.callTool("inject_addons", { intent: "Open a PR" });
  expect(performance.now() - begin).toBeGreaterThanOrEqual(3900);
  expect(performance.now() - begin).toBeLessThan(4800);
  expect(result.content[0].text).not.toContain("skill://");
  expect(host.saved).toHaveLength(0);
  expect(judge.calls[0]!.signal?.aborted).toBe(true);
}, 5000);
