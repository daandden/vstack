import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fakeHost } from "./support/extension-host.ts";
import { ENV, git } from "./support/fixture.ts";
import { statePathOf, storedFolder } from "./support/flow-store.ts";

const stored = (home: string, flow: string) => readFileSync(statePathOf(home, flow), "utf8");

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-clean-command-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
let count = 0;
function world() {
  const home = join(root, String(count++));
  const project = join(home, "project");
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  const run = async (args: string[], input?: unknown) => {
    const p = Bun.spawn([process.execPath, ...args, "--home", home], { cwd: project,
      env: { ...ENV, HOME: home, VSTACK_FLOW_HOST: "off" },
      stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    return { stdout, stderr, code, killed: false };
  };
  const ok = async (args: string[], input?: unknown) => {
    const result = await run([script, ...args], input);
    expect(result.code, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  };
  const host = (selections: string[] = [], hasUI = true) => {
    const h = fakeHost({ sessionId: "cleanup", hasUI, selections, exec: async (_command, args) => {
      const homeAt = args.indexOf("--home");
      const local = homeAt < 0 ? args : [...args.slice(0, homeAt), ...args.slice(homeAt + 2)];
      return run(local);
    } });
    h.ctx.cwd = project;
    return h;
  };
  const expired = join(home, ".vstack/tmp/old-project/verify/expired");
  mkdirSync(expired, { recursive: true });
  const raw = join(expired, "output.txt");
  writeFileSync(raw, "old diagnostic");
  const old = new Date(Date.now() - 100 * 86400000);
  utimesSync(raw, old, old);
  utimesSync(expired, old, old);
  return { home, project, expired, ok, host };
}

test("confirmed Scratch cleanup records its outcome in the bound Flow without losing the caller's Stage", async () => {
  const w = world();
  const opened = await w.ok(["open", "--title", "Cleanup proof", "--skill", "implement", "--session", "cleanup"]);
  const h = w.host(["Apply all"]);
  await h.callCommand("vstack-clean");
  expect(existsSync(w.expired)).toBe(false);
  expect(existsSync(storedFolder(w.home, opened.flow))).toBe(true);
  const snapshot = await w.ok(["show", "--flow", opened.flow]);
  const cleanup = snapshot.stages.find((stage: any) => stage.skill === "vstack-clean");
  expect(cleanup).toBeDefined();
  expect(cleanup.state).toBe("finished");
  expect(cleanup.results).toHaveLength(1);
  const bound = await w.ok(["bound", "--session", "cleanup"]);
  expect(bound.binding).toMatchObject({ flow: opened.flow, stage: opened.stage });
  expect(stored(w.home, opened.flow)).toContain(w.expired);
  expect(h.sent).toEqual([]);
});

test("unbound cleanup retains confirmation and creates no administrative Flow", async () => {
  const w = world();
  const cancelled = w.host(["Cancel"]);
  await cancelled.callCommand("vstack-clean");
  expect(existsSync(w.expired)).toBe(true);
  expect(cancelled.uiCalls.filter(call => call.method === "select")).toHaveLength(1);
  expect((await w.ok(["bound", "--session", "cleanup"])).binding).toBeNull();
  expect(readdirSync(join(w.home, ".vstack/tmp"))).toEqual(["old-project"]);
  const confirmed = w.host(["Apply all"]);
  await confirmed.callCommand("vstack-clean");
  expect(existsSync(w.expired)).toBe(false);
  expect((await w.ok(["bound", "--session", "cleanup"])).binding).toBeNull();
  expect(readdirSync(join(w.home, ".vstack/tmp"))).toEqual([]);
});

test("cancelled and headless bound Commands preserve Scratch and record honest outcomes", async () => {
  for (const hasUI of [true, false]) {
    const w = world();
    const opened = await w.ok(["open", "--title", "Retained work", "--skill", "implement", "--session", "cleanup"]);
    const h = w.host(["Cancel"], hasUI);
    await h.callCommand("vstack-clean");
    expect(existsSync(w.expired)).toBe(true);
    expect(h.uiCalls.filter(call => call.method === "select")).toHaveLength(hasUI ? 1 : 0);
    const snapshot = await w.ok(["show", "--flow", opened.flow]);
    expect(snapshot.stages.map((stage: any) => [stage.skill, stage.state, stage.results.length])).toEqual([
      ["implement", "in-progress", 0], ["vstack-clean", "finished", 1],
    ]);
    expect((await w.ok(["bound", "--session", "cleanup"])).stage).toBe(opened.stage);
    expect(h.sent.filter((message: any) => message.customType === "vstack-flow")).toEqual([]);
  }
});

test("a refused cleanup preserves raw diagnostics on its Flow and offers no deletion", async () => {
  const w = world();
  const opened = await w.ok(["open", "--title", "Invalid cleanup", "--skill", "implement", "--session", "cleanup"]);
  const h = w.host(["Apply all"]);
  await h.callCommand("vstack-clean", "invalid-age");
  expect(existsSync(w.expired)).toBe(true);
  expect(h.uiCalls.filter(call => call.method === "select")).toHaveLength(0);
  const snapshot = await w.ok(["show", "--flow", opened.flow]);
  expect(snapshot.stages[1].results).toHaveLength(1);
  expect(snapshot.stages[1].state).toBe("finished");
  expect(stored(w.home, opened.flow)).toContain("invalid-age");
});

test("choosing one expired entry deletes only that entry and retains the preview evidence", async () => {
  const w = world();
  const other = join(w.expired, "..", "retained");
  mkdirSync(other);
  writeFileSync(join(other, "keep.txt"), "keep");
  const old = new Date(Date.now() - 100 * 86400000);
  utimesSync(join(other, "keep.txt"), old, old);
  utimesSync(other, old, old);
  const opened = await w.ok(["open", "--title", "Selective cleanup", "--skill", "implement", "--session", "cleanup"]);
  const h = w.host();
  let step = 0;
  h.ctx.ui.select = async (_title: string, options: string[]) => {
    step++;
    if (step === 1) return "Choose items";
    if (step === 2) return options.find(option => option.includes(" / expired "));
    return "Done";
  };
  await h.callCommand("vstack-clean");
  expect(existsSync(w.expired)).toBe(false);
  expect(existsSync(other)).toBe(true);
  expect(step).toBe(3);
  const snapshot = await w.ok(["show", "--flow", opened.flow]);
  expect(snapshot.stages[1].results).toHaveLength(1);
  expect(stored(w.home, opened.flow)).toContain(other);
});

test("a Command after a finished Stage publishes once without a false attachment failure", async () => {
  const w = world();
  const opened = await w.ok(["open", "--title", "Finished work", "--skill", "implement", "--session", "cleanup"]);
  await w.ok(["submit", "--session", "cleanup"], { version: 1, items: [{ kind: "stage", state: "finished" }] });
  const h = w.host(["Apply all"]);
  await h.callCommand("vstack-clean");
  expect(existsSync(w.expired)).toBe(false);
  const snapshot = await w.ok(["show", "--flow", opened.flow]);
  expect(snapshot.stages.map((stage: any) => [stage.state, stage.results.length])).toEqual([
    ["finished", 0], ["finished", 1],
  ]);
  expect(h.sent).toEqual([]);
});
