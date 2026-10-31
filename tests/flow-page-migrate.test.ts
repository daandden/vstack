import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoKey, scratchRoot } from "../plugin/skills/vstack-tmp/scripts/scratch.ts";
import { ENV, git } from "./support/fixture.ts";

const FLOW_PAGE = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const FIXTURES = join(import.meta.dir, "fixtures", "flow-page-migrate");
const CLEAN = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "clean.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-page-migrate-")));
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
  return { base, home, project, scratch: join(scratchRoot(home), repoKey(project)) };
}
type World = ReturnType<typeof world>;

type Run = { code: number; stdout: string; stderr: string; json: any };
function run(w: World, args: string[], o: { session?: string; stdin?: unknown } = {}): Run {
  const env = { ...ENV, HOME: w.home, VSTACK_FLOW_HOST: "off", ...(o.session ? { PI_SESSION_ID: o.session } : {}) };
  const stdin = o.stdin === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(o.stdin));
  const r = Bun.spawnSync([process.execPath, FLOW_PAGE, ...args, "--home", w.home], { cwd: w.project, env, stdin, stdout: "pipe", stderr: "pipe" });
  let json: any;
  try {
    json = JSON.parse(r.stdout.toString());
  } catch {
    json = undefined;
  }
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString(), json };
}
const ok = (r: Run): any => {
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  return r.json;
};

function historical(folder: string, fixture: string) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "page.jsonl"), readFileSync(join(FIXTURES, fixture)));
}

function tree(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name !== ".lock") out[p] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  return out;
}

const option = (label: string, extra: object = {}) => ({ label, does: `${label} does`, gains: [`${label} gain`], costs: [`${label} cost`], ...extra });
const SVG = readFileSync(join(FIXTURES, "scope.svg"), "utf8");

function legacyPage(w: World, fixture = "legacy.jsonl") {
  const folder = join(w.scratch, "grilling", "project-41");
  mkdirSync(join(folder, "figures"), { recursive: true });
  writeFileSync(join(folder, "figures", "scope.svg"), SVG);
  historical(folder, fixture);
  return folder;
}

test("alias discovery offers historical continuation before a new Flow, and requires explicit migration", () => {
  const w = world();
  const folder = legacyPage(w);
  const before = tree(w.scratch);
  const found = ok(run(w, ["find", "ticket:42"]));
  expect(found.migration_required).toBe(true);
  expect(found.historical).toEqual([expect.objectContaining({ source: folder, title: "Checkout limits", open: true })]);
  expect(found.flow).toBeUndefined();
  expect(tree(w.scratch)).toEqual(before);
  const migrated = ok(run(w, ["migrate", found.historical[0].source]));
  expect(ok(run(w, ["find", "ticket:42"])).flow).toBe(migrated.flow);
  const continued = ok(run(w, ["open", "--flow", "ticket:42", "--skill", "research"]));
  expect(continued.flow).toBe(migrated.flow);
});

test("automatic cleanup protects an open historical structured Flow regardless of file age", () => {
  const w = world();
  const folder = legacyPage(w);
  const old = new Date("2020-01-01T00:00:00Z");
  for (const file of Object.keys(tree(folder)).reverse()) utimesSync(file, old, old);
  utimesSync(join(folder, "figures"), old, old);
  utimesSync(folder, old, old);
  const before = tree(folder);
  const result = Bun.spawnSync([process.execPath, CLEAN, "--home", w.home, "--now", "2030-01-01T00:00:00Z", "--delete", folder], { cwd: w.project, env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout.toString()).deleted).toEqual([]);
  expect(tree(folder)).toEqual(before);
  expect(ok(run(w, ["find", "spec:41"])).migration_required).toBe(true);
});

test("historical alias ambiguity names the sources and never silently chooses a new or existing Flow", () => {
  const w = world();
  const first = legacyPage(w);
  const second = join(w.scratch, "grilling", "another-41");
  historical(second, "legacy.jsonl");
  const before = tree(w.scratch);
  const ambiguous = run(w, ["find", "ticket:42"]);
  expect(ambiguous.code).toBe(1);
  expect(ambiguous.stdout).toBe("");
  expect(ambiguous.stderr).toContain(first);
  expect(ambiguous.stderr).toContain(second);
  expect(tree(w.scratch)).toEqual(before);
  const migrated = ok(run(w, ["migrate", first]));
  const mixed = run(w, ["find", "ticket:42"]);
  expect(mixed.code).toBe(1);
  expect(mixed.stderr).toContain(migrated.flow);
  expect(mixed.stderr).toContain(second);
  expect(ok(run(w, ["show", "--flow", migrated.flow])).flow.id).toBe(migrated.flow);
});

test("an expired migrated Flow cannot be resurrected by its retained historical source", () => {
  const w = world();
  const source = legacyPage(w, "legacy-closed.jsonl");
  const migrated = ok(run(w, ["migrate", source]));
  const folder = join(migrated.page, "..");
  const beforeSource = tree(source);
  const clean = Bun.spawnSync([process.execPath, CLEAN, "--home", w.home, "--now", "2030-01-01T00:00:00Z", "--delete", folder], { cwd: w.project, env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(clean.stderr.toString()).toBe("");
  expect(clean.exitCode).toBe(0);
  expect(JSON.parse(clean.stdout.toString()).deleted).toEqual([join(w.scratch, "flow", migrated.flow)]);
  expect(existsSync(migrated.page)).toBe(false);
  const before = tree(w.scratch);
  for (const args of [["find", "spec:41"], ["migrate", source], ["show", "--flow", migrated.flow]]) {
    const refused = run(w, args);
    expect(refused.code).toBe(1);
    expect(refused.stdout).toBe("");
    expect(refused.stderr).toContain(migrated.flow);
  }
  expect(tree(w.scratch)).toEqual(before);
  expect(tree(source)).toEqual(beforeSource);
  expect(ok(run(w, ["open", "--title", "Explicit new work", "--skill", "research"])).flow).not.toBe(migrated.flow);
});

test("a structured Grilling page migrates into a Flow with its questions, answers, numbers, times, ids, sources, figures, Topics, and Results", () => {
  const w = world();
  const folder = legacyPage(w);
  const before = tree(folder);
  const migrated = ok(run(w, ["migrate", folder]));
  expect(tree(folder)).toEqual(before);

  const snap = ok(run(w, ["show", "--flow", migrated.flow]));
  expect(snap.flow.id).toBe(migrated.flow);
  expect(snap.stages.map((st: any) => [st.id, st.skill, st.state])).toEqual([["grill", "grill-with-docs", "finished"], ["impl", "implement-spec", "in-progress"]]);
  const [grillStage, implStage] = snap.stages;
  const originalRounds = readFileSync(join(folder, "page.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)).filter((r) => r.type === "round");
  expect([...grillStage.rounds, ...implStage.rounds].map((r: any) => [r.id, r.time])).toEqual(originalRounds.map((r) => [r.id, r.time]));
  const q = Object.fromEntries(snap.stages.flatMap((st: any) => st.questions).map((x: any) => [x.id, x]));
  expect(Object.keys(q).sort()).toEqual(["q-limit", "q-open", "q-scope", "q-scope-again"]);
  expect([q["q-scope"].q, q["q-limit"].q, q["q-scope-again"].q, q["q-open"].q]).toEqual([1, 2, 1, 1]);
  expect(q["q-scope-again"].again).toBe("q-scope");

  expect(q["q-scope"].answer.state).toBe("picked");
  expect(q["q-scope"].answer.picks).toEqual(["A. First"]);
  expect(q["q-scope"].answer.response.text).toBe("keep it simple");
  expect(q["q-limit"].answer.picks).toBeUndefined();
  expect(q["q-limit"].answer.reading).toBeUndefined();
  expect(q["q-limit"].answer.state).toBe("written");
  expect(q["q-limit"].open).toBe(false);
  expect(["picked", "resolved"]).not.toContain(q["q-scope-again"].answer.state);
  expect(q["q-scope-again"].open).toBe(false);
  expect(q["q-scope-again"].retired).toBeDefined();
  expect(q["q-open"].answer.state).toBe("open");
  expect(q["q-open"].open).toBe(true);
  expect(grillStage.closes.map((c: any) => [c.id, c.decisions.map((d: any) => d.question)])).toEqual([["c1", ["q-scope-again", "q-limit"]]]);

  expect(grillStage.results.map((r: any) => [r.id, r.shape, r.entries.map((e: any) => e.id)])).toEqual([["findings", "cards", ["findings/f1"]]]);
  expect(grillStage.results[0].entries[0].questions).toEqual(["q-scope"]);
  expect(q["q-scope"].results).toEqual(["findings/f1"]);
  expect(implStage.results.map((r: any) => [r.id, r.shape, r.entries.map((e: any) => e.id)])).toEqual([["checks", "ledger", ["checks/l1"]], ["tickets", "table", ["tickets/t42"]]]);
  expect(grillStage.background).toBe("bg");
  expect(snap.topics).toEqual([{ id: "caps", questions: ["q-scope"] }]);
  expect(q["q-scope"].topics).toEqual(["caps"]);
  const shared = snap.sources.find((s: any) => s.cited_by.includes("bg"));
  expect(shared.cited_by).toContain("q-scope");

  const svg = snap.attachments.find((a: any) => a.used_by.includes("q-scope"));
  expect(svg.type).toBe("svg");
  expect(svg.revision).toBe(createHash("sha256").update(SVG).digest("hex"));
  expect(readFileSync(join(migrated.page, "..", svg.file), "utf8")).toBe(SVG);
  expect(q["q-limit"].figures.length).toBe(1);

  const ids = new Set([...readFileSync(migrated.page, "utf8").matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const anchor of ["q-q-scope", "q-q-open", "stage-grill", "stage-impl", "round-r1", "close-c1", "background-bg", "report-findings", "report-findings_f1", "report-tickets_t42", "topic-caps", "q-scope", "grill"])
    expect(ids).toContain(anchor);

  for (const alias of ["spec:41", "ticket:42", "ticket:43", "branch:feat/limits", "run:41-run", "folder:41", "slug:checkout-limits"]) expect(ok(run(w, ["find", alias])).flow).toBe(migrated.flow);
});

test("migration preserves declared reader needs and visual kinds without inventing them on older questions", () => {
  const w = world();
  const folder = legacyPage(w);
  const records = readFileSync(join(folder, "page.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const q = records.find((r) => r.type === "question" && r.id === "q-scope");
  q.needs = [{ need: "Locate the existing checkout boundary.", kind: "context-diagram" }];
  for (const v of [q.visual].flat()) v.kind = "context-diagram";
  writeFileSync(join(folder, "page.jsonl"), records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const before = tree(folder);
  const migrated = ok(run(w, ["migrate", folder]));
  const snap = ok(run(w, ["show", "--flow", migrated.flow]));
  const questions = snap.stages.flatMap((st: any) => st.questions);
  expect(questions.find((r: any) => r.id === "q-scope").needs).toEqual(q.needs);
  expect(questions.find((r: any) => r.id === "q-scope").figures[0].kind).toBe("context-diagram");
  expect(questions.find((r: any) => r.id === "q-open").needs).toBeUndefined();
  expect(snap.stages.every((st: any) => st.opened === undefined)).toBe(true);
  expect(tree(folder)).toEqual(before);
});

test("an in-flight migrated Stage takes new contributions without changing old Q numbers, ids, or captured figures", () => {
  const w = world();
  const folder = legacyPage(w);
  const migrated = ok(run(w, ["migrate", folder]));
  const retained = ok(run(w, ["show", "--flow", migrated.flow])).reading;
  expect(retained.publications).toEqual([]);
  expect(retained.historical.map((b: any) => b.id)).toEqual(["bg", "findings", "q-scope", "q-limit", "q-scope-again", "c1", "checks", "tickets", "q-open", "caps"]);
  expect(retained.historical.every((b: any) => b.position === undefined && b.publication === undefined)).toBe(true);
  const before = tree(folder);
  ok(run(w, ["bind", "--flow", migrated.flow, "--stage", "impl"], { session: "continue" }));
  const updated = ok(run(w, ["submit"], { session: "continue", stdin: { version: 1, items: [
    { kind: "answer", question: "q-open", response: { status: "answered", picks: ["B"] } },
    { kind: "round", questions: [{ ref: "next", title: "What comes next?", description: "Continue the implementation.", needs: [{ need: "Decide whether the implementation can continue.", kind: "prose" }], options: [option("Proceed"), option("Stop")] }] },
    { kind: "revise", result: "checks", add: [{ claim: "Browser checked", status: "confirmed", evidence: "browser", missing_proof: "none", consequence: "continue" }] },
  ] } }));
  const snap = ok(run(w, ["show", "--flow", migrated.flow]));
  expect(snap.reading.historical).toEqual(retained.historical);
  expect(snap.reading.publications).toEqual([{ id: updated.refs.next, kind: "question", stage: "impl", position: 1, publication: updated.revision }]);
  expect(readFileSync(migrated.page, "utf8")).toContain('id="historical-content"');
  const impl = snap.stages.find((s: any) => s.id === "impl");
  expect(impl.questions.map((q: any) => [q.id, q.q])).toEqual([["q-open", 1], [updated.refs.next, 2]]);
  expect(impl.questions[0].answer.picks).toEqual(["B. Second"]);
  expect(impl.results[0].entries.map((e: any) => e.id)).toEqual(["checks/l1", "checks/e1"]);
  expect(new Set(snap.stages.flatMap((s: any) => s.questions).map((q: any) => q.id)).size).toBe(5);
  expect(tree(folder)).toEqual(before);
  writeFileSync(join(folder, "figures", "scope.svg"), SVG.replace("#cba6f7", "#a6e3a1"));
  ok(run(w, ["render", "--flow", migrated.flow]));
  const figure = snap.attachments.find((a: any) => a.used_by.includes("q-scope"));
  expect(readFileSync(join(migrated.page, "..", figure.file), "utf8")).toBe(SVG);
  const nextStage = ok(run(w, ["open", "--flow", migrated.flow, "--skill", "research"]));
  expect(snap.stages.some((s: any) => s.id === nextStage.stage)).toBe(false);
});

test("a handwritten page stays readable and untouched instead of gaining fabricated state", () => {
  const w = world();
  const folder = join(w.scratch, "grilling", "project-handwritten");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "page.html"), "<h1>Handwritten decisions</h1><p>A personal note, not structured state.</p>");
  const before = tree(w.scratch);
  const r = run(w, ["migrate", folder]);
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).not.toBe("");
  expect(tree(w.scratch)).toEqual(before);
});

test("a historically closed Flow starts retention at migration without inventing historical timestamps", () => {
  const w = world();
  const folder = legacyPage(w, "legacy-closed.jsonl");
  const before = tree(folder);
  const migrated = ok(run(w, ["migrate", folder]));
  const snap = ok(run(w, ["show", "--flow", migrated.flow]));
  expect(snap.open).toBe(false);
  expect(snap.lifecycle).toEqual([{ event: "closed", time: snap.migrated.time }]);
  expect(Date.parse(snap.migrated.time)).toBeGreaterThan(Date.parse("2026-10-02T09:30:00+07:00"));
  expect(snap.stages.map((s: any) => s.state)).toEqual(["finished", "finished"]);
  for (const stage of snap.stages) {
    expect(stage.opened).toBeUndefined();
    expect(stage.finished).toBeUndefined();
    for (const close of stage.closes) expect(close.time).toBeUndefined();
    for (const q of stage.questions) expect(q.answer.time).toBeUndefined();
  }
  expect(tree(folder)).toEqual(before);
  const repeated = ok(run(w, ["migrate", folder]));
  expect(repeated.repeated).toBe(true);
  expect(ok(run(w, ["show", "--flow", migrated.flow])).lifecycle).toEqual(snap.lifecycle);
});

test("repeating migration finds the same Flow, but changed source or invalid history cannot overwrite durable work", () => {
  const w = world();
  const folder = legacyPage(w);
  const migrated = ok(run(w, ["migrate", folder]));
  const before = tree(w.home);
  const repeated = ok(run(w, ["migrate", folder]));
  expect(repeated.flow).toBe(migrated.flow);
  expect(repeated.repeated).toBe(true);
  expect(tree(w.home)).toEqual(before);
  historical(folder, "legacy-changed.jsonl");
  const changed = tree(w.home);
  const refused = run(w, ["migrate", folder]);
  expect(refused.code).toBe(1);
  expect(tree(w.home)).toEqual(changed);
  expect(ok(run(w, ["show", "--flow", migrated.flow])).revision).toBe(migrated.revision);
  const invalid = join(w.scratch, "grilling", "project-invalid");
  mkdirSync(invalid);
  writeFileSync(join(invalid, "page.jsonl"), readFileSync(join(folder, "page.jsonl"), "utf8").replace('\"picks\":[\"A\"]', '\"picks\":[\"Z\"]'));
  const invalidBefore = tree(w.home);
  expect(run(w, ["migrate", invalid]).code).toBe(1);
  expect(tree(w.home)).toEqual(invalidBefore);
});

test("stageless historical questions keep session-scoped Q numbers and missing figures stay honestly unavailable", () => {
  const w = world();
  const folder = join(w.scratch, "grilling", "project-stageless");
  historical(folder, "stageless.jsonl");
  const raw = readFileSync(join(folder, "page.jsonl"), "utf8");
  writeFileSync(join(folder, "page.jsonl"), raw.split("\n").map((line) => {
    if (!line) return line;
    const r = JSON.parse(line);
    if (r.id === "round-2") r.session = 2;
    if (r.id === "question-2") { r.q = 1; r.visual = { svg: "figures/gone.svg" }; }
    return JSON.stringify(r);
  }).join("\n"));
  const migrated = ok(run(w, ["migrate", folder]));
  const snap = ok(run(w, ["show", "--flow", migrated.flow]));
  expect(snap.stages.map((s: any) => [s.state, s.questions.map((q: any) => [q.id, q.q])])).toEqual([
    ["finished", [["question-1", 1]]], ["in-progress", [["question-2", 1]]],
  ]);
  expect(snap.attachments[0].availability).toBe("unavailable");
  const stage = snap.stages[1].id;
  const next = ok(run(w, ["submit", "--flow", migrated.flow, "--stage", stage], { stdin: { version: 1, items: [
    { kind: "round", questions: [{ title: "Which cap?", description: "Continue.", needs: [{ need: "Compare the available cap policies.", kind: "prose" }], options: [option("First"), option("Second")] }] },
  ] } }));
  expect(["question-1", "question-2"]).not.toContain(next.ask.questions[0].id);
  expect(next.ask.questions[0].question).toStartWith("Q2.");
});

test("unsafe historical markup cannot become executable content on a migrated Flow", () => {
  const w = world();
  const folder = legacyPage(w);
  const raw = readFileSync(join(folder, "page.jsonl"), "utf8");
  for (const visual of [{ html: "<script>document.body.textContent='lost'</script>" }, { html: "<b>safe</b>", css: "@import 'https://example.com/unsafe.css';" }]) {
    writeFileSync(join(folder, "page.jsonl"), raw.split("\n").map((line) => {
      if (!line) return line;
      const r = JSON.parse(line);
      if (r.id === "q-open") r.visual = visual;
      return JSON.stringify(r);
    }).join("\n"));
    const before = tree(w.scratch);
    const r = run(w, ["migrate", folder]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe("");
    expect(tree(w.scratch)).toEqual(before);
  }
});
