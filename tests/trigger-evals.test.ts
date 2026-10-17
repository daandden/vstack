import { afterEach, expect, test } from "bun:test";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) rmSync(p, { recursive: true, force: true }); });
const script = join(import.meta.dir, "../plugin/skills/skill-creator/scripts/trigger-evals.ts");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "trigger-evals-")); roots.push(root);
  const omp = join(root, "omp");
  writeFileSync(omp, `#!/bin/sh\nexec "${process.execPath}" "${join(import.meta.dir, "support/trigger-omp.ts")}" "$@"\n`); chmodSync(omp, 0o755);
  const home = join(root, "home"); mkdirSync(home);
  return { root, omp, home, log: join(root, "omp.log") };
}
function writeJson(path: string, value: unknown) { writeFileSync(path, JSON.stringify(value)); return path; }
function sessionFile(root: string, records: object[]) { const path = join(root, "parent.jsonl"); writeFileSync(path, records.map((r) => JSON.stringify(r)).join("\n") + "\n"); return path; }
const parentRecords = [
  { type: "session", version: 3, id: "parent" },
  { type: "model_change", model: "openai/gpt-old" },
  { type: "thinking_level_change", thinkingLevel: "low" },
  { type: "model_change", model: "anthropic/claude-opus-5-5" },
  { type: "thinking_level_change", thinkingLevel: "high" },
];
function run(args: string[], env: Record<string, string>) {
  const r = Bun.spawnSync([process.execPath, script, ...args], { env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
const calls = (log: string) => readFileSync(log, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

test("starts every run at once with the real HOME and without inherited PI_ and OMP_ variables", () => {
  const { root, omp, home, log } = fixture();
  const queries = writeJson(join(root, "queries.json"), [
    { id: "csv-01", split: "train", request: "Rename the billing CSV columns to snake_case.", expected: { "csv-tools": true } },
    { id: "csv-02", split: "test", request: "Summarize last night's outage for the status page.", expected: { "csv-tools": false } },
  ]);
  const runs = join(root, "runs"), skills = join(root, "project/.omp/skills");
  const r = run([queries, runs, "--skills-dir", skills, "--runs", "2", "--omp", omp], {
    HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), PI_TEST_MARKER: "1", OMP_TEST_MARKER: "1",
    STUB_OMP_LOG: log, STUB_OMP_BARRIER: join(root, "barrier"), STUB_OMP_EXPECT: "4",
  });
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);

  const started = calls(log);
  expect(started).toHaveLength(4);
  for (const call of started) {
    expect(call.env.HOME).toBe(home);
    expect(Object.keys(call.env).filter((key) => key.startsWith("PI_") || key.startsWith("OMP_"))).toEqual([]);
  }

  const commands = readJson(join(runs, "commands.json"));
  expect(commands.map((c: { id: string }) => c.id)).toEqual(["csv-01-run-1", "csv-01-run-2", "csv-02-run-1", "csv-02-run-2"]);
  expect(commands[3]).toEqual({
    id: "csv-02-run-2", query: "csv-02", run: 2, cwd: join(runs, "csv-02-run-2/workspace"), pid: expect.any(Number),
    argv: [omp, "-p", "--model", "anthropic/claude-opus-5-5", "--thinking", "high", "--approval-mode", "yolo",
      "--cwd", join(runs, "csv-02-run-2/workspace"), "--session-dir", join(runs, "csv-02-run-2/session"),
      "--config", join(runs, "csv-02-run-2/trigger.yml"), expect.any(String)],
  });
  for (const c of commands as { query: string; argv: string[] }[]) {
    const prompt = c.argv.at(-1)!;
    expect(prompt).toStartWith(`${c.query === "csv-01" ? "Rename the billing CSV columns to snake_case." : "Summarize last night's outage for the status page."}\n\n`);
    expect(prompt).toContain("Read SKILL.md");
    expect(prompt).toContain("stop before acting on the request");
    expect(prompt).not.toContain("csv-tools");
  }
  expect(commands.map((c: { pid: number }) => c.pid).sort()).toEqual(started.map((c: { pid: number }) => c.pid).sort());
  for (const call of started) expect(call.args).toEqual(commands.find((c: { pid: number }) => c.pid === call.pid).argv.slice(1));
  expect(Bun.YAML.parse(readFileSync(join(runs, "csv-01-run-1/trigger.yml"), "utf8"))).toEqual({ memory: { backend: "off" }, skills: { customDirectories: [skills] } });
});

const call = (id: string, name: string, args: object) => ({ type: "toolCall", id, name, arguments: args });
const said = (...content: object[]) => ({ type: "message", message: { role: "assistant", content } });
const result = (id: string, name: string, isError = false, details?: object) => ({ type: "message", message: { role: "toolResult", toolCallId: id, toolName: name, content: [{ type: "text", text: isError ? "Error: not found" : "---\nname: x\n---" }], isError, ...(details && { details }) } });
const readEvent = (path: string) => ({ op: "read", path, chars: 30, preview: `[Skill file: /skills/${path.slice(8)}/SKILL.md]` });
const text = (t: string) => ({ type: "text", text: t });

test("scores only successful skill reads as loads, with session line evidence", () => {
  const { root, omp, home } = fixture();
  const runs = join(root, "runs"), alpha = join(root, "project/.omp/skills/alpha/SKILL.md");
  const queries = writeJson(join(root, "queries.json"), [
    { id: "alpha-01", split: "train", request: "Import the vendor CSV into the ledger.", expected: { alpha: true, beta: false } },
    { id: "beta-01", split: "train", request: "Draft release notes for v2.3.", expected: { alpha: false, beta: true } },
    { id: "beta-02", split: "test", request: "Write the changelog entry for the cache fix.", expected: { alpha: false, beta: true } },
  ]);
  const transcripts = writeJson(join(root, "transcripts.json"), {
    "Import the vendor CSV": [
      { type: "message", message: { role: "user", content: [text("Available skills: alpha, beta")] } },
      said(text("beta could also apply."), call("c1", "read", { path: "skill://alpha" }), call("c2", "read", { path: "skill://beta" })),
      result("c1", "read"),
      result("c2", "read", true),
    ],
    "Draft release notes": [
      said(call("c1", "read", { path: "../skills/beta/SKILL.md" }), call("c2", "read", { path: alpha }), call("c3", "read", { path: "SKILL.md" })),
      result("c2", "read"),
      result("c1", "read"),
      result("c3", "read"),
    ],
    "Write the changelog entry": [
      said(call("c1", "eval", { language: "js", code: "const s = await tool.read({ path: 'skill://beta' });\nconsole.log(s);" })),
      result("c1", "eval", false, { statusEvents: [readEvent("skill://beta")] }),
      said(call("c2", "eval", { language: "py", code: 'print(tool.read({"path": "skill://alpha"}))' })),
      result("c2", "eval", true, { statusEvents: [{ op: "read", path: "skill://alpha", chars: 15, preview: "Unknown skill", hasError: true, error: "Unknown skill: alpha" }] }),
      said(text("skill://alpha is a near miss, so I stop here.")),
    ],
  });
  const r = run([queries, runs, "--runs", "1", "--omp", omp], {
    HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_TRANSCRIPTS: transcripts, STUB_OMP_BARRIER: join(root, "barrier"), STUB_OMP_EXPECT: "3",
  });
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);

  const session = (id: string) => join(runs, id, "session/session.jsonl");
  expect(readJson(join(runs, "results.json"))).toEqual([
    { id: "alpha-01-run-1", query: "alpha-01", run: 1, exit_code: 0, loaded: [{ skill: "alpha", session: session("alpha-01-run-1"), call_line: 3, result_line: 4 }] },
    { id: "beta-01-run-1", query: "beta-01", run: 1, exit_code: 0, loaded: [
      { skill: "alpha", session: session("beta-01-run-1"), call_line: 2, result_line: 3 },
      { skill: "beta", session: session("beta-01-run-1"), call_line: 2, result_line: 4 },
    ] },
    { id: "beta-02-run-1", query: "beta-02", run: 1, exit_code: 0, loaded: [{ skill: "beta", session: session("beta-02-run-1"), call_line: 2, result_line: 3 }] },
  ]);
  const scores = {
    alpha: { all: { correct: 2, trials: 3 }, train: { correct: 1, trials: 2 }, test: { correct: 1, trials: 1 } },
    beta: { all: { correct: 3, trials: 3 }, train: { correct: 2, trials: 2 }, test: { correct: 1, trials: 1 } },
  };
  expect(readJson(join(runs, "scores.json"))).toEqual(scores);
  expect(JSON.parse(r.stdout)).toEqual(scores);
});

test("credits an eval read only when the eval result records that read as successful", () => {
  const { root, omp, home } = fixture();
  const runs = join(root, "runs");
  const queries = writeJson(join(root, "queries.json"), [{ id: "beta-01", split: "train", request: "Write the changelog entry for the cache fix.", expected: { alpha: false, beta: true, gamma: false } }]);
  const transcripts = writeJson(join(root, "transcripts.json"), {
    "Write the changelog entry": [
      said(call("c1", "eval", { language: "py", code: `print("tool.read({'path': 'skill://alpha'})")` })),
      result("c1", "eval"),
      said(call("c2", "eval", { language: "py", code: 'try:\n    tool.read({"path": "skill://gamma"})\nexcept Exception:\n    pass' })),
      result("c2", "eval", false, { statusEvents: [{ op: "read", error: "Unknown skill: gamma" }] }),
      said(call("c3", "eval", { language: "js", code: "const name = 'beta';\nawait tool.read({ path: `skill://${name}` });" })),
      result("c3", "eval", false, { statusEvents: [readEvent("skill://beta")] }),
    ],
  });
  const r = run([queries, runs, "--runs", "1", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_TRANSCRIPTS: transcripts });
  expect(r.stderr).toBe("");
  expect(r.code).toBe(0);
  expect(readJson(join(runs, "results.json"))[0].loaded).toEqual([{ skill: "beta", session: join(runs, "beta-01-run-1/session/session.jsonl"), call_line: 6, result_line: 7 }]);
});

test("keeps a failed selection-only run in results.json but leaves it out of scores.json", () => {
  const { root, omp, home } = fixture();
  const runs = join(root, "runs");
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } }]);
  const transcripts = writeJson(join(root, "transcripts.json"), { "Rename the CSV columns.": [said(call("c1", "read", { path: "skill://csv-tools" })), result("c1", "read")] });
  const r = run([queries, runs, "--runs", "2", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_TRANSCRIPTS: transcripts, STUB_OMP_FAIL: "csv-01-run-2" });
  expect(r.code).toBe(0);
  expect(readJson(join(runs, "results.json")).map((x: { id: string; exit_code: number }) => [x.id, x.exit_code])).toEqual([["csv-01-run-1", 0], ["csv-01-run-2", 7]]);
  expect(readJson(join(runs, "scores.json"))).toEqual({ "csv-tools": { all: { correct: 1, trials: 1 }, train: { correct: 1, trials: 1 }, test: { correct: 0, trials: 0 } } });

  const full = run([queries, join(root, "full"), "--full", "--runs", "2", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_TRANSCRIPTS: transcripts, STUB_OMP_FAIL: "csv-01-run-2" });
  expect(full.code).toBe(0);
  expect(readJson(join(root, "full/scores.json"))["csv-tools"].all).toEqual({ correct: 2, trials: 2 });
});

test("refuses a run dir that already exists without writing to it or starting omp", () => {
  const { root, omp, home, log } = fixture();
  const runs = join(root, "iteration-1"); mkdirSync(join(runs, "csv-01-run-1/session"), { recursive: true });
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } }]);
  const r = run([queries, runs, "--runs", "1", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_LOG: log });
  expect(r).toEqual({ code: 1, stdout: "", stderr: `[ERROR] Run dir ${runs} already exists; use a new iteration-<N>\n` });
  expect(readdirSync(runs, { recursive: true }).sort()).toEqual(["csv-01-run-1", "csv-01-run-1/session"]);
  expect(existsSync(log)).toBe(false);
});

test("refuses a query id outside lowercase letters, digits, and hyphens, or a duplicate id, before creating anything", () => {
  const { root, omp, home, log } = fixture();
  const runs = join(root, "runs"), env = { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_LOG: log };
  const query = (id: unknown) => ({ id, split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } });
  const cases: [unknown[], string][] = [
    [[query("csv-01"), query("../escape")], 'Query id "../escape" must use only lowercase letters, digits, and hyphens'],
    [[query("CSV_01")], 'Query id "CSV_01" must use only lowercase letters, digits, and hyphens'],
    [[query(7)], "Query id 7 must use only lowercase letters, digits, and hyphens"],
    [[query("csv-01"), query("csv-02"), query("csv-01")], 'Duplicate query id "csv-01"'],
  ];
  for (const [queries, message] of cases) {
    const r = run([writeJson(join(root, "queries.json"), queries), runs, "--runs", "1", "--omp", omp], env);
    expect(r).toEqual({ code: 1, stdout: "", stderr: `[ERROR] ${message}\n` });
  }
  expect(readdirSync(root).sort()).toEqual(["home", "omp", "parent.jsonl", "queries.json"]);
});

test("fails without starting omp when the Session model, thinking level, or session file is missing", () => {
  const { root, omp, home, log } = fixture();
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } }]);
  const env = { HOME: home, STUB_OMP_LOG: log, PI_SESSION_FILE: join(root, "absent.jsonl") };
  const cases: [string[], object[], string][] = [
    [["--session-file", join(root, "parent.jsonl")], [{ type: "session" }, { type: "model_change", model: "anthropic/claude-opus-5-5" }], `Missing prerequisite: no thinking_level_change record in ${join(root, "parent.jsonl")}`],
    [["--session-file", join(root, "parent.jsonl")], [{ type: "session" }, { type: "thinking_level_change", thinkingLevel: "high" }], `Missing prerequisite: no model_change record in ${join(root, "parent.jsonl")}`],
    [[], [], `Missing prerequisite: session file ${join(root, "absent.jsonl")} does not exist; set PI_SESSION_FILE or pass --session-file`],
  ];
  for (const [flags, records, message] of cases) {
    sessionFile(root, records);
    const r = run([queries, join(root, "runs"), "--omp", omp, ...flags], env);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(`[ERROR] ${message}\n`);
  }
  expect(Bun.file(log).size).toBe(0);
});

test("lists a candidate's directory first and hides displaced installs of its name", () => {
  const { root, omp, home } = fixture();
  const candidate = join(root, "workspace/candidate/csv-tools"), skills = join(root, "project/.omp/skills");
  mkdirSync(candidate, { recursive: true }); writeFileSync(join(candidate, "SKILL.md"), "---\nname: csv-tools\ndescription: Candidate.\n---\nBody\n");
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } }]);
  const r = run([queries, join(root, "runs"), "--candidate", candidate, "--skills-dir", skills, "--runs", "1", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords) });
  expect(r.code).toBe(0);
  expect(Bun.YAML.parse(readFileSync(join(root, "runs/csv-01-run-1/trigger.yml"), "utf8"))).toEqual({
    memory: { backend: "off" },
    skills: { customDirectories: [join(root, "workspace/candidate"), skills], ignoredSkills: ["*/csv-tools"] },
  });
});

test("stops with the process error when omp cannot start, and refuses a candidate without SKILL.md", () => {
  const { root, home } = fixture();
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "train", request: "Rename the CSV columns.", expected: { "csv-tools": true } }]);
  const env = { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords) };
  const missing = join(root, "no-such-omp");
  const r = run([queries, join(root, "runs"), "--omp", missing], env);
  expect(r.code).toBe(1);
  expect(r.stderr).toStartWith(`[ERROR] Cannot start ${missing}: `);
  expect(r.stderr).toContain("ENOENT");
  expect(existsSync(join(root, "runs/commands.json"))).toBe(false);

  const empty = join(root, "candidate/csv-tools"); mkdirSync(empty, { recursive: true });
  const c = run([queries, join(root, "runs2"), "--candidate", empty, "--omp", missing], env);
  expect(c).toEqual({ code: 1, stdout: "", stderr: `[ERROR] Candidate ${empty} has no SKILL.md; copy the complete skill to <workspace>/candidate/<name>/\n` });
});

test("a full run sends the raw request and lists loads in order", () => {
  const { root, omp, home, log } = fixture();
  const queries = writeJson(join(root, "queries.json"), [{ id: "csv-01", split: "test", request: "Rename the CSV columns.", expected: { "csv-tools": true, "sql-tools": false } }]);
  const transcripts = writeJson(join(root, "transcripts.json"), {
    "Rename the CSV columns.": [
      said(call("c1", "read", { path: "skill://sql-tools" })), result("c1", "read"),
      said(call("c2", "read", { path: "skill://csv-tools" })), result("c2", "read"),
    ],
  });
  const runs = join(root, "runs");
  const r = run([queries, runs, "--full", "--runs", "1", "--omp", omp], { HOME: home, PI_SESSION_FILE: sessionFile(root, parentRecords), STUB_OMP_LOG: log, STUB_OMP_TRANSCRIPTS: transcripts });
  expect(r.code).toBe(0);
  expect(calls(log)[0].args.at(-1)).toBe("Rename the CSV columns.");
  expect(readJson(join(runs, "results.json"))[0].loaded.map((l: { skill: string }) => l.skill)).toEqual(["sql-tools", "csv-tools"]);
});
