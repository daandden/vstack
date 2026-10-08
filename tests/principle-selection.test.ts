import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { fakeHost } from "./support/extension-host.ts";
const model = { provider: "typesafe", id: "jev-latest", api: "typesafe", baseUrl: "https://judge.test/" };
const options = { models: [model], apiKeys: { "typesafe/jev-latest": "test-key" } };
let fetchSpy: ReturnType<typeof spyOn>;
afterEach(() => fetchSpy?.mockRestore());
function endpoint(scores: Record<string, number>) {
  return spyOn(globalThis, "fetch").mockImplementation((async () => Response.json({ answers: Object.fromEntries(Object.entries(scores).map(([k, noul]) => [k, { type: "noul", noul }])) })) as typeof fetch);
}
describe("principle selection", () => {
  test("selects all scores at least .75 in one hidden message, once per session", async () => {
    fetchSpy = endpoint({ "fix-root-causes": .75, "prove-it-works": .9, "experience-first": .749 });
    const host = fakeHost(options);
    const [result]: any = await host.emit("before_agent_start", { prompt: "Fix the failing login" });
    expect(result.message.display).toBe(false);
    expect(result.message.content).toContain("skill://principle-fix-root-causes");
    expect(result.message.content).toContain("skill://principle-prove-it-works");
    expect(result.message.content).not.toContain("experience-first");
    expect(result.message.content).toContain("Ignore");
    expect(await host.emit("before_agent_start", { prompt: "Again" })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect((await fakeHost(options).emit("before_agent_start", { prompt: "Fix login" }))[0]).toBeDefined();
  });
  test("cleans prompt and sends all 23 final noul questions directly", async () => {
    fetchSpy = endpoint({});
    await fakeHost(options).emit("before_agent_start", { prompt: "Fix the failing login \u001b[31mnow\u001b[0m ```ignore this``` <system-reminder>noise</system-reminder> abcdef1234567890" });
    const [url, init]: any = fetchSpy.mock.calls[0];
    expect(url).toBe("https://judge.test/v1/systemone");
    const body = JSON.parse(init.body);
    expect(body.state).toEqual({ request: "Fix the failing login now abcdef1" });
    expect(Object.keys(body.questions)).toHaveLength(23);
    expect(Object.values(body.questions).every((q: any) => q.type === "noul")).toBe(true);
  });
  test("skips subagents, missing credentials, chat judges and missing native model", async () => {
    fetchSpy = endpoint({ "fix-root-causes": 1 });
    for (const override of [{ agent: { kind: "sub", id: "Child", name: "vstack-worker", depth: 1 } }, { apiKeys: {} }, { nativeJudge: false }, { models: [{ ...model, api: "openai-completions" }] }, { models: [] }]) {
      expect(await fakeHost({ ...options, ...override } as any).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  test("retries once after a 503 or transport error, then skips silently", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("unavailable", { status: 503 }));
    expect(await fakeHost(options).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockReset().mockRejectedValue(new Error("network"));
    expect(await fakeHost(options).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  test("a successful retry injects normally", async () => {
    fetchSpy = endpoint({ "fix-root-causes": .9 });
    fetchSpy.mockRejectedValueOnce(new Error("network"));
    expect((await fakeHost(options).emit("before_agent_start", { prompt: "Fix login" }))[0]).toBeDefined();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
  test("the whole selection has a four-second deadline even when fetch ignores abort", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const start = performance.now();
    expect(await fakeHost(options).emit("before_agent_start", { prompt: "Fix login" })).toEqual([undefined]);
    expect(performance.now() - start).toBeLessThan(4500);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  }, 5000);
  test("resumed sessions retain injected pointers from the active branch", async () => {
    fetchSpy = endpoint({ "fix-root-causes": .9, "prove-it-works": .9 });
    const host = fakeHost({ ...options, entries: [{ type: "message", message: { role: "custom", customType: "vstack-principles", content: "skill://principle-fix-root-causes" } }] });
    const [result]: any = await host.emit("before_agent_start", { prompt: "Fix login" });
    expect(result.message.content).not.toContain("fix-root-causes");
    expect(result.message.content).toContain("prove-it-works");
  });
});
