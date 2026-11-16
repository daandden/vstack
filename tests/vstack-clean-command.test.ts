
import { afterEach, beforeEach, expect, test } from "bun:test";
import { fakeHost } from "./support/extension-host.ts";

type Exec = { stdout: string; stderr: string; code: number; killed: boolean };

const HOME = "/home/cleaner";
const TERN = "/opt/tern/bin/tern";
const READY = {
  plugins: [
    { id: "vstack-flow", status: "ready", window: true, blocks: [] },
    { id: "vstack-clean", status: "ready", window: true, blocks: [{ id: "popup" }] },
  ],
};
const trigger = (pane: string, age: string) => `${HOME}/.vstack/clean-popup/${pane}/${age}`;
const handled = (path: string): Exec => ({ stdout: "", stderr: `tern open: ${path} cannot open in a file block\n`, code: 1, killed: false });
const ok = (value: unknown): Exec => ({ stdout: JSON.stringify(value), stderr: "", code: 0, killed: false });

const saved = { ...process.env };
beforeEach(() => {
  process.env.HOME = HOME;
  process.env.TERN_PANE = "7";
  process.env.TERN_EXE = TERN;
});
afterEach(() => {
  for (const key of ["HOME", "TERN_PANE", "TERN_EXE"]) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function host(options: { plugins?: Exec; open?: (path: string) => Exec; hasUI?: boolean } = {}) {
  return fakeHost({
    hasUI: options.hasUI ?? true,
    exec: async (_command, args) => {
      if (args[0] === "plugin") return options.plugins ?? ok(READY);
      if (args[0] === "open") return (options.open ?? handled)(args[1]!);
      throw new Error(`unexpected Tern call ${args.join(" ")}`);
    },
  });
}
const notes = (h: ReturnType<typeof host>) => h.uiCalls.filter(call => call.method === "notify").map(call => ({ text: call.args[0] as string, level: call.args[1] }));

test("inside Tern with the plugin ready, the Command opens the popup over its pane with the 15-day default and nothing else", async () => {
  const h = host();
  await h.callCommand("vstack-clean");
  expect(h.execCalls).toEqual([
    { command: TERN, args: ["plugin", "list", "--json"] },
    { command: TERN, args: ["open", trigger("7", "15d")] },
  ]);
  expect(h.uiCalls.filter(call => call.method === "select")).toEqual([]);
  expect(notes(h).every(note => note.level !== "error")).toBe(true);
  expect(h.sent).toEqual([]);
});

test("an age argument travels to the popup", async () => {
  const h = host();
  await h.callCommand("vstack-clean", " 30d ");
  expect(h.execCalls.at(-1)).toEqual({ command: TERN, args: ["open", trigger("7", "30d")] });
});

test("an invalid age is refused in omp before Tern is asked anything", async () => {
  const h = host();
  await h.callCommand("vstack-clean", "soon");
  expect(h.execCalls).toEqual([]);
  expect(notes(h)).toEqual([{ text: expect.stringMatching(/age.*"soon".*Nothing deleted/s), level: "error" }]);
});

test("outside Tern the Command deletes nothing and says it needs Tern", async () => {
  delete process.env.TERN_PANE;
  const h = host();
  await h.callCommand("vstack-clean");
  expect(h.execCalls).toEqual([]);
  expect(notes(h)).toEqual([{ text: expect.stringMatching(/needs Tern.*vstack-clean.*Nothing deleted/s), level: "error" }]);
});

test.each([
  ["absent", { plugins: [{ id: "vstack-flow", status: "ready", window: true, blocks: [] }] }],
  ["failed to load", { plugins: [{ id: "vstack-clean", status: "error", window: true, blocks: [{ id: "popup" }] }] }],
  ["missing its popup block", { plugins: [{ id: "vstack-clean", status: "ready", window: true, blocks: [] }] }],
  ["without its window half", { plugins: [{ id: "vstack-clean", status: "ready", window: false, blocks: [{ id: "popup" }] }] }],
])("a plugin %s is not ready: no open is tried and the user is told to set it up", async (_case, list) => {
  const h = host({ plugins: ok(list) });
  await h.callCommand("vstack-clean");
  expect(h.execCalls.map(call => call.args[0])).toEqual(["plugin"]);
  expect(notes(h)).toEqual([{ text: expect.stringMatching(/vstack-clean Tern plugin is not ready.*setup-vstack.*Nothing deleted/s), level: "error" }]);
});

test("a plugin list that fails is reported and no open is tried", async () => {
  const h = host({ plugins: { stdout: "", stderr: "no daemon\n", code: 1, killed: false } });
  await h.callCommand("vstack-clean");
  expect(h.execCalls.map(call => call.args[0])).toEqual(["plugin"]);
  expect(notes(h)).toEqual([{ text: expect.stringMatching(/no daemon.*Nothing deleted/s), level: "error" }]);
});

test.each([
  ["an unclaimed open (exit 0)", (_path: string): Exec => ({ stdout: "", stderr: "", code: 0, killed: false })],
  ["another tern open error", (_path: string): Exec => ({ stdout: "", stderr: "tern open: no window\n", code: 1, killed: false })],
  ["a crash", (path: string): Exec => ({ ...handled(path), code: 2 })],
])("%s after a ready preflight is reported as a launch failure", async (_case, open) => {
  const h = host({ open });
  await h.callCommand("vstack-clean");
  expect(notes(h)).toEqual([{ text: expect.stringMatching(/could not open the Scratch cleanup popup.*Nothing deleted/s), level: "error" }]);
});

test("without an interactive UI the Command refuses as before and touches Tern not at all", async () => {
  const h = host({ hasUI: false });
  await h.callCommand("vstack-clean");
  expect(h.execCalls).toEqual([]);
  expect(h.sent).toEqual([expect.objectContaining({ customType: "vstack-clean", content: expect.stringContaining("Nothing deleted") })]);
});
