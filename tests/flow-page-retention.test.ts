import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ENV, git } from "./support/fixture.ts";

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
  spawn([process.execPath, SCRIPT, ...args, "--home", at.home], at.cwd, { ...ENV, HOME: at.home, VSTACK_FLOW_HOST: "off", ...(session ? { PI_SESSION_ID: session } : {}) }, stdin);
const clean = (at: At, from: number, days: number, ...args: string[]) =>
  spawn([process.execPath, CLEAN, "--home", at.home, "--now", new Date(from + days * DAY).toISOString(), ...args], at.cwd, ENV);
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};
const listed = (r: Run): string[] => ok(r).entries.map((e: { path: string }) => e.path);

const contribution = (...items: object[]) => ({ version: 1, items });
const card = (ref: string) => ({ ref, title: `Finding ${ref}`, label: "issue", blocking: true, impact: `Users see ${ref}.`, action: `Fix ${ref}.`, evidence: `${ref}.ts:1` });
const FINISH = { kind: "stage", state: "finished" };
const RESULT = contribution({ kind: "result", shape: "cards", title: "Late", entries: [card("late")] });
function finishedFlow(w: ReturnType<typeof world>, session = "s-1") {
  const o = ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at, session));
  ok(run(["submit"], w.at, session, contribution({ kind: "result", ref: "r", shape: "cards", title: "Findings", entries: [card("a")] }, FINISH)));
  return { ...o, folder: dirname(o.page) };
}
const lifecycleTime = (at: At, flow: string): number => Date.parse(ok(run(["show", "--flow", flow], at)).lifecycle.at(-1).time);

function files(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}
function touchAll(dir: string, when: number) {
  const t = new Date(when);
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      utimesSync(join(d, e.name), t, t);
    }
  };
  walk(dir);
  utimesSync(dir, t, t);
}

test("an open Flow is never listed or deleted, however old its files are", () => {
  const w = world();
  const f = finishedFlow(w);
  const opened = Date.now();
  touchAll(f.folder, opened - 2000 * DAY);
  expect(ok(run(["show", "--flow", f.flow], w.at)).open).toBe(true);

  for (const age of ["90d", "1d", "1h"]) expect(listed(clean(w.at, opened, 500, "--older-than", age))).not.toContain(f.folder);
  const del = ok(clean(w.at, opened, 500, "--older-than", "1d", "--delete", f.folder));
  expect(del.deleted).toEqual([]);
  expect(del.skipped.map((s: { path: string }) => s.path)).toEqual([f.folder]);
  expect(existsSync(f.page)).toBe(true);
  expect(ok(run(["show", "--flow", f.flow], w.at)).flow.id).toBe(f.flow);
});

test("a closed Flow becomes eligible 90 days after its close, whatever its file times or page reads say", () => {
  const w = world();
  const f = finishedFlow(w);
  const closed = ok(run(["close", "--flow", f.flow], w.at));
  expect(closed.flow).toBe(f.flow);
  const at = lifecycleTime(w.at, f.flow);
  expect(ok(run(["show", "--flow", f.flow], w.at)).open).toBe(false);

  touchAll(f.folder, at - 1000 * DAY);
  expect(listed(clean(w.at, at, 89))).not.toContain(f.folder);
  expect(ok(clean(w.at, at, 89, "--delete", f.folder)).deleted).toEqual([]);

  for (const read of [["show", "--flow", f.flow], ["find", `slug:${ok(run(["show", "--flow", f.flow], w.at)).flow.slug}`], ["render", "--flow", f.flow]]) ok(run(read, w.at));
  expect(lifecycleTime(w.at, f.flow)).toBe(at);
  touchAll(f.folder, at + 90 * DAY);
  const due = ok(clean(w.at, at, 91));
  expect(due.entries.map((e: { path: string }) => e.path)).toContain(f.folder);
  expect(due.entries.find((e: { path: string }) => e.path === f.folder).age_days).toBe(91);
  expect(listed(clean(w.at, at, 30, "--older-than", "1d"))).not.toContain(f.folder);
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
  for (const r of [run(["close", "--flow", o.flow], w.at), run(["open", "--flow", o.flow, "--skill", "explain"], w.at, "s-2"), run(["submit", "--flow", o.flow, "--stage", o.stage], w.at, undefined, RESULT)]) {
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
  }
  expect(ok(run(["show", "--flow", o.flow], w.at)).revision).toBe(revision);
  expect(run(["reopen", "--flow", ok(run(["open", "--title", "Other", "--skill", "explain"], w.at)).flow, "--skill", "explain"], w.at).code).toBe(1);
});

test("reopening adds a Stage, keeps the history, and protects the Flow again until its next close", () => {
  const w = world();
  const f = finishedFlow(w);
  ok(run(["close", "--flow", f.flow], w.at));
  const closedAt = lifecycleTime(w.at, f.flow);

  const re = ok(run(["reopen", "--flow", f.flow, "--skill", "grill-me", "--parent", f.stage], w.at, "s-2"));
  expect(re.bound).toBe(true);
  const s = ok(run(["show", "--flow", f.flow], w.at));
  expect(s.open).toBe(true);
  expect(s.lifecycle.map((l: { event: string }) => l.event)).toEqual(["closed", "reopened"]);
  expect(s.stages.map((st: { id: string; state: string }) => [st.id, st.state])).toEqual([[f.stage, "finished"], [re.stage, "in-progress"]]);
  expect(s.stages[0].results).toHaveLength(1);
  expect(s.stages[1].parent).toBe(f.stage);

  expect(listed(clean(w.at, closedAt, 400))).not.toContain(f.folder);
  expect(ok(clean(w.at, closedAt, 400, "--delete", f.folder)).deleted).toEqual([]);
  ok(run(["submit"], w.at, "s-2", contribution(FINISH)));
  ok(run(["close"], w.at, "s-2"));
  expect(listed(clean(w.at, lifecycleTime(w.at, f.flow), 89))).not.toContain(f.folder);
  expect(listed(clean(w.at, lifecycleTime(w.at, f.flow), 91))).toContain(f.folder);
});

test("an expired Flow goes with its page, data, and captured files, and its identity reports the loss instead of starting empty", () => {
  const w = world();
  const opened = ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at, "s-1"));
  const f = { ...opened, folder: dirname(opened.page) };
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
  const flowsDir = dirname(f.folder);
  touchAll(f.folder, at + 90 * DAY);

  const del = ok(clean(w.at, at, 91, "--delete", f.folder));
  expect(del.deleted).toEqual([f.folder]);
  expect(existsSync(f.folder)).toBe(false);
  expect(existsSync(late)).toBe(false);

  const never = run(["find", "never-seen-000000"], w.at);
  for (const args of [["find", f.flow], ["show", "--flow", f.flow], ["render", "--flow", f.flow], ["open", "--flow", f.flow, "--skill", "explain"], ["reopen", "--flow", f.flow, "--skill", "explain"], ["submit", "--flow", f.flow, "--stage", f.stage]]) {
    const r = run(args, w.at, "s-1", RESULT);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toContain(f.flow);
    expect(r.stderr.replaceAll(f.flow, "")).not.toBe(never.stderr.replaceAll("never-seen-000000", ""));
  }
  expect(run(["submit"], w.at, "s-1", RESULT).code).toBe(1);
  expect(readdirSync(flowsDir).filter((e) => !e.startsWith(".")).map((e) => join(flowsDir, e))).toEqual([keep.folder]);
  expect(files(flowsDir).some((p) => p.includes(f.flow) && !p.includes(`${join(flowsDir, ".ids")}/`))).toBe(false);
  expect(ok(run(["open", "--title", "Retention proof", "--skill", "explain"], w.at)).flow).not.toBe(f.flow);
  ok(run(["show"], w.at, "s-keep"));
});

test("the Flow registry and session bindings are never offered as Scratch entries", () => {
  const w = world();
  const f = finishedFlow(w);
  const flowsDir = dirname(f.folder);
  touchAll(flowsDir, Date.now() - 1000 * DAY);
  const r = ok(clean(w.at, Date.now(), 0, "--older-than", "1d"));
  expect(r.entries.filter((e: { kind: string }) => e.kind === "flow")).toEqual([]);
  const meta = readdirSync(flowsDir).filter((e) => e.startsWith(".")).map((e) => join(flowsDir, e));
  expect(meta.length).toBeGreaterThan(0);
  const del = ok(clean(w.at, Date.now(), 0, "--older-than", "1d", "--delete", ...meta));
  expect(del.deleted).toEqual([]);
  for (const p of meta) expect(existsSync(p)).toBe(true);
  expect(ok(run(["show"], w.at, "s-1")).flow.id).toBe(f.flow);
});

test("other Scratch keeps its newest-file retention, measured from --now", () => {
  const w = world();
  const entry = join(w.home, ".vstack", "tmp", "shop-aaaaaa", "explain", "page.html");
  mkdirSync(dirname(entry), { recursive: true });
  writeFileSync(entry, "x");
  const now = Date.now();
  utimesSync(entry, new Date(now - 10 * DAY), new Date(now - 10 * DAY));
  expect(listed(clean(w.at, now, 0, "--older-than", "14d"))).not.toContain(entry);
  expect(listed(clean(w.at, now, 5, "--older-than", "14d"))).toContain(entry);
  expect(ok(clean(w.at, now, 0, "--older-than", "14d", "--delete", entry)).deleted).toEqual([]);
  expect(ok(clean(w.at, now, 5, "--older-than", "14d", "--delete", entry)).deleted).toEqual([entry]);
  expect(existsSync(entry)).toBe(false);
});
