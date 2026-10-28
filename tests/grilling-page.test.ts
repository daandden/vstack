// grilling-page's render script run as a process: records in, page out, bad input refused (ADR 0013).

import { afterAll, beforeEach, expect, test } from "bun:test";
import { chmodSync, closeSync, constants, existsSync, lstatSync, mkdtempSync, openSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
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
const needsFor = (extra: Record<string, any>) => {
  const visuals = [...[extra.visual ?? []].flat(), ...(extra.options ?? []).map((o: any) => o.preview).filter(Boolean)];
  const kinds = [...new Set(visuals.map((v: any) => v.kind).filter(Boolean))];
  return [{ need: "Why the decision matters", kind: "prose" }, ...kinds.map((kind) => ({ need: `What the ${kind} shows`, kind }))];
};
const question = (id: string, q: number, extra: Record<string, any> = {}) => ({
  type: "question", id, round: "s1-r1", q, title: `Title ${q}?`, description: `Description ${q}`, needs: needsFor(extra),
  options: [option("A. First", { recommended: "it is first" }), option("B. Second")], ...extra,
});
const STAR = '<span class="star" aria-hidden="true">*</span><span class="sr-only"> (recommended)</span>';

test("append renders the page and prints its absolute path", () => {
  const r = append(PAGE, ROUND, question("s1-r1-q1", 1));
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(page);
  const html = readFileSync(page, "utf8");
  expect(html).toContain(`<li class="option" data-recommended><h4>A. First${STAR}</h4>`);
  expect(html).toContain('<li class="option"><h4>B. Second</h4>');
});

test("the description renders paragraphs and bullet lists", () => {
  const description = "First line\nsame paragraph.\n\n- one\n- `two`\n\nLast.";
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1, { description })).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('<div class="description"><p>First line same paragraph.</p><ul class="bullets"><li>one</li><li><code>two</code></li></ul><p>Last.</p></div>');
});

const TODAY = [{ text: "A btw answer reaches only you.", source: "extensions/picker-btw.md:3" }, { text: "The grill records Other text as the answer.", source: "plugin/skills/grilling/SKILL.md:27" }];
const TERMS = [{ term: "Picker btw", text: "A side question asked inside the picker while an ask waits." }];
/** The HTML of one question, from its title to its options. */
const questionBody = (html: string, id: string) => {
  const start = html.indexOf(`id="q-${id}"`);
  return html.slice(start, html.indexOf('<ol class="options">', start));
};
const block = (html: string, cls: string) => {
  const start = html.indexOf(`class="${cls}"`);
  return start < 0 ? undefined : html.slice(start, html.indexOf("</div>", start));
};

test("Today and Term notes render as their own blocks under the description", () => {
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1, { today: TODAY, terms: TERMS })).code).toBe(0);
  const body = questionBody(readFileSync(page, "utf8"), "s1-r1-q1");
  const today = block(body, "today")!;
  const terms = block(body, "terms")!;
  expect(today).toMatch(/A btw answer reaches only you\.[\s\S]*extensions\/picker-btw\.md:3[\s\S]*The grill records Other text as the answer\.[\s\S]*plugin\/skills\/grilling\/SKILL\.md:27/);
  expect(terms).toMatch(/Picker btw[\s\S]*A side question asked inside the picker while an ask waits\./);
  expect(body.indexOf('class="today"')).toBeGreaterThan(body.indexOf("Description 1"));
  expect(body.indexOf('class="terms"')).toBeGreaterThan(body.indexOf("Description 1"));
});

test("a state file from before Today and Term notes renders without empty blocks", () => {
  writeFileSync(state, `${lines(PAGE, ROUND, question("s1-r1-q1", 1))}\n`);
  expect(run(["render", state]).code).toBe(0);
  const body = questionBody(readFileSync(page, "utf8"), "s1-r1-q1");
  expect(body).toContain("Description 1");
  for (const cls of ["today", "terms"]) expect(block(body, cls)).toBeUndefined();
});

test.each([
  ["a Today fact with no source", { today: [{ text: "A fact." }] }, "today 1: source"],
  ["a Today fact with an empty text", { today: [TODAY[0], { text: " ", source: "a.ts:1" }] }, "today 2: text"],
  ["a Today fact that is not an object", { today: ["A fact. a.ts:1"] }, "today 1: must be an object"],
  ["a term with no text", { terms: [{ term: "Picker btw" }] }, "terms 1: text"],
  ["an empty Today list", { today: [] }, "today must"],
  ["Term notes that are not a list", { terms: { term: "Picker btw", text: "A side question." } }, "terms must"],
])("%s is refused, names the record, and writes nothing", (_, extra, problem) => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(question("s1-r1-q2", 2, extra));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`question s1-r1-q2: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test("markup in Today facts and Term notes is escaped, and code and links are kept", () => {
  const marked = (s: string) => `${s} <img src=x onerror=alert(1)> \`${s}-code\` [${s}-link](https://example.com/${s})`;
  const fields = ["fact", "source", "term", "note"];
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1, { today: [{ text: marked("fact"), source: marked("source") }], terms: [{ term: marked("term"), text: marked("note") }] })).code).toBe(0);
  const body = questionBody(readFileSync(page, "utf8"), "s1-r1-q1");
  expect(body).not.toContain("<img");
  for (const f of fields) {
    expect(body).toContain(`${f} &lt;img src=x onerror=alert(1)&gt;`);
    expect(body).toContain(`<code>${f}-code</code>`);
    expect(body).toContain(`<a href="https://example.com/${f}">${f}-link</a>`);
  }
});

test("a question from before the description field is refused with the fix", () => {
  append(PAGE, ROUND);
  const { description, ...old } = question("s1-r1-q1", 1);
  const r = append({ ...old, plain: "Plain", why: "Why", settled: "Nothing" });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("has plain, why, and settled from an older page; write one description instead and start a new page");
});

test("an option label must start with its own letter", () => {
  append(PAGE, ROUND);
  const r = append(question("s1-r1-q1", 1, { options: [option("A. First"), option("First again")] }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain('option B: label must start with "B. ", the same text as the ask label');
});

test("a question with one option renders it and takes its answer", () => {
  const r = append(PAGE, ROUND, question("s1-r1-q1", 1, { options: [option("A. Only candidate", { recommended: "it is the only one" })] }));
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(page);
  expect(readFileSync(page, "utf8")).toContain(`<li class="option" data-recommended><h4>A. Only candidate${STAR}</h4>`);
  expect(run(["answer", state, "s1-r1-q1=A"]).code).toBe(0);
  expect(readFileSync(page, "utf8")).toMatch(/<li class="option" data-recommended data-picked><h4>A\. Only candidate/);
  expect(run(["answer", state, "s1-r1-q1=B"]).stderr).toContain("question s1-r1-q1 has no option B");
});

test("a question with no options is refused and writes nothing", () => {
  append(PAGE, ROUND);
  const before = readFileSync(state, "utf8");
  const r = append(question("s1-r1-q1", 1, { options: [] }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("question s1-r1-q1: options must list one or more options");
  expect(readFileSync(state, "utf8")).toBe(before);
});

const refusedNeeds = (q2: object, missing: string) => {
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1)).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(q2);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("question s1-r1-q2: ");
  expect(r.stderr).toContain(missing);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
};

test("a new question with no reader needs is refused and writes nothing", () => {
  const { needs: _, ...bare } = question("s1-r1-q2", 2);
  refusedNeeds(bare, "needs");
});

test("a need whose Visual kind no visual on the question shows is refused", () => {
  const needs = [{ need: "Where the door sits on the floor plan", kind: "source-view" }, { need: "How the flow runs today", kind: "context-diagram" }];
  refusedNeeds(question("s1-r1-q2", 2, { needs, visual: { text: "flow", kind: "context-diagram" } }), "source-view");
});

test.each([
  ["no reader needs", { needs: undefined }, "needs"],
  ["a source-view need with no visual", { needs: [{ need: "Where the door sits on the floor plan", kind: "source-view" }] }, "source-view"],
])("append refuses a question with %s before a valid same-id replacement and leaves all flow artifacts unchanged", (_, extra, problem) => {
  const folder = flowFolder();
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1)).code).toBe(0);
  const figure = join(folder, "figures", "existing.svg");
  writeFileSync(figure, '<svg xmlns="http://www.w3.org/2000/svg"><text>Existing figure</text></svg>\n');
  const files = [state, page, join(folder, "flow.json"), figure];
  const before = files.map((file) => readFileSync(file, "utf8"));
  const entriesBefore = readdirSync(folder);
  const figuresBefore = readdirSync(join(folder, "figures"));
  const r = append(
    { ...FLOW, tickets: ["new-ticket"] },
    question("s1-r1-q2", 2, extra),
    question("s1-r1-q2", 2),
  );
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("question s1-r1-q2: ");
  expect(r.stderr).toContain(problem);
  expect(files.map((file) => readFileSync(file, "utf8"))).toEqual(before);
  expect(readdirSync(folder)).toEqual(entriesBefore);
  expect(readdirSync(join(folder, "figures"))).toEqual(figuresBefore);
});

test("a visual or preview whose Visual kind no need names is refused", () => {
  const needs = [{ need: "Why the decision matters", kind: "prose" }];
  refusedNeeds(question("s1-r1-q2", 2, { needs, visual: { text: "flow", kind: "context-diagram" } }), "context-diagram");
  refusedNeeds(question("s1-r1-q2", 2, { needs, options: [option("A. One", { preview: { text: "screen", kind: "option-preview" } }), option("B. Two")] }), "option-preview");
});

test("a question whose only needs are prose is accepted with no visual", () => {
  const needs = [{ need: "Which trade-off the team accepts", kind: "prose" }];
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1, { needs })).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('id="q-s1-r1-q1"');
});

test("a stored question with no needs still renders after a later append and after answer", () => {
  const { needs: _, ...stored } = question("s1-r1-q1", 1, { visual: { text: "old figure" } });
  writeFileSync(state, `${lines(PAGE, ROUND, stored)}\n`);
  expect(append(question("s1-r1-q2", 2)).code).toBe(0);
  expect(run(["answer", state, "s1-r1-q1=A"]).code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(questionBody(html, "s1-r1-q1")).toContain("old figure");
  expect(block(questionBody(html, "s1-r1-q1"), "needs")).toBeUndefined();
  expect(html).toContain('id="q-s1-r1-q2"');
});

test("the page shows each need with its Visual kind after the description", () => {
  const needs = [{ need: "Where the door sits on the floor plan", kind: "source-view" }, { need: "Which trade-off the team accepts", kind: "prose" }];
  expect(append(PAGE, ROUND, question("s1-r1-q1", 1, { needs, visual: { text: "floor plan", kind: "source-view" } })).code).toBe(0);
  const body = questionBody(readFileSync(page, "utf8"), "s1-r1-q1");
  const shown = block(body, "needs")!;
  expect(shown).toMatch(/Where the door sits on the floor plan[\s\S]*Source view[\s\S]*Which trade-off the team accepts[\s\S]*Prose/);
  expect(body.indexOf('class="needs"')).toBeGreaterThan(body.indexOf("Description 1"));
});

test("answer marks the picked option and shows a line only for a note", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1), question("s1-r1-q2", 2));
  expect(run(["answer", state, "s1-r1-q1=B", "s1-r1-q2=A:only on wifi"]).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const q1 = html.slice(html.indexOf('id="q-s1-r1-q1"'), html.indexOf('id="q-s1-r1-q2"'));
  expect(q1).toMatch(/<li class="option" data-picked><h4>B\. Second<span class="sr-only"> \(your answer\)/);
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
  const r = append(question("s1-r1-q2", 2, { options: [option("A. One"), { ...option("B. Two"), costs: [] }] }));
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
  const bad = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html: "<script>x()</script>", kind: "option-preview" } }), option("B. Two")] }));
  expect(bad.code).toBe(1);
  const ok = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html: '<p class="x">hi</p>', css: ".x, p { color: red; }", kind: "option-preview" } }), option("B. Two")] }));
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
  const r = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html, kind: "option-preview" } }), option("B. Two")] }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("html is not safe");
  expect(existsSync(page) ? readFileSync(page, "utf8") : "").not.toContain("alert(1)");
});

test("an SVG file with an event handler is refused, and one with only styles is kept", () => {
  append(PAGE, ROUND);
  const evil = join(dir, "evil.svg");
  writeFileSync(evil, '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="1" height="1"/></svg>');
  const bad = append(question("s1-r1-q1", 1, { visual: { svg: evil, kind: "context-diagram" } }));
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("the onload attribute on <svg> is not allowed");
  const good = join(dir, "good.svg");
  writeFileSync(good, '<svg xmlns="http://www.w3.org/2000/svg"><style>.n { fill: red; }</style><rect class="n" width="1" height="1"/></svg>');
  expect(append(question("s1-r1-q1", 1, { visual: { svg: good, kind: "context-diagram" } })).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('<rect class="n"');
});

test.each([
  ["a Google Fonts import", "https://fonts.googleapis.com/css2?family=IosevkaTerm+Nerd+Font+Mono"],
  ["an import from another host", "https://example.com/figure.css"],
])("an SVG file whose styles hold %s is refused", (_, url) => {
  append(PAGE, ROUND);
  const svg = join(dir, "import.svg");
  writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url('${url}');</style><rect width="1" height="1"/></svg>`);
  const r = append(question("s1-r1-q1", 1, { visual: { svg, kind: "context-diagram" } }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`${svg} is not safe: its styles import a file`);
  expect(existsSync(page) ? readFileSync(page, "utf8") : "").not.toContain(url);
});

test("a question with a list of visuals renders each one in order, and a bad entry is refused", () => {
  append(PAGE, ROUND);
  const context = join(dir, "context.svg");
  writeFileSync(context, '<svg xmlns="http://www.w3.org/2000/svg"><rect id="context-figure" width="1" height="1"/></svg>');
  const bad = append(question("s1-r1-q1", 1, { visual: [{ svg: context, kind: "context-diagram" }, { html: "<script>x()</script>", kind: "comparison-table" }] }));
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("visual 2: html is not safe");
  expect(append(question("s1-r1-q1", 1, { visual: [{ svg: context, kind: "context-diagram" }, { text: "options figure", kind: "option-diagram" }] })).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const first = html.indexOf('id="context-figure"');
  const second = html.indexOf("options figure");
  expect(first).toBeGreaterThan(-1);
  expect(second).toBeGreaterThan(first);
  expect(second).toBeLessThan(html.indexOf('<ol class="options">'));
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

test("every keyboard stop has its link in the Jump row, and a reopened summary is no longer a stop", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  const close = (id: string) => ({ type: "close", id, session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }] });
  append(close("c1"));
  append(close("c2"));
  const html = readFileSync(page, "utf8");
  const stops = [...html.matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  const links = [...html.matchAll(/data-for="([^"]+)"/g)].map((m) => m[1]);
  expect(stops).toEqual(["q-s1-r1-q1", "close-c2"]);
  expect(links).toEqual(stops);
});

const summary = (html: string) => html.match(/<section class="summary"[\s\S]*?<\/section>/)![0];

test("an older close with gate, answer, and note renders its decisions and no Closing gate row", () => {
  const close = { type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }], gate: true, answer: "Shared understanding", note: "Go on." };
  writeFileSync(state, `${lines(PAGE, ROUND, question("s1-r1-q1", 1), close)}\n`);
  expect(run(["render", state]).code).toBe(0);
  const html = summary(readFileSync(page, "utf8"));
  expect(html).toContain("One is true.");
  expect(html).not.toContain("Closing gate");
  expect(html).not.toContain("Shared understanding");
  expect(html).not.toContain("Go on.");
});

const FLOW = { type: "flow", id: "flow", slug: "page-per-flow", key: "page-per-flow", state: "open" };
function flowFolder(key = "page-per-flow") {
  const folder = join(dir, `vstack-${key}`);
  Bun.spawnSync(["mkdir", "-p", folder]);
  state = join(folder, "page.jsonl");
  page = join(folder, "page.html");
  return folder;
}

test.each([
  ["no slug", { slug: undefined }, "flow flow: slug must be"],
  ["a state that is not open or closed", { state: "paused" }, "flow flow: state must be open or closed"],
  ["tickets that are not a list", { tickets: "160" }, "flow flow: tickets must be a list"],
  ["a key that is not the folder's key", { key: "151" }, "flow flow: key 151 does not match the folder vstack-page-per-flow"],
])("append refuses a flow record with %s, names it, and writes nothing", (_, extra, problem) => {
  const folder = flowFolder();
  expect(append(PAGE).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append({ ...FLOW, ...extra });
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(problem);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(existsSync(join(folder, "flow.json"))).toBe(false);
});

const flowJson = (folder: string) => JSON.parse(readFileSync(join(folder, "flow.json"), "utf8"));

test("every command writes flow.json from the flow record, and a later flow record with the same id replaces it", () => {
  const folder = flowFolder();
  const flow = { ...FLOW, spec: "151", tickets: ["160", "161"], branch: "feat/flow-grilling-page", runs: ["spec151-r1"] };
  const r = append(PAGE, flow, ROUND, question("s1-r1-q1", 1));
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(page);
  expect(flowJson(folder)).toEqual({ id: "flow", slug: "page-per-flow", key: "page-per-flow", state: "open", spec: "151", tickets: ["160", "161"], branch: "feat/flow-grilling-page", runs: ["spec151-r1"] });
  expect(existsSync(join(folder, "figures"))).toBe(true);

  expect(append({ ...flow, tickets: ["160", "161", "162"], state: "closed" }).code).toBe(0);
  expect(flowJson(folder)).toMatchObject({ tickets: ["160", "161", "162"], state: "closed", slug: "page-per-flow" });

  rmSync(join(folder, "flow.json"));
  expect(run(["answer", state, "s1-r1-q1=A"]).code).toBe(0);
  expect(flowJson(folder).state).toBe("closed");
  rmSync(join(folder, "flow.json"));
  expect(run(["render", state]).code).toBe(0);
  expect(flowJson(folder).tickets).toEqual(["160", "161", "162"]);

  const second = append({ ...FLOW, id: "flow-2" });
  expect(second.code).toBe(1);
  expect(second.stderr).toContain("flow flow-2: a page has one flow record, and flow flow is already on it");
});

test("a page with no flow record writes no flow.json", () => {
  expect(append(PAGE).code).toBe(0);
  expect(existsSync(join(dir, "flow.json"))).toBe(false);
  expect(existsSync(join(dir, "figures"))).toBe(false);
});

test("rename moves the flow folder, keeps the old key in flow.json, and prints the new page path", () => {
  const old = flowFolder();
  append(PAGE, { ...FLOW, spec: "151" }, ROUND, question("s1-r1-q1", 1));
  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(0);
  const moved = join(dir, "vstack-151");
  expect(r.stdout.trim()).toBe(join(moved, "page.html"));
  expect(existsSync(old)).toBe(false);
  expect(flowJson(moved)).toMatchObject({ slug: "page-per-flow", key: "151", old_keys: ["page-per-flow"], spec: "151" });
  expect(readFileSync(join(moved, "page.html"), "utf8")).toContain("Title 1?");
  expect(run(["append", join(moved, "page.jsonl"), "-"], lines(question("s1-r1-q2", 2))).code).toBe(0);
  expect(readFileSync(join(moved, "page.html"), "utf8")).toContain("Title 2?");
  expect(run(["rename", join(moved, "page.jsonl"), "151-b"]).code).toBe(0);
  expect(flowJson(join(dir, "vstack-151-b")).old_keys).toEqual(["page-per-flow", "151"]);
});

test("rename normalizes tracker keys while retaining original issue identities", () => {
  const old = flowFolder();
  const flow = { ...FLOW, spec: "MY_PROJ-12", tickets: ["MY_PROJ-13"] };
  expect(append(PAGE, flow, ROUND, question("s1-r1-q1", 1)).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const moved = join(dir, "vstack-my-proj-12");
  const r = run(["rename", state, "MY_PROJ-12"]);
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(join(moved, "page.html"));
  expect(existsSync(old)).toBe(false);
  expect(flowJson(moved)).toMatchObject({
    slug: "page-per-flow", key: "my-proj-12", old_keys: ["page-per-flow"],
    spec: "MY_PROJ-12", tickets: ["MY_PROJ-13"],
  });
  const movedState = join(moved, "page.jsonl");
  expect(readFileSync(movedState, "utf8").startsWith(before)).toBe(true);
  const files = ["page.jsonl", "page.html", "flow.json"];
  const unchanged = files.map((f) => readFileSync(join(moved, f), "utf8"));
  expect(run(["rename", movedState, "My_Proj-12"]).code).toBe(0);
  expect(files.map((f) => readFileSync(join(moved, f), "utf8"))).toEqual(unchanged);
});

test("rename refuses when the target folder exists, and writes nothing", () => {
  const old = flowFolder();
  append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1));
  const before = readFileSync(state, "utf8");
  const target = join(dir, "vstack-151");
  Bun.spawnSync(["mkdir", "-p", target]);
  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`${target} already exists`);
  expect(readFileSync(join(old, "page.jsonl"), "utf8")).toBe(before);
  expect(flowJson(old).key).toBe("page-per-flow");
  expect(readdirSync(target)).toEqual([]);
});

test("rename to the current key succeeds, prints the page path, and writes nothing", () => {
  const folder = flowFolder();
  append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1));
  expect(run(["rename", state, "151"]).code).toBe(0);
  const moved = join(dir, "vstack-151");
  const movedState = join(moved, "page.jsonl");
  writeFileSync(join(moved, "page.html"), "<p>older template</p>\n");
  writeFileSync(join(moved, "flow.json"), '{"older": "format"}\n');
  const files = ["page.jsonl", "page.html", "flow.json"];
  const before = files.map((f) => readFileSync(join(moved, f), "utf8"));
  const r = run(["rename", movedState, "151"]);
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(join(moved, "page.html"));
  expect(files.map((f) => readFileSync(join(moved, f), "utf8"))).toEqual(before);
  expect(existsSync(folder)).toBe(false);
  expect(run(["render", movedState]).code).toBe(0);
  expect(flowJson(moved)).toMatchObject({ key: "151", old_keys: ["page-per-flow"] });
});

test("rename refuses a page with no flow record, and a key that is not lowercase letters, digits, and hyphens", () => {
  flowFolder();
  append(PAGE);
  const none = run(["rename", state, "151"]);
  expect(none.code).toBe(1);
  expect(none.stderr).toContain("rename needs a flow record");
  expect(existsSync(join(dir, "vstack-151"))).toBe(false);
  expect(run(["rename", state, "Spec 151"]).code).toBe(2);
});

const figure = (id: string) => `<svg xmlns="http://www.w3.org/2000/svg"><rect id="${id}" width="1" height="1"/></svg>`;

test("rename keeps an SVG stored relative and one stored as an absolute path into the old folder, and later commands show both", () => {
  const old = flowFolder();
  Bun.spawnSync(["mkdir", "-p", join(old, "figures")]);
  writeFileSync(join(old, "figures", "context.svg"), figure("relative-figure"));
  writeFileSync(join(old, "figures", "options.svg"), figure("absolute-figure"));
  const q2 = question("s1-r1-q2", 2, { options: [option("A. First", { preview: { svg: join(old, "figures", "options.svg"), kind: "option-preview" } }), option("B. Second")] });
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: "figures/context.svg", kind: "context-diagram" } }), q2).code).toBe(0);

  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(0);
  const moved = join(dir, "vstack-151");
  expect(r.stdout.trim()).toBe(join(moved, "page.html"));
  expect(existsSync(old)).toBe(false);
  const newState = join(moved, "page.jsonl");
  expect(run(["append", newState, "-"], lines(question("s1-r1-q3", 3))).code).toBe(0);
  const render = run(["render", newState]);
  expect(render.code).toBe(0);
  expect(render.stdout.trim()).toBe(join(moved, "page.html"));
  const html = readFileSync(join(moved, "page.html"), "utf8");
  expect(html).toContain('id="relative-figure"');
  expect(html).toContain('id="absolute-figure"');
  expect(html).toContain("Title 3?");
});

test("a rename that would leave an SVG unresolved exits 1 and leaves the old folder unchanged", () => {
  const old = flowFolder();
  Bun.spawnSync(["mkdir", "-p", join(old, "figures")]);
  writeFileSync(join(old, "figures", "context.svg"), figure("context-figure"));
  const roundabout = "../vstack-page-per-flow/figures/context.svg";
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: roundabout, kind: "context-diagram" } })).code).toBe(0);
  const files = Object.fromEntries(["page.jsonl", "page.html", "flow.json"].map((f) => [f, readFileSync(join(old, f), "utf8")]));

  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`question s1-r1-q1: ${roundabout} would not resolve after the move`);
  expect(existsSync(join(dir, "vstack-151"))).toBe(false);
  for (const [f, text] of Object.entries(files)) expect(readFileSync(join(old, f), "utf8")).toBe(text);
});

const RENDER = join(import.meta.dir, "..", "plugin", "skills", "vstack-figures", "scripts", "render.ts");
test.each([
  ["flowchart", "flowchart TD\n  Cart([Cart]) --> Stock{In stock?}\n  Stock -- Yes --> Pay[Pay]\n  Stock -- No --> Split[Split]\n", "Stock"],
  ["sequence", "sequenceDiagram\n  participant Shop\n  participant Bank\n  Shop->>Bank: Authorize order #35;12\n  Bank--)Shop: Approved\n", "Bank"],
  ["er", "erDiagram\n  Order ||--o{ OrderLine : holds\n  Order {\n    string id\n  }\n", "Order"],
])("a %s figure from the render script goes on the page through { svg: figures/<file> }", (type, mermaid, focus) => {
  const folder = flowFolder();
  const rendered = Bun.spawnSync(["bun", RENDER, "-", join(folder, "figures", `${type}.svg`), "--focus", focus], { stdin: new TextEncoder().encode(mermaid), stdout: "pipe", stderr: "pipe" });
  expect(rendered.stderr.toString()).toBe("");
  expect(rendered.exitCode).toBe(0);
  const r = append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: `figures/${type}.svg`, kind: "context-diagram" } }));
  expect(r.code).toBe(0);
  const html = readFileSync(page, "utf8");
  const scope = new RegExp(`class="pele pele-${type} (pele-f[0-9a-f]{8})"`).exec(html)?.[1];
  expect(scope).toBeDefined();
  expect(html).toContain("--pele-bg: #1e1e2e;");
  expect(html).toContain(`.${scope} [data-id="${focus}"] text { fill: #cba6f7; }`);
});

/** Every file and symlink under `folder`, with its bytes or link target. */
const tree = (folder: string) => readdirSync(folder, { recursive: true }).map(String).sort().map((f) => {
  const path = join(folder, f);
  return lstatSync(path).isSymbolicLink() ? [f, `-> ${readlinkSync(path)}`] : lstatSync(path).isDirectory() ? [f, "dir"] : [f, readFileSync(path, "utf8")];
});

test.each([
  ["an absolute path to a symlink in the folder whose target is outside it", "absolute"],
  ["a relative path to a symlink whose target is the old folder's absolute path", "relative"],
])("rename refuses %s, writes nothing, and leaves a flow that renders", (_, kind) => {
  const old = flowFolder();
  Bun.spawnSync(["mkdir", "-p", join(old, "figures")]);
  writeFileSync(join(old, "figures", "real.svg"), figure("real-figure"));
  const external = join(dir, "external.svg");
  writeFileSync(external, figure("external-figure"));
  const link = join(old, "figures", "link.svg");
  symlinkSync(kind === "absolute" ? external : join(old, "figures", "real.svg"), link);
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: kind === "absolute" ? link : "figures/link.svg", kind: "context-diagram" } })).code).toBe(0);
  const before = tree(old);

  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(r.stderr).toContain("svg file");
  expect(r.stderr).toContain("does not exist after the move");
  expect(existsSync(join(dir, "vstack-151"))).toBe(false);
  expect(tree(old)).toEqual(before);
  const render = run(["render", state]);
  expect(render.code).toBe(0);
  expect(render.stdout.trim()).toBe(page);
  expect(flowJson(old).key).toBe("page-per-flow");
});

test("a rename whose state write fails moves the folder back, and the flow still renders under its old key", () => {
  const old = flowFolder();
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1)).code).toBe(0);
  chmodSync(state, 0o444);
  const before = tree(old);

  const r = run(["rename", state, "151"]);
  if (existsSync(state)) chmodSync(state, 0o644);
  expect(r.code).toBe(1);
  expect(r.stdout).toBe("");
  expect(existsSync(join(dir, "vstack-151"))).toBe(false);
  expect(tree(old)).toEqual(before);
  const render = run(["render", state]);
  expect(render.code).toBe(0);
  expect(render.stdout.trim()).toBe(page);
  expect(flowJson(old)).toMatchObject({ key: "page-per-flow" });
});

const stage = (id: string, extra: object = {}) => ({ type: "stage", id, skill: "grill-with-docs", state: "in-progress", ...extra });

test.each([
  ["a state that is not a Stage state", { state: "done" }, "state must be not-started, in-progress, or finished"],
  ["no skill", { skill: undefined }, "skill must be a non-empty string"],
])("a stage with %s is refused, names the record, and writes nothing", (_, extra, problem) => {
  expect(append(PAGE).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(stage("grill", extra));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`stage grill: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test("a round that names an unknown stage is refused, names the round, and writes nothing", () => {
  expect(append(PAGE, stage("grill")).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append({ ...ROUND, stage: "spec" }, question("s1-r1-q1", 1));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("round s1-r1: stage spec does not exist");
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).not.toContain("Title 1?");
});

const tabs = (html: string) => [...html.matchAll(/<a role="tab"[^>]*aria-selected="(true|false)"[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[2], m[3].replace(/<[^>]+>/g, ""), m[1] === "true"]);
const panel = (html: string, id: string) => {
  const head = `id="${id}" role="tabpanel"`;
  const start = html.indexOf(head);
  if (start < 0) return "";
  const next = html.indexOf('role="tabpanel"', start + head.length);
  return html.slice(start, next < 0 ? html.indexOf("</main>") : next);
};
const SPEC_ROUND = { type: "round", id: "s2-r1", session: 2, round: 2, stage: "spec", time: "2026-10-10T09:00:00+07:00" };

test("the page opens on an Overview tab, then has one tab per Stage in append order, each with its own rounds", () => {
  const r = append(PAGE, stage("grill"), stage("spec", { skill: "to-spec", state: "not-started" }), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Spec question?" });
  expect(r.code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-grill", "Grill", false], ["stage-spec", "Spec", false]]);
  expect(html.indexOf('id="overview" role="tabpanel"')).toBeLessThan(html.indexOf('id="stage-grill" role="tabpanel"'));
  expect(panel(html, "stage-grill")).toContain('id="q-s1-r1-q1"');
  expect(panel(html, "stage-grill")).not.toContain("Spec question?");
  expect(panel(html, "stage-spec")).toContain('id="q-s2-r1-q1"');
});

const overviewItem = (html: string, id: string) => panel(html, "overview").split('<li class="stage"').find((p) => p.includes(`href="#stage-${id}"`)) ?? "";

const overviewLine = (id: string, q: number, title: string, shown: string) => `<a href="#q-${id}">Q${q}</a> ${title} <span class="${shown === "Open" ? "open" : "pick"}">${shown}</span>`;

test("the Overview lists each Stage's state and every question with your answer or Open, and no summary text", () => {
  expect(
    append(
      PAGE,
      stage("grill", { state: "finished" }),
      stage("spec", { skill: "to-spec" }),
      stage("tickets", { skill: "to-tickets", state: "not-started" }),
      { ...ROUND, stage: "grill" },
      question("s1-r1-q1", 1),
      question("s1-r1-q2", 2),
      SPEC_ROUND,
      { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Answered spec question?" },
      { ...question("s2-r1-q2", 2), round: "s2-r1", title: "Open spec question?" },
      { ...question("s2-r1-q3", 3), round: "s2-r1", title: "Timed-out spec question?" },
    ).code,
  ).toBe(0);
  expect(run(["answer", state, "s1-r1-q1=A", "s1-r1-q2=other:Neither, use a third way", "s2-r1-q1=A,B", "s2-r1-q3=unanswered"]).code).toBe(0);
  expect(append({ type: "close", id: "c1", stage: "grill", decisions: [{ question: "s1-r1-q1", text: "One is true." }, { question: "s1-r1-q2", text: "Two is true." }] }).code).toBe(0);
  const html = readFileSync(page, "utf8");

  const ids = [...panel(html, "overview").matchAll(/<li class="stage"[\s\S]*?href="#stage-([^"]+)"/g)].map((m) => m[1]);
  expect(ids).toEqual(["grill", "spec", "tickets"]);

  const grill = overviewItem(html, "grill");
  expect(grill).toContain('data-state="finished"');
  expect(grill).toContain("Finished");
  expect(grill).toContain(overviewLine("s1-r1-q1", 1, "Title 1?", "A. First"));
  expect(grill).toContain(overviewLine("s1-r1-q2", 2, "Title 2?", "Neither, use a third way"));
  expect(grill).not.toContain("One is true.");

  const spec = overviewItem(html, "spec");
  expect(spec).toContain('data-state="in-progress"');
  expect(spec).toContain(overviewLine("s2-r1-q1", 1, "Answered spec question?", "A. First, B. Second"));
  expect(spec).toContain(overviewLine("s2-r1-q2", 2, "Open spec question?", "Open"));
  expect(spec).toContain(overviewLine("s2-r1-q3", 3, "Timed-out spec question?", "Open"));

  expect(append({ type: "round", id: "s2-r2", stage: "spec" }, { ...question("s2-r2-q3", 3), round: "s2-r2", title: "Timed-out spec question, again?", again: "s2-r1-q3" }).code).toBe(0);
  expect(run(["answer", state, "s2-r2-q3=B"]).code).toBe(0);
  const again = overviewItem(readFileSync(page, "utf8"), "spec");
  expect(again).toContain(overviewLine("s2-r2-q3", 3, "Timed-out spec question, again?", "B. Second"));
  expect(again).not.toContain('href="#q-s2-r1-q3"');

  const tickets = overviewItem(html, "tickets");
  expect(tickets).toContain('data-state="not-started"');
  expect(tickets).toContain("Not started");
  expect(tickets).toContain("No questions yet.");
  expect(panel(html, "stage-tickets")).toContain("No rounds yet.");
  expect(html).toMatch(/<a role="tab"[^>]*href="#stage-grill"><span class="dot" data-state="finished"><\/span>Grill<\/a>/);
});

test.each([
  ["without a round", false, ["Assumed: Keep local files.", "A note about Assumed: picks."], "1 decision"],
  ["with an empty round", true, ["Assumed: Keep local files.", "assumed: Not a standing pick.", "Assumed: Keep the existing format."], "2 decisions"],
])("the Overview links a finished Stage's Assumed count to its summary %s", (_, withRound, extra, count) => {
  expect(append(
    PAGE,
    stage("grill", { state: "finished" }),
    ...(withRound ? [{ ...ROUND, stage: "grill" }] : []),
    { type: "close", id: "assumed-close", stage: "grill", decisions: [], extra },
  ).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const item = overviewItem(html, "grill");
  expect(item).toContain(`<a href="#close-assumed-close">No questions; ${count} assumed</a>`);
  expect(item).not.toContain("No questions yet.");
  expect(item).not.toContain("Keep local files.");
  expect(panel(html, "stage-grill")).toContain('id="close-assumed-close"');
  expect(panel(html, "stage-grill")).toContain("Assumed: Keep local files.");
});

test.each([
  ["not-started", ["Assumed: Keep local files."]],
  ["in-progress", ["Assumed: Keep local files."]],
  ["finished", ["A note about Assumed: picks."]],
])("the Overview keeps its empty text for a %s Stage without finished Assumed picks", (status, extra) => {
  expect(append(PAGE, stage("grill", { state: status }), { type: "close", id: "c1", stage: "grill", decisions: [], extra }).code).toBe(0);
  const item = overviewItem(readFileSync(page, "utf8"), "grill");
  expect(item).toContain("No questions yet.");
  expect(item).not.toContain("assumed</a>");
});

test("a later stage record with the same id replaces the earlier one", () => {
  expect(append(PAGE, stage("grill"), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1)).code).toBe(0);
  expect(overviewItem(readFileSync(page, "utf8"), "grill")).toContain('data-state="in-progress"');
  expect(append(stage("grill", { state: "finished" })).code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(overviewItem(html, "grill")).toContain('data-state="finished"');
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-grill", "Grill", false]]);
  expect(readFileSync(state, "utf8").trim().split("\n")).toHaveLength(5);
});

test("a state file from before Stages renders as one Stage, and a Stage added later gets its own tab", () => {
  const close = { type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }] };
  writeFileSync(state, `${lines(PAGE, ROUND, question("s1-r1-q1", 1), close)}\n`);
  const r = run(["render", state]);
  expect(r.code).toBe(0);
  expect(r.stderr).toBe("");
  let html = readFileSync(page, "utf8");
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-_grilling", "Grilling", false]]);
  expect(panel(html, "stage-_grilling")).toMatch(/id="q-s1-r1-q1"[\s\S]*id="close-c1"/);
  expect(overviewItem(html, "_grilling")).toContain('data-state="finished"');
  expect(overviewItem(html, "_grilling")).toContain(overviewLine("s1-r1-q1", 1, "Title 1?", "Open"));

  expect(append(stage("spec"), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  html = readFileSync(page, "utf8");
  expect(tabs(html).map(([id]) => id)).toEqual(["overview", "stage-_grilling", "stage-spec"]);
  expect(panel(html, "stage-_grilling")).not.toContain('id="q-s2-r1-q1"');
  expect(panel(html, "stage-spec")).toContain('id="q-s2-r1-q1"');
});

test("each tab's keyboard stops have their links in that tab's Jump row, and every link on the page has its target", () => {
  const close = { type: "close", id: "c1", stage: "grill", decisions: [{ question: "s1-r1-q1", text: "One is true." }] };
  const crossLink = { description: "Builds on [the grill's Q1](#q-s1-r1-q1)." };
  expect(append(PAGE, stage("grill"), stage("spec"), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), close, SPEC_ROUND, { ...question("s2-r1-q1", 1, crossLink), round: "s2-r1" }).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const stopsIn = (id: string) => [...panel(html, id).matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  expect(stopsIn("overview")).toEqual([]);
  expect(stopsIn("stage-grill")).toEqual(["q-s1-r1-q1", "close-c1"]);
  expect(jumpRow(html, "stage-grill").map(([target]) => target)).toEqual(["q-s1-r1-q1", "close-c1"]);
  expect(stopsIn("stage-spec")).toEqual(["q-s2-r1-q1"]);
  expect(jumpRow(html, "stage-spec").map(([target]) => target)).toEqual(["q-s2-r1-q1"]);
  expect(panel(html, "stage-spec")).toContain('<a href="#q-s1-r1-q1">the grill\'s Q1</a>');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  expect(targets.filter((t) => !ids.has(t))).toEqual([]);
});

const jumpRow = (html: string, id: string) => [...(html.match(new RegExp(`<nav class="jump-row"[^>]*data-tab="${id}"[\\s\\S]*?</nav>`))?.[0] ?? "").matchAll(/data-for="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "")]);

test("a round lists its questions in Q-number order in its tab and its Jump row, whatever the append order", () => {
  const R2 = { type: "round", id: "s1-r2", stage: "grill" };
  expect(append(PAGE, stage("grill"), { ...ROUND, stage: "grill" }, question("q1", 1), question("q2", 2), question("q3", 3)).code).toBe(0);
  expect(append(R2, { ...question("q4", 0), round: "s1-r2", title: "New?" }, { ...question("q3b", 0), round: "s1-r2", again: "q3" }, { ...question("q1b", 0), round: "s1-r2", again: "q1" }).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const round2 = html.slice(html.indexOf('aria-labelledby="round-s1-r2"'));
  expect([...round2.matchAll(/<span class="qnum">(Q\d+)<\/span>/g)].map((m) => m[1])).toEqual(["Q1", "Q3", "Q4"]);
  expect(jumpRow(html, "stage-grill").map(([, t]) => t)).toEqual(["Q1", "Q2", "Q3", "Q1", "Q3", "Q4"]);
});

test("the Jump row links the Background and each Report block before the questions, by jump label or by kind", () => {
  expect(append(PAGE, stage("review"), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(append(report("benchmark", "cards", { entries: [card("b1")], jump: "Benchmark" }), report("standards", "cards", { entries: [card("s1")] }), report("safety", "cards", { entries: [card("f1")] }), background("context", "review")).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const row = jumpRow(html, "stage-review");
  expect(row).toEqual([["background-context", "Background"], ["report-benchmark", "Benchmark"], ["report-standards", "Report"], ["report-safety", "Report 2"], ["q-s2-r1-q1", "Q1"]]);
  const stops = [...panel(html, "stage-review").matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  expect(stops).toEqual(row.map(([id]) => id));
  expect(html).toMatch(/data-for="report-safety"[^>]*>Report 2<\/a><span class="sep"[^>]*><\/span><a href="#q-s2-r1-q1"/);
});

test("a jump label shaped like a link stays plain text inside its Jump row link", () => {
  expect(append(PAGE, stage("review"), background("context", "review", { jump: "[Context](#q-q2) `code`" })).code).toBe(0);
  expect(readFileSync(page, "utf8")).toContain('<a href="#background-context" data-for="background-context">[Context](#q-q2) `code`</a>');
});

test.each([["background", () => background("context", "review", { jump: 3 })], ["report", () => report("standards", "cards", { entries: [card("s1")], jump: "" })]])("a %s whose jump label is not text is refused", (kind, rec) => {
  expect(append(PAGE, stage("review")).code).toBe(0);
  const r = append(rec());
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`${kind} `);
  expect(r.stderr).toContain("jump");
});

const REVIEW_ROUND = { ...SPEC_ROUND, id: "s2-r1", stage: "review" };
const card = (id: string, extra: object = {}) => ({ id, title: `Finding ${id}`, label: "issue", blocking: false, impact: `Impact ${id}`, evidence: `Evidence ${id}`, action: `Action ${id}`, ...extra });
const report = (id: string, shape: string, extra: object = {}) => ({ type: "report", id, stage: "review", title: `Report ${id}`, shape, ...extra });
const entry = (html: string, id: string) => {
  const start = html.indexOf(` id="${id}"`);
  if (start < 0) return "";
  const ends = ["<li class=", "<tr ", "</section>"].map((s) => html.indexOf(s, start + 1)).filter((i) => i > 0);
  return html.slice(start, Math.min(...ends));
};

test("a cards Report block renders each card's id, title, label, blocking flag, impact, action, evidence, and visual", () => {
  const cards = [card("s1", { blocking: true, visual: { text: "before -> after" } }), card("s2", { label: "suggestion" })];
  const r = append(PAGE, stage("review", { skill: "code-review" }), report("standards", "cards", { summary: "Two findings on `grilling-page.ts`.", entries: cards }));
  expect(r.code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  expect(tab).toContain('id="report-standards"');
  expect(tab).toContain("Report standards");
  expect(tab).toContain("Two findings on <code>grilling-page.ts</code>.");
  const s1 = entry(tab, "report-standards_s1");
  for (const t of ["s1", "Finding s1", "issue (blocking)", "Impact s1", "Evidence s1", "Action s1", "before -&gt; after"]) expect(s1).toContain(t);
  const s2 = entry(tab, "report-standards_s2");
  for (const t of ["Finding s2", "suggestion (non-blocking)", "Impact s2", "Evidence s2", "Action s2"]) expect(s2).toContain(t);
  expect(tab).not.toContain("No rounds yet.");
});

test("a card reads Impact, then Action, then its Evidence folded in a closed details block labelled Evidence", () => {
  expect(append(PAGE, stage("review", { skill: "code-review" }), report("standards", "cards", { entries: [card("s1")] })).code).toBe(0);
  const s1 = entry(panel(readFileSync(page, "utf8"), "stage-review"), "report-standards_s1");
  const fold = s1.match(/<details([^>]*)>([\s\S]*?)<\/details>/);
  expect(fold).not.toBeNull();
  const [whole, attrs, inside] = fold!;
  expect(attrs).not.toMatch(/\bopen\b/);
  expect(inside).toMatch(/^\s*<summary[^>]*>Evidence<\/summary>/);
  expect(inside).toContain("Evidence s1");
  expect(inside).not.toContain("Impact s1");
  expect(inside).not.toContain("Action s1");
  const at = (t: string) => s1.indexOf(t);
  expect(at("Impact s1")).toBeGreaterThan(0);
  expect(at("Impact s1")).toBeLessThan(at("Action s1"));
  expect(at("Action s1")).toBeLessThan(at(whole));
});

test("a ledger Report block renders each claim with its status, evidence, missing proof, and consequence", () => {
  const claim = (id: string, status: string) => ({ id, claim: `Claim ${id}`, status, evidence: `Evidence ${id}`, missing_proof: `Missing ${id}`, consequence: `Consequence ${id}` });
  const r = append(PAGE, stage("review", { skill: "code-review" }), report("safety", "ledger", { entries: [claim("p1", "confirmed"), claim("p2", "cleared"), claim("p3", "unproven")] }));
  expect(r.code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  for (const [id, status, label] of [["p1", "confirmed", "Confirmed"], ["p2", "cleared", "Cleared"], ["p3", "unproven", "Unproven"]]) {
    const html = entry(tab, `report-safety_${id}`);
    expect(html).toContain(`data-status="${status}"`);
    for (const t of [`Claim ${id}`, label, `Evidence ${id}`, "Missing proof", `Missing ${id}`, `Consequence ${id}`]) expect(html).toContain(t);
  }
});

test("a table Report block renders its columns and rows, and a row that links a question gets a Question cell", () => {
  const rows = [{ id: "t1", cells: ["#160 Stage tabs", "none", "M"] }, { id: "t2", cells: ["#162 Report blocks", "#160", "M"], question: "s2-r1-q1" }];
  const r = append(PAGE, stage("review", { title: "Tickets" }), report("breakdown", "table", { columns: ["Ticket", "Blocked by", "Size"], rows }), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Approve the breakdown?" });
  expect(r.code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  expect(tab).toMatch(/<th scope="col">Ticket<\/th><th scope="col">Blocked by<\/th><th scope="col">Size<\/th><th scope="col">Question<\/th>/);
  expect(entry(tab, "report-breakdown_t1")).toMatch(/<td>#160 Stage tabs<\/td><td>none<\/td><td>M<\/td><td><\/td>/);
  expect(entry(tab, "report-breakdown_t2")).toMatch(/<td>#162 Report blocks<\/td><td>#160<\/td><td>M<\/td><td><a href="#q-s2-r1-q1">Q1<\/a>: Approve the breakdown\?<\/td>/);
});

test("entries link to their questions and questions link back to entries, also across tabs", () => {
  const r = append(
    PAGE,
    stage("grill"),
    stage("review"),
    { ...ROUND, stage: "grill" },
    question("s1-r1-q1", 1, { title: "Keep the old flag?", report_entries: ["standards/s1", "safety/p1"] }),
    report("standards", "cards", { entries: [card("s1", { question: "s1-r1-q1" }), card("s2", { question: "s2-r1-q1" })] }),
    report("safety", "ledger", { entries: [{ id: "p1", claim: "Input reaches the shell", status: "unproven", evidence: "e", missing_proof: "m", consequence: "c" }] }),
    REVIEW_ROUND,
    { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Fix S2 now?", report_entries: ["standards/s2"] },
  );
  expect(r.code).toBe(0);
  const html = readFileSync(page, "utf8");
  const review = panel(html, "stage-review");
  const grill = panel(html, "stage-grill");
  expect(entry(review, "report-standards_s1")).toContain('<a href="#q-s1-r1-q1">Q1</a>: Keep the old flag?');
  expect(grill).toContain('id="q-s1-r1-q1"');
  expect(questionBody(grill, "s1-r1-q1")).toMatch(/<a href="#report-standards_s1">Report standards <span class="entry-id">s1<\/span><\/a>: Finding s1[\s\S]*<a href="#report-safety_p1">Report safety <span class="entry-id">p1<\/span><\/a>: Input reaches the shell/);
  expect(entry(review, "report-standards_s2")).toContain('<a href="#q-s2-r1-q1">Q1</a>: Fix S2 now?');
  expect(questionBody(review, "s2-r1-q1")).toContain('<a href="#report-standards_s2">');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  expect(targets.filter((t) => !ids.has(t))).toEqual([]);
});

test("inside a tab, Report blocks render before the rounds, even when they were appended after them", () => {
  expect(append(PAGE, stage("review"), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(append(report("standards", "cards", { entries: [card("s1")] }), report("safety", "ledger", { entries: [{ id: "p1", claim: "c", status: "cleared", evidence: "e", missing_proof: "m", consequence: "c" }] })).code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  const at = (s: string) => tab.indexOf(s);
  expect(at('id="report-standards"')).toBeGreaterThan(0);
  expect(at('id="report-standards"')).toBeLessThan(at('id="report-safety"'));
  expect(at('id="report-safety"')).toBeLessThan(at('aria-labelledby="round-s2-r1"'));
});

test("a later report record with the same id replaces the earlier one", () => {
  expect(append(PAGE, stage("review"), report("standards", "cards", { entries: [card("s1"), card("s2")] })).code).toBe(0);
  expect(append(report("standards", "cards", { title: "Standards, second pass", entries: [card("s1", { title: "Finding s1, fixed" })] })).code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  expect(tab).toContain("Standards, second pass");
  expect(tab).toContain("Finding s1, fixed");
  expect(tab).not.toContain('id="report-standards_s2"');
  expect(tab.match(/id="report-standards"/g)).toHaveLength(1);
});

const LEDGER_ENTRY = { id: "p1", claim: "c", status: "cleared", evidence: "e", missing_proof: "m", consequence: "c" };
test.each([
  ["an unknown shape", report("standards", "list", { entries: [card("s1")] }), "report standards: shape must be cards, ledger, or table"],
  ["no title", report("standards", "cards", { title: undefined, entries: [card("s1")] }), "report standards: title must be a non-empty string"],
  ["an unknown stage", report("standards", "cards", { stage: "spec", entries: [card("s1")] }), "report standards: stage spec does not exist"],
  ["no entries", report("standards", "cards"), "report standards: entries must list one or more entries"],
  ["a card with no impact", report("standards", "cards", { entries: [card("s1", { impact: undefined })] }), "report standards: entry s1: impact must be a non-empty string"],
  ["a card with a blocking flag that is not true or false", report("standards", "cards", { entries: [card("s1", { blocking: "yes" })] }), "report standards: entry s1: blocking must be true or false"],
  ["a card with an unsafe visual", report("standards", "cards", { entries: [card("s1", { visual: { html: "<script>x</script>" } })] }), "report standards: entry s1: visual: html is not safe"],
  ["two entries with one id", report("standards", "cards", { entries: [card("s1"), card("s1")] }), "report standards: entry s1: id is used by another entry of this report"],
  ["a claim with an unknown status", report("safety", "ledger", { entries: [{ ...LEDGER_ENTRY, status: "maybe" }] }), "report safety: entry p1: status must be confirmed, cleared, or unproven"],
  ["a claim with no missing proof", report("safety", "ledger", { entries: [{ ...LEDGER_ENTRY, missing_proof: undefined }] }), "report safety: entry p1: missing_proof must be a non-empty string"],
  ["a table with no columns", report("breakdown", "table", { rows: [{ id: "t1", cells: ["a"] }] }), "report breakdown: columns must be a list of one or more non-empty strings"],
  ["a row with a cell too few", report("breakdown", "table", { columns: ["Ticket", "Size"], rows: [{ id: "t1", cells: ["a"] }] }), "report breakdown: row t1: cells must list 2 strings, one per column"],
  ["a table with entries in place of rows", report("breakdown", "table", { columns: ["Ticket"], entries: [{ id: "t1", cells: ["a"] }] }), "report breakdown: a table report has rows, not entries"],
  ["an entry that links an unknown question", report("standards", "cards", { entries: [card("s1", { question: "s9-r1-q1" })] }), "report standards: entry s1 links question s9-r1-q1, which does not exist"],
  ["a row that links an unknown question", report("breakdown", "table", { columns: ["Ticket"], rows: [{ id: "t1", cells: ["a"], question: "nope" }] }), "report breakdown: row t1 links question nope, which does not exist"],
])("a report with %s is refused, names the record, and writes nothing", (_, rec, problem) => {
  expect(append(PAGE, stage("review")).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(rec);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(problem);
  expect(r.stderr).toContain("Nothing was written.");
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test("a question that links an unknown report or entry is refused, names the question, and writes nothing", () => {
  expect(append(PAGE, stage("review"), report("standards", "cards", { entries: [card("s1")] }), REVIEW_ROUND).code).toBe(0);
  const before = readFileSync(state, "utf8");
  for (const [link, problem] of [["standards/s9", "question s2-r1-q1: report entry standards/s9 does not exist"], ["safety/p1", "question s2-r1-q1: report entry safety/p1 does not exist"], ["standards", "report_entries must list <report id>/<entry id> strings"]]) {
    const r = append({ ...question("s2-r1-q1", 1), round: "s2-r1", report_entries: [link] });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(problem);
    expect(readFileSync(state, "utf8")).toBe(before);
  }
});

const background = (id: string, stageId: string, extra: object = {}) => ({
  type: "background", id, stage: stageId, title: "How a flow keeps its page", summary: "One page follows the flow from grill to merge.",
  sections: [{ heading: "One folder per flow", body: "The folder holds the state file and the page." }], sources: ["docs/adr/0028-flow-grilling-page.md"], ...extra,
});

test.each([
  ["no stage", { stage: undefined }, "stage must be a non-empty string"],
  ["an empty title", { title: " " }, "title must be a non-empty string"],
  ["no summary", { summary: undefined }, "summary must be a non-empty string"],
  ["no sections", { sections: [] }, "sections must be a list of one or more { heading, body }"],
  ["a section with no body", { sections: [{ heading: "One folder per flow" }] }, "sections 1: body must be a non-empty string"],
  ["no sources", { sources: undefined }, "sources must be a list of one or more non-empty strings"],
  ["a visual with two kinds", { visual: { text: "a", html: "<p>b</p>" } }, "visual: must have exactly one of text, html, or svg"],
  ["an unknown stage", { stage: "spec" }, "stage spec does not exist"],
])("a background with %s is refused, names the record, and writes nothing", (_, extra, problem) => {
  expect(append(PAGE, stage("grill")).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(background("context", "grill", extra));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`background context: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test("a Stage has at most one background", () => {
  expect(append(PAGE, stage("grill"), background("context", "grill")).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append(background("more-context", "grill"));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("background more-context: stage grill already has background context");
  expect(readFileSync(state, "utf8")).toBe(before);
});

test("a Background visual does not meet a question's need, and the same figure on the question does", () => {
  const floor = join(dir, "floor.svg");
  writeFileSync(floor, '<svg xmlns="http://www.w3.org/2000/svg"><rect id="floor-plan" width="1" height="1"/></svg>');
  expect(append(PAGE, stage("grill"), { ...ROUND, stage: "grill" }, background("context", "grill", { visual: { svg: floor } })).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const needs = [{ need: "Where the door sits on the floor plan", kind: "source-view" }];
  const r = append(question("s1-r1-q1", 1, { needs }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("question s1-r1-q1: ");
  expect(r.stderr).toContain("source-view");
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(append(question("s1-r1-q1", 1, { needs, visual: { svg: floor, kind: "source-view" } })).code).toBe(0);
});

test("a Background renders at the top of its Stage tab, before the rounds, even when appended after them", () => {
  const sections = [{ heading: "One folder per flow", body: "The folder holds the state file.\n\n- `page.jsonl`\n- `page.html`" }, { heading: "Renamed at to-spec", body: "The key becomes the spec issue." }];
  const visual = { text: "grilling/vstack-151/" };
  expect(append(PAGE, stage("grill"), stage("spec"), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(append(background("context", "spec", { sections, visual, sources: ["[ADR 0028](https://example.com/0028)", "GLOSSARY.md: Stage"] })).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const spec = panel(html, "stage-spec");
  const bg = spec.slice(spec.indexOf('class="background"'), spec.indexOf('class="round"'));
  expect(spec.indexOf('class="background"')).toBeGreaterThan(-1);
  expect(spec.indexOf('class="background"')).toBeLessThan(spec.indexOf('class="round"'));
  expect(bg).toContain("How a flow keeps its page");
  expect(bg).toContain("One page follows the flow from grill to merge.");
  expect(bg).toMatch(/One folder per flow<\/h3>[\s\S]*<p>The folder holds the state file\.<\/p><ul class="bullets"><li><code>page\.jsonl<\/code><\/li><li><code>page\.html<\/code><\/li><\/ul>[\s\S]*Renamed at to-spec<\/h3>[\s\S]*<p>The key becomes the spec issue\.<\/p>/);
  expect(bg).toContain("<pre>grilling/vstack-151/</pre>");
  expect(bg).toMatch(/Sources[\s\S]*<li><a href="https:\/\/example\.com\/0028">ADR 0028<\/a><\/li><li>GLOSSARY\.md: Stage<\/li>/);
  expect(panel(html, "stage-grill")).not.toContain('class="background"');
});

test("a later background record with the same id replaces the earlier one", () => {
  expect(append(PAGE, stage("grill"), background("context", "grill")).code).toBe(0);
  expect(append(background("context", "grill", { title: "How a flow page moves", summary: "rename moves the folder." })).code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-grill");
  expect(tab.match(/class="background"/g)).toHaveLength(1);
  expect(tab).toContain("How a flow page moves");
  expect(tab).toContain("rename moves the folder.");
  expect(tab).not.toContain("How a flow keeps its page");
});

const topic = (id: string, extra: object = {}) => ({
  type: "topic", id, title: `Topic ${id}`, summary: `What ${id} is, in one line.`, body: `The long form of ${id}.`, sources: [`GLOSSARY.md: ${id}`], ...extra,
});

test.each([
  ["an empty title", { title: " " }, "title must be a non-empty string"],
  ["no summary", { summary: undefined }, "summary must be a non-empty string"],
  ["no body", { body: undefined }, "body must be a non-empty string"],
  ["empty sources", { sources: [] }, "sources must be a list of one or more non-empty strings"],
])("a topic with %s is refused, names the record, and writes nothing", (_, extra, problem) => {
  expect(append(PAGE).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(topic("scratch", extra));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`topic scratch: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test.each([
  ["names an unknown topic", ["scratch", "stage"], "topic stage does not exist"],
  ["has an empty topics list", [], "topics must be a list of one or more non-empty strings"],
])("a question that %s is refused, names the question, and writes nothing", (_, topics, problem) => {
  expect(append(PAGE, topic("scratch"), ROUND).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append(question("s1-r1-q1", 1, { topics }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`question s1-r1-q1: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).not.toContain("Title 1?");
});

test("each Topic note renders once in the Topics tab, and each question that names it links to it from any tab", () => {
  const scratch = topic("scratch", { body: "Scratch is temporary.\n\n- kept 90 days", sources: ["[GLOSSARY.md](https://example.com/glossary)"] });
  expect(
    append(
      PAGE, scratch, topic("stage"), stage("grill"), stage("spec", { skill: "to-spec" }),
      { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1, { topics: ["scratch", "stage"] }), question("s1-r1-q2", 2),
      SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1", topics: ["scratch"] },
    ).code,
  ).toBe(0);
  expect(append(topic("stage", { title: "Stage, again" })).code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-grill", "Grill", false], ["stage-spec", "Spec", false], ["topics", "Topics", false]]);
  expect(html.match(/<article class="topic" id="topic-scratch"/g)).toHaveLength(1);
  const topicsTab = panel(html, "topics");
  expect(topicsTab).toMatch(/id="topic-scratch"[\s\S]*Topic scratch[\s\S]*What scratch is, in one line\.[\s\S]*<p>Scratch is temporary\.<\/p><ul class="bullets"><li>kept 90 days<\/li><\/ul>[\s\S]*Sources[\s\S]*<a href="https:\/\/example\.com\/glossary">GLOSSARY\.md<\/a>[\s\S]*id="topic-stage"[\s\S]*Stage, again/);
  expect(questionBody(html, "s1-r1-q1")).toMatch(/<a href="#topic-scratch">Topic scratch<\/a>: What scratch is, in one line\.[\s\S]*<a href="#topic-stage">Stage, again<\/a>/);
  expect(questionBody(html, "s2-r1-q1")).toContain('<a href="#topic-scratch">Topic scratch</a>');
  expect(questionBody(html, "s1-r1-q2")).not.toContain("#topic-");
  const row = jumpRow(html, "topics").map(([target]) => target);
  const stops = [...topicsTab.matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  expect(stops).toEqual(["topic-scratch", "topic-stage"]);
  expect(row).toEqual(stops);
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  expect([...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]).filter((t) => !ids.has(t))).toEqual([]);
});

test("inside a tab, the Background renders first, then Report blocks, then rounds, whatever the append order", () => {
  expect(append(PAGE, stage("review"), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(append(report("standards", "cards", { entries: [card("s1")] })).code).toBe(0);
  expect(append(background("context", "review")).code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  const at = (s: string) => tab.indexOf(s);
  expect(at('id="background-context"')).toBeGreaterThan(-1);
  expect(at('id="background-context"')).toBeLessThan(at('id="report-standards"'));
  expect(at('id="report-standards"')).toBeLessThan(at('aria-labelledby="round-s2-r1"'));
});

const stored = () => Object.fromEntries(readFileSync(state, "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.id, r]));

test("append numbers Stages, rounds, questions, and closes, and a question asked again keeps its Q number", () => {
  const bare = (id: string, round: string, extra: object = {}) => {
    const { q: _, ...rest } = question(id, 0, { round, ...extra });
    return rest;
  };
  expect(
    append(
      PAGE,
      { type: "stage", id: "grill", skill: "grill-with-docs", state: "in-progress" },
      { type: "stage", id: "spec", skill: "to-spec", state: "not-started", order: 9 },
      { type: "round", id: "ra", stage: "grill" },
      bare("qa1", "ra"),
      bare("qa2", "ra"),
      { type: "round", id: "rb", stage: "spec", session: 7, round: 7, time: "2020-01-01T00:00:00+00:00" },
      bare("qb1", "rb"),
    ).code,
  ).toBe(0);
  expect(run(["answer", state, "qa1=A", "qa2=unanswered"]).code).toBe(0);
  expect(append({ type: "round", id: "rc", stage: "grill" }, bare("qc", "rc", { again: "qa2" }), bare("qd", "rc"), { type: "close", id: "c1", stage: "grill", decisions: [{ question: "qa1", text: "One." }, { question: "qc", text: "Two." }, { question: "qd", text: "Three." }] }).code).toBe(0);
  expect(append({ type: "stage", id: "grill", skill: "grill-with-docs", state: "finished" }).code).toBe(0);
  expect(append({ ...stored().c1, session: 99 }).code).toBe(0);
  const r = stored();
  expect([r.grill.order, r.spec.order]).toEqual([1, 2]);
  expect([r.ra, r.rb, r.rc].map((x) => [x.session, x.round])).toEqual([[1, 1], [2, 2], [1, 3]]);
  expect(r.rb.time).not.toBe("2020-01-01T00:00:00+00:00");
  for (const x of [r.ra, r.rb, r.rc]) expect(Math.abs(Date.parse(x.time) - Date.now())).toBeLessThan(60_000);
  expect([r.qa1, r.qa2, r.qb1, r.qc, r.qd].map((x) => x.q)).toEqual([1, 2, 1, 2, 3]);
  expect(r.c1.session).toBe(1);
  expect(r.grill.state).toBe("finished");
});

test("append refuses a question asked again from another session, and a close for a Stage that names another Stage's question", () => {
  expect(append(PAGE, { type: "stage", id: "grill", skill: "grill-with-docs", state: "in-progress" }, { type: "stage", id: "spec", skill: "to-spec", state: "in-progress" }, { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1)).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const again = append({ type: "round", id: "s2-r1", stage: "spec" }, { ...question("s2-r1-q1", 1), round: "s2-r1", again: "s1-r1-q1" });
  expect(again.code).toBe(1);
  expect(again.stderr).toContain("question s2-r1-q1: again names s1-r1-q1, which is not in the same session");
  const close = append({ type: "close", id: "c1", stage: "spec", decisions: [{ question: "s1-r1-q1", text: "One." }] });
  expect(close.code).toBe(1);
  expect(close.stderr).toContain("close c1: s1-r1-q1 is not the latest ask of Q1 in session 2");
  expect(readFileSync(state, "utf8")).toBe(before);
});

const ASSUMED = { type: "report", id: "assumed", stage: "grill", title: "Assumed", shape: "table", columns: ["Decision", "Pick", "Why"], rows: [{ id: "test-command", cells: ["Test command", "Use the repo's", "package.json:10"] }] };
const ALL_ASSUMED = { type: "close", id: "c1", stage: "grill", decisions: [], extra: ["Assumed: Tests run with bun test (package.json:10)"] };

test.each([
  ["no round", []],
  ["a round with no questions", [{ type: "round", id: "r1", stage: "grill" }]],
])("a Stage that settled every decision as Assumed closes with %s and no decisions, and its summary lists the Assumed picks", (_, round) => {
  expect(append(PAGE, stage("grill"), ASSUMED, ...round).code).toBe(0);
  const r = append(ALL_ASSUMED, { type: "stage", id: "grill", skill: "grill-with-docs", state: "finished" });
  expect(r.stderr).not.toContain("Nothing was written");
  expect(r.code).toBe(0);
  expect(stored().c1.session).toBe(1);
  const html = readFileSync(page, "utf8");
  expect(summary(panel(html, "stage-grill"))).toContain("<li>Assumed: Tests run with bun test (package.json:10)</li>");
  expect(jumpRow(html, "stage-grill").map(([target]) => target)).toEqual(["report-assumed", "close-c1"]);
  expect(append(stage("spec", { skill: "to-spec" }), { type: "round", id: "s2", stage: "spec" }).code).toBe(0);
  expect(stored().s2.session).toBe(2);
});

test.each([
  ["no decisions while a question is open", [{ ...ROUND, stage: "grill" }, question("s1-r1-q1", 1)], ALL_ASSUMED, "close c1: Q1 has no decision"],
  ["no decisions and no extra bullets", [], { ...ALL_ASSUMED, extra: undefined }, "close c1: a close lists one or more decisions or extra bullets"],
  ["decisions that are not a list", [], { ...ALL_ASSUMED, decisions: undefined }, "decisions must be a list of { question, text }, empty when the Stage asked nothing"],
  ["no Stage and no rounds", [], { ...ALL_ASSUMED, stage: undefined }, "close c1: the page has no rounds"],
  ["a Stage that does not exist", [], { ...ALL_ASSUMED, stage: "spec" }, "close c1: stage spec does not exist"],
])("append refuses a close with %s and writes nothing", (_, setup, close, problem) => {
  expect(append(PAGE, stage("grill"), ...setup).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append(close);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(problem);
  expect(readFileSync(state, "utf8")).toBe(before);
});

test("each Stage tab is labeled from its skill, and a skill's second Stage gets a number", () => {
  const st = (id: string, skill: string) => ({ type: "stage", id, skill, state: "in-progress", title: `A long phrase about ${id}` });
  expect(append(PAGE, st("grill", "grill-with-docs"), st("review", "code-review"), st("spec", "to-spec"), st("review-again", "code-review")).code).toBe(0);
  expect(tabs(readFileSync(page, "utf8")).map(([, label]) => label)).toEqual(["Overview", "Grill", "Review", "Spec", "Review 2"]);
  const before = readFileSync(state, "utf8");
  const r = append(st("odd", "not-a-skill"));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("stage odd: skill not-a-skill has no tab label");
  expect(readFileSync(state, "utf8")).toBe(before);
});

test("only the latest unanswered ask of a Q number is marked open for the n key", () => {
  expect(append(PAGE, stage("grill"), stage("spec", { skill: "to-spec" }), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), question("s1-r1-q2", 2), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(run(["answer", state, "s1-r1-q1=unanswered", "s1-r1-q2=A"]).code).toBe(0);
  expect(append({ type: "round", id: "s1-r2", stage: "grill" }, { ...question("s1-r2-q1", 1), round: "s1-r2", again: "s1-r1-q1" }).code).toBe(0);
  const openIds = () => [...readFileSync(page, "utf8").matchAll(/<article class="question" id="q-([^"]+)"[^>]* data-open[ >]/g)].map((m) => m[1]);
  expect(openIds()).toEqual(["s1-r2-q1", "s2-r1-q1"]);
  expect(run(["answer", state, "s1-r2-q1=B"]).code).toBe(0);
  expect(openIds()).toEqual(["s2-r1-q1"]);
});

test("append assigns record ids and attaches questions to the round just appended", () => {
  const { id: _, q: __, round: ___, ...content } = question("unused", 1);
  expect(append(PAGE, stage("grill"), { type: "round", stage: "grill" }, content, content).code).toBe(0);
  const records = Object.values(stored()) as any[];
  const round = records.find((r) => r.type === "round");
  const questions = records.filter((r) => r.type === "question");
  expect(questions.map((r) => [r.round, r.q])).toEqual([[round.id, 1], [round.id, 2]]);
  expect(new Set(records.map((r) => r.id)).size).toBe(records.length);
  expect(run(["answer", state, `${questions[1].id}=B`]).code).toBe(0);
  expect(overviewItem(readFileSync(page, "utf8"), "grill")).toContain("B. Second");
});

test("append preserves replacement numbers and continues the current stored round after older record updates", () => {
  const first = { ...ROUND, stage: "grill", session: 4, round: 7 };
  const last = { ...ROUND, id: "last", stage: "grill", session: 4, round: 8 };
  const earlier = question("earlier", 5, { round: first.id });
  const current = question("current", 6, { round: last.id });
  writeFileSync(state, `${lines(PAGE, { ...stage("grill"), order: 3 }, earlier, first, last, current, { ...first, time: "2026-10-09T16:00:00+07:00" })}\n`);
  expect(run(["render", state]).code).toBe(0);
  expect(run(["answer", state, "current=B"]).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const { round: _, ...replacement } = earlier;
  expect(append({ ...replacement, q: 99, title: "Updated?" }, { type: "question", title: "Next?", description: "Next decision.", needs: current.needs, options: current.options }).code).toBe(0);
  const r = stored();
  expect(r.grill.order).toBe(3);
  expect([r[first.id].session, r[first.id].round, r[first.id].time]).toEqual([4, 7, "2026-10-09T16:00:00+07:00"]);
  expect([r.earlier.round, r.earlier.q]).toEqual([first.id, 5]);
  expect([r["question-1"].round, r["question-1"].q]).toEqual(["last", 7]);
  expect(readFileSync(state, "utf8").startsWith(before)).toBe(true);
});

test("append continues Q numbers when stored questions precede their round", () => {
  writeFileSync(state, `${lines(PAGE, question("earlier", 8), { ...ROUND, session: 3, round: 6 })}\n`);
  expect(run(["render", state]).code).toBe(0);
  const { id: _, round: __, q: ___, ...content } = question("unused", 1);
  expect(append(content).code).toBe(0);
  expect([stored()["question-1"].round, stored()["question-1"].q]).toEqual([ROUND.id, 9]);
});

test("concurrent CLI appends assign eight unique ids and Q numbers without losing rendered questions", async () => {
  expect(append(PAGE, ROUND, question("seed", 1, { description: "x".repeat(4_000_000) })).code).toBe(0);
  const { id: _, round: __, q: ___, ...content } = question("unused", 1);
  const workers = Array.from({ length: 8 }, (_, i) => Bun.spawn(["bun", SCRIPT, "append", state, "-"], {
    stdin: Buffer.from(lines({ ...content, title: `Writer ${i}?` })), stdout: "pipe", stderr: "pipe",
  }));
  const results = await Promise.all(workers.map(async (p) => ({
    code: await p.exited, stdout: await new Response(p.stdout).text(), stderr: await new Response(p.stderr).text(),
  })));
  expect(results.map((r) => r.code)).toEqual(Array(8).fill(0));
  expect(results.map((r) => r.stdout)).toEqual(Array(8).fill(`${page}\n`));
  const writes = readFileSync(state, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.title?.startsWith("Writer"));
  expect(writes).toHaveLength(8);
  expect(new Set(writes.map((r) => r.id)).size).toBe(8);
  expect(writes.map((r) => r.q).sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  const html = readFileSync(page, "utf8");
  for (let i = 0; i < 8; i++) expect(html).toContain(`Writer ${i}?`);
});

test("successful append reports assigned metadata on stderr so callers can answer without reading state", () => {
  const { id: _, round: __, q: ___, ...content } = question("unused", 1);
  const result = append(PAGE, stage("grill"), { type: "round", stage: "grill" }, content);
  expect(result.code).toBe(0);
  expect(result.stdout).toBe(`${page}\n`);
  expect(result.stderr.trim()).not.toBe("");
  const metadata = JSON.parse(result.stderr);
  expect(metadata).toEqual([
    { type: "page", id: "page" },
    { type: "stage", id: "grill", order: 1 },
    { type: "round", id: "round-1", stage: "grill", session: 1, round: 1, time: expect.any(String) },
    { type: "question", id: "question-1", round: "round-1", q: 1 },
  ]);
  expect(result.stderr).toBe(`${JSON.stringify(metadata)}\n`);
  expect(Math.abs(Date.parse(metadata[2].time) - Date.now())).toBeLessThan(60_000);
  expect(run(["answer", state, `${metadata[3].id}=B`]).code).toBe(0);
  expect(overviewItem(readFileSync(page, "utf8"), "grill")).toContain("B. Second");
  const next = append(
    { type: "round", id: "round-2", stage: "grill" },
    { ...content, again: metadata[3].id },
    { type: "close", stage: "grill", decisions: [{ question: "question-2", text: "Keep it." }] },
  );
  expect(next.code).toBe(0);
  const continuation = JSON.parse(next.stderr);
  expect(continuation).toEqual([
    { type: "round", id: "round-2", stage: "grill", session: 1, round: 2, time: expect.any(String) },
    { type: "question", id: "question-2", round: "round-2", again: "question-1", q: 1 },
    { type: "close", id: "close-1", stage: "grill", session: 1 },
  ]);
  const replacement = append({ type: "round", id: "round-2", stage: "grill", session: 99, round: 99, time: "1999-01-01T00:00:00Z" });
  expect(JSON.parse(replacement.stderr)).toEqual([continuation[0]]);
  const bad = append({ ...content, needs: [{ need: "How it works today", kind: "context-diagram" }], visual: { svg: "missing.svg", kind: "context-diagram" } });
  expect(bad.code).toBe(1);
  expect(bad.stdout).toBe("");
  expect(bad.stderr).toStartWith("grilling-page.ts:");
  expect(bad.stderr).not.toContain('"id":"question-3"');
});

test("a SIGKILL during CLI rendering releases the state lock for the next append", async () => {
  expect(append(PAGE, ROUND).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const fifo = join(dir, "waiting.svg");
  expect(Bun.spawnSync(["mkfifo", fifo]).exitCode).toBe(0);
  const blocked = Bun.spawn(["bun", SCRIPT, "append", state, "-"], {
    stdin: Buffer.from(lines(question("interrupted", 1, { visual: { svg: fifo, kind: "context-diagram" } }))), stdout: "pipe", stderr: "pipe",
  });
  let writer: number | undefined;
  try {
    for (let i = 0; i < 200 && writer === undefined; i++) {
      try { writer = openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK); }
      catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENXIO") throw e;
        await Bun.sleep(10);
      }
    }
    expect(writer).toBeDefined();
    blocked.kill("SIGKILL");
    await blocked.exited;
    expect(readFileSync(state, "utf8")).toBe(before);
    const next = Bun.spawn(["bun", SCRIPT, "append", state, "-"], {
      stdin: Buffer.from(lines(question("after-kill", 1))), stdout: "pipe", stderr: "pipe",
    });
    const timer = setTimeout(() => next.kill("SIGKILL"), 1000);
    try {
      const [code, stdout] = await Promise.all([next.exited, new Response(next.stdout).text(), new Response(next.stderr).text()]);
      expect(code).toBe(0);
      expect(stdout).toBe(`${page}\n`);
      expect(readFileSync(page, "utf8")).toContain('id="q-after-kill"');
    } finally { clearTimeout(timer); }
  } finally {
    blocked.kill("SIGKILL");
    await blocked.exited;
    if (writer !== undefined) closeSync(writer);
  }
});
