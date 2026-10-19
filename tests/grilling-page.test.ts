// grilling-page's render script run as a process: records in, page out, bad input refused (ADR 0013).

import { afterAll, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
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
  type: "question", id, round: "s1-r1", q, title: `Title ${q}?`, description: `Description ${q}`,
  options: [option("A. First", { recommended: "it is first" }), option("B. Second")], ...extra,
});
const STAR = '<span class="star" aria-hidden="true">*</span><span class="sr-only"> (recommended)</span>';

test("append renders the page and prints its absolute path", () => {
  const r = append(PAGE, ROUND, question("s1-r1-q1", 1));
  expect(r.code).toBe(0);
  expect(r.stdout.trim()).toBe(page);
  const html = readFileSync(page, "utf8");
  expect(html).toContain(`<li class="option" data-recommended><h4>First${STAR}</h4>`);
  expect(html).toContain('<li class="option"><h4>Second</h4>');
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

test("a state file from before Today and Term notes renders its questions unchanged, with no empty blocks", () => {
  writeFileSync(state, `${lines(PAGE, ROUND, question("s1-r1-q1", 1))}\n`);
  expect(run(["render", state]).code).toBe(0);
  const article = readFileSync(page, "utf8").match(/<article class="question"[\s\S]*?<\/article>/)![0];
  expect(article).toBe(`<article class="question" id="q-s1-r1-q1" data-state="open" data-stop>
<h3><span class="qnum">Q1</span>Title 1?</h3>
<div class="description"><p>Description 1</p></div>
<ol class="options">
<li class="option" data-recommended><h4>First${STAR}</h4><p>A. First does</p><ul class="trade"><li class="gain">A. First gain</li><li class="cost">A. First cost</li></ul><p class="why">Recommended: it is first</p></li>
<li class="option"><h4>Second</h4><p>B. Second does</p><ul class="trade"><li class="gain">B. Second gain</li><li class="cost">B. Second cost</li></ul></li>
</ol>
</article>`);
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

test("answer marks the picked option and shows a line only for a note", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1), question("s1-r1-q2", 2));
  expect(run(["answer", state, "s1-r1-q1=B", "s1-r1-q2=A:only on wifi"]).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const q1 = html.slice(html.indexOf('id="q-s1-r1-q1"'), html.indexOf('id="q-s1-r1-q2"'));
  expect(q1).toMatch(/<li class="option" data-picked><h4>Second<span class="sr-only"> \(your answer\)/);
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
  const bad = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html: "<script>x()</script>" } }), option("B. Two")] }));
  expect(bad.code).toBe(1);
  const ok = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html: '<p class="x">hi</p>', css: ".x, p { color: red; }" } }), option("B. Two")] }));
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
  const r = append(question("s1-r1-q1", 1, { options: [option("A. One", { preview: { html } }), option("B. Two")] }));
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

test.each([
  ["a Google Fonts import", "https://fonts.googleapis.com/css2?family=IosevkaTerm+Nerd+Font+Mono"],
  ["an import from another host", "https://example.com/figure.css"],
])("an SVG file whose styles hold %s is refused", (_, url) => {
  append(PAGE, ROUND);
  const svg = join(dir, "import.svg");
  writeFileSync(svg, `<svg xmlns="http://www.w3.org/2000/svg"><style>@import url('${url}');</style><rect width="1" height="1"/></svg>`);
  const r = append(question("s1-r1-q1", 1, { visual: { svg } }));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`${svg} is not safe: its styles import a file`);
  expect(existsSync(page) ? readFileSync(page, "utf8") : "").not.toContain(url);
});

test("a question with a list of visuals renders each one in order, and a bad entry is refused", () => {
  append(PAGE, ROUND);
  const context = join(dir, "context.svg");
  writeFileSync(context, '<svg xmlns="http://www.w3.org/2000/svg"><rect id="context-figure" width="1" height="1"/></svg>');
  const bad = append(question("s1-r1-q1", 1, { visual: [{ svg: context }, { html: "<script>x()</script>" }] }));
  expect(bad.code).toBe(1);
  expect(bad.stderr).toContain("visual 2: html is not safe");
  expect(append(question("s1-r1-q1", 1, { visual: [{ svg: context }, { text: "options figure" }] })).code).toBe(0);
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

test("every keyboard stop has its link in the Q row, and a reopened summary is no longer a stop", () => {
  append(PAGE, ROUND, question("s1-r1-q1", 1));
  const close = (id: string) => ({ type: "close", id, session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }] });
  append({ ...close("c1"), answer: "Not yet" });
  append(close("c2"));
  const html = readFileSync(page, "utf8");
  const stops = [...html.matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  const links = [...html.matchAll(/data-for="([^"]+)"/g)].map((m) => m[1]);
  expect(stops).toEqual(["q-s1-r1-q1", "close-c2"]);
  expect(links).toEqual(stops);
});

// A flow folder: <Scratch dir>/grilling/<project>-<key>/ with page.jsonl, page.html, flow.json, and figures/.
const FLOW = { type: "flow", id: "flow", slug: "page-per-flow", key: "page-per-flow", state: "open" };
/** Points state and page at page.jsonl in a new flow folder <dir>/vstack-<key>/ and returns the folder. */
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
  const q2 = question("s1-r1-q2", 2, { options: [option("A. First", { preview: { svg: join(old, "figures", "options.svg") } }), option("B. Second")] });
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: "figures/context.svg" } }), q2).code).toBe(0);

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
  expect(append(PAGE, FLOW, ROUND, question("s1-r1-q1", 1, { visual: { svg: roundabout } })).code).toBe(0);
  const files = Object.fromEntries(["page.jsonl", "page.html", "flow.json"].map((f) => [f, readFileSync(join(old, f), "utf8")]));

  const r = run(["rename", state, "151"]);
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`question s1-r1-q1: ${roundabout} would not resolve after the move`);
  expect(existsSync(join(dir, "vstack-151"))).toBe(false);
  for (const [f, text] of Object.entries(files)) expect(readFileSync(join(old, f), "utf8")).toBe(text);
});

const stage = (id: string, order: number, extra: object = {}) => ({ type: "stage", id, skill: "grill-with-docs", title: `Stage ${id}`, state: "in-progress", order, ...extra });

test.each([
  ["a state that is not a Stage state", { state: "done" }, "state must be not-started, in-progress, or finished"],
  ["no skill", { skill: undefined }, "skill must be a non-empty string"],
  ["an empty title", { title: " " }, "title must be a non-empty string"],
  ["an order that is not a whole number", { order: 1.5 }, "order must be a whole number of 1 or more"],
])("a stage with %s is refused, names the record, and writes nothing", (_, extra, problem) => {
  expect(append(PAGE).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const pageBefore = readFileSync(page, "utf8");
  const r = append(stage("grill", 1, extra));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain(`stage grill: ${problem}`);
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).toBe(pageBefore);
});

test("a round that names an unknown stage is refused, names the round, and writes nothing", () => {
  expect(append(PAGE, stage("grill", 1)).code).toBe(0);
  const before = readFileSync(state, "utf8");
  const r = append({ ...ROUND, stage: "spec" }, question("s1-r1-q1", 1));
  expect(r.code).toBe(1);
  expect(r.stderr).toContain("round s1-r1: stage spec does not exist");
  expect(readFileSync(state, "utf8")).toBe(before);
  expect(readFileSync(page, "utf8")).not.toContain("Title 1?");
});

/** The tab strip as [panel id, label, selected] in order. */
const tabs = (html: string) => [...html.matchAll(/<a role="tab"[^>]*aria-selected="(true|false)"[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [m[2], m[3].replace(/<[^>]+>/g, ""), m[1] === "true"]);
/** The HTML of one tab panel, up to the next panel or the end of the page body. */
const panel = (html: string, id: string) => {
  const head = `id="${id}" role="tabpanel"`;
  const start = html.indexOf(head);
  if (start < 0) return "";
  const next = html.indexOf('role="tabpanel"', start + head.length);
  return html.slice(start, next < 0 ? html.indexOf("</main>") : next);
};
const SPEC_ROUND = { type: "round", id: "s2-r1", session: 2, round: 2, stage: "spec", time: "2026-10-10T09:00:00+07:00" };

test("the page opens on an Overview tab, then has one tab per Stage in order, each with its own rounds", () => {
  const r = append(PAGE, stage("spec", 2, { title: "Write the spec", state: "not-started" }), stage("grill", 1, { title: "Grill the plan" }), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Spec question?" });
  expect(r.code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-grill", "Grill the plan", false], ["stage-spec", "Write the spec", false]]);
  expect(html.indexOf('id="overview" role="tabpanel"')).toBeLessThan(html.indexOf('id="stage-grill" role="tabpanel"'));
  expect(panel(html, "stage-grill")).toContain('id="q-s1-r1-q1"');
  expect(panel(html, "stage-grill")).not.toContain("Spec question?");
  expect(panel(html, "stage-spec")).toContain('id="q-s2-r1-q1"');
});

/** One Stage's entry on the Overview. */
const overviewItem = (html: string, id: string) => panel(html, "overview").split('<li class="stage"').find((p) => p.includes(`href="#stage-${id}"`)) ?? "";

test("the Overview shows each Stage's state, its decisions, and its open questions, linked into the tabs", () => {
  expect(
    append(
      PAGE,
      stage("grill", 1, { title: "Grill the plan", state: "finished" }),
      stage("spec", 2, { title: "Write the spec", skill: "to-spec" }),
      stage("tickets", 3, { title: "Break into tickets", state: "not-started" }),
      { ...ROUND, stage: "grill" },
      question("s1-r1-q1", 1),
      question("s1-r1-q2", 2),
      SPEC_ROUND,
      { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Answered spec question?" },
      { ...question("s2-r1-q2", 2), round: "s2-r1", title: "Open spec question?" },
      { ...question("s2-r1-q3", 3), round: "s2-r1", title: "Timed-out spec question?" },
    ).code,
  ).toBe(0);
  expect(run(["answer", state, "s1-r1-q1=A", "s1-r1-q2=B", "s2-r1-q1=A", "s2-r1-q3=unanswered"]).code).toBe(0);
  const decisions = [{ question: "s1-r1-q2", text: "Two is true." }, { question: "s1-r1-q1", text: "One is true." }];
  expect(append({ type: "close", id: "c1", session: 1, decisions, answer: "Not yet" }, { type: "close", id: "c2", session: 1, decisions: [decisions[1], { ...decisions[0], text: "Two is now true." }], answer: "Yes" }).code).toBe(0);
  const html = readFileSync(page, "utf8");

  const ids = [...panel(html, "overview").matchAll(/<li class="stage"[\s\S]*?href="#stage-([^"]+)"/g)].map((m) => m[1]);
  expect(ids).toEqual(["grill", "spec", "tickets"]);

  const grill = overviewItem(html, "grill");
  expect(grill).toContain('data-state="finished"');
  expect(grill).toContain("Finished");
  expect(grill).toContain("grill-with-docs");
  expect(grill).toMatch(/<a href="#q-s1-r1-q1">Q1<\/a>: One is true\.[\s\S]*<a href="#q-s1-r1-q2">Q2<\/a>: Two is now true\./);
  expect(grill).not.toContain("Two is true.");
  expect(grill).toContain("No open questions.");

  const spec = overviewItem(html, "spec");
  expect(spec).toContain('data-state="in-progress"');
  expect(spec).toContain("In progress");
  expect(spec).toContain("to-spec");
  expect(spec).toContain("No decisions yet.");
  expect(spec).toMatch(/<a href="#q-s2-r1-q2">Q2<\/a>: Open spec question\?[\s\S]*<a href="#q-s2-r1-q3">Q3<\/a>: Timed-out spec question\?/);
  expect(spec).not.toContain("Answered spec question?");

  const tickets = overviewItem(html, "tickets");
  expect(tickets).toContain('data-state="not-started"');
  expect(tickets).toContain("Not started");
  expect(panel(html, "stage-tickets")).toContain("No rounds yet.");

  expect(tabs(html).map(([id]) => id)).toEqual(["overview", "stage-grill", "stage-spec", "stage-tickets"]);
  expect(html).toMatch(/<a role="tab"[^>]*href="#stage-grill"><span class="dot" data-state="finished"><\/span>Grill the plan<\/a>/);
});

test("a later stage record with the same id replaces the earlier one", () => {
  expect(append(PAGE, stage("grill", 1, { title: "Grill the plan" }), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1)).code).toBe(0);
  expect(overviewItem(readFileSync(page, "utf8"), "grill")).toContain('data-state="in-progress"');
  expect(append(stage("grill", 1, { title: "Grill the plan again", state: "finished" })).code).toBe(0);
  const html = readFileSync(page, "utf8");
  expect(overviewItem(html, "grill")).toContain('data-state="finished"');
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-grill", "Grill the plan again", false]]);
  expect(readFileSync(state, "utf8").trim().split("\n")).toHaveLength(5);
});

test("a state file from before Stages renders as one Stage, and a Stage added later gets its own tab", () => {
  const close = { type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }], answer: "Yes" };
  writeFileSync(state, `${lines(PAGE, ROUND, question("s1-r1-q1", 1), close)}\n`);
  const r = run(["render", state]);
  expect(r.code).toBe(0);
  expect(r.stderr).toBe("");
  let html = readFileSync(page, "utf8");
  expect(tabs(html)).toEqual([["overview", "Overview", true], ["stage-_grilling", "Grilling", false]]);
  expect(panel(html, "stage-_grilling")).toMatch(/id="q-s1-r1-q1"[\s\S]*id="close-c1"/);
  expect(overviewItem(html, "_grilling")).toContain('data-state="finished"');
  expect(overviewItem(html, "_grilling")).toContain('<a href="#q-s1-r1-q1">Q1</a>: One is true.');

  expect(append(stage("spec", 1), SPEC_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  html = readFileSync(page, "utf8");
  expect(tabs(html).map(([id]) => id)).toEqual(["overview", "stage-_grilling", "stage-spec"]);
  expect(panel(html, "stage-_grilling")).not.toContain('id="q-s2-r1-q1"');
  expect(panel(html, "stage-spec")).toContain('id="q-s2-r1-q1"');
});

test("each tab's keyboard stops have their links in that tab's Q row, and every link on the page has its target", () => {
  const close = { type: "close", id: "c1", session: 1, decisions: [{ question: "s1-r1-q1", text: "One is true." }] };
  const crossLink = { description: "Builds on [the grill's Q1](#q-s1-r1-q1)." };
  expect(append(PAGE, stage("grill", 1), stage("spec", 2), { ...ROUND, stage: "grill" }, question("s1-r1-q1", 1), close, SPEC_ROUND, { ...question("s2-r1-q1", 1, crossLink), round: "s2-r1" }).code).toBe(0);
  const html = readFileSync(page, "utf8");
  const stopsIn = (id: string) => [...panel(html, id).matchAll(/id="([^"]+)"[^>]*data-stop/g)].map((m) => m[1]);
  const qrow = (id: string) => [...(html.match(new RegExp(`<nav class="qnav"[^>]*data-tab="${id}"[\\s\\S]*?</nav>`))?.[0] ?? "").matchAll(/data-for="([^"]+)"/g)].map((m) => m[1]);
  expect(stopsIn("overview")).toEqual([]);
  expect(stopsIn("stage-grill")).toEqual(["q-s1-r1-q1", "close-c1"]);
  expect(qrow("stage-grill")).toEqual(["q-s1-r1-q1", "close-c1"]);
  expect(stopsIn("stage-spec")).toEqual(["q-s2-r1-q1"]);
  expect(qrow("stage-spec")).toEqual(["q-s2-r1-q1"]);
  expect(panel(html, "stage-spec")).toContain('<a href="#q-s1-r1-q1">the grill\'s Q1</a>');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  expect(targets.filter((t) => !ids.has(t))).toEqual([]);
});

const REVIEW_ROUND = { ...SPEC_ROUND, id: "s2-r1", stage: "review" };
const card = (id: string, extra: object = {}) => ({ id, title: `Finding ${id}`, label: "issue", blocking: false, impact: `Impact ${id}`, evidence: `Evidence ${id}`, action: `Action ${id}`, ...extra });
const report = (id: string, shape: string, extra: object = {}) => ({ type: "report", id, stage: "review", title: `Report ${id}`, shape, ...extra });
/** The HTML of one report entry, from its own tag to the next entry or the end of its report. */
const entry = (html: string, id: string) => {
  const start = html.indexOf(` id="${id}"`);
  if (start < 0) return "";
  const ends = ["<li class=", "<tr ", "</section>"].map((s) => html.indexOf(s, start + 1)).filter((i) => i > 0);
  return html.slice(start, Math.min(...ends));
};

test("a cards Report block renders each card's id, title, label, blocking flag, impact, evidence, action, and visual", () => {
  const cards = [card("s1", { blocking: true, visual: { text: "before -> after" } }), card("s2", { label: "suggestion" })];
  const r = append(PAGE, stage("review", 1, { skill: "code-review" }), report("standards", "cards", { summary: "Two findings on `grilling-page.ts`.", entries: cards }));
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

test("a ledger Report block renders each claim with its status, evidence, missing proof, and consequence", () => {
  const claim = (id: string, status: string) => ({ id, claim: `Claim ${id}`, status, evidence: `Evidence ${id}`, missing_proof: `Missing ${id}`, consequence: `Consequence ${id}` });
  const r = append(PAGE, stage("review", 1, { skill: "code-review" }), report("safety", "ledger", { entries: [claim("p1", "confirmed"), claim("p2", "cleared"), claim("p3", "unproven")] }));
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
  const r = append(PAGE, stage("review", 1, { title: "Tickets" }), report("breakdown", "table", { columns: ["Ticket", "Blocked by", "Size"], rows }), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1", title: "Approve the breakdown?" });
  expect(r.code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  expect(tab).toMatch(/<th scope="col">Ticket<\/th><th scope="col">Blocked by<\/th><th scope="col">Size<\/th><th scope="col">Question<\/th>/);
  expect(entry(tab, "report-breakdown_t1")).toMatch(/<td>#160 Stage tabs<\/td><td>none<\/td><td>M<\/td><td><\/td>/);
  expect(entry(tab, "report-breakdown_t2")).toMatch(/<td>#162 Report blocks<\/td><td>#160<\/td><td>M<\/td><td><a href="#q-s2-r1-q1">Q1<\/a>: Approve the breakdown\?<\/td>/);
});

test("entries link to their questions and questions link back to entries, also across tabs", () => {
  const r = append(
    PAGE,
    stage("grill", 1),
    stage("review", 2),
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
  // A card in the review tab links to a question in the grill tab, and that question links back across the tabs.
  expect(entry(review, "report-standards_s1")).toContain('<a href="#q-s1-r1-q1">Q1</a>: Keep the old flag?');
  expect(grill).toContain('id="q-s1-r1-q1"');
  expect(questionBody(grill, "s1-r1-q1")).toMatch(/<a href="#report-standards_s1">Report standards <span class="entry-id">s1<\/span><\/a>: Finding s1[\s\S]*<a href="#report-safety_p1">Report safety <span class="entry-id">p1<\/span><\/a>: Input reaches the shell/);
  // Inside one tab, the links go both ways too.
  expect(entry(review, "report-standards_s2")).toContain('<a href="#q-s2-r1-q1">Q1</a>: Fix S2 now?');
  expect(questionBody(review, "s2-r1-q1")).toContain('<a href="#report-standards_s2">');
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  expect(targets.filter((t) => !ids.has(t))).toEqual([]);
});

test("inside a tab, Report blocks render before the rounds, even when they were appended after them", () => {
  expect(append(PAGE, stage("review", 1), REVIEW_ROUND, { ...question("s2-r1-q1", 1), round: "s2-r1" }).code).toBe(0);
  expect(append(report("standards", "cards", { entries: [card("s1")] }), report("safety", "ledger", { entries: [{ id: "p1", claim: "c", status: "cleared", evidence: "e", missing_proof: "m", consequence: "c" }] })).code).toBe(0);
  const tab = panel(readFileSync(page, "utf8"), "stage-review");
  const at = (s: string) => tab.indexOf(s);
  expect(at('id="report-standards"')).toBeGreaterThan(0);
  expect(at('id="report-standards"')).toBeLessThan(at('id="report-safety"'));
  expect(at('id="report-safety"')).toBeLessThan(at('aria-labelledby="round-s2-r1"'));
});

test("a later report record with the same id replaces the earlier one", () => {
  expect(append(PAGE, stage("review", 1), report("standards", "cards", { entries: [card("s1"), card("s2")] })).code).toBe(0);
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
  expect(append(PAGE, stage("review", 1)).code).toBe(0);
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
  expect(append(PAGE, stage("review", 1), report("standards", "cards", { entries: [card("s1")] }), REVIEW_ROUND).code).toBe(0);
  const before = readFileSync(state, "utf8");
  for (const [link, problem] of [["standards/s9", "question s2-r1-q1: report entry standards/s9 does not exist"], ["safety/p1", "question s2-r1-q1: report entry safety/p1 does not exist"], ["standards", "report_entries must list <report id>/<entry id> strings"]]) {
    const r = append({ ...question("s2-r1-q1", 1), round: "s2-r1", report_entries: [link] });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(problem);
    expect(readFileSync(state, "utf8")).toBe(before);
  }
});
