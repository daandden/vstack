// grilling-page's render script run as a process: records in, page out, bad input refused (ADR 0013).

import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "grilling-page", "scripts", "grilling-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "grilling-page-test-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

let dir: string;
let state: string;
let page: string;
let n = 0;
beforeEach(() => {
  dir = join(root, String(n++));
  Bun.spawnSync(["mkdir", "-p", dir]);
  state = join(dir, "topic.jsonl");
  page = join(dir, "topic.html");
});

function run(args: string[], stdin?: string) {
  const r = Bun.spawnSync(["bun", SCRIPT, ...args], { stdin: stdin === undefined ? "ignore" : new TextEncoder().encode(stdin), stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
const lines = (...recs: object[]) => recs.map((r) => JSON.stringify(r)).join("\n");
const append = (...recs: object[]) => run(["append", state, "-"], lines(...recs));

const PAGE = { type: "page", id: "page", title: "Topic" };
const ROUND = { type: "round", id: "s1-r1", session: 1, round: 1, time: "2026-10-09T15:00:00+07:00" };
const option = (label: string, extra: object = {}) => ({ label, does: `${label} does`, gains: [`${label} gain`], costs: [`${label} cost`], ...extra });
const question = (id: string, q: number, extra: object = {}) => ({
  type: "question", id, round: "s1-r1", q, title: `Title ${q}`, plain: `Plain ${q}`, why: "Why", settled: "Nothing",
  options: [option("First", { recommended: "it is first" }), option("Second")], ...extra,
});

test("append renders the page and prints its absolute path", () => {
  const r = append(PAGE, ROUND, question("s1-r1-q1", 1));
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(page);
  const html = readFileSync(page, "utf8");
  expect(html).toContain("<h4>A. First</h4>");
  expect(html).toMatch(/<li class="option" data-recommended><h4>A\. First/);
});

test("answer marks the picked option and shows a line only for a note", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1), question("s1-r1-q2", 2));
  expect(run(["answer", state, "s1-r1-q1=B", "s1-r1-q2=A:only on wifi"]).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const q1 = html.slice(html.indexOf('id="q-s1-r1-q1"'), html.indexOf('id="q-s1-r1-q2"'));
  expect(q1).toMatch(/<li class="option" data-picked><h4>B\. Second/);
  expect(q1).not.toContain('class="answer"');
  expect(html).toContain("Your note</span><span>only on wifi");
});

test("a later record with the same id replaces the earlier one", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  append({ ...question("s1-r1-q1", 1), title: "Changed title" });
  const html = readFileSync(page, "utf8");
  expect(html).toContain("Changed title");
  expect(html).not.toContain("Title 1");
  expect(readFileSync(state, "utf8").trim().split("\n")).toHaveLength(4);
});

test("a bad record writes nothing and names the problem", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  const before = readFileSync(state, "utf8");
  const r = append(question("s1-r1-q2", 2, { options: [option("A"), { ...option("B"), costs: [] }] }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("option B: costs must be a list of one or more non-empty strings");
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).not.toContain("Title 2");
});

test("an answer for an option that does not exist is refused", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  const r = run(["answer", state, "s1-r1-q1=C"]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("has no option C");
});

test("preview HTML with a script is refused, and preview CSS is scoped to the preview", () => {
  append(PAGE, ROUND);
  const bad = append(question("s1-r1-q1", 1, { options: [option("A", { preview: { html: "<script>x()</script>" } }), option("B")] }));
  expect(bad.code).toBe(1);
  const ok = append(question("s1-r1-q1", 1, { options: [option("A", { preview: { html: '<p class="x">hi</p>', css: ".x, p { color: red; }" } }), option("B")] }));
  expect(ok.code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain("#q-s1-r1-q1-a .x, #q-s1-r1-q1-a p { color: red; }");
});

test.each([
  ["an event handler after a slash", "<svg/onload=alert(1)>"],
  ["an event handler in upper case", '<img src=x ONERROR="alert(1)">'],
  ["a javascript URL hidden by an entity", '<a href="&#106;avascript:alert(1)">x</a>'],
  ["a javascript URL split by a tab entity", '<a href="java&Tab;script:alert(1)">x</a>'],
  ["an SVG animation that sets a link", '<svg><a><set attributeName="href" to="javascript:alert(1)"/><text>x</text></a></svg>'],
  ["a script hidden after a closing tag", "</div></li></ol><script>alert(1)</script>"],
])("preview HTML with %s is refused", (_, html) => {
  append(PAGE, ROUND);
  const r = append(question("s1-r1-q1", 1, { options: [option("A", { preview: { html } }), option("B")] }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("html is not safe");
  expect(existsSync(page) ? readFileSync(page, "utf8") : "").not.toContain("alert(1)");
});

test("an SVG file with an event handler is refused, and one with only styles is kept", () => {
  append(PAGE, ROUND);
  const evil = join(dir, "evil.svg");
  writeFileSync(evil, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>');
  const bad = append(question("s1-r1-q1", 1, { visual: { svg: evil } }));
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("the onload attribute on <svg> is not allowed");
  const good = join(dir, "good.svg");
  writeFileSync(good, '<svg xmlns="http://www.w3.org/2000/svg"><style>.n { fill: red; }</style><rect class="n" width="1" height="1"/></svg>');
  expect(append(question("s1-r1-q1", 1, { visual: { svg: good } })).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('<rect class="n"');
});

test("user text is escaped", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1, { title: "<img src=x onerror=alert(1)>" }));
  expect(readFileSync(page, "utf8")).toContain("&lt;img src=x onerror=alert(1)&gt;");
});

test("a close must cover every question asked before it, and later questions do not break it", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1), question("s1-r1-q2", 2));
  const missing = append({ type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One." }] });
  expect(missing.code).toBe(1);
  expect(missing.stderr).toContain("Q2 has no decision");
  const close = { type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }, { question: "s1-r1-q2", text: "Two is true." }] };
  expect(append(close).code).toBe(0);
  expect(append({ type: "round", id: "s1-r2", session: 1, round: 2, time: "2026-10-09T16:00:00+07:00" }, { ...question("s1-r2-q3", 3), round: "s1-r2" }).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('<li><a href="#q-s1-r1-q2">Q2</a>: Two is true.</li>');
});

test("a page written by hand, with no state file, is not continued", () => {
  writeFileSync(page, "<html></html>");
  const r = append(PAGE);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("was not made by grilling-page.ts");
  expect(existsSync(state)).toBe(false);
});
