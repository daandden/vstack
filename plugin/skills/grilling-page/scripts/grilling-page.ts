// Keeps a Grilling page from a JSONL state file and renders the whole page on every command.
//
//   bun grilling-page.ts append <state.jsonl> [<records.jsonl> | -]
//   bun grilling-page.ts answer <state.jsonl> <question-id>=<spec> ...
//   bun grilling-page.ts render <state.jsonl>
//   bun grilling-page.ts rename <state.jsonl> <new-key>
//
// The page is the state path with .html in place of .jsonl. Each state line is one JSON record.
// A later line with the same id replaces an earlier one. Every command checks all records,
// renders the page from templates/grilling-page.html, and prints the page's absolute path.
// With a flow record, the state file's folder is the flow folder <project>-<key>/: every command also
// writes flow.json from that record and makes figures/. rename moves the folder to <project>-<new-key>/.
// An answer <spec> is A or A,B (picked options), with an optional :note; other:<text>; or unanswered[:<reason>].
// Exit 0 prints the path; exit 1 is a record error and writes nothing; exit 2 is a usage error.

import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

type Visual = { text?: string; html?: string; css?: string; svg?: string };
type Option = { label: string; does: string; gains: string[]; costs: string[]; recommended?: string; preview?: Visual };
type Rec = Record<string, any> & { type: string; id: string };
type Line = { rec: Rec; line: number };

const ID = /^[a-z0-9][a-z0-9-]*$/;
const TEMPLATE = join(import.meta.dir, "..", "templates", "grilling-page.html");
// Elements that run code, load other documents, take input, or swallow the rest of the page as raw text.
const BLOCKED_TAGS = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "applet", "portal", "link", "meta", "base", "style", "form", "input", "button", "textarea", "select", "template", "noscript", "noembed", "noframes", "plaintext", "xmp", "set", "animate", "animatemotion", "animatetransform", "handler", "listener"]);
const NAMED_ENTITIES: Record<string, string> = { colon: ":", tab: "\t", newline: "\n", nbsp: " " };

/** Problems in a piece of HTML or SVG, found by parsing it the way a browser does. Empty when it is safe to inline.
 *  `allowStyle` keeps <style>, which diagram-design's SVG exports carry; its text still cannot import or run anything. */
function unsafeMarkup(markup: string, allowStyle = false): string[] {
  const problems: string[] = [];
  new HTMLRewriter()
    .on("*", {
      element(el) {
        if (BLOCKED_TAGS.has(el.tagName) && !(allowStyle && el.tagName === "style")) problems.push(`<${el.tagName}> is not allowed`);
        for (const [name, value] of el.attributes) {
          if (name.toLowerCase().startsWith("on")) problems.push(`the ${name} attribute on <${el.tagName}> is not allowed`);
          const decoded = value
            .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
            .replace(/&#(\d+);?/g, (_, n) => String.fromCodePoint(Number(n)))
            .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m)
            .replace(/[\u0000-\u0020]/g, "")
            .toLowerCase();
          if (/^(javascript|vbscript|data):/.test(decoded)) problems.push(`the ${name} attribute on <${el.tagName}> holds a ${decoded.split(":")[0]}: URL`);
        }
      },
    })
    .transform(markup);
  return problems;
}

class RecordError extends Error {}
const fail = (where: string, message: string): never => {
  throw new RecordError(`${where}: ${message}`);
};

function usage(message: string): never {
  process.stderr.write(`grilling-page.ts: ${message}\nusage: bun grilling-page.ts append <state.jsonl> [<records.jsonl> | -]\n       bun grilling-page.ts answer <state.jsonl> <question-id>=<spec> ...\n       bun grilling-page.ts render <state.jsonl>\n       bun grilling-page.ts rename <state.jsonl> <new-key>\n`);
  process.exit(2);
}

function parseLines(text: string, firstLine: number, source: string): Line[] {
  const out: Line[] = [];
  text.split("\n").forEach((raw, i) => {
    if (raw.trim() === "") return;
    const where = `${source} line ${firstLine + i}`;
    let rec: unknown;
    try {
      rec = JSON.parse(raw);
    } catch (e) {
      fail(where, `not valid JSON (${(e as Error).message})`);
    }
    if (typeof rec !== "object" || rec === null || Array.isArray(rec)) fail(where, "a record must be a JSON object");
    const r = rec as Rec;
    if (r.type === "answer" && r.id === undefined && typeof r.question === "string") r.id = `answer-${r.question}`;
    if (typeof r.id !== "string" || !ID.test(r.id)) fail(where, `id must be lowercase letters, digits, and hyphens, got ${JSON.stringify(r.id)}`);
    out.push({ rec: r, line: firstLine + i });
  });
  return out;
}

const str = (r: Rec, key: string, where: string, optional = false): string | undefined => {
  const v = r[key];
  if (v === undefined && optional) return undefined;
  if (typeof v !== "string" || v.trim() === "") fail(where, `${key} must be a non-empty string`);
  return v;
};
const int = (r: Rec, key: string, where: string): number => {
  const v = r[key];
  if (!Number.isInteger(v) || v < 1) fail(where, `${key} must be a whole number of 1 or more`);
  return v;
};
const strList = (v: unknown, key: string, where: string): string[] => {
  if (!Array.isArray(v) || v.length === 0 || v.some((s) => typeof s !== "string" || s.trim() === "")) fail(where, `${key} must be a list of one or more non-empty strings`);
  return v as string[];
};
/** An optional list of one or more objects, each with every field in `fields` as a non-empty string. */
function entryList(r: Rec, key: string, fields: string[], where: string): void {
  const v = r[key];
  if (v === undefined) return;
  if (!Array.isArray(v) || v.length === 0) fail(where, `${key} must be a list of one or more { ${fields.join(", ")} }`);
  v.forEach((e: unknown, i: number) => {
    const ew = `${where}: ${key} ${i + 1}`;
    if (typeof e !== "object" || e === null || Array.isArray(e)) fail(ew, `must be an object with ${fields.join(" and ")}`);
    for (const f of fields) str(e as Rec, f, ew);
  });
}

function checkVisual(v: unknown, where: string): Visual {
  if (typeof v !== "object" || v === null || Array.isArray(v)) fail(where, "must be an object with text, html, or svg");
  const vis = v as Visual;
  const kinds = (["text", "html", "svg"] as const).filter((k) => vis[k] !== undefined);
  if (kinds.length !== 1) fail(where, "must have exactly one of text, html, or svg");
  for (const k of ["text", "html", "svg", "css"] as const) if (vis[k] !== undefined && (typeof vis[k] !== "string" || vis[k]!.trim() === "")) fail(where, `${k} must be a non-empty string`);
  if (vis.css !== undefined && vis.html === undefined) fail(where, "css needs html");
  const markupProblems = vis.html !== undefined ? unsafeMarkup(vis.html) : [];
  if (markupProblems.length) fail(where, `html is not safe: ${markupProblems.join("; ")}`);
  if (vis.css !== undefined && /@|<\/|expression\(|javascript:/i.test(vis.css)) fail(where, "css must hold plain rules only, with no at-rules, closing tags, or script URLs");
  return vis;
}

const STATE_LABELS: Record<string, string> = { "not-started": "Not started", "in-progress": "In progress", finished: "Finished" };
const STAGE_STATES = Object.keys(STATE_LABELS);

/** `records` holds the latest record of each id, in the order the ids first appear. */
type State = { page: Rec; order: Rec[]; questions: Map<string, Rec>; answers: Map<string, Rec>; rounds: Map<string, Rec>; stages: Rec[]; flow?: Rec; records: Rec[] };

/** Checks every record. `folder` is the basename of the state file's folder, which a flow record's key must end. */
function check(lines: Line[], folder: string): State {
  const latest = new Map<string, Line>();
  const first: string[] = [];
  for (const l of lines) {
    const prev = latest.get(l.rec.id);
    if (prev && prev.rec.type !== l.rec.type) fail(`line ${l.line}`, `id ${l.rec.id} is a ${prev.rec.type} on line ${prev.line}, so it cannot become a ${l.rec.type}`);
    if (!prev) first.push(l.rec.id);
    latest.set(l.rec.id, l);
  }
  const all = first.map((id) => latest.get(id)!);
  const rounds = new Map<string, Rec>();
  const stages = new Map<string, Rec>();
  const questions = new Map<string, Rec>();
  const answers = new Map<string, Rec>();
  let page: Rec | undefined;
  let flow: Rec | undefined;
  const order: Rec[] = [];
  for (const { rec: r, line } of all) {
    const where = `line ${line}: ${r.type} ${r.id}`;
    switch (r.type) {
      case "page":
        str(r, "title", where);
        str(r, "crumb", where, true);
        page = r;
        break;
      case "stage":
        str(r, "skill", where);
        str(r, "title", where);
        if (!STAGE_STATES.includes(r.state)) fail(where, `state must be ${STAGE_STATES.slice(0, -1).join(", ")}, or ${STAGE_STATES.at(-1)}`);
        int(r, "order", where);
        stages.set(r.id, r);
        break;
      case "round":
        int(r, "session", where);
        int(r, "round", where);
        str(r, "stage", where, true);
        if (typeof r.time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(r.time)) fail(where, "time must be an ISO timestamp such as 2026-10-09T15:00:00+07:00");
        rounds.set(r.id, r);
        order.push(r);
        break;
      case "question": {
        str(r, "round", where);
        int(r, "q", where);
        if (["plain", "why", "settled"].some((k) => r[k] !== undefined)) fail(where, "has plain, why, and settled from an older page; write one description instead and start a new page");
        for (const k of ["title", "description"]) str(r, k, where);
        str(r, "example", where, true);
        entryList(r, "today", ["text", "source"], where);
        entryList(r, "terms", ["term", "text"], where);
        if (Array.isArray(r.visual)) {
          if (!r.visual.length) fail(where, "visual must be one visual or a list of one or more");
          r.visual.forEach((v: unknown, i: number) => checkVisual(v, `${where}: visual ${i + 1}`));
        } else if (r.visual !== undefined) checkVisual(r.visual, `${where}: visual`);
        if (!Array.isArray(r.options) || r.options.length < 2) fail(where, "options must list two or more options");
        let recommended = 0;
        (r.options as Option[]).forEach((o, i) => {
          const ow = `${where}: option ${letter(i)}`;
          if (typeof o !== "object" || o === null) fail(ow, "must be an object");
          const label = str(o as unknown as Rec, "label", ow)!;
          if (!label.startsWith(`${letter(i)}. `) || label.slice(3).trim() === "") fail(ow, `label must start with "${letter(i)}. ", the same text as the ask label`);
          str(o as unknown as Rec, "does", ow);
          strList(o.gains, "gains", ow);
          strList(o.costs, "costs", ow);
          if (o.recommended !== undefined) {
            str(o as unknown as Rec, "recommended", ow);
            recommended++;
          }
          if (o.preview !== undefined) checkVisual(o.preview, `${ow}: preview`);
        });
        if (recommended > 1) fail(where, "at most one option can be recommended");
        questions.set(r.id, r);
        break;
      }
      case "answer": {
        str(r, "question", where);
        const kinds = ["picks", "other", "unanswered"].filter((k) => r[k] !== undefined);
        if (kinds.length !== 1) fail(where, "must have exactly one of picks, other, or unanswered");
        if (r.picks !== undefined) strList(r.picks, "picks", where);
        if (r.other !== undefined) str(r, "other", where);
        if (r.unanswered !== undefined && typeof r.unanswered !== "string") fail(where, "unanswered must be a string (it can be empty)");
        str(r, "note", where, true);
        answers.set(r.question, r);
        break;
      }
      case "close": {
        int(r, "session", where);
        str(r, "answer", where, true);
        str(r, "note", where, true);
        if (!Array.isArray(r.decisions) || r.decisions.length === 0) fail(where, "decisions must list one { question, text } per decision");
        for (const dec of r.decisions) {
          if (typeof dec !== "object" || dec === null) fail(where, "each decision must be an object");
          str(dec, "question", `${where}: decision`);
          str(dec, "text", `${where}: decision ${dec.question}`);
        }
        if (r.extra !== undefined) strList(r.extra, "extra", where);
        order.push(r);
        break;
      }
      case "flow": {
        for (const k of ["slug", "key"]) if (typeof r[k] !== "string" || !ID.test(r[k])) fail(where, `${k} must be lowercase letters, digits, and hyphens`);
        if (r.state !== "open" && r.state !== "closed") fail(where, "state must be open or closed");
        str(r, "spec", where, true);
        str(r, "branch", where, true);
        for (const k of ["tickets", "runs", "old_keys"]) if (r[k] !== undefined) strList(r[k], k, where);
        if ((r.old_keys ?? []).some((k: string) => !ID.test(k))) fail(where, "old_keys must be lowercase letters, digits, and hyphens");
        if (flow) fail(where, `a page has one flow record, and flow ${flow.id} is already on it`);
        if (!folder.endsWith(`-${r.key}`) || folder.length <= r.key.length + 1) fail(where, `key ${r.key} does not match the folder ${folder}, which must be <project>-${r.key}. Change the key with rename`);
        flow = r;
        break;
      }
      default:
        fail(where, "type must be page, stage, round, question, answer, close, or flow");
    }
  }
  if (!page) fail("state", "needs one page record");
  for (const r of rounds.values()) if (r.stage !== undefined && !stages.has(r.stage)) fail(`round ${r.id}`, `stage ${r.stage} does not exist`);
  for (const q of questions.values()) if (!rounds.has(q.round)) fail(`question ${q.id}`, `round ${q.round} does not exist`);
  for (const a of answers.values()) {
    const q = questions.get(a.question);
    if (!q) fail(`answer ${a.id}`, `question ${a.question} does not exist`);
    for (const p of a.picks ?? []) if (letterIndex(p) < 0 || letterIndex(p) >= q!.options.length) fail(`answer ${a.id}`, `question ${a.question} has no option ${p}`);
  }
  for (const c of order) {
    if (c.type !== "close") continue;
    const latest = latestBySession(order.slice(0, order.indexOf(c)), questions, c.session);
    if (latest.size === 0) fail(`close ${c.id}`, `session ${c.session} has no questions`);
    const named = new Map<number, string>();
    for (const dec of c.decisions as Rec[]) {
      const q = questions.get(dec.question);
      if (!q) fail(`close ${c.id}`, `question ${dec.question} does not exist`);
      if (latest.get(q!.q)?.id !== q!.id) fail(`close ${c.id}`, `${dec.question} is not the latest ask of Q${q!.q} in session ${c.session}`);
      if (named.has(q!.q)) fail(`close ${c.id}`, `Q${q!.q} has two decisions`);
      named.set(q!.q, dec.question);
    }
    for (const [n] of latest) if (!named.has(n)) fail(`close ${c.id}`, `Q${n} has no decision`);
  }
  return { page: page!, order, questions, answers, rounds, stages: [...stages.values()], flow, records: all.map((l) => l.rec) };
}

/** The latest ask of each Q number in one session, by Q number, among the rounds in `order`. */
function latestBySession(order: Rec[], questions: Map<string, Rec>, session: number): Map<number, Rec> {
  const latest = new Map<number, Rec>();
  for (const r of order) if (r.type === "round" && r.session === session) for (const q of questions.values()) if (q.round === r.id) latest.set(q.q, q);
  return new Map([...latest].sort(([a], [b]) => a - b));
}

const letter = (i: number) => String.fromCharCode(65 + i);
const letterIndex = (s: string) => (/^[A-Z]$/.test(s) ? s.charCodeAt(0) - 65 : -1);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Escaped text with `code` and [text](https://url) kept. */
function text(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|file:\/\/|#)[^)\s]+)\)/g, (_, t, u) => `<a href="${u}">${t}</a>`);
}

function scopeCss(css: string, id: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel: string, body: string) => {
    const scoped = sel.split(",").map((s) => s.trim()).filter(Boolean).map((s) => (s === ":scope" ? `#${id}` : `#${id} ${s.replace(/^:scope\s*/, "")}`));
    return `${scoped.join(", ")} { ${body.trim()} }\n`;
  });
}

function visualHtml(v: Visual, id: string, cls: string, baseDir: string): string {
  if (v.text !== undefined) return `<div class="${cls}" id="${id}"><pre>${esc(v.text)}</pre></div>`;
  if (v.svg !== undefined) {
    const path = isAbsolute(v.svg) ? v.svg : resolve(baseDir, v.svg);
    if (!existsSync(path)) fail(`visual ${id}`, `svg file ${path} does not exist`);
    const svg = readFileSync(path, "utf8").replace(/<\?xml[^>]*\?>\s*/, "").trim();
    if (!svg.startsWith("<svg")) fail(`visual ${id}`, `${path} must be an <svg>`);
    const svgProblems = unsafeMarkup(svg, true);
    if (/@import|javascript:|expression\(/i.test(svg)) svgProblems.push("its styles import a file or hold a script URL");
    if (svgProblems.length) fail(`visual ${id}`, `${path} is not safe: ${svgProblems.join("; ")}`);
    return `<figure class="${cls}" id="${id}">${svg}</figure>`;
  }
  const style = v.css ? `<style>${scopeCss(v.css, id)}</style>` : "";
  return `<div class="${cls}" id="${id}">${style}${v.html}</div>`;
}

function formatTime(iso: string): string {
  const [, y, mo, d, h, mi] = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)!;
  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(mo) - 1];
  return `${d} ${month} ${y}, ${h}:${mi}`;
}

const stateOf = (a: Rec | undefined) => (!a ? "open" : a.unanswered !== undefined ? "unanswered" : "answered");

/** The line under the options, only when it says more than the picked label: [label, html]. */
function answerLine(a: Rec | undefined): [string, string] | undefined {
  if (!a) return undefined;
  if (a.unanswered !== undefined) return ["Unanswered", text(a.unanswered || "The ask timed out or was cancelled. This is not your answer, and the question stays open.")];
  if (a.other !== undefined) return ["Your answer", text(a.note ? `${a.other}. Note: "${a.note}"` : a.other)];
  if (a.note) return ["Your note", text(a.note)];
  return undefined;
}

/** Paragraphs split on blank lines; a block whose lines all start with "- " is a bullet list. */
function description(s: string): string {
  const blocks = s.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim());
      if (lines.every((l) => l.startsWith("- "))) return `<ul class="bullets">${lines.map((l) => `<li>${text(l.slice(2))}</li>`).join("")}</ul>`;
      return `<p>${text(lines.join(" "))}</p>`;
    })
    .join("");
}

function questionHtml(q: Rec, a: Rec | undefined, baseDir: string): string {
  const qid = `q-${q.id}`;
  const facts = ((q.today ?? []) as Rec[]).map((f) => `<li>${text(f.text)} <span class="source">${text(f.source)}</span></li>`).join("");
  const today = facts ? `\n<div class="today"><p class="label">Today</p><ul class="bullets">${facts}</ul></div>` : "";
  const notes = ((q.terms ?? []) as Rec[]).map((t) => `<dt>${text(t.term)}</dt><dd>${text(t.text)}</dd>`).join("");
  const terms = notes ? `\n<div class="terms"><p class="label">Term notes</p><dl>${notes}</dl></div>` : "";
  const example = q.example ? `\n<div class="example"><p class="label">Example</p><p>${text(q.example)}</p></div>` : "";
  const picks = new Set<string>(a?.picks ?? []);
  const options = (q.options as Option[])
    .map((o, i) => {
      const L = letter(i);
      const attrs = `${o.recommended ? " data-recommended" : ""}${picks.has(L) ? " data-picked" : ""}`;
      const star = o.recommended ? `<span class="star" aria-hidden="true">*</span><span class="sr-only"> (recommended)</span>` : "";
      const mark = picks.has(L) ? `<span class="sr-only"> (your answer)</span>` : "";
      const preview = o.preview ? visualHtml(o.preview, `${qid}-${L.toLowerCase()}`, "preview", baseDir) : "";
      const trade = [...o.gains.map((g) => `<li class="gain">${text(g)}</li>`), ...o.costs.map((c) => `<li class="cost">${text(c)}</li>`)].join("");
      const why = o.recommended ? `<p class="why">Recommended: ${text(o.recommended)}</p>` : "";
      return `<li class="option"${attrs}><h4>${text(o.label.slice(3))}${star}${mark}</h4>${preview}<p>${text(o.does)}</p><ul class="trade">${trade}</ul>${why}</li>`;
    })
    .join("\n");
  const state = stateOf(a);
  const line = answerLine(a);
  const visuals: Visual[] = q.visual === undefined ? [] : Array.isArray(q.visual) ? q.visual : [q.visual];
  const visual = visuals.map((v, i) => visualHtml(v, `${qid}-visual${i ? `-${i + 1}` : ""}`, "visual", baseDir)).join("\n");
  return `<article class="question" id="${qid}" data-state="${state}" data-stop>
<h3><span class="qnum">Q${q.q}</span>${text(q.title)}</h3>
<div class="description">${description(q.description)}</div>${today}${terms}${example}
${visual}<ol class="options">
${options}
</ol>${line ? `\n<p class="answer" data-state="${state}"><span class="label">${line[0]}</span><span>${line[1]}</span></p>` : ""}
</article>`;
}

/** Rounds with no stage, from before Stages, render in this one implicit Stage. Its id cannot be a record id. */
const IMPLICIT_STAGE = "_grilling";

function render(s: State, baseDir: string): string {
  // A round renders in its stage's tab, and a close in the tab of its session's last round before it.
  const stageOf = new Map<Rec, string>();
  const sessionStage = new Map<number, string>();
  for (const item of s.order) {
    if (item.type === "round") sessionStage.set(item.session, item.stage ?? IMPLICIT_STAGE);
    stageOf.set(item, sessionStage.get(item.session)!);
  }
  const stages = [...s.stages].sort((a, b) => a.order - b.order);
  if (s.order.some((r) => r.type === "round" && r.stage === undefined)) stages.unshift({ type: "stage", id: IMPLICIT_STAGE, title: "Grilling" });
  const questionsOf = (roundId: string) => [...s.questions.values()].filter((q) => q.round === roundId);
  const lastClose = new Map<number, string>();
  for (const r of s.order) if (r.type === "close") lastClose.set(r.session, r.id);
  const qnum = (id: string) => s.questions.get(id)!.q;
  const decisionsOf = (close: Rec) => [...(close.decisions as Rec[])].sort((a, b) => qnum(a.question) - qnum(b.question)).map((dec) => `<li><a href="#q-${dec.question}">Q${qnum(dec.question)}</a>: ${text(dec.text)}</li>`);

  const tabs = [`<a role="tab" id="tab-overview" aria-selected="true" aria-controls="overview" href="#overview">Overview</a>`];
  const qrows: string[] = [];
  const overview: string[] = [];
  const panels: string[] = [];
  for (const st of stages) {
    const pid = `stage-${st.id}`;
    const nav: string[] = [];
    const body: string[] = [];
    const items = s.order.filter((i) => stageOf.get(i) === st.id);
    for (const item of items) {
      if (item.type === "round") {
        const qs = questionsOf(item.id);
        const head = `<header><h2 id="round-${item.id}">Session ${item.session}, round ${item.round}<time datetime="${esc(item.time)}">${formatTime(item.time)}</time></h2></header>`;
        body.push(`<section class="round" aria-labelledby="round-${item.id}">\n${head}\n${qs.map((q) => questionHtml(q, s.answers.get(q.id), baseDir)).join("\n")}\n</section>`);
        if (qs.length) {
          if (nav.length) nav.push(`<span class="sep" aria-hidden="true"></span>`);
          for (const q of qs) nav.push(`<a href="#q-${q.id}" data-for="q-${q.id}"><span class="dot" data-state="${stateOf(s.answers.get(q.id))}"></span>Q${q.q}</a>`);
        }
      } else {
        const bullets = [...decisionsOf(item), ...((item.extra as string[] | undefined) ?? []).map((e) => `<li>${text(e)}</li>`)].join("\n");
        const gate = item.answer ? (item.note ? `${item.answer}. Note: "${item.note}"` : `${item.answer}.`) : "Waiting for your answer.";
        const latest = lastClose.get(item.session) === item.id;
        body.push(`<section class="summary" id="close-${item.id}" aria-labelledby="close-${item.id}-title"${latest ? " data-stop" : ""}>
<h2 id="close-${item.id}-title">Summary of session ${item.session}</h2>
<ul class="decisions">
${bullets}
</ul>
<p class="answer"><span class="label">Closing gate</span><span>${text(gate)}</span></p>
</section>`);
        if (latest) nav.push(`<span class="sep" aria-hidden="true"></span><a href="#close-${item.id}" data-for="close-${item.id}">Summary</a>`);
      }
    }
    // An implicit Stage is finished once its last record is an answered close.
    const last = items.at(-1);
    const state = st.state ?? (last?.type === "close" && last.answer ? "finished" : "in-progress");
    const dot = `<span class="dot" data-state="${state}"></span>`;
    const decisions = items.filter((i) => i.type === "close" && lastClose.get(i.session) === i.id).flatMap(decisionsOf);
    const sessions = new Set(items.filter((i) => i.type === "round").map((r) => r.session as number));
    const open = [...sessions].flatMap((n) => [...latestBySession(items, s.questions, n).values()]).filter((q) => stateOf(s.answers.get(q.id)) !== "answered");
    const openItems = open.map((q) => `<li><a href="#q-${q.id}">Q${q.q}</a>: ${text(q.title)}</li>`);
    tabs.push(`<a role="tab" id="tab-${pid}" aria-selected="false" aria-controls="${pid}" href="#${pid}">${dot}${text(st.title)}</a>`);
    if (nav.length) qrows.push(`<nav class="qnav" aria-label="Questions in ${esc(st.title)}" data-tab="${pid}" hidden>${nav.join("")}</nav>`);
    overview.push(`<li class="stage" data-state="${state}">
<h3><a href="#${pid}">${dot}${text(st.title)}</a><span class="meta"><span class="state">${STATE_LABELS[state]}</span>${st.skill ? `<span>${text(st.skill)}</span>` : ""}</span></h3>
<p class="label">Decisions</p>${decisions.length ? `<ul>${decisions.join("")}</ul>` : `<p class="empty">No decisions yet.</p>`}
<p class="label">Open questions</p>${openItems.length ? `<ul>${openItems.join("")}</ul>` : `<p class="empty">No open questions.</p>`}
</li>`);
    panels.push(`<section class="tab" id="${pid}" role="tabpanel" aria-labelledby="tab-${pid}" hidden>\n${body.join("\n") || `<p class="empty">No rounds yet.</p>`}\n</section>`);
  }
  const head = `<header class="page-head">${s.page.crumb ? `<p class="crumb">${text(s.page.crumb)}</p>` : ""}<h1>${text(s.page.title)}</h1></header>`;
  const overviewPanel = `<section class="tab" id="overview" role="tabpanel" aria-labelledby="tab-overview">\n${overview.length ? `<ol class="stages">\n${overview.join("\n")}\n</ol>` : `<p class="empty">No Stage yet.</p>`}\n</section>`;
  const bar = `<header class="bar">\n<div class="tabs" role="tablist" aria-label="Stages">${tabs.join("")}</div>\n${qrows.join("\n")}\n</header>`;
  return readFileSync(TEMPLATE, "utf8").replace("{{title}}", esc(s.page.title)).replace("<!-- NAV -->", bar).replace("<!-- BODY -->", [head, overviewPanel, ...panels].join("\n"));
}

/** Writes flow.json from the flow record, so a later Stage can match the flow by any of its values, and makes figures/. */
function writeFlow(flow: Rec, folder: string): void {
  const { type: _, ...fields } = flow;
  writeFileSync(join(folder, "flow.json"), `${JSON.stringify(fields, null, 2)}\n`);
  mkdirSync(join(folder, "figures"), { recursive: true });
}

function answerRecords(specs: string[]): string {
  if (specs.length === 0) usage("answer needs one or more <question-id>=<spec>");
  return specs
    .map((spec) => {
      const m = spec.match(/^([a-z0-9][a-z0-9-]*)=([^:]*)(?::([\s\S]*))?$/);
      if (!m) usage(`bad answer ${JSON.stringify(spec)}; use <question-id>=A, =A,B:note, =other:text, or =unanswered:reason`);
      const [, question, head, rest] = m;
      const rec: Rec = { type: "answer", id: `answer-${question}`, question };
      if (head === "other") {
        if (!rest) usage(`${question}=other needs :<text>`);
        rec.other = rest;
      } else if (head === "unanswered") rec.unanswered = rest ?? "";
      else {
        rec.picks = head.split(",").map((p) => p.trim().toUpperCase());
        if (rest) rec.note = rest;
      }
      return JSON.stringify(rec);
    })
    .join("\n");
}

/** A copy of `v` with `fix` applied to the path of every SVG visual in it, at any depth. */
function mapSvgs(v: unknown, fix: (path: string) => string): any {
  if (Array.isArray(v)) return v.map((x) => mapSvgs(x, fix));
  if (typeof v !== "object" || v === null) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "svg" && typeof x === "string" ? fix(x) : mapSvgs(x, fix)]));
}

const inside = (path: string, dir: string) => path.startsWith(dir + sep);

/** The records that rename appends to move the flow folder from `folder` to `target`: each record with an absolute
 *  SVG path into the folder, stored again with that path relative to the folder, and then the flow record with its
 *  new key and the old key in old_keys. Refuses when any SVG visual would not resolve after the move. */
function renameRecords(s: State, folder: string, target: string, newKey: string): string {
  const realFolder = realpathSync(folder);
  const unresolved: string[] = [];
  const out: Rec[] = [];
  for (const r of s.records) {
    let changed = false;
    const fixed = mapSvgs(r, (p) => {
      const after = isAbsolute(p) ? p : resolve(target, p);
      const now = inside(after, target) ? join(folder, relative(target, after)) : after;
      const real = existsSync(now) ? realpathSync(now) : undefined;
      if (real !== undefined && inside(real, realFolder) && isAbsolute(p)) {
        changed = true;
        return relative(realFolder, real);
      }
      if (real === undefined || (inside(real, realFolder) && !inside(after, target))) unresolved.push(`${r.type} ${r.id}: ${p}`);
      return p;
    });
    if (changed) out.push(fixed);
  }
  if (unresolved.length) fail("rename", `${unresolved.join(", ")} would not resolve after the move. Store each SVG as a path relative to the flow folder`);
  out.push({ ...s.flow!, key: newKey, old_keys: [...(s.flow!.old_keys ?? []), s.flow!.key] });
  return out.map((r) => JSON.stringify(r)).join("\n");
}

const [command, statePath, ...rest] = Bun.argv.slice(2);
if (!["append", "answer", "render", "rename"].includes(command ?? "")) usage("give a command: append, answer, render, or rename");
if (!statePath || !statePath.endsWith(".jsonl")) usage("give the state file, ending in .jsonl");
const state = resolve(statePath);
const page = state.replace(/\.jsonl$/, ".html");
if (!existsSync(state) && existsSync(page)) {
  process.stderr.write(`grilling-page.ts: ${page} exists but was not made by grilling-page.ts. Start a new page with a new name.\n`);
  process.exit(1);
}

let added = "";
if (command === "append") {
  if (rest.length > 1) usage("append takes at most one records file");
  added = rest[0] === undefined || rest[0] === "-" ? await Bun.stdin.text() : readFileSync(rest[0], "utf8");
  if (added.trim() === "") usage("append got no records");
} else if (command === "answer") added = answerRecords(rest);
else if (command === "rename") {
  if (rest.length !== 1 || !ID.test(rest[0])) usage("rename takes one new key of lowercase letters, digits, and hyphens");
} else if (rest.length) usage("render takes no more arguments");

try {
  const old = existsSync(state) ? readFileSync(state, "utf8") : "";
  const oldLines = old === "" ? 0 : old.replace(/\n$/, "").split("\n").length;
  let lines = [...parseLines(old, 1, "state"), ...parseLines(added, oldLines + 1, command === "append" && rest[0] && rest[0] !== "-" ? rest[0] : "input")];
  const folder = dirname(state);
  let s = check(lines, basename(folder));
  let target = folder;
  if (command === "rename") {
    if (!s.flow) fail("rename", "rename needs a flow record. Append one first");
    target = join(dirname(folder), basename(folder).slice(0, -s.flow!.key.length) + rest[0]);
    if (existsSync(target)) fail("rename", `${target} already exists`);
    added = renameRecords(s, folder, target, rest[0]);
    lines = [...lines, ...parseLines(added, oldLines + 1, "rename")];
    s = check(lines, basename(target));
  }
  // Render before the move: after rename's records, every SVG path reads the same file from the old folder as from the new one.
  const html = render(s, folder);
  mkdirSync(folder, { recursive: true });
  if (target !== folder) renameSync(folder, target);
  const newState = join(target, basename(state));
  const newPage = join(target, basename(page));
  if (added.trim() !== "") appendFileSync(newState, (old === "" || old.endsWith("\n") ? "" : "\n") + added.trim() + "\n");
  writeFileSync(newPage, html);
  if (s.flow) writeFlow(s.flow, target);
  process.stdout.write(`${newPage}\n`);
} catch (e) {
  if (!(e instanceof RecordError)) throw e;
  process.stderr.write(`grilling-page.ts: ${e.message}\nNothing was written.\n`);
  process.exit(1);
}
