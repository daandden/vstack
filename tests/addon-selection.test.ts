import { describe, expect, test } from "bun:test";
import catalogFile from "../addon-questions.json";
import { parseAddonCatalog } from "../plugin/extensions/addon-catalog.ts";
import { fakeHost } from "./support/extension-host.ts";
import { judge, judgeAnswers } from "./support/extension-mocks.ts";

const catalog = parseAddonCatalog(catalogFile);

const options = {};
const savedRun = { type: "custom_message", customType: "skill-prompt", details: { name: "implement" } };
const running = { ...options, entries: [savedRun] };
const stalled = () => new Promise<never>(() => {});
const addonPicks = (results: any[]) => results.filter(result => result?.message?.customType === "vstack-addons");

describe("Principle picks in subagent sessions", () => {
  const child = (name: string, id = "0-Child", parentId = "Main", entries: unknown[] = []) =>
    fakeHost({ ...options, entries, agent: { kind: "sub", id, name, depth: 1, parentId } });
  const brief = (assignment: string) => `Complete assignment thoroughly:\n\n${assignment}`;
  async function registerMainSession(main: ReturnType<typeof fakeHost>) {
    await main.emit("before_agent_start", { prompt: "Plan the next step" });
    judge.calls = [];
  }

  test("a judged agent in a Matt run gets principle picks from its cleaned brief, with no precedence sentence", async () => {
    judgeAnswers({ "principle-prove-it-works": .9, "principle-guard-the-context-window": .7, "principle-explain-the-number": .699, "principle-never-block-on-the-human": 1, "open-pr": 1 });
    await registerMainSession(fakeHost(running));
    const [result]: any = await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser \u001b[31mnow\u001b[0m <system-reminder>noise</system-reminder> abcdef1234567890") });
    expect(result.message.customType).toBe("vstack-addons");
    expect(result.message.display).toBe(false);
    expect(result.message.content).toContain("skill://principle-guard-the-context-window");
    expect(result.message.content).toContain("skill://principle-prove-it-works");
    expect(result.message.content).not.toContain("skill://principle-explain-the-number");
    expect(result.message.content).not.toContain("skill://principle-never-block-on-the-human");
    expect(result.message.content).not.toContain("skill://open-pr");
    expect(result.message.content).not.toContain("those steps win");
    const body = judge.calls[0]!.request;
    expect(body.state).toEqual({ request: "Fix the parser now abcdef1", preamble: catalog.brief_preamble });
    const asked = Object.keys(body.questions);
    expect(asked).toHaveLength(21);
    expect(asked.every(name => name.startsWith("principle-"))).toBe(true);
    expect(asked).not.toContain("principle-never-block-on-the-human");
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
    expect(addonPicks(await child("vstack-verifier").emit("before_agent_start", { prompt: brief("Verify PR #12") }))).toEqual([]);
    expect(judge.calls).toHaveLength(1);
    judge.calls = [];
    judge.respond = stalled;
    const begin = performance.now();
    expect(addonPicks(await child("vstack-verifier").emit("before_agent_start", { prompt: brief("Verify PR #12") }))).toEqual([]);
    expect(performance.now() - begin).toBeGreaterThanOrEqual(3900);
    expect(performance.now() - begin).toBeLessThan(4500);
    expect(judge.calls).toHaveLength(1);
    expect(judge.calls[0]!.signal?.aborted).toBe(true);
  }, 6000);
  test("the diagram drawer, the comment critic, omp's own agents, and /tan clones get no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    for (const name of ["vstack-diagram-drawer", "vstack-comment-critic", "task", "scout", "worker", "sub"]) {
      expect(addonPicks(await child(name).emit("before_agent_start", { prompt: brief("Fix the parser") }))).toEqual([]);
    }
    expect(judge.calls).toHaveLength(0);
  });
  test("a child of a main session outside a Matt run, or of an unknown session, gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(options));
    expect(addonPicks(await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser") }))).toEqual([]);
    await registerMainSession(fakeHost(running));
    expect(addonPicks(await child("vstack-worker", "0-Child", "Unknown").emit("before_agent_start", { prompt: brief("Fix the parser") }))).toEqual([]);
    expect(judge.calls).toHaveLength(0);
  });
  test("a nested child follows the top-level session, also below an agent that gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const entries: unknown[] = [savedRun];
    await registerMainSession(fakeHost({ ...options, entries }));
    expect((await child("vstack-worker", "0-Worker").emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    expect(addonPicks(await child("task", "1-Task").emit("before_agent_start", { prompt: brief("Look around") }))).toEqual([]);
    for (const parentId of ["0-Worker", "1-Task"]) {
      expect((await child("vstack-explorer", `${parentId}.0-Explore`, parentId).emit("before_agent_start", { prompt: brief("Find the fact") }))[0]).toBeDefined();
    }
    entries.length = 0;
    judge.calls = [];
    expect(addonPicks(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") }))).toEqual([]);
    expect(judge.calls).toHaveLength(0);
  });
  test("only the first prompt of a subagent session, its brief, is judged, also when omp dropped and resent it", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    const entries: unknown[] = [];
    const worker = child("vstack-worker", "0-Child", "Main", entries);
    for (let attempt = 0; attempt < 2; attempt++) expect((await worker.emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    entries.push(said("user", brief("Build ticket 3")), said("assistant", "Ticket 3 is built."));
    for (const prompt of ["Yield your result now.", "Also check the README."]) expect(addonPicks(await worker.emit("before_agent_start", { prompt }))).toEqual([]);
    expect(judge.calls).toHaveLength(2);
  });
  test("a child started after its top-level session shut down gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    const main = fakeHost(running);
    await registerMainSession(main);
    await main.emit("session_shutdown");
    expect(addonPicks(await child("vstack-worker").emit("before_agent_start", { prompt: brief("Fix the parser") }))).toEqual([]);
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
    expect(addonPicks(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") }))).toEqual([]);
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
    expect(addonPicks(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") }))).toEqual([]);
    expect((await child("vstack-worker", "1-Worker").emit("before_agent_start", { prompt: brief("Build ticket 4") }))[0]).toBeDefined();
    expect(judge.calls).toHaveLength(1);
  });
  test("a subagent that shut down leaves no record, so a child that names it as parent gets no picks", async () => {
    judgeAnswers({ "principle-prove-it-works": .9 });
    await registerMainSession(fakeHost(running));
    const worker = child("vstack-worker", "0-Worker");
    expect((await worker.emit("before_agent_start", { prompt: brief("Build ticket 3") }))[0]).toBeDefined();
    await worker.emit("session_shutdown");
    expect(addonPicks(await child("vstack-explorer", "0-Worker.0-Explore", "0-Worker").emit("before_agent_start", { prompt: brief("Find the fact") }))).toEqual([]);
    expect(judge.calls).toHaveLength(1);
  });
});

const said = (role: "user" | "assistant", content: unknown) => ({ type: "message", message: { role, content } });
