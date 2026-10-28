// The Flow page domain: a Flow's stored state, the typed contributions that change it, and the derived view that
// both `show` and the renderer read. Everything here is pure; flow-page.ts does the reading, locking, and writing.

import { createHash } from "node:crypto";
import { applyProgress, type Progress, PROGRESS_KINDS, type ProgressView, progressSnapshot, progressView, UPDATE_FIELD } from "./progress.ts";

export const SCHEMA = 1;
export const CONTRIBUTION_VERSION = 1;

export type StageState = "in-progress" | "finished";
export type Stage = { id: string; skill: string; ticket?: string; parent?: string; state: StageState; order: number; opened: string; finished?: string };
export type Round = { id: string; stage: string; n: number; seq: number; time: string };
export type Option = { label: string; does: string; gains: string[]; costs: string[]; recommended?: string };
export type Fact = { text: string; source: string };
export type Term = { term: string; text: string };
export type Question = {
  id: string; stage: string; round: string; q: number; title: string; description: string; options: Option[];
  again?: string; reopens?: string; today?: Fact[]; terms?: Term[]; topics?: string[]; entries?: string[]; example?: string;
};
/** What `ask` returned, as it returned it. `picks` of a timed-out, cancelled, or headless response are not the user's. */
export type ResponseStatus = "answered" | "empty" | "cancelled" | "timed-out" | "headless";
export type AskResponse = { status: ResponseStatus; picks?: string[]; text?: string; note_on?: string };
/** The agent's reading of words with no pick: they settle the decision, or they leave a part of it unresolved. */
export type NonConsent = "question" | "concern" | "ambiguous";
export type Reading = { outcome: "resolved"; decision: string; basis: string; maps_to?: string } | { outcome: NonConsent; unresolved: string };
export type Answer = { question: string; time: string; response: AskResponse; reading?: Reading };
export type AnswerState = "open" | "picked" | "resolved" | "unresolved";
export type Decision = { question: string; text: string; answer: AnswerState };
export type Close = { id: string; stage: string; seq: number; time: string; decisions: Decision[]; assumed: string[]; extra?: string[] };
export type Assumed = { id: string; stage: string; decision: string; pick: string; why: string };
export type Retirement = { question: string; reason: string; time: string };
export type Section = { heading: string; body: string };
export type Background = { id: string; stage: string; title: string; summary: string; sections: Section[]; sources: string[] };
export type Topic = { id: string; title: string; summary: string; body: string; sources: string[] };
export type Shape = "cards" | "ledger" | "table" | "document";
/** `changed` is the Flow revision that last changed a Result's header or an entry, which a focused revision checks. */
export type Entry = Record<string, unknown> & { id: string; changed: number };
/** One block of a Document section. Prose and list items can cite with `[@<citation ref>]`. */
export type Block = { prose: string } | { list: string[]; ordered: boolean } | { code: string; language?: string; source?: string } | { figure: string };
export type DocSection = { heading: string; blocks: Block[] };
export type DocumentBody = { sections: DocSection[]; citations: { ref: string; source: string }[]; limitations: string[]; sources: string[] };
/** Where a Result's content is canonically kept, and which revision of it the Result captured. */
export type Canonical = { file: string; root: string; sha256: string } | { commit: string } | { tracker: string; revision: string };
/** `revision` counts whole republications of the Result with `revises`; `captured` is when this one was submitted. */
export type Result = {
  id: string; stage: string; shape: Shape; title: string; summary?: string; columns?: string[]; entries: Entry[]; changed: number;
  document?: DocumentBody; attachments?: string[]; canonical?: Canonical; revision?: number; captured?: string;
};
export type Source = { id: string; text: string };
export const ATTACHMENT_TYPES = ["image", "video", "svg", "file", "trace", "evidence", "artifact"] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];
/** A typed attachment. `captured` ones hold stored bytes named by their sha256 `revision`; `unavailable` ones say why
 *  there are none; an `artifact` is a runnable thing that runs outside the page, at the `revision` its producer names. */
export type Attachment = {
  id: string; stage: string; type: AttachmentType; caption: string; origin: string; time: string;
  availability: "captured" | "unavailable" | "external";
  revision?: string; file?: string; size?: number; name?: string; from?: { root: string; path: string };
  reason?: string; launch?: string; url?: string;
};
/** File reads a contribution needs. flow-page.ts supplies them, so this module stays free of the filesystem. */
export type Io = {
  capture(path: string, type: AttachmentType, where: string): { revision: string; file: string; size: number; name: string; from: { root: string; path: string } };
  /** The canonical file `path` names, resolved from the working directory, or from the named `root` when given. */
  canonical(path: string, where: string, root?: string): { file: string; root: string; sha256: string };
};

export type State = {
  schema: number;
  flow: { id: string; slug: string; title: string; created: string };
  revision: number;
  next: Record<string, number>;
  seq: number;
  stages: Stage[];
  rounds: Round[];
  questions: Question[];
  answers: Answer[];
  closes: Close[];
  backgrounds: Background[];
  topics: Topic[];
  results: Result[];
  assumed: Assumed[];
  retirements: Retirement[];
  sources: Source[];
  /** Qualified lookup aliases such as `spec:267`, added and never removed. */
  aliases: string[];
  /** The latest contribution to each Stage, by Stage id, so a repeat of it returns its receipt instead of applying twice. */
  submissions: Record<string, { digest: string; revision: number; receipt: Receipt }>;
  attachments: Attachment[];
  /** Earlier revisions of republished Results, oldest first. */
  history: Result[];
  progress?: Progress;
};

/** Fills the fields that states written before attachments existed lack. */
export function upgrade(s: State): State {
  s.attachments ??= [];
  s.history ??= [];
  return s;
}

export class Refusal extends Error {}
export const refuse = (where: string, message: string): never => {
  throw new Refusal(where ? `${where}: ${message}` : message);
};

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF = /^[a-z0-9][a-z0-9-]*$/;
const CODE_ID = /^(stage|round|question|close|background|topic|result|source|assumed|attachment|task|blocker|pr|check)-\d+$/;
const TICKET = /^#?[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHAPES: Shape[] = ["cards", "ledger", "table", "document"];
const CLAIM_STATES = ["confirmed", "cleared", "unproven"];
/** A citation marker in Document prose or a list item. */
export const CITE = /\[@([a-z0-9][a-z0-9-]*)\]/g;
const LINK = /\[[^\]]*\]\(([^)\s]*)\)/g;
/** Links in Document and attachment text may only go to the web or to an anchor on the page. */
function safeLinks(t: string, where: string): string {
  for (const m of t.matchAll(LINK)) if (!/^(https?:\/\/|#)/i.test(m[1])) refuse(where, `the link ${JSON.stringify(m[1])} uses an unsafe or unsupported scheme; links must start with https://, http://, or #`);
  return t;
}
export const listed = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")}, or ${xs.at(-1)}`);
const all = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
export const letter = (i: number) => String.fromCharCode(65 + i);
const letterIndex = (s: string) => (/^[A-Z]$/.test(s) ? s.charCodeAt(0) - 65 : -1);
/** The full label, such as "B. Second", of the option a letter names. */
export const optionLabel = (q: Question, l: string) => q.options[letterIndex(l)].label;
const STATUSES: ResponseStatus[] = ["answered", "empty", "cancelled", "timed-out", "headless"];
const NON_CONSENT: NonConsent[] = ["question", "concern", "ambiguous"];

export function nowIso(d = new Date()): string {
  const off = -d.getTimezoneOffset();
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, "0");
  const local = new Date(d.getTime() + off * 60_000).toISOString().slice(0, 19);
  return `${local}${off >= 0 ? "+" : "-"}${pad(off / 60)}:${pad(off % 60)}`;
}

export function slugOf(title: string): string {
  const words = title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean).slice(0, 5);
  return words.length ? words.join("-") : "flow";
}

function newId(s: State, kind: string): string {
  s.next[kind] = (s.next[kind] ?? 0) + 1;
  return `${kind}-${s.next[kind]}`;
}

export function newFlow(id: string, slug: string, title: string, time: string): State {
  if (title.trim() === "") refuse("open", "--title must be non-empty");
  return {
    schema: SCHEMA, flow: { id, slug, title, created: time }, revision: 0, next: {}, seq: 0,
    stages: [], rounds: [], questions: [], answers: [], closes: [], backgrounds: [], topics: [], results: [], assumed: [], retirements: [], sources: [],
    aliases: [`folder:${id}`], submissions: {}, attachments: [], history: [],
  };
}

export function openStage(s: State, skill: string, ticket: string | undefined, time: string, parent?: string): Stage {
  if (!SLUG.test(skill)) refuse("open", `--skill must be a skill name of lowercase letters, digits, and hyphens, got ${JSON.stringify(skill)}`);
  if (ticket !== undefined && !TICKET.test(ticket)) refuse("open", `--ticket must be a ticket id such as 269 or #269, got ${JSON.stringify(ticket)}`);
  if (parent !== undefined) stageOf(s, parent, "open: --parent");
  const stage: Stage = { id: newId(s, "stage"), skill, ticket, parent, state: "in-progress", order: s.stages.length + 1, opened: time };
  if (ticket === undefined) delete stage.ticket;
  if (parent === undefined) delete stage.parent;
  s.stages.push(stage);
  s.revision++;
  return stage;
}

export function stageOf(s: State, id: string, where: string): Stage {
  return s.stages.find((st) => st.id === id) ?? refuse(where, `Flow ${s.flow.id} has no Stage ${id}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Lookup aliases. A Flow keeps its immutable id; these qualified keys only find it. Lookup is the caller's job.

export const ALIAS_KINDS = ["spec", "ticket", "branch", "run", "folder", "slug"];
const ALIAS_VALUE: Record<string, RegExp> = {
  spec: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  ticket: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
  branch: /^[A-Za-z0-9._][A-Za-z0-9._/+@-]*$/,
  run: /^[A-Za-z0-9][A-Za-z0-9._-]*$/,
  folder: SLUG,
  slug: SLUG,
};

/** `kind:value` in its stored form: a spec or ticket loses a leading `#`. Anything else is refused. */
export function parseAlias(raw: string): string {
  const at = raw.indexOf(":");
  const kind = at < 0 ? "" : raw.slice(0, at);
  if (!ALIAS_KINDS.includes(kind)) refuse("alias", `${JSON.stringify(raw)} is not a qualified alias; write <kind>:<value> with kind ${listed(ALIAS_KINDS)}, such as spec:267`);
  let value = raw.slice(at + 1);
  if (kind === "spec" || kind === "ticket") value = value.replace(/^#/, "");
  if (!ALIAS_VALUE[kind].test(value)) refuse("alias", `${JSON.stringify(raw)} has no valid ${kind} value`);
  return `${kind}:${value}`;
}

/** Every alias that finds `s`: the stored ones, its slug, and the ticket of each Stage. */
export function aliasesOf(s: State): string[] {
  const derived = [`slug:${s.flow.slug}`, ...s.stages.filter((st) => st.ticket).map((st) => `ticket:${st.ticket!.replace(/^#/, "")}`)];
  return [...new Set([...s.aliases, ...derived])];
}

/** Adds the aliases `s` does not have yet and returns them. A new alias is one revision; no new alias is none. */
export function addAliases(s: State, aliases: string[]): string[] {
  const have = new Set(aliasesOf(s));
  const added = [...new Set(aliases)].filter((a) => !have.has(a));
  if (added.length) {
    s.aliases.push(...added);
    s.revision++;
  }
  return added;
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing external input. Every object is checked against its exact field list, so HTML, CSS, scripts, ids, numbers,
// and other code-owned fields are refused rather than dropped.

export type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function fields(v: unknown, where: string, required: string[], optional: string[] = []): Obj {
  if (!isObj(v)) refuse(where, `must be an object with ${listed(required)}`);
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) refuse(where, `${k} is not a field here; the fields are ${listed([...required, ...optional])}`);
  for (const k of required) if (o[k] === undefined) refuse(where, `needs ${k}`);
  return o;
}
export function text(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") refuse(where, `${k} must be a non-empty string`);
  return v as string;
}
const optText = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : text(o, k, where));
export function texts(o: Obj, k: string, where: string): string[] {
  const v = o[k];
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x.trim() === "")) refuse(where, `${k} must be a list of one or more non-empty strings`);
  return v as string[];
}
const optTexts = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : texts(o, k, where));
function list(o: Obj, k: string, where: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v) || v.length === 0) refuse(where, `${k} must be a list of one or more items`);
  return v as unknown[];
}
function ref(o: Obj, where: string): string | undefined {
  if (o.ref === undefined) return undefined;
  if (typeof o.ref !== "string" || !REF.test(o.ref)) refuse(where, "ref must be lowercase letters, digits, and hyphens");
  if (CODE_ID.test(o.ref as string)) refuse(where, `ref ${o.ref} looks like an id the script assigns; choose another ref`);
  return o.ref as string;
}

// ---------------------------------------------------------------------------------------------------------------
// Applying one contribution to one Stage.

export type Receipt = { refs: Record<string, string>; ask?: { questions: { id: string; question: string; options: { label: string }[]; recommended?: number }[] } };

const KINDS = ["background", "topic", "attachment", "result", "revise", "assumed", "round", "answer", "close", "stage", ...PROGRESS_KINDS];

/** The same JSON value in one spelling, whatever its key order. */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}` : JSON.stringify(v);

/**
 * Applies `input` to Stage `stageId` of `s` in place, or throws a Refusal and leaves the caller to discard `s`.
 * A repeat of the Stage's latest contribution changes nothing and returns that contribution's receipt and revision.
 */
export function contribute(s: State, stageId: string, input: unknown, time: string, io: Io): Receipt & { revision: number; repeated?: true } {
  const env = fields(input, "contribution", ["version", "items"]);
  if (env.version !== CONTRIBUTION_VERSION) refuse("contribution", `version ${JSON.stringify(env.version)} is not supported; flow-page reads contribution version ${CONTRIBUTION_VERSION}`);
  const items = list(env, "items", "contribution");
  const stage = stageOf(s, stageId, "contribution");
  const digest = createHash("sha256").update(canonical(input)).digest("hex");
  const last = s.submissions[stage.id];
  if (last?.digest === digest) return { ...last.receipt, revision: last.revision, repeated: true };
  if (stage.state === "finished") refuse("contribution", `Stage ${stage.id} is finished, so it takes no more content; open a new Stage to continue the Flow`);
  const rev = s.revision + 1;

  const refs: Record<string, string> = {};
  const kinds: Record<string, string> = {};
  const claim = (r: string | undefined, id: string, kind: string, where: string) => {
    if (r === undefined) return;
    if (refs[r] !== undefined) refuse(where, `ref ${r} is already used in this contribution`);
    refs[r] = id;
    kinds[r] = kind;
  };
  /** An id or an earlier ref of this contribution, which must name a `kind`. */
  const resolve = (v: unknown, kind: string, where: string): string => {
    if (typeof v !== "string" || v.trim() === "") refuse(where, `must name a ${kind} by ref or id`);
    const key = v as string;
    if (refs[key] !== undefined) {
      if (kinds[key] !== kind) refuse(where, `ref ${key} names a ${kinds[key]}, not a ${kind}`);
      return refs[key];
    }
    return key;
  };

  const revised = new Set<string>();
  // Pass 1: give every new referable thing its id, so later items and forward references can name it.
  const nextEntry = new Map<string, number>();
  const planned = items.map((raw, i) => {
    const kind = isObj(raw) ? raw.kind : undefined;
    const where = `item ${i + 1}${typeof kind === "string" ? ` (${kind})` : ""}`;
    if (typeof kind !== "string" || !KINDS.includes(kind)) refuse(where, `kind must be ${listed(KINDS)}, got ${JSON.stringify(kind)}`);
    const o = raw as Obj;
    const ids: { id?: string; entries?: string[]; questions?: string[] } = {};
    if (kind === "revise" && Array.isArray(o.add) && typeof o.result === "string" && !o.result.includes("/")) {
      const rid = kinds[o.result] === "result" ? refs[o.result] : o.result;
      const r = s.results.find((x) => x.id === rid);
      if (r) {
        const next = nextEntry.get(rid) ?? Math.max(0, ...r.entries.map((e) => Number(e.id.slice(1)))) + 1;
        ids.entries = o.add.map((e, j) => {
          const eid = `${rid}/e${next + j}`;
          if (isObj(e)) {
            const er = ref(e, `${where}: entry ${j + 1}`);
            if (er !== undefined) claim(`${o.result}/${er}`, eid, "result entry", where);
          }
          return eid;
        });
        nextEntry.set(rid, next + o.add.length);
      }
    }
    if (PROGRESS_KINDS.includes(kind) && kind !== "end-state" && o[UPDATE_FIELD[kind]!] === undefined) claim(ref(o, where), (ids.id = newId(s, kind)), kind, where);
    if (kind === "topic") claim(ref(o, where), (ids.id = newId(s, "topic")), "topic", where);
    if (kind === "assumed") claim(ref(o, where), (ids.id = newId(s, "assumed")), "assumed pick", where);
    if (kind === "attachment") claim(ref(o, where), (ids.id = newId(s, "attachment")), "attachment", where);
    if (kind === "result") {
      let id: string;
      if (o.revises !== undefined) {
        const old = s.results.find((r) => r.id === o.revises) ?? refuse(where, `revises must name a Result published earlier by its id, got ${JSON.stringify(o.revises)}`);
        if (old.stage !== stage.id) refuse(where, `${old.id} belongs to Stage ${old.stage}; revise a Result from its own Stage, or publish a new Result here`);
        if (revised.has(old.id)) refuse(where, `${old.id} is already revised in this contribution`);
        revised.add(old.id);
        id = old.id;
      } else id = newId(s, "result");
      claim(ref(o, where), (ids.id = id), "result", where);
      const rows = Array.isArray(o.entries) ? o.entries : Array.isArray(o.rows) ? o.rows : [];
      ids.entries = rows.map((e, j) => {
        const eid = `${ids.id}/e${j + 1}`;
        if (isObj(e)) {
          const r = ref(e, `${where}: entry ${j + 1}`);
          if (r !== undefined && typeof o.ref === "string") claim(`${o.ref}/${r}`, eid, "result entry", where);
        }
        return eid;
      });
    }
    if (kind === "round" && Array.isArray(o.questions))
      ids.questions = o.questions.map((q, j) => {
        const qid = newId(s, "question");
        if (isObj(q)) claim(ref(q, `${where}: question ${j + 1}`), qid, "question", `${where}: question ${j + 1}`);
        return qid;
      });
    return { o, kind, where, ids };
  });

  const receipt: Receipt = { refs };
  let rounds = 0;
  for (const { o, kind, where, ids } of planned) {
    switch (kind) {
      case "background": {
        fields(o, where, ["kind", "title", "summary", "sections", "sources"]);
        const other = s.backgrounds.find((b) => b.stage === stage.id);
        if (other) refuse(where, `Stage ${stage.id} already has ${other.id}; a Stage has one Background`);
        const sections = list(o, "sections", where).map((sec, j) => {
          const sw = `${where}: section ${j + 1}`;
          const so = fields(sec, sw, ["heading", "body"]);
          return { heading: text(so, "heading", sw), body: text(so, "body", sw) };
        });
        s.backgrounds.push({ id: newId(s, "background"), stage: stage.id, title: text(o, "title", where), summary: text(o, "summary", where), sections, sources: texts(o, "sources", where).map((t) => sourceId(s, t)) });
        break;
      }
      case "topic":
        fields(o, where, ["kind", "title", "summary", "body", "sources"], ["ref"]);
        s.topics.push({ id: ids.id!, title: text(o, "title", where), summary: text(o, "summary", where), body: text(o, "body", where), sources: texts(o, "sources", where).map((t) => sourceId(s, t)) });
        break;
      case "attachment":
        s.attachments.push(parseAttachment(o, where, stage.id, ids.id!, time, io));
        break;
      case "revise":
        revise(s, o, where, stage.id, ids.entries, rev, resolve);
        break;
      case "assumed":
        fields(o, where, ["kind", "decision", "pick", "why"], ["ref"]);
        s.assumed.push({ id: ids.id!, stage: stage.id, decision: text(o, "decision", where), pick: text(o, "pick", where), why: text(o, "why", where) });
        break;
      case "result": {
        const r = parseResult(o, where, stage.id, ids.id!, ids.entries!, rev, (v, w) => resolve(v, "attachment", w), (t) => sourceId(s, t), io);
        r.captured = time;
        const i = s.results.findIndex((x) => x.id === r.id);
        if (i < 0) {
          r.revision = 1;
          s.results.push(r);
          break;
        }
        // A republished Result: the old revision stays in history, and the canonical link carries over.
        const old = s.results[i];
        if (r.canonical === undefined && old.canonical !== undefined) {
          if (!("file" in old.canonical)) refuse(where, `${old.id} was captured from ${"commit" in old.canonical ? `commit ${old.canonical.commit}` : `${old.canonical.tracker} at ${old.canonical.revision}`}; give canonical again with the revision this one captures`);
          r.canonical = io.canonical(old.canonical.file, where, old.canonical.root);
        }
        r.revision = (old.revision ?? 1) + 1;
        s.history.push(old);
        s.results[i] = r;
        break;
      }
      case "round": {
        fields(o, where, ["kind", "questions"]);
        if (++rounds > 1) refuse(where, "a contribution asks at most one round, because one round is one ask");
        const qs = list(o, "questions", where);
        const round: Round = { id: newId(s, "round"), stage: stage.id, n: s.rounds.filter((r) => r.stage === stage.id).length + 1, seq: ++s.seq, time };
        s.rounds.push(round);
        const parsed = qs.map((q, j) => parseQuestion(q, `${where}: question ${j + 1}`, ids.questions![j], stage.id, round.id, resolve));
        assignQNumbers(s, parsed, stage.id, where);
        s.questions.push(...parsed);
        receipt.ask = {
          questions: [...parsed].sort((a, b) => a.q - b.q).map((q) => {
            const rec = q.options.findIndex((op) => op.recommended !== undefined);
            return { id: q.id, question: `Q${q.q}. ${q.title}`, options: q.options.map((op) => ({ label: op.label })), ...(rec >= 0 ? { recommended: rec } : {}) };
          }),
        };
        for (const q of parsed) for (const f of q.today ?? []) f.source = sourceId(s, f.source);
        break;
      }
      case "answer": {
        fields(o, where, ["kind", "question", "response"], ["reading"]);
        const qid = resolve(o.question, "question", `${where}: question`);
        const q = s.questions.find((x) => x.id === qid) ?? refuse(where, `question ${qid} does not exist`);
        if (q.stage !== stage.id) refuse(where, `question ${qid} belongs to Stage ${q.stage}, not the bound Stage ${stage.id}`);
        if (s.answers.some((a) => a.question === qid)) refuse(where, `question ${qid} already has an answer; to reopen the decision, ask it again in a later round with again: ${qid}, which keeps this answer`);
        const response = parseResponse(o.response, `${where}: response`, q);
        const reading = parseReading(o.reading, `${where}: reading`, q, response);
        s.answers.push({ question: qid, time, response, ...(reading ? { reading } : {}) });
        break;
      }
      case "close": {
        fields(o, where, ["kind", "decisions"], ["extra"]);
        if (!Array.isArray(o.decisions)) refuse(where, "decisions must be a list of { question, text }, empty when the Stage asked nothing");
        const extra = optTexts(o, "extra", where);
        const latest = latestAsks(s, stage.id);
        const named = new Map<number, string>();
        const decisions = (o.decisions as unknown[]).map((d, j): Decision => {
          const dw = `${where}: decision ${j + 1}`;
          const dobj = fields(d, dw, ["question", "text"]);
          const qid = resolve(dobj.question, "question", dw);
          const q = s.questions.find((x) => x.id === qid) ?? refuse(dw, `question ${qid} does not exist`);
          if (q.stage !== stage.id) refuse(dw, `question ${qid} belongs to Stage ${q.stage}, not Stage ${stage.id}`);
          if (latest.get(q.q)?.id !== q.id) refuse(dw, `${qid} is not the latest ask of Q${q.q}; decide ${latest.get(q.q)!.id}`);
          if (named.has(q.q)) refuse(dw, `Q${q.q} already has a decision`);
          named.set(q.q, qid);
          return { question: qid, text: text(dobj, "text", dw), answer: answerState(s, qid) };
        });
        const missing = [...latest].filter(([n]) => !named.has(n)).map(([n, q]) => `Q${n} (${q.id})`);
        if (missing.length) refuse(where, `a close decides every latest ask of its Stage; ${all(missing)} ${missing.length === 1 ? "has" : "have"} no decision`);
        // The close lists every Assumed pick still standing; code takes them from their records, so none is left out.
        const assumed = visibleAssumed(s, stage.id).map((a) => a.id);
        if (decisions.length === 0 && assumed.length === 0 && extra === undefined) refuse(where, "a close with no decisions and no Assumed picks needs extra bullets");
        s.closes.push({ id: newId(s, "close"), stage: stage.id, seq: ++s.seq, time, decisions, assumed, ...(extra ? { extra } : {}) });
        break;
      }
      case "stage": {
        fields(o, where, ["kind", "state"], ["retire"]);
        if (o.state !== "finished") refuse(where, `a Stage moves only from in-progress to finished; ${JSON.stringify(o.state)} is not a transition from in-progress`);
        const unresolved = [...latestAsks(s, stage.id).values()].filter((q) => !settled(answerState(s, q.id)));
        const given = o.retire === undefined ? [] : list(o, "retire", where).map((x, j) => {
          const rw = `${where}: retire ${j + 1}`;
          const r = fields(x, rw, ["question", "reason"]);
          return { question: resolve(r.question, "question", rw), reason: text(r, "reason", rw), rw };
        });
        given.forEach((g, j) => {
          if (!unresolved.some((q) => q.id === g.question)) refuse(g.rw, `${g.question} is not an unresolved latest ask of Stage ${stage.id}; retire lists only the questions the Stage leaves unresolved`);
          if (given.findIndex((x) => x.question === g.question) !== j) refuse(g.rw, `${g.question} is already retired in this item`);
        });
        const missing = unresolved.filter((q) => !given.some((g) => g.question === q.id)).map((q) => `Q${q.q} (${q.id})`);
        if (missing.length) refuse(where, `finishing Stage ${stage.id} retires its unresolved questions; give retire a reason for ${all(missing)}`);
        for (const g of given) s.retirements.push({ question: g.question, reason: g.reason, time });
        stage.state = "finished";
        stage.finished = time;
        break;
      }
      default:
        applyProgress(s, stage.id, kind, o, where, ids.id, resolve, time);
    }
  }
  checkLinks(s);
  s.revision = rev;
  s.submissions[stage.id] = { digest, revision: rev, receipt };
  return { ...receipt, revision: rev };
}

function sourceId(s: State, t: string): string {
  const found = s.sources.find((x) => x.text === t);
  if (found) return found.id;
  const src = { id: newId(s, "source"), text: t };
  s.sources.push(src);
  return src.id;
}

function parseResult(o: Obj, where: string, stage: string, id: string, entryIds: string[], rev: number, attachment: (v: unknown, where: string) => string, source: (t: string) => string, io: Io): Result {
  if (!SHAPES.includes(o.shape as Shape)) refuse(where, `shape must be ${listed(SHAPES)}, got ${JSON.stringify(o.shape)}`);
  const shape = o.shape as Shape;
  const table = shape === "table";
  const shared = ["ref", "summary", "attachments", "canonical", "revises"];
  const head = (body: Partial<Result>): Result => ({
    id, stage, shape, title: text(o, "title", where), ...(o.summary !== undefined ? { summary: text(o, "summary", where) } : {}), entries: [], changed: rev, ...body,
    ...(o.attachments !== undefined ? { attachments: texts(o, "attachments", where).map((a) => attachment(a, `${where}: attachments`)) } : {}),
    ...(o.canonical !== undefined ? { canonical: parseCanonical(o.canonical, `${where}: canonical`, io) } : {}),
  });
  if (shape === "document") {
    fields(o, where, ["kind", "shape", "title", "sections"], [...shared, "citations", "limitations", "sources"]);
    return head({ document: parseDocument(o, where, attachment, source) });
  }
  fields(o, where, ["kind", "shape", "title", table ? "columns" : "entries", ...(table ? ["rows"] : [])], shared);
  const columns = table ? texts(o, "columns", where) : undefined;
  const entries = list(o, table ? "rows" : "entries", where).map((e, j) => parseEntry(shape, columns, e, `${where}: ${table ? "row" : "entry"} ${j + 1}`, entryIds[j].split("/")[1], rev));
  return head({ ...(columns ? { columns } : {}), entries });
}

/** One cards entry, ledger entry, or table row, checked against its shape. */
function parseEntry(shape: Shape, columns: string[] | undefined, e: unknown, ew: string, id: string, changed: number): Entry {
  if (shape === "cards") {
    const c = fields(e, ew, ["title", "label", "blocking", "impact", "action", "evidence"], ["ref"]);
    if (typeof c.blocking !== "boolean") refuse(ew, "blocking must be true or false");
    return { id, ...(c.ref ? { ref: c.ref } : {}), title: text(c, "title", ew), label: text(c, "label", ew), blocking: c.blocking, impact: text(c, "impact", ew), action: text(c, "action", ew), evidence: text(c, "evidence", ew), changed };
  }
  if (shape === "ledger") {
    const c = fields(e, ew, ["claim", "status", "evidence", "missing_proof", "consequence"], ["ref"]);
    if (!CLAIM_STATES.includes(c.status as string)) refuse(ew, `status must be ${listed(CLAIM_STATES)}`);
    return { id, ...(c.ref ? { ref: c.ref } : {}), claim: text(c, "claim", ew), status: c.status, evidence: text(c, "evidence", ew), missing_proof: text(c, "missing_proof", ew), consequence: text(c, "consequence", ew), changed };
  }
  const c = fields(e, ew, ["cells"], ["ref"]);
  if (!Array.isArray(c.cells) || c.cells.length !== columns!.length || c.cells.some((x) => typeof x !== "string")) refuse(ew, `cells must list ${columns!.length} strings, one per column`);
  return { id, ...(c.ref ? { ref: c.ref } : {}), cells: c.cells as string[], changed };
}

/** A focused revision: `set` replaces named fields of one entry or of a Result's header, `add` appends entries. */
function revise(s: State, o: Obj, where: string, stage: string, entryIds: string[] | undefined, rev: number, resolve: (v: unknown, kind: string, where: string) => string): void {
  fields(o, where, ["kind", "result"], ["base", "set", "add"]);
  if (o.set === undefined && o.add === undefined) refuse(where, "needs set, add, or both");
  if (typeof o.result !== "string") refuse(where, "result must name a Result as <result ref or id>, or an entry as <result ref or id>/<entry ref or id>");
  const [rname, ename] = (o.result as string).split("/", 2);
  const rid = resolve(rname, "result", `${where}: result`);
  const r = s.results.find((x) => x.id === rid) ?? refuse(where, `Result ${rid} does not exist`);
  if (r.stage !== stage) refuse(where, `Result ${rid} belongs to Stage ${r.stage}, not the bound Stage ${stage}`);
  const entry = ename === undefined ? undefined : (r.entries.find((e) => e.id === ename || e.ref === ename) ?? refuse(where, `Result ${rid} has no entry ${ename}`));
  if (o.set !== undefined) {
    if (!Number.isInteger(o.base) || (o.base as number) < 1 || (o.base as number) > s.revision) refuse(where, `set needs base, the Flow revision you read ${o.result} at (1 to ${s.revision}); show prints it as changed`);
    const base = o.base as number;
    const changed = entry ? entry.changed : r.changed;
    if (changed > base) refuse(where, `conflict: ${o.result} changed in revision ${changed}, after your base ${base}; read it again with show and resubmit your edit`);
    if (!isObj(o.set)) refuse(`${where}: set`, "must be an object of the fields to replace");
    const set = o.set as Obj;
    if (entry) {
      if (set.ref !== undefined) refuse(`${where}: set`, "ref is not a field here; an entry keeps its ref");
      const { id, changed: _, ...content } = entry;
      const at = r.entries.indexOf(entry);
      r.entries[at] = parseEntry(r.shape, r.columns, { ...content, ...set }, `${where}: set`, id, rev);
    } else {
      fields(set, `${where}: set`, [], ["title", "summary"]);
      if (set.title !== undefined) r.title = text(set, "title", `${where}: set`);
      if (set.summary !== undefined) r.summary = text(set, "summary", `${where}: set`);
      r.changed = rev;
    }
  } else if (o.base !== undefined) refuse(where, "base goes with set; add appends entries without one");
  if (o.add !== undefined) {
    if (entry) refuse(where, "add appends entries to a Result; name the Result, not an entry");
    if (r.shape === "document") refuse(where, `${rid} is a Document, which has no entries; publish its next revision with revises`);
    if (entryIds === undefined) refuse(where, `add appends to a Result from an earlier contribution; put new entries of ${o.result} in its result item`);
    const adds = list(o, "add", where);
    r.entries.push(...adds.map((e, j) => parseEntry(r.shape, r.columns, e, `${where}: add ${j + 1}`, entryIds![j].split("/")[1], rev)));
  }
}

function optionLetter(q: Question, p: string, where: string): string {
  if (letterIndex(p) < 0 || letterIndex(p) >= q.options.length) refuse(where, `question ${q.id} has no option ${JSON.stringify(p)}; its options are ${listed(q.options.map((_, i) => letter(i)))}`);
  return p;
}

/** The ask response as `ask` returned it, checked but never reworded. */
function parseResponse(raw: unknown, where: string, q: Question): AskResponse {
  const o = fields(raw, where, ["status"], ["picks", "text", "note_on"]);
  if (!STATUSES.includes(o.status as ResponseStatus)) refuse(where, `status must be ${listed(STATUSES)}, got ${JSON.stringify(o.status)}`);
  const status = o.status as ResponseStatus;
  const picks = optTexts(o, "picks", where)?.map((p) => optionLetter(q, p, `${where}: picks`));
  const words = optText(o, "text", where);
  const noteOn = o.note_on === undefined ? undefined : optionLetter(q, text(o, "note_on", where), `${where}: note_on`);
  if (noteOn !== undefined && words === undefined) refuse(where, "note_on names the option a note was written on, so it needs the note as text");
  if (noteOn !== undefined && picks?.includes(noteOn)) refuse(where, `note_on names an option the user did not pick, but ${noteOn} is in picks`);
  if (status === "answered" && picks === undefined && words === undefined) refuse(where, "an answered response has picks or text; a response with neither is empty");
  if (status === "empty" && (picks !== undefined || words !== undefined)) refuse(where, "an empty response has no picks and no text");
  if (status === "headless" && (picks === undefined || words !== undefined)) refuse(where, "a headless response holds the substituted picks and no text, because no user answered");
  return { status, ...(picks ? { picks } : {}), ...(words !== undefined ? { text: words } : {}), ...(noteOn !== undefined ? { note_on: noteOn } : {}) };
}

/** Words with no pick need the agent's reading; a pick, and anything that is not the user's response, take none. */
function parseReading(raw: unknown, where: string, q: Question, response: AskResponse): Reading | undefined {
  const needed = response.status === "answered" && response.picks === undefined;
  if (raw === undefined) {
    if (needed) refuse(where, `words with no pick need a reading: outcome resolved with the decision and its basis when they settle it, else outcome ${listed(NON_CONSENT)} with the unresolved part`);
    return undefined;
  }
  if (!needed) refuse(where, response.status === "answered" ? "an explicit pick is the user's answer, so it takes no reading" : `a ${response.status} response is not the user's answer, so no reading can settle it`);
  if (!isObj(raw)) refuse(where, "must be an object with outcome");
  const o = raw as Obj;
  if (o.outcome === "resolved") {
    fields(o, where, ["outcome", "decision", "basis"], ["maps_to"]);
    const mapsTo = o.maps_to === undefined ? undefined : optionLetter(q, text(o, "maps_to", where), `${where}: maps_to`);
    return { outcome: "resolved", decision: text(o, "decision", where), basis: text(o, "basis", where), ...(mapsTo !== undefined ? { maps_to: mapsTo } : {}) };
  }
  if (!NON_CONSENT.includes(o.outcome as NonConsent)) refuse(where, `outcome must be resolved, ${listed(NON_CONSENT)}, got ${JSON.stringify(o.outcome)}`);
  fields(o, where, ["outcome", "unresolved"]);
  return { outcome: o.outcome as NonConsent, unresolved: text(o, "unresolved", where) };
}

/** Only an explicit pick or words read as settling the decision are the user's answer; everything else is not consent. */
export function answerState(s: State, question: string): AnswerState {
  const a = s.answers.find((x) => x.question === question);
  if (!a) return "open";
  if (a.response.status !== "answered") return "unresolved";
  if (a.response.picks) return "picked";
  return a.reading?.outcome === "resolved" ? "resolved" : "unresolved";
}
const settled = (state: AnswerState) => state === "picked" || state === "resolved";

/** The Assumed picks of a Stage that no question has reopened. */
function visibleAssumed(s: State, stage: string): Assumed[] {
  return s.assumed.filter((a) => a.stage === stage && !s.questions.some((q) => q.reopens === a.id));
}

function parseCanonical(v: unknown, where: string, io: Io): Canonical {
  const forms = isObj(v) ? ["file", "commit", "tracker"].filter((k) => v[k] !== undefined) : [];
  if (forms.length !== 1) refuse(where, "must be one of { file }, { commit }, or { tracker, revision }");
  if (forms[0] === "file") {
    const o = fields(v, where, ["file"]);
    return io.canonical(text(o, "file", where), where);
  }
  if (forms[0] === "commit") {
    const o = fields(v, where, ["commit"]);
    if (typeof o.commit !== "string" || !/^[0-9a-f]{7,64}$/.test(o.commit)) refuse(where, "commit must be a commit hash of 7 to 64 lowercase hex digits");
    return { commit: o.commit as string };
  }
  const o = fields(v, where, ["tracker", "revision"]);
  return { tracker: text(o, "tracker", where), revision: text(o, "revision", where) };
}

function parseDocument(o: Obj, where: string, attachment: (v: unknown, where: string) => string, source: (t: string) => string): DocumentBody {
  const citations = o.citations === undefined ? [] : list(o, "citations", where).map((c, j) => {
    const cw = `${where}: citation ${j + 1}`;
    const co = fields(c, cw, ["ref", "source"]);
    if (typeof co.ref !== "string" || !REF.test(co.ref)) refuse(cw, "ref must be lowercase letters, digits, and hyphens");
    return { ref: co.ref as string, source: safeLinks(text(co, "source", cw), cw) };
  });
  const seen = new Set<string>();
  for (const [j, c] of citations.entries()) {
    if (seen.has(c.ref)) refuse(`${where}: citation ${j + 1}`, `ref ${c.ref} is already a citation of this Document`);
    seen.add(c.ref);
  }
  /** Text that a reader sees with its links and citation markers, each checked here. */
  const cited = (t: string, w: string) => {
    for (const m of t.matchAll(CITE)) if (!seen.has(m[1])) refuse(w, `[@${m[1]}] names no citation of this Document; add { ref: "${m[1]}", source } to citations`);
    return safeLinks(t, w);
  };
  const sections = list(o, "sections", where).map((sec, j) => {
    const sw = `${where}: section ${j + 1}`;
    const so = fields(sec, sw, ["heading", "blocks"]);
    const blocks = list(so, "blocks", sw).map((b, k): Block => {
      const bw = `${sw}: block ${k + 1}`;
      const forms = isObj(b) ? ["prose", "list", "code", "figure"].filter((x) => b[x] !== undefined) : [];
      if (forms.length !== 1) refuse(bw, "must have exactly one of prose, list, code, or figure");
      switch (forms[0]) {
        case "prose": {
          const bo = fields(b, bw, ["prose"]);
          return { prose: cited(text(bo, "prose", bw), bw) };
        }
        case "list": {
          const bo = fields(b, bw, ["list"], ["ordered"]);
          if (bo.ordered !== undefined && typeof bo.ordered !== "boolean") refuse(bw, "ordered must be true or false");
          return { list: texts(bo, "list", bw).map((t) => cited(t, bw)), ordered: bo.ordered === true };
        }
        case "code": {
          const bo = fields(b, bw, ["code"], ["language", "source"]);
          const code = text(bo, "code", bw);
          if (bo.language !== undefined && (typeof bo.language !== "string" || !/^[a-z0-9][a-z0-9+#.-]*$/i.test(bo.language))) refuse(bw, "language must be a language name such as ts or python");
          return { code, ...(bo.language !== undefined ? { language: bo.language as string } : {}), ...(bo.source !== undefined ? { source: text(bo, "source", bw) } : {}) };
        }
        default: {
          const bo = fields(b, bw, ["figure"]);
          return { figure: attachment(bo.figure, `${bw}: figure`) };
        }
      }
    });
    return { heading: text(so, "heading", sw), blocks };
  });
  const limitations = o.limitations === undefined ? [] : texts(o, "limitations", where).map((t) => safeLinks(t, `${where}: limitations`));
  const sources = o.sources === undefined ? [] : texts(o, "sources", where).map((t) => source(safeLinks(t, `${where}: sources`)));
  return { sections, citations: citations.map((c) => ({ ref: c.ref, source: source(c.source) })), limitations, sources };
}

function parseAttachment(o: Obj, where: string, stage: string, id: string, time: string, io: Io): Attachment {
  const type = o.type as AttachmentType;
  if (!ATTACHMENT_TYPES.includes(type)) refuse(where, `type must be ${listed([...ATTACHMENT_TYPES])}, got ${JSON.stringify(o.type)}`);
  const base = { id, stage, type, time };
  if (type === "artifact") {
    fields(o, where, ["kind", "type", "caption", "origin", "launch", "revision"], ["ref", "url"]);
    if (o.url !== undefined && (typeof o.url !== "string" || !/^https?:\/\/[^\s]+$/i.test(o.url))) refuse(where, "url must be an http:// or https:// URL");
    return {
      ...base, caption: safeLinks(text(o, "caption", where), where), origin: safeLinks(text(o, "origin", where), where), availability: "external",
      launch: safeLinks(text(o, "launch", where), where), revision: text(o, "revision", where), ...(o.url !== undefined ? { url: o.url as string } : {}),
    };
  }
  fields(o, where, ["kind", "type", "caption", "origin"], ["ref", "path", "unavailable"]);
  const caption = safeLinks(text(o, "caption", where), where);
  const origin = safeLinks(text(o, "origin", where), where);
  if ((o.path === undefined) === (o.unavailable === undefined)) refuse(where, "needs exactly one of path, the file to capture, or unavailable, the reason there is none");
  if (o.unavailable !== undefined) return { ...base, caption, origin, availability: "unavailable", reason: text(o, "unavailable", where) };
  const c = io.capture(text(o, "path", where), type, where);
  return { ...base, caption, origin, availability: "captured", revision: c.revision, file: c.file, size: c.size, name: c.name, from: c.from };
}

function parseQuestion(raw: unknown, where: string, id: string, stage: string, round: string, resolve: (v: unknown, kind: string, where: string) => string): Question {
  const o = fields(raw, where, ["title", "description", "options"], ["ref", "again", "reopens", "today", "terms", "topics", "results", "example"]);
  const options = list(o, "options", where).map((op, i) => {
    const ow = `${where}: option ${i + 1}`;
    const oo = fields(op, ow, ["label", "does", "gains", "costs"], ["recommended"]);
    const label = text(oo, "label", ow);
    if (/^[A-Z]\.\s/.test(label)) refuse(ow, `label starts with "${label.slice(0, 3)}"; give the label alone, the script adds the option letter`);
    return { label: `${letter(i)}. ${label}`, does: text(oo, "does", ow), gains: texts(oo, "gains", ow), costs: texts(oo, "costs", ow), ...(oo.recommended !== undefined ? { recommended: text(oo, "recommended", ow) } : {}) };
  });
  if (options.length > 26) refuse(where, "options must be 26 or fewer");
  if (options.filter((op) => op.recommended !== undefined).length > 1) refuse(where, "at most one option can be recommended");
  const pairs = (k: string, a: string, b: string) =>
    o[k] === undefined ? undefined : list(o, k, where).map((x, j) => {
      const xw = `${where}: ${k} ${j + 1}`;
      const xo = fields(x, xw, [a, b]);
      return { [a]: text(xo, a, xw), [b]: text(xo, b, xw) };
    });
  const q: Question = { id, stage, round, q: 0, title: text(o, "title", where), description: text(o, "description", where), options };
  if (o.again !== undefined) q.again = resolve(o.again, "question", `${where}: again`);
  if (o.reopens !== undefined) q.reopens = resolve(o.reopens, "assumed pick", `${where}: reopens`);
  const today = pairs("today", "text", "source") as Fact[] | undefined;
  if (today) q.today = today;
  const terms = pairs("terms", "term", "text") as Term[] | undefined;
  if (terms) q.terms = terms;
  if (o.topics !== undefined) q.topics = texts(o, "topics", where).map((t) => resolve(t, "topic", `${where}: topics`));
  if (o.results !== undefined) q.entries = texts(o, "results", where).map((t) => resolve(t, "result entry", `${where}: results`));
  const example = optText(o, "example", where);
  if (example) q.example = example;
  return q;
}

/**
 * Q numbers count up within a Stage. A question asked again in its own Stage takes the Q number of the earlier question.
 * A question of a finished Stage that is still relevant is asked again in the current Stage under a new Q number.
 */
function assignQNumbers(s: State, qs: Question[], stage: string, where: string): void {
  const fresh = new Map(qs.map((q) => [q.id, q]));
  for (const q of qs) {
    if (q.again === undefined) continue;
    const seen = [q.id];
    for (let t = fresh.get(q.again); t; t = t.again === undefined ? undefined : fresh.get(t.again)) {
      if (seen.includes(t.id)) refuse(`${where}`, `questions ${seen.join(", ")} ask each other again, a cycle; again names an earlier question`);
      seen.push(t.id);
    }
    if (fresh.has(q.again)) refuse(where, `${q.id} asks ${q.again} again, which is in the same round; again names a question of an earlier round`);
  }
  let max = Math.max(0, ...s.questions.filter((q) => q.stage === stage).map((q) => q.q));
  for (const q of qs) {
    if (q.again === undefined) {
      q.q = ++max;
      continue;
    }
    const earlier = s.questions.find((x) => x.id === q.again) ?? refuse(where, `${q.id} asks ${q.again} again, which does not exist`);
    if (earlier.stage === stage) {
      q.q = earlier.q;
      continue;
    }
    const from = stageOf(s, earlier.stage, where);
    if (from.state !== "finished") refuse(where, `${q.id} asks ${earlier.id} again, but its Stage ${from.id} is still in progress; across Stages, again names a question of a finished Stage`);
    const latest = latestAsks(s, from.id).get(earlier.q)!;
    if (latest.id !== earlier.id) refuse(where, `${q.id} asks ${earlier.id} again, but ${latest.id} is the latest ask of Q${earlier.q} in Stage ${from.id}; ask that one again`);
    q.q = ++max;
  }
}

/** The latest ask of each Q number in a Stage, by Q number. */
export function latestAsks(s: State, stage: string): Map<number, Question> {
  const seqOf = new Map(s.rounds.map((r) => [r.id, r.seq]));
  const latest = new Map<number, Question>();
  for (const q of s.questions.filter((x) => x.stage === stage).sort((a, b) => seqOf.get(a.round)! - seqOf.get(b.round)!)) latest.set(q.q, q);
  return new Map([...latest].sort(([a], [b]) => a - b));
}

function checkLinks(s: State): void {
  const topics = new Set(s.topics.map((t) => t.id));
  const entries = new Set(s.results.flatMap((r) => r.entries.map((e) => `${r.id}/${e.id}`)));
  for (const q of s.questions) {
    for (const t of q.topics ?? []) if (!topics.has(t)) refuse(`question ${q.id}`, `topic ${t} does not exist`);
    for (const e of q.entries ?? []) if (!entries.has(e)) refuse(`question ${q.id}`, `result entry ${e} does not exist; name it <result ref or id>/<entry ref or id>`);
    if (q.reopens === undefined) continue;
    const a = s.assumed.find((x) => x.id === q.reopens) ?? refuse(`question ${q.id}`, `Assumed pick ${q.reopens} does not exist`);
    if (a.stage !== q.stage && stageOf(s, a.stage, `question ${q.id}`).state !== "finished") refuse(`question ${q.id}`, `Assumed pick ${a.id} belongs to Stage ${a.stage}, which is still in progress; reopen it from that Stage`);
    const other = s.questions.find((x) => x.reopens === a.id && x.id !== q.id);
    if (other) refuse(`question ${q.id}`, `Assumed pick ${a.id} is already reopened by ${other.id}; ask that question again instead`);
  }
  const attachments = new Set(s.attachments.map((a) => a.id));
  const used = new Set<string>();
  for (const r of [...s.results, ...s.history])
    for (const a of attachmentsOf(r)) {
      if (!attachments.has(a)) refuse(`result ${r.id}`, `attachment ${a} does not exist`);
      used.add(a);
    }
  for (const a of s.attachments) if (!used.has(a.id)) refuse(`attachment ${a.id}`, "is attached to no Result; name it in a Result's attachments or a Document figure");
}

/** Every attachment a Result shows: its figures, then its attachments list. */
export function attachmentsOf(r: Result): string[] {
  const figures = (r.document?.sections ?? []).flatMap((sec) => sec.blocks.flatMap((b) => ("figure" in b ? [b.figure] : [])));
  return [...new Set([...figures, ...(r.attachments ?? [])])];
}

// ---------------------------------------------------------------------------------------------------------------
// The derived view: labels, open questions, answers, and every backlink, computed from the single stored records.

/** `picks` holds option labels only for an explicit pick; `why` says why an unresolved answer is not consent. */
export type AnswerView = { state: AnswerState; why?: ResponseStatus | NonConsent; response?: AskResponse; reading?: Reading; picks?: string[] };
export type QuestionView = Question & { answer: AnswerView; open: boolean; latest: boolean; retired?: { reason: string; time: string }; decided_in?: string; asked_again_by: string[] };
export type DocView = {
  sections: { anchor: string; heading: string; blocks: Block[] }[];
  citations: { anchor: string; n: number; ref: string; source: string; text: string; cited_in: string[] }[]; citationsAnchor: string;
  limitations: string[]; limitationsAnchor: string;
  sources: string[]; sourceTexts: string[]; sourcesAnchor: string;
  figures: string[];
};
export type ResultView = Omit<Result, "entries" | "document"> & {
  /** The id this rendering of the Result anchors at: the Result id, or `<id>-r<n>` for an earlier revision. */
  anchor: string;
  revision: number;
  entries: (Entry & { anchor: string; questions: string[] })[];
  doc?: DocView;
  shown: Attachment[];
  history: ResultView[];
};
export type AssumedView = Assumed & { reopened_by?: string };
export type StageView = Stage & {
  label: string;
  children: string[];
  background?: Background & { sourceTexts: string[] };
  results: ResultView[];
  assumed: AssumedView[];
  items: ({ type: "round"; round: Round; questions: QuestionView[] } | { type: "close"; close: Close; latest: boolean })[];
  asked: QuestionView[];
};
export type View = {
  flow: State["flow"]; revision: number; stages: StageView[];
  topics: (Topic & { sourceTexts: string[]; questions: string[] })[];
  sources: (Source & { cited_by: string[] })[];
  questions: Map<string, QuestionView>;
  attachments: (Attachment & { used_by: string[] })[];
  progress: ProgressView;
};

const words = (skill: string) => skill.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Tab labels come from the skill name, plus the ticket when the Stage has one; repeated labels get a number. */
function stageLabels(stages: Stage[]): Map<string, string> {
  const base = new Map(stages.map((st) => [st.id, st.ticket ? `${words(st.skill)} ${st.ticket.startsWith("#") ? st.ticket : `#${st.ticket}`}` : words(st.skill)]));
  const total = new Map<string, number>();
  for (const b of base.values()) total.set(b, (total.get(b) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(stages.map((st) => {
    const b = base.get(st.id)!;
    const n = (seen.get(b) ?? 0) + 1;
    seen.set(b, n);
    return [st.id, n === 1 ? b : `${b} ${n}`];
  }));
}

function answerView(s: State, q: Question): AnswerView {
  const a = s.answers.find((x) => x.question === q.id);
  const state = answerState(s, q.id);
  if (!a) return { state };
  const recorded = { response: a.response, ...(a.reading ? { reading: a.reading } : {}) };
  if (state === "picked") return { state, ...recorded, picks: a.response.picks!.map((p) => optionLabel(q, p)) };
  if (state === "resolved") return { state, ...recorded };
  return { state, why: a.reading && a.reading.outcome !== "resolved" ? a.reading.outcome : a.response.status, ...recorded };
}

export function view(s: State): View {
  const sourceText = new Map(s.sources.map((x) => [x.id, x.text]));
  const labels = stageLabels([...s.stages].sort((a, b) => a.order - b.order));
  const decidedIn = new Map<string, string>();
  for (const c of [...s.closes].sort((a, b) => a.seq - b.seq)) for (const d of c.decisions) decidedIn.set(d.question, c.id);
  const latestIds = new Set(s.stages.flatMap((st) => [...latestAsks(s, st.id).values()].map((q) => q.id)));
  const questions = new Map<string, QuestionView>();
  for (const q of s.questions) {
    const answer = answerView(s, q);
    const latest = latestIds.has(q.id);
    const retired = s.retirements.find((r) => r.question === q.id);
    const qv: QuestionView = { ...q, answer, latest, open: latest && !retired && !settled(answer.state), asked_again_by: s.questions.filter((x) => x.again === q.id).map((x) => x.id) };
    if (retired) qv.retired = { reason: retired.reason, time: retired.time };
    if (decidedIn.has(q.id)) qv.decided_in = decidedIn.get(q.id);
    questions.set(q.id, qv);
  }
  const linking = (entry: string) => s.questions.filter((q) => q.entries?.includes(entry)).map((q) => q.id);
  const attachment = new Map(s.attachments.map((a) => [a.id, a]));
  const resultView = (r: Result, anchor: string, current: boolean): ResultView => {
    const { document: d, ...rest } = r;
    const rv: ResultView = {
      ...rest, anchor, revision: r.revision ?? 1, shown: attachmentsOf(r).map((a) => attachment.get(a)!), history: [],
      entries: r.entries.map((e) => ({ ...e, anchor: `${anchor}-${e.id}`, questions: current ? linking(`${r.id}/${e.id}`) : [] })),
    };
    if (d) {
      const sections = d.sections.map((sec, i) => ({ ...sec, anchor: `${anchor}-s${i + 1}` }));
      const citesIn = (ref: string) => sections.filter((sec) => sec.blocks.some((b) => ("prose" in b ? [b.prose] : "list" in b ? b.list : []).some((t) => [...t.matchAll(CITE)].some((m) => m[1] === ref)))).map((sec) => sec.anchor);
      rv.doc = {
        sections,
        citations: d.citations.map((c, i) => ({ anchor: `${anchor}-c${i + 1}`, n: i + 1, ref: c.ref, source: c.source, text: sourceText.get(c.source)!, cited_in: citesIn(c.ref) })), citationsAnchor: `${anchor}-citations`,
        limitations: d.limitations, limitationsAnchor: `${anchor}-limitations`,
        sources: d.sources, sourceTexts: d.sources.map((x) => sourceText.get(x)!), sourcesAnchor: `${anchor}-sources`,
        figures: d.sections.flatMap((sec) => sec.blocks.flatMap((b) => ("figure" in b ? [b.figure] : []))),
      };
    }
    if (current) rv.history = s.history.filter((h) => h.id === r.id).map((h) => resultView(h, `${r.id}-r${h.revision ?? 1}`, false));
    return rv;
  };
  const stages = [...s.stages].sort((a, b) => a.order - b.order).map((st): StageView => {
    const bg = s.backgrounds.find((b) => b.stage === st.id);
    const results = s.results.filter((r) => r.stage === st.id).map((r) => resultView(r, r.id, true));
    const closes = s.closes.filter((c) => c.stage === st.id);
    const lastClose = closes.at(-1)?.id;
    const seqOfRound = (r: Round) => r.seq;
    const items = [
      ...s.rounds.filter((r) => r.stage === st.id).map((round) => ({ type: "round" as const, seq: seqOfRound(round), round, questions: s.questions.filter((q) => q.round === round.id).sort((a, b) => a.q - b.q).map((q) => questions.get(q.id)!) })),
      ...closes.map((close) => ({ type: "close" as const, seq: close.seq, close, latest: close.id === lastClose })),
    ].sort((a, b) => a.seq - b.seq).map(({ seq: _, ...item }) => item);
    return {
      ...st, label: labels.get(st.id)!, children: s.stages.filter((x) => x.parent === st.id).map((x) => x.id), results, items,
      assumed: s.assumed.filter((a) => a.stage === st.id).map((a) => {
        const by = s.questions.find((q) => q.reopens === a.id)?.id;
        return by ? { ...a, reopened_by: by } : a;
      }),
      asked: [...latestAsks(s, st.id).values()].map((q) => questions.get(q.id)!),
      ...(bg ? { background: { ...bg, sourceTexts: bg.sources.map((x) => sourceText.get(x)!) } } : {}),
    };
  });
  const citers = (id: string) => [
    ...s.backgrounds.filter((b) => b.sources.includes(id)).map((b) => b.id),
    ...s.topics.filter((t) => t.sources.includes(id)).map((t) => t.id),
    ...s.questions.filter((q) => q.today?.some((f) => f.source === id)).map((q) => q.id),
    ...s.results.filter((r) => r.document && (r.document.sources.includes(id) || r.document.citations.some((c) => c.source === id))).map((r) => r.id),
  ];
  return {
    flow: s.flow, revision: s.revision, stages, questions, progress: progressView(s),
    topics: s.topics.map((t) => ({ ...t, sourceTexts: t.sources.map((x) => sourceText.get(x)!), questions: s.questions.filter((q) => q.topics?.includes(t.id)).map((q) => q.id) })),
    sources: s.sources.map((x) => ({ ...x, cited_by: citers(x.id) })),
    attachments: s.attachments.map((a) => ({ ...a, used_by: [...new Set([...s.results, ...s.history].filter((r) => attachmentsOf(r).includes(a.id)).map((r) => r.id))] })),
  };
}

/** The `show` snapshot: ids, numbers, states, labels, and links, with no page markup. */
export function snapshot(v: View, page: string, renderer: number) {
  return {
    flow: v.flow, revision: v.revision, renderer, page,
    stages: v.stages.map((st) => ({
      id: st.id, label: st.label, skill: st.skill, ...(st.ticket ? { ticket: st.ticket } : {}), ...(st.parent ? { parent: st.parent } : {}), children: st.children,
      state: st.state, order: st.order, opened: st.opened, ...(st.finished ? { finished: st.finished } : {}),
      background: st.background?.id,
      results: st.results.map((r) => ({
        id: r.id, shape: r.shape, revision: r.revision, ...(r.captured ? { captured: r.captured } : {}), ...(r.canonical ? { canonical: r.canonical } : {}), changed: r.changed,
        revisions: [...r.history, r].map((x) => ({ revision: x.revision, ...(x.captured ? { captured: x.captured } : {}), ...(x.canonical ? { canonical: x.canonical } : {}), attachments: x.shown.map((a) => a.id) })),
        attachments: r.shown.map((a) => a.id),
        entries: r.entries.map(({ anchor: _, ...e }) => ({ ...e, id: `${r.id}/${e.id}`, questions: e.questions })),
        ...(r.doc ? {
          document: {
            sections: r.doc.sections.map((sec) => sec.anchor),
            citations: r.doc.citations.map((c) => ({ anchor: c.anchor, n: c.n, source: c.source, cited_in: c.cited_in })),
            figures: r.doc.figures, limitations: r.doc.limitations.length, limitations_anchor: r.doc.limitationsAnchor, sources: r.doc.sources,
          },
        } : {}),
      })),
      assumed: st.assumed.map((a) => ({ id: a.id, ...(a.reopened_by ? { reopened_by: a.reopened_by } : {}) })),
      rounds: st.items.filter((i) => i.type === "round").map((i) => ({ id: i.round.id, n: i.round.n, time: i.round.time, questions: i.questions.map((q) => q.id) })),
      questions: st.items.flatMap((i) => (i.type === "round" ? i.questions : [])).map((q) => ({
        id: q.id, q: q.q, latest: q.latest, open: q.open, answer: q.answer, ...(q.retired ? { retired: q.retired } : {}),
        ...(q.again ? { again: q.again } : {}), asked_again_by: q.asked_again_by, ...(q.reopens ? { reopens: q.reopens } : {}),
        results: q.entries ?? [], topics: q.topics ?? [], ...(q.decided_in ? { decided_in: q.decided_in } : {}),
      })),
      closes: st.items.filter((i) => i.type === "close").map((i) => ({
        id: i.close.id, time: i.close.time, decisions: i.close.decisions.map((d) => ({ question: d.question, answer: d.answer })), assumed: i.close.assumed,
      })),
    })),
    topics: v.topics.map((t) => ({ id: t.id, questions: t.questions })),
    sources: v.sources.map((x) => ({ id: x.id, cited_by: x.cited_by })),
    attachments: v.attachments.map((a) => ({
      id: a.id, stage: a.stage, type: a.type, availability: a.availability, time: a.time, used_by: a.used_by,
      ...(a.revision ? { revision: a.revision } : {}), ...(a.file ? { file: `assets/${a.file}`, size: a.size } : {}), ...(a.from ? { from: a.from } : {}),
    })),
    progress: progressSnapshot(v.progress),
  };
}
