import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";
import { flowMetadataPaths, storedFolder, touchStoredFiles } from "./support/flow-store.ts";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const CLEAN = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "clean.ts");
const DAY = 86_400_000;
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-retention-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let n = 0;
function world() {
  const base = join(root, String(n++));
  const home = join(base, "home");
  const project = join(base, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(project, { recursive: true });
  git(project, "init", "-q", "-b", "main");
  git(project, "commit", "-q", "--allow-empty", "-m", "base");
  return { base, home, project, at: { cwd: project, home } };
}

type Run = { code: number; stdout: string; stderr: string; json: any };
type At = { cwd: string; home: string };
function spawn(cmd: string[], cwd: string, env: Record<string, string>, stdin?: unknown): Run {
  const r = Bun.spawnSync(cmd, { cwd, env, stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(stdin)), stdout: "pipe", stderr: "pipe" });
  const stdout = r.stdout.toString();
  let json: any;
  try {
    json = JSON.parse(stdout);
  } catch {
    json = undefined;
  }
  return { code: r.exitCode, stdout, stderr: r.stderr.toString(), json };
}
const run = (args: string[], at: At, session?: string, stdin?: unknown) =>
  spawn([process.execPath, SCRIPT, ...args, "--home", at.home], at.cwd, { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off", ...(session ? { PI_SESSION_ID: session } : {}) }, stdin);
const clean = (at: At, from: number, days: number, ...args: string[]) =>
  spawn([process.execPath, CLEAN, "--home", at.home, "--now", new Date(from + days * DAY).toISOString(), ...args], at.cwd, ENV);
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};
const listed = (r: Run): string[] => ok(r).rows.map((row: { path: string }) => row.path);
const snapshotFor = (r: Run, path: string): string => {
  const snapshot = ok(r).rows.find((row: { path: string }) => row.path === path)?.snapshot;
  expect(snapshot).toEqual(expect.any(String));
  return snapshot;
};

const contribution = (...items: object[]) => ({ version: 1, items });
const card = (ref: string) => ({ ref, title: `Finding ${ref}`, label: "issue", blocking: true, impact: `Users see ${ref}.`, action: `Fix ${ref}.`, evidence: `${ref}.ts:1` });
const FINISH = { kind: "stage", state: "finished" };
const RESULT = contribution({ kind: "result", shape: "cards", title: "Late", entries: [card("late")] });
function finishedFlow(w: ReturnType<typeof world>, session = "s-1") {
  const o = ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at, session));
  ok(run(["submit"], w.at, session, contribution({ kind: "result", ref: "r", shape: "cards", title: "Findings", entries: [card("a")] }, FINISH)));
  return { ...o, folder: storedFolder(w.at.home, o.flow) };
}
const lifecycleTime = (at: At, flow: string): number => Date.parse(ok(run(["show", "--flow", flow], at)).lifecycle.at(-1).time);


test("an open Flow is never listed or deleted, however old its files are", () => {
  const w = world();
  const f = finishedFlow(w);
  const opened = Date.now();
  touchStoredFiles(f.folder, opened - 2000 * DAY);
  expect(ok(run(["show", "--flow", f.flow], w.at)).open).toBe(true);

  for (const age of ["90d", "1d", "1h"]) expect(listed(clean(w.at, opened, 500, "--older-than", age))).not.toContain(f.folder);
  expect(existsSync(f.folder)).toBe(true);
  expect(ok(run(["show", "--flow", f.flow], w.at)).flow.id).toBe(f.flow);
});

test("a closed Flow becomes eligible 15 days after its close, whatever its file times or reads say", () => {
  const w = world();
  const f = finishedFlow(w);
  const closed = ok(run(["close", "--flow", f.flow], w.at));
  expect(closed.flow).toBe(f.flow);
  const at = lifecycleTime(w.at, f.flow);
  expect(ok(run(["show", "--flow", f.flow], w.at)).open).toBe(false);

  touchStoredFiles(f.folder, at - 1000 * DAY);
  expect(listed(clean(w.at, at, 14))).not.toContain(f.folder);
  expect(listed(clean(w.at, at, 16, "--older-than", "30d"))).not.toContain(f.folder);

  for (const read of [["show", "--flow", f.flow], ["find", `slug:${ok(run(["show", "--flow", f.flow], w.at)).flow.slug}`]]) ok(run(read, w.at));
  expect(lifecycleTime(w.at, f.flow)).toBe(at);
  touchStoredFiles(f.folder, at + 15 * DAY);
  const due = ok(clean(w.at, at, 16));
  expect(due.rows.find((row: { path: string }) => row.path === f.folder).age_days).toBe(16);
  expect(listed(clean(w.at, at, 10, "--older-than", "1d"))).not.toContain(f.folder);
});

test("closing needs every Stage finished, and a closed Flow takes no Stage or content until it is reopened", () => {
  const w = world();
  const o = ok(run(["open", "--title", "Busy flow", "--skill", "explain"], w.at, "s-1"));
  const busy = run(["close", "--flow", o.flow], w.at);
  expect(busy.code).toBe(1);
  expect(busy.stdout).toBe("");
  expect(ok(run(["show", "--flow", o.flow], w.at)).open).toBe(true);

  ok(run(["submit"], w.at, "s-1", contribution(FINISH)));
  ok(run(["close"], w.at, "s-1"));
  const revision = ok(run(["show", "--flow", o.flow], w.at)).revision;
  for (const [i, r] of [run(["close", "--flow", o.flow], w.at), run(["open", "--flow", o.flow, "--skill", "explain"], w.at, "s-2"), run(["submit", "--flow", o.flow, "--stage", o.stage], w.at, undefined, RESULT)].entries()) {
    expect(r.code).toBe(1);
    if (i === 2) expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, diagnostics: expect.any(Array) });
    else expect(r.stdout).toBe("");
  }
  expect(ok(run(["show", "--flow", o.flow], w.at)).revision).toBe(revision);
  expect(run(["reopen", "--flow", ok(run(["open", "--title", "Other", "--skill", "explain"], w.at)).flow, "--skill", "explain"], w.at).code).toBe(1);
});

test("reopening adds a Stage, keeps the history, and protects the Flow again until its next close", () => {
  const w = world();
  const f = finishedFlow(w);
  ok(run(["close", "--flow", f.flow], w.at));
  const closedAt = lifecycleTime(w.at, f.flow);
  const selected = snapshotFor(clean(w.at, closedAt, 16), f.folder);

  const re = ok(run(["reopen", "--flow", f.flow, "--skill", "grill-me", "--parent", f.stage], w.at, "s-2"));
  expect(re.bound).toBe(true);
  const s = ok(run(["show", "--flow", f.flow], w.at));
  expect(s.open).toBe(true);
  expect(s.lifecycle.map((l: { event: string }) => l.event)).toEqual(["closed", "reopened"]);
  expect(s.stages.map((st: { id: string; state: string }) => [st.id, st.state])).toEqual([[f.stage, "finished"], [re.stage, "in-progress"]]);
  expect(s.stages[0].results).toHaveLength(1);
  expect(s.stages[1].parent).toBe(f.stage);

  expect(listed(clean(w.at, closedAt, 400))).not.toContain(f.folder);
  const result = ok(clean(w.at, closedAt, 400, "--delete", selected));
  expect(result.deleted).toEqual([]);
  expect(result.skipped).toMatchObject([{ path: f.folder, reason: "Open Flow" }]);
  ok(run(["submit"], w.at, "s-2", contribution(FINISH)));
  ok(run(["close"], w.at, "s-2"));
  expect(listed(clean(w.at, lifecycleTime(w.at, f.flow), 14))).not.toContain(f.folder);
  expect(listed(clean(w.at, lifecycleTime(w.at, f.flow), 16))).toContain(f.folder);
});

test("an expired Flow goes with its data and captured files, and its identity reports the loss instead of starting empty", () => {
  const w = world();
  const opened = ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at, "s-1"));
  const f = { ...opened, folder: storedFolder(w.at.home, opened.flow) };
  writeFileSync(join(w.project, "captured.bin"), "evidence");
  ok(run(["submit"], w.at, "s-1", contribution(
    { kind: "attachment", ref: "proof", type: "file", caption: "Retained evidence", origin: "project", path: "captured.bin" },
    { kind: "result", shape: "cards", title: "Findings", entries: [card("a")], attachments: ["proof"] },
    FINISH,
  )));
  const late = join(f.folder, ok(run(["show", "--flow", f.flow], w.at)).attachments[0].file);
  expect(readFileSync(late, "utf8")).toBe("evidence");
  const keep = finishedFlow(w, "s-keep");
  ok(run(["close", "--flow", f.flow], w.at));
  const at = lifecycleTime(w.at, f.flow);
  const selected = snapshotFor(clean(w.at, at, 16), f.folder);
  touchStoredFiles(f.folder, at + 17 * DAY);

  const del = ok(clean(w.at, at, 16, "--delete", selected));
  expect(del.deleted).toMatchObject([{ path: f.folder, removed: [f.folder] }]);
  expect(existsSync(f.folder)).toBe(false);
  expect(existsSync(late)).toBe(false);

  const never = run(["find", "never-seen-000000"], w.at);
  for (const args of [["find", f.flow], ["show", "--flow", f.flow], ["open", "--flow", f.flow, "--skill", "explain"], ["reopen", "--flow", f.flow, "--skill", "explain"], ["submit", "--flow", f.flow, "--stage", f.stage]]) {
    const r = run(args, w.at, "s-1", RESULT);
    expect(r.code).toBe(1);
    if (args[0] === "submit") expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, diagnostics: expect.any(Array) });
    else expect(r.stdout).toBe("");
    expect(r.stderr).toContain(f.flow);
    expect(r.stderr.replaceAll(f.flow, "")).not.toBe(never.stderr.replaceAll("never-seen-000000", ""));
  }
  expect(run(["submit"], w.at, "s-1", RESULT).code).toBe(1);
  expect(ok(run(["show", "--flow", keep.flow], w.at)).flow.id).toBe(keep.flow);
  expect(ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at)).flow).not.toBe(f.flow);
  ok(run(["show"], w.at, "s-keep"));
});

test("an expired Flow snapshot skips a replacement folder", () => {
  const w = world();
  const f = finishedFlow(w);
  ok(run(["close", "--flow", f.flow], w.at));
  const at = lifecycleTime(w.at, f.flow);
  const selected = snapshotFor(clean(w.at, at, 16), f.folder);
  renameSync(f.folder, join(w.base, "original-flow"));
  mkdirSync(f.folder);
  const replacement = join(f.folder, "replacement-only.txt");
  writeFileSync(replacement, "unselected");

  const result = ok(clean(w.at, at, 16, "--delete", selected));
  expect(result).toMatchObject({
    deleted: [], partial: [], skipped: [{ path: f.folder, reason: "Flow identity changed" }],
  });
  expect(readFileSync(replacement, "utf8")).toBe("unselected");
  expect(ok(run(["show", "--flow", f.flow], w.at)).flow.id).toBe(f.flow);
});

test("the Flow registry and session bindings are never offered as Scratch entries", () => {
  const w = world();
  const f = finishedFlow(w);
  const flowsDir = dirname(f.folder);
  touchStoredFiles(flowsDir, Date.now() - 1000 * DAY);
  const r = ok(clean(w.at, Date.now(), 0, "--older-than", "1d"));
  expect(r.rows.filter((row: { kind: string }) => row.kind === "flow")).toEqual([]);
  const meta = flowMetadataPaths(w.at.home, f.flow);
  expect(meta.length).toBeGreaterThan(0);
  for (const p of meta) expect(existsSync(p)).toBe(true);
  expect(ok(run(["show"], w.at, "s-1")).flow.id).toBe(f.flow);
});

test("other Scratch keeps its newest-file retention, measured from --now", () => {
  const w = world();
  const entry = join(w.home, ".vstack", "tmp", "shop-aaaaaa", "to-tickets", "record");
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(entry, "x");
  const now = Date.now();
  utimesSync(entry, new Date(now - 10 * DAY), new Date(now - 10 * DAY));
  expect(listed(clean(w.at, now, 0, "--older-than", "14d"))).not.toContain(entry);
  expect(listed(clean(w.at, now, 5, "--older-than", "14d"))).toContain(entry);
  const selected = snapshotFor(clean(w.at, now, 5, "--older-than", "14d"), entry);
  expect(ok(clean(w.at, now, 0, "--older-than", "14d", "--delete", selected)).skipped)
    .toMatchObject([{ path: entry, reason: "Newer than the TTL" }]);
  expect(ok(clean(w.at, now, 5, "--older-than", "14d", "--delete", selected)).deleted)
    .toMatchObject([{ path: entry, removed: [entry] }]);
  expect(existsSync(entry)).toBe(false);
});
