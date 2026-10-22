// Keeps a Grilling page from a JSONL state file and renders the whole page on every command but a same-key rename.
//
//   bun grilling-page.ts append <state.jsonl> [<records.jsonl> | -]
//   bun grilling-page.ts answer <state.jsonl> <question-id>=<spec> ...
//   bun grilling-page.ts render <state.jsonl>
//   bun grilling-page.ts rename <state.jsonl> <new-key>
//
// The page is the state path with .html in place of .jsonl. Each state line is one JSON record.
// A later line with the same id replaces an earlier one. Every command checks all records,
// renders the page from templates/grilling-page.html, and prints the page's absolute path.
// Successful append also prints a compact JSON metadata array to stderr after writing.
// With a flow record, the state file's folder is the flow folder <project>-<key>/: every command also
// writes flow.json from that record and makes figures/. rename moves the folder to <project>-<new-key>/.
// The exception: rename to the current key checks the records, writes nothing, and prints the page path.
// An answer <spec> is A or A,B (picked options), with an optional :note; other:<text>; or unanswered[:<reason>].
// Exit 0 prints the path; exit 1 is a record error and writes nothing; exit 2 is a usage error.

import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { constants, tmpdir } from "node:os";
import { dlopen, read } from "bun:ffi";

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

function parseLines(text: string, firstLine: number, source: string, assignIds = false): Line[] {
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
    if (!(assignIds && r.id === undefined) && (typeof r.id !== "string" || !ID.test(r.id))) fail(where, `id must be lowercase letters, digits, and hyphens, got ${JSON.stringify(r.id)}`);
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
function entryList(r: Rec, key: string, fields: string[], where: string, required = false): void {
  const v = r[key];
  if (v === undefined && !required) return;
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

function checkVisuals(v: unknown, where: string): Visual[] {
  if (!Array.isArray(v)) return [checkVisual(v, `${where}: visual`)];
  if (!v.length) fail(where, "visual must be one visual or a list of one or more");
  return v.map((x, i) => checkVisual(x, `${where}: visual ${i + 1}`));
}
const visualsOf = (v: Visual | Visual[] | undefined): Visual[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

const STATE_LABELS: Record<string, string> = { "not-started": "Not started", "in-progress": "In progress", finished: "Finished" };
const STAGE_STATES = Object.keys(STATE_LABELS);
const STAGE_LABELS: Record<string, string> = {
  grilling: "Grill",
  "grill-me": "Grill",
  "grill-with-docs": "Grill",
  "domain-modeling": "Domain",
  "diagram-design": "Diagram",
  triage: "Triage",
  "to-spec": "Spec",
  "to-tickets": "Tickets",
  "to-questionnaire": "Questionnaire",
  "improve-codebase-architecture": "Architecture",
  prototype: "Prototype",
  wayfinder: "Map",
  teach: "Teach",
  implement: "Implement",
  "implement-spec": "Implement",
  tdd: "TDD",
  "code-review": "Review",
  session: "Retro",
};
const CLAIM_LABELS: Record<string, string> = { confirmed: "Confirmed", cleared: "Cleared", unproven: "Unproven" };
const CLAIM_STATES = Object.keys(CLAIM_LABELS);
const SHAPES = ["cards", "ledger", "table"];
const listed = (xs: string[]) => `${xs.slice(0, -1).join(", ")}, or ${xs.at(-1)}`;

const entriesOf = (r: Rec): Rec[] => (r.shape === "table" ? r.rows : r.entries);

function checkReport(r: Rec, where: string): void {
  str(r, "stage", where);
  str(r, "title", where);
  str(r, "summary", where, true);
  if (!SHAPES.includes(r.shape)) fail(where, `shape must be ${listed(SHAPES)}`);
  const [key, other] = r.shape === "table" ? ["rows", "entries"] : ["entries", "rows"];
  if (r[other] !== undefined) fail(where, `a ${r.shape} report has ${key}, not ${other}`);
  if (r.shape === "table") strList(r.columns, "columns", where);
  else if (r.columns !== undefined) fail(where, `a ${r.shape} report has no columns`);
  if (!Array.isArray(r[key]) || r[key].length === 0) fail(where, `${key} must list one or more ${r.shape === "table" ? "rows" : "entries"}`);
  const seen = new Set<string>();
  (r[key] as unknown[]).forEach((e, i) => {
    const kind = r.shape === "table" ? "row" : "entry";
    if (typeof e !== "object" || e === null || Array.isArray(e)) fail(`${where}: ${kind} ${i + 1}`, "must be an object");
    const en = e as Rec;
    if (typeof en.id !== "string" || !ID.test(en.id)) fail(`${where}: ${kind} ${i + 1}`, "id must be lowercase letters, digits, and hyphens");
    const ew = `${where}: ${kind} ${en.id}`;
    if (seen.has(en.id)) fail(ew, "id is used by another entry of this report");
    seen.add(en.id);
    str(en, "question", ew, true);
    if (r.shape === "cards") {
      for (const k of ["title", "label", "impact", "evidence", "action"]) str(en, k, ew);
      if (typeof en.blocking !== "boolean") fail(ew, "blocking must be true or false");
      if (en.visual !== undefined) checkVisuals(en.visual, ew);
    } else if (r.shape === "ledger") {
      for (const k of ["claim", "evidence", "missing_proof", "consequence"]) str(en, k, ew);
      if (!CLAIM_STATES.includes(en.status)) fail(ew, `status must be ${listed(CLAIM_STATES)}`);
    } else if (!Array.isArray(en.cells) || en.cells.length !== r.columns.length || en.cells.some((c: unknown) => typeof c !== "string")) {
      fail(ew, `cells must list ${r.columns.length} strings, one per column`);
    }
  });
}

type State = { page: Rec; order: Rec[]; questions: Map<string, Rec>; answers: Map<string, Rec>; rounds: Map<string, Rec>; stages: Rec[]; reports: Map<string, Rec>; backgrounds: Map<string, Rec>; topics: Map<string, Rec>; flow?: Rec; records: Rec[] };

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
  const reports = new Map<string, Rec>();
  const backgrounds: Rec[] = [];
  const topics = new Map<string, Rec>();
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
        if (!STAGE_LABELS[r.skill]) fail(where, `skill ${r.skill} has no tab label. Add it to STAGE_LABELS in grilling-page.ts`);
        if (!STAGE_STATES.includes(r.state)) fail(where, `state must be ${listed(STAGE_STATES)}`);
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
        str(r, "again", where, true);
        entryList(r, "today", ["text", "source"], where);
        entryList(r, "terms", ["term", "text"], where);
        if (r.visual !== undefined) checkVisuals(r.visual, where);
        if (r.report_entries !== undefined && strList(r.report_entries, "report_entries", where).some((e) => !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(e))) fail(where, "report_entries must list <report id>/<entry id> strings");
        if (r.topics !== undefined) strList(r.topics, "topics", where);
        if (!Array.isArray(r.options) || r.options.length === 0) fail(where, "options must list one or more options");
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
        str(r, "stage", where, true);
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
      case "background":
        for (const k of ["stage", "title", "summary"]) str(r, k, where);
        entryList(r, "sections", ["heading", "body"], where, true);
        strList(r.sources, "sources", where);
        if (r.visual !== undefined) checkVisuals(r.visual, where);
        backgrounds.push(r);
        break;
      case "topic":
        for (const k of ["title", "summary", "body"]) str(r, k, where);
        strList(r.sources, "sources", where);
        topics.set(r.id, r);
        break;
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
      case "report":
        checkReport(r, where);
        reports.set(r.id, r);
        break;
      default:
        fail(where, "type must be page, stage, round, question, answer, close, flow, report, background, or topic");
    }
  }
  if (!page) fail("state", "needs one page record");
  for (const r of rounds.values()) if (r.stage !== undefined && !stages.has(r.stage)) fail(`round ${r.id}`, `stage ${r.stage} does not exist`);
  const backgroundOf = new Map<string, Rec>();
  for (const b of backgrounds) {
    if (!stages.has(b.stage)) fail(`background ${b.id}`, `stage ${b.stage} does not exist`);
    const other = backgroundOf.get(b.stage);
    if (other) fail(`background ${b.id}`, `stage ${b.stage} already has background ${other.id}`);
    backgroundOf.set(b.stage, b);
  }
  for (const q of questions.values()) if (!rounds.has(q.round)) fail(`question ${q.id}`, `round ${q.round} does not exist`);
  for (const r of reports.values()) {
    if (!stages.has(r.stage)) fail(`report ${r.id}`, `stage ${r.stage} does not exist`);
    for (const e of entriesOf(r)) if (e.question !== undefined && !questions.has(e.question)) fail(`report ${r.id}`, `${r.shape === "table" ? "row" : "entry"} ${e.id} links question ${e.question}, which does not exist`);
  }
  for (const q of questions.values())
    for (const link of (q.report_entries ?? []) as string[]) {
      const [rid, eid] = link.split("/");
      if (!reports.has(rid) || !entriesOf(reports.get(rid)!).some((e) => e.id === eid)) fail(`question ${q.id}`, `report entry ${link} does not exist`);
    }
  for (const q of questions.values()) for (const t of q.topics ?? []) if (!topics.has(t)) fail(`question ${q.id}`, `topic ${t} does not exist`);
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
  return { page: page!, order, questions, answers, rounds, stages: [...stages.values()], reports, backgrounds: backgroundOf, topics, flow, records: all.map((l) => l.rec) };
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

function answerLabel(q: Rec, a: Rec | undefined): string | undefined {
  if (a?.picks) return (a.picks as string[]).map((p) => (q.options as Option[])[letterIndex(p)].label).join(", ");
  return a?.other;
}

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

const entryAnchor = (report: string, entry: string) => `report-${report}_${entry}`;
const entryName = (r: Rec, e: Rec): string => (r.shape === "cards" ? e.title : r.shape === "ledger" ? e.claim : e.cells[0] || e.id);

function questionHtml(q: Rec, a: Rec | undefined, baseDir: string, reports: Map<string, Rec>, topics: Map<string, Rec>, open: boolean): string {
  const qid = `q-${q.id}`;
  const facts = ((q.today ?? []) as Rec[]).map((f) => `<li>${text(f.text)} <span class="source">${text(f.source)}</span></li>`).join("");
  const today = facts ? `\n<div class="today"><p class="label">Today</p><ul class="bullets">${facts}</ul></div>` : "";
  const notes = ((q.terms ?? []) as Rec[]).map((t) => `<dt>${text(t.term)}</dt><dd>${text(t.text)}</dd>`).join("");
  const terms = notes ? `\n<div class="terms"><p class="label">Term notes</p><dl>${notes}</dl></div>` : "";
  const links = ((q.topics ?? []) as string[]).map((id) => `<li><a href="#topic-${id}">${text(topics.get(id)!.title)}</a>: ${text(topics.get(id)!.summary)}</li>`).join("");
  const topicNotes = links ? `\n<div class="topics"><p class="label">Topic notes</p><ul class="bullets">${links}</ul></div>` : "";
  const example = q.example ? `\n<div class="example"><p class="label">Example</p><p>${text(q.example)}</p></div>` : "";
  const refs = ((q.report_entries ?? []) as string[]).map((ref) => {
    const [rid, eid] = ref.split("/");
    const r = reports.get(rid)!;
    return `<li><a href="#${entryAnchor(rid, eid)}">${text(r.title)} <span class="entry-id">${eid}</span></a>: ${text(entryName(r, entriesOf(r).find((e) => e.id === eid)!))}</li>`;
  });
  const reportLinks = refs.length ? `\n<div class="report-links"><p class="label">From the report</p><ul class="bullets">${refs.join("")}</ul></div>` : "";
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
      return `<li class="option"${attrs}><h4>${text(o.label)}${star}${mark}</h4>${preview}<p>${text(o.does)}</p><ul class="trade">${trade}</ul>${why}</li>`;
    })
    .join("\n");
  const state = stateOf(a);
  const line = answerLine(a);
  const visual = visualsOf(q.visual).map((v, i) => visualHtml(v, `${qid}-visual${i ? `-${i + 1}` : ""}`, "visual", baseDir)).join("\n");
  return `<article class="question" id="${qid}" data-state="${state}"${open ? " data-open" : ""} data-stop>
<h3><span class="qnum">Q${q.q}</span>${text(q.title)}</h3>
<div class="description">${description(q.description)}</div>${reportLinks}${today}${terms}${topicNotes}${example}
${visual}<ol class="options">
${options}
</ol>${line ? `\n<p class="answer" data-state="${state}"><span class="label">${line[0]}</span><span>${line[1]}</span></p>` : ""}
</article>`;
}

function reportHtml(r: Rec, questions: Map<string, Rec>, baseDir: string): string {
  const rid = `report-${r.id}`;
  const ask = (e: Rec) => {
    const q = e.question === undefined ? undefined : questions.get(e.question)!;
    return q ? `<a href="#q-${q.id}">Q${q.q}</a>: ${text(q.title)}` : "";
  };
  const fields = (pairs: [string, string][]) => `<dl class="fields">${pairs.map(([k, v]) => `<dt>${k}</dt><dd>${text(v)}</dd>`).join("")}</dl>`;
  const askLine = (e: Rec) => (e.question === undefined ? "" : `\n<p class="ask"><span class="label">Question</span><span>${ask(e)}</span></p>`);
  let entries: string;
  if (r.shape === "table") {
    const linked = (r.rows as Rec[]).some((e) => e.question !== undefined);
    const head = `<tr>${(r.columns as string[]).map((c) => `<th scope="col">${text(c)}</th>`).join("")}${linked ? `<th scope="col">Question</th>` : ""}</tr>`;
    const rows = (r.rows as Rec[]).map((e) => `<tr id="${entryAnchor(r.id, e.id)}">${(e.cells as string[]).map((c) => `<td>${text(c)}</td>`).join("")}${linked ? `<td>${ask(e)}</td>` : ""}</tr>`);
    entries = `<div class="table"><table>\n<thead>${head}</thead>\n<tbody>\n${rows.join("\n")}\n</tbody>\n</table></div>`;
  } else if (r.shape === "ledger") {
    const claims = (r.entries as Rec[]).map(
      (e) => `<li class="claim" id="${entryAnchor(r.id, e.id)}" data-status="${e.status}">
<h3><span class="entry-id">${e.id}</span>${text(e.claim)}</h3>
<p class="tag">${CLAIM_LABELS[e.status]}</p>
${fields([["Evidence", e.evidence], ["Missing proof", e.missing_proof], ["Consequence", e.consequence]])}${askLine(e)}
</li>`,
    );
    entries = `<ol class="entries">\n${claims.join("\n")}\n</ol>`;
  } else {
    const cards = (r.entries as Rec[]).map((e) => {
      const id = entryAnchor(r.id, e.id);
      const visual = visualsOf(e.visual).map((v, i) => visualHtml(v, `${id}_visual${i ? `-${i + 1}` : ""}`, "visual", baseDir)).join("\n");
      return `<li class="card" id="${id}"${e.blocking ? " data-blocking" : ""}>
<h3><span class="entry-id">${e.id}</span>${text(e.title)}</h3>
<p class="tag">${text(e.label)} (${e.blocking ? "blocking" : "non-blocking"})</p>
${fields([["Impact", e.impact], ["Evidence", e.evidence], ["Action", e.action]])}${visual ? `\n${visual}` : ""}${askLine(e)}
</li>`;
    });
    entries = `<ol class="entries">\n${cards.join("\n")}\n</ol>`;
  }
  const summary = r.summary ? `<p class="report-summary">${text(r.summary)}</p>` : "";
  return `<section class="report" id="${rid}" data-shape="${r.shape}" aria-labelledby="${rid}-title">
<header><h2 id="${rid}-title">${text(r.title)}</h2>${summary}</header>
${entries}
</section>`;
}

const sourcesHtml = (sources: string[]) => `<div class="sources"><p class="label">Sources</p><ul class="bullets">${sources.map((src) => `<li>${text(src)}</li>`).join("")}</ul></div>`;

function backgroundHtml(b: Rec, baseDir: string): string {
  const id = `background-${b.id}`;
  const visual = visualsOf(b.visual).map((v, i) => visualHtml(v, `${id}-visual${i ? `-${i + 1}` : ""}`, "visual", baseDir)).join("\n");
  const sections = (b.sections as Rec[]).map((sec) => `<section><h3>${text(sec.heading)}</h3><div class="description">${description(sec.body)}</div></section>`).join("\n");
  return `<section class="background" id="${id}" aria-labelledby="${id}-title">
<header><p class="label">Background</p><h2 id="${id}-title">${text(b.title)}</h2></header>
<p class="summary-line">${text(b.summary)}</p>
${visual}${sections}
${sourcesHtml(b.sources)}
</section>`;
}

const IMPLICIT_STAGE = "_grilling";

function render(s: State, baseDir: string): string {
  const stageOf = new Map<Rec, string>();
  const sessionStage = new Map<number, string>();
  for (const item of s.order) {
    if (item.type === "round") sessionStage.set(item.session, item.stage ?? IMPLICIT_STAGE);
    stageOf.set(item, sessionStage.get(item.session)!);
  }
  const stages = [...s.stages].sort((a, b) => a.order - b.order);
  const seen = new Map<string, number>();
  const labelOf = new Map<string, string>();
  for (const st of stages) {
    const base = STAGE_LABELS[st.skill];
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    labelOf.set(st.id, n === 1 ? base : `${base} ${n}`);
  }
  if (s.order.some((r) => r.type === "round" && r.stage === undefined)) {
    stages.unshift({ type: "stage", id: IMPLICIT_STAGE });
    labelOf.set(IMPLICIT_STAGE, "Grilling");
  }
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
    const label = text(labelOf.get(st.id)!);
    const nav: string[] = [];
    const body: string[] = [];
    const bg = s.backgrounds.get(st.id);
    if (bg) body.push(backgroundHtml(bg, baseDir));
    for (const r of s.reports.values()) if (r.stage === st.id) body.push(reportHtml(r, s.questions, baseDir));
    const items = s.order.filter((i) => stageOf.get(i) === st.id);
    const sessions = new Set(items.filter((i) => i.type === "round").map((r) => r.session as number));
    const asked = [...sessions].flatMap((n) => [...latestBySession(items, s.questions, n).values()]);
    const openIds = new Set(asked.filter((q) => stateOf(s.answers.get(q.id)) !== "answered").map((q) => q.id));
    for (const item of items) {
      if (item.type === "round") {
        const qs = questionsOf(item.id);
        const head = `<header><h2 id="round-${item.id}">Session ${item.session}, round ${item.round}<time datetime="${esc(item.time)}">${formatTime(item.time)}</time></h2></header>`;
        body.push(`<section class="round" aria-labelledby="round-${item.id}">\n${head}\n${qs.map((q) => questionHtml(q, s.answers.get(q.id), baseDir, s.reports, s.topics, openIds.has(q.id))).join("\n")}\n</section>`);
        if (qs.length) {
          if (nav.length) nav.push(`<span class="sep" aria-hidden="true"></span>`);
          for (const q of qs) nav.push(`<a href="#q-${q.id}" data-for="q-${q.id}"><span class="dot" data-state="${stateOf(s.answers.get(q.id))}"></span>Q${q.q}</a>`);
        }
      } else {
        const bullets = [...decisionsOf(item), ...((item.extra as string[] | undefined) ?? []).map((e) => `<li>${text(e)}</li>`)].join("\n");
        const latest = lastClose.get(item.session) === item.id;
        body.push(`<section class="summary" id="close-${item.id}" aria-labelledby="close-${item.id}-title"${latest ? " data-stop" : ""}>
<h2 id="close-${item.id}-title">Summary of session ${item.session}</h2>
<ul class="decisions">
${bullets}
</ul>
</section>`);
        if (latest) nav.push(`<span class="sep" aria-hidden="true"></span><a href="#close-${item.id}" data-for="close-${item.id}">Summary</a>`);
      }
    }
    const last = items.at(-1);
    const state = st.state ?? (last?.type === "close" ? "finished" : "in-progress");
    const dot = `<span class="dot" data-state="${state}"></span>`;
    const askedItems = asked.map((q) => {
      const shown = answerLabel(q, s.answers.get(q.id));
      return `<li><a href="#q-${q.id}">Q${q.q}</a> ${text(q.title)} <span class="${shown === undefined ? "open" : "pick"}">${shown === undefined ? "Open" : text(shown)}</span></li>`;
    });
    tabs.push(`<a role="tab" id="tab-${pid}" aria-selected="false" aria-controls="${pid}" href="#${pid}">${dot}${label}</a>`);
    if (nav.length) qrows.push(`<nav class="qnav" aria-label="Questions in ${label}" data-tab="${pid}" hidden>${nav.join("")}</nav>`);
    overview.push(`<li class="stage" data-state="${state}">
<h3><a href="#${pid}">${dot}${label}</a><span class="meta"><span class="state">${STATE_LABELS[state]}</span>${st.skill ? `<span>${text(st.skill)}</span>` : ""}</span></h3>
${askedItems.length ? `<ul>${askedItems.join("")}</ul>` : `<p class="empty">No questions yet.</p>`}
</li>`);
    panels.push(`<section class="tab" id="${pid}" role="tabpanel" aria-labelledby="tab-${pid}" hidden>\n${body.join("\n") || `<p class="empty">No rounds yet.</p>`}\n</section>`);
  }
  if (s.topics.size) {
    const topics = [...s.topics.values()];
    tabs.push(`<a role="tab" id="tab-topics" aria-selected="false" aria-controls="topics" href="#topics">Topics</a>`);
    qrows.push(`<nav class="qnav" aria-label="Topic notes" data-tab="topics" hidden>${topics.map((t) => `<a href="#topic-${t.id}" data-for="topic-${t.id}">${text(t.title)}</a>`).join("")}</nav>`);
    const notes = topics.map((t) => `<article class="topic" id="topic-${t.id}" data-stop>
<h3>${text(t.title)}</h3>
<p class="summary-line">${text(t.summary)}</p>
<div class="description">${description(t.body)}</div>
${sourcesHtml(t.sources)}
</article>`);
    panels.push(`<section class="tab" id="topics" role="tabpanel" aria-labelledby="tab-topics" hidden>\n${notes.join("\n")}\n</section>`);
  }
  const head = `<header class="page-head">${s.page.crumb ? `<p class="crumb">${text(s.page.crumb)}</p>` : ""}<h1>${text(s.page.title)}</h1></header>`;
  const overviewPanel = `<section class="tab" id="overview" role="tabpanel" aria-labelledby="tab-overview">\n${overview.length ? `<ol class="stages">\n${overview.join("\n")}\n</ol>` : `<p class="empty">No Stage yet.</p>`}\n</section>`;
  const bar = `<header class="bar">\n<div class="tabs" role="tablist" aria-label="Stages">${tabs.join("")}</div>\n${qrows.join("\n")}\n</header>`;
  return readFileSync(TEMPLATE, "utf8").replace("{{title}}", esc(s.page.title)).replace("<!-- NAV -->", bar).replace("<!-- BODY -->", [head, overviewPanel, ...panels].join("\n"));
}

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

function nowIso(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

function assignRecordMetadata(old: Line[], added: Line[]): Line[] {
  const known = new Map<string, Rec>();
  const sessionOfStage = new Map<string, number>();
  const sessionOfRound = new Map<string, number>();
  const maxQ = new Map<number, number>();
  let maxOrder = 0;
  let maxSession = 0;
  let maxRound = 0;
  let lastRound: string | undefined;
  const reserved = new Set([...old, ...added].map((l) => l.rec.id).filter(Boolean));
  const counters = new Map<string, number>();
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  const scan = (r: Rec) => {
    known.set(r.id, r);
    if (r.type === "stage") maxOrder = Math.max(maxOrder, num(r.order));
    else if (r.type === "round") {
      maxSession = Math.max(maxSession, num(r.session));
      maxRound = Math.max(maxRound, num(r.round));
      sessionOfStage.set(r.stage ?? IMPLICIT_STAGE, r.session);
      sessionOfRound.set(r.id, r.session);
      lastRound = r.id;
    } else if (r.type === "question") {
      const session = sessionOfRound.get(r.round);
      if (session !== undefined) maxQ.set(session, Math.max(maxQ.get(session) ?? 0, num(r.q)));
    }
  };
  for (const { rec } of old) known.set(rec.id, rec);
  for (const r of known.values()) if (r.type !== "question") scan(r);
  for (const r of known.values()) if (r.type === "question") scan(r);
  for (const { rec: r } of added) {
    if (r.id === undefined) {
      let n = counters.get(r.type) ?? 0;
      do { r.id = `${r.type}-${++n}`; } while (reserved.has(r.id));
      counters.set(r.type, n);
      reserved.add(r.id);
    }
    const prev = known.get(r.id);
    const same = prev?.type === r.type ? prev : undefined;
    if (r.type === "stage") r.order = same?.order ?? ++maxOrder;
    else if (r.type === "round") {
      if (same) Object.assign(r, { session: same.session, round: same.round, time: same.time });
      else Object.assign(r, { session: sessionOfStage.get(r.stage ?? IMPLICIT_STAGE) ?? ++maxSession, round: ++maxRound, time: nowIso() });
    } else if (r.type === "question") {
      if (r.round === undefined) r.round = same?.round ?? lastRound;
      const session = sessionOfRound.get(r.round);
      if (session === undefined) fail(`question ${r.id}`, `round ${r.round} does not exist`);
      if (same) r.q = same.q;
      else if (r.again !== undefined) {
        const earlier = known.get(r.again);
        if (earlier?.type !== "question") fail(`question ${r.id}`, `again names ${r.again}, which is not a question`);
        if (sessionOfRound.get(earlier!.round) !== session) fail(`question ${r.id}`, `again names ${r.again}, which is not in the same session`);
        r.q = earlier!.q;
      } else r.q = (maxQ.get(session!) ?? 0) + 1;
    } else if (r.type === "close") {
      const session = same?.session ?? sessionOfStage.get(r.stage ?? IMPLICIT_STAGE);
      if (session === undefined) fail(`close ${r.id}`, r.stage === undefined ? "the page has no rounds" : `stage ${r.stage} has no rounds`);
      r.session = session;
    }
    scan(r);
  }
  return added;
}

function mapSvgs(v: unknown, fix: (path: string) => string): any {
  if (Array.isArray(v)) return v.map((x) => mapSvgs(x, fix));
  if (typeof v !== "object" || v === null) return v;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, k === "svg" && typeof x === "string" ? fix(x) : mapSvgs(x, fix)]));
}

const inside = (path: string, dir: string) => path.startsWith(dir + sep);

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

const errnoName = process.platform === "darwin" ? "__error" : "__errno_location";
const symbols = {
  flock: { args: ["i32", "i32"], returns: "i32" },
  [errnoName]: { args: [], returns: "ptr" },
} as const;
const libraryNames = process.platform === "darwin" ? ["/usr/lib/libSystem.B.dylib"] : ["libc.so.6", "libc.so"];
let libc!: ReturnType<typeof dlopen<typeof symbols>>;
for (const name of libraryNames) {
  try { libc = dlopen(name, symbols); break; }
  catch (e) { if (name === libraryNames.at(-1)) throw e; }
}
const LOCK_EX = 2;
const LOCK_NB = 4;
const locks = new Set<number>();
const releaseLocks = () => {
  for (const fd of locks) {
    closeSync(fd);
    locks.delete(fd);
  }
};
process.once("exit", releaseLocks);

function canonicalPath(path: string): string {
  return existsSync(path) ? realpathSync(path) : join(canonicalPath(dirname(path)), basename(path));
}

async function lockState(state: string, wait = true): Promise<void> {
  // Keep the inode stable for waiters. Closing the descriptor releases the lock, even after SIGKILL.
  const lock = join(tmpdir(), `grilling-page-${createHash("sha256").update(canonicalPath(state)).digest("hex")}.flock`);
  const fd = openSync(lock, "a", 0o600);
  locks.add(fd);
  while (libc.symbols.flock(fd, LOCK_EX | LOCK_NB) !== 0) {
    const errno = read.i32(libc.symbols[errnoName]()!, 0);
    if (errno !== constants.errno.EWOULDBLOCK && errno !== constants.errno.EINTR) fail("lock", `${state}: flock failed with errno ${errno}`);
    if (!wait) fail("rename", `${state} is in use`);
    await Bun.sleep(10);
  }
}

const [command, statePath, ...rest] = Bun.argv.slice(2);
if (!["append", "answer", "render", "rename"].includes(command ?? "")) usage("give a command: append, answer, render, or rename");
if (!statePath || !statePath.endsWith(".jsonl")) usage("give the state file, ending in .jsonl");
const state = resolve(statePath);
const page = state.replace(/\.jsonl$/, ".html");
const originalFolder = existsSync(dirname(state)) ? statSync(dirname(state)) : undefined;

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
  await lockState(state);
  if (originalFolder) {
    const folder = existsSync(dirname(state)) ? statSync(dirname(state)) : undefined;
    if (!folder || folder.dev !== originalFolder.dev || folder.ino !== originalFolder.ino) fail(command, "the flow folder moved while waiting. Use its new page path");
  }
  if (!existsSync(state) && existsSync(page)) fail(command, `${page} exists but was not made by grilling-page.ts. Start a new page with a new name`);
  const old = existsSync(state) ? readFileSync(state, "utf8") : "";
  const oldLines = old === "" ? 0 : old.replace(/\n$/, "").split("\n").length;
  const before = parseLines(old, 1, "state");
  let after = parseLines(added, oldLines + 1, command === "append" && rest[0] && rest[0] !== "-" ? rest[0] : "input", command === "append");
  if (command === "append") {
    after = assignRecordMetadata(before, after);
    added = after.map((l) => JSON.stringify(l.rec)).join("\n");
  }
  let lines = [...before, ...after];
  const folder = dirname(state);
  let s = check(lines, basename(folder));
  let target = folder;
  if (command === "rename") {
    if (!s.flow) fail("rename", "rename needs a flow record. Append one first");
    if (rest[0] === s.flow!.key) {
      process.stdout.write(`${page}\n`);
      process.exit(0);
    }
    target = join(dirname(folder), basename(folder).slice(0, -s.flow!.key.length) + rest[0]);
    await lockState(join(target, basename(state)), false);
    if (existsSync(target)) fail("rename", `${target} already exists`);
    added = renameRecords(s, folder, target, rest[0]);
    lines = [...lines, ...parseLines(added, oldLines + 1, "rename")];
    s = check(lines, basename(target));
  }
  let html = render(s, folder);
  mkdirSync(folder, { recursive: true });
  const newState = join(target, basename(state));
  const newPage = join(target, basename(page));
  const write = () => {
    if (added.trim() !== "") appendFileSync(newState, (old === "" || old.endsWith("\n") ? "" : "\n") + added.trim() + "\n");
    writeFileSync(newPage, html);
    if (s.flow) writeFlow(s.flow, target);
  };
  if (target === folder) write();
  else {
    renameSync(folder, target);
    try {
      html = render(s, target);
      write();
    } catch (e) {
      if (readFileSync(newState, "utf8") !== old) writeFileSync(newState, old);
      renameSync(target, folder);
      if (e instanceof RecordError) fail("rename", `${e.message} after the move. Store each SVG as a path relative to the flow folder`);
      throw e;
    }
  }
  process.stdout.write(`${newPage}\n`);
  if (command === "append") process.stderr.write(`${JSON.stringify(after.map(({ rec: { type, id, stage, question, again, order, session, round, q, time } }) => ({ type, id, stage, question, again, order, session, round, q, time })))}\n`);
} catch (e) {
  if (!(e instanceof RecordError)) throw e;
  process.stderr.write(`grilling-page.ts: ${e.message}\nNothing was written.\n`);
  process.exit(1);
} finally {
  releaseLocks();
}
