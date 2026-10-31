import { createHash } from "node:crypto";
import { linesOf, parseDiff, type Hunk } from "./code.ts";
import { progressHandlers, type Progress, PROGRESS_KINDS, type ProgressKind, type ProgressView, progressSnapshot, progressView } from "./progress.ts";
import { CODE_ID, fields, isObj, list, listed, newId, type Obj, REF, refuse, text, texts, VISUAL_KINDS } from "./fields.ts";

export const SCHEMA = 1;
export const CONTRIBUTION_VERSION = 1;

export const STAGE_STATES = ["not-started", "in-progress", "finished"] as const;
export type StageState = (typeof STAGE_STATES)[number];
export type Stage = { id: string; skill: string; ticket?: string; parent?: string; state: StageState; order: number; opened?: string; finished?: string };
export type Round = { id: string; stage: string; n: number; seq: number; time: string; session?: number };
export type VisualKind = keyof typeof VISUAL_KINDS;
export type ReaderNeed = { need: string; kind: VisualKind };
export type Figure = { id: string; kind?: Exclude<VisualKind, "prose"> } & ({ text: string } | { html: string; css?: string } | { attachment: string });
export type Option = { label: string; does: string; gains: string[]; costs: string[]; recommended?: string; preview?: Figure };
export type Fact = { text: string; source: string };
export type Term = { term: string; text: string };
export type Question = {
  id: string; stage: string; round: string; q: number; title: string; description: string; options: Option[];
  again?: string; reopens?: string; today?: Fact[]; terms?: Term[]; topics?: string[]; entries?: string[]; example?: string; figures?: Figure[]; needs?: ReaderNeed[];
};
/** What `ask` returned, as it returned it. `picks` of a timed-out, cancelled, or headless response are not the user's. */
const STATUSES = ["answered", "empty", "cancelled", "timed-out", "headless"] as const;
export type ResponseStatus = (typeof STATUSES)[number];
export type AskResponse = { status: ResponseStatus; picks?: string[]; text?: string; note_on?: string };
/** The agent's reading of words with no pick: they settle the decision, or they leave a part of it unresolved. */
const NON_CONSENT = ["question", "concern", "ambiguous"] as const;
export type NonConsent = (typeof NON_CONSENT)[number];
export type Reading = { outcome: "resolved"; decision: string; basis: string; maps_to?: string } | { outcome: NonConsent; unresolved: string };
export type Answer = { id?: string; question: string; time?: string; response?: AskResponse; reading?: Reading; legacy?: { other?: string; note?: string; unanswered?: string } };
export type AnswerState = "open" | "picked" | "written" | "resolved" | "unresolved";
export type Decision = { question: string; text: string; answer: AnswerState };
export type Close = { id: string; stage: string; seq: number; time?: string; decisions: Decision[]; assumed: string[]; extra?: string[] };
export type Assumed = { id: string; stage: string; decision: string; pick: string; why: string };
export type Retirement = { question: string; reason: string; time?: string };
export type Section = { heading: string; body: string };
export type Background = { id: string; stage: string; title: string; summary: string; sections: Section[]; sources: string[]; figures?: Figure[]; jump?: string };
export type Topic = { id: string; title: string; summary: string; body: string; sources: string[] };
const SHAPES = ["cards", "ledger", "table", "document", "prototype", "comparison", "metrics", "code", "timeline", "quiz", "review"] as const;
export type Shape = (typeof SHAPES)[number];
const REVIEW_AXES = ["standards", "spec", "blast-radius"] as const;
const REVIEW_STATES = ["findings", "clean", "skipped", "unavailable", "blocked"] as const;
export type ReviewAxisName = (typeof REVIEW_AXES)[number];
export type ReviewStatus = (typeof REVIEW_STATES)[number];
type ReviewAxis = { axis: (typeof REVIEW_AXES)[number]; status: (typeof REVIEW_STATES)[number]; reason?: string };
type ReviewRow = ReviewAxis & { finding?: string; impact?: string; location?: string; blocking?: boolean; target?: string };
/** `changed` is the Flow revision that last changed a Result's header or an entry, which a focused revision checks. */
export type Entry = Record<string, unknown> & { id: string; changed: number };
/** One block of a Document section. Prose and list items can cite with `[@<citation ref>]`. */
export type Block = { prose: string } | { list: string[]; ordered: boolean } | { code: string; language?: string; source?: string } | { figure: string };
export type DocSection = { heading: string; blocks: Block[] };
export type DocumentBody = { sections: DocSection[]; citations: { ref: string; source: string }[]; limitations: string[]; sources: string[] };
/** Alternatives side by side on shared criteria. A pair with no assessment stays a gap. Refs are local to the Result. */
export type Alternative = { ref: string; name: string; summary?: string; attachments?: string[] };
export type Criterion = { ref: string; name: string; description?: string };
export type Assessment = { alternative: string; criterion: string; finding: string; evidence?: string };
export const VERDICTS = ["chosen", "tie", "inconclusive"] as const;
export type ComparisonBody = {
  alternatives: Alternative[]; criteria: Criterion[]; assessments: Assessment[];
  verdict: { outcome: (typeof VERDICTS)[number]; alternative?: string; reason: string };
};
/** Measured numbers. A value is a number, or `missing` with its reason; code never fills one in or rates it. */
export type Uncertainty = { low: number; high: number; of: string } | { plusminus: number; of: string };
export type Measured = { series: string; value: number; samples?: number; uncertainty?: Uncertainty } | { series: string; missing: string };
export const MEASURE_VERDICTS = ["better", "worse", "no-difference", "inconclusive"] as const;
export type Measurement = { ref: string; name: string; unit: string; better?: "lower" | "higher"; verdict?: (typeof MEASURE_VERDICTS)[number]; values: Measured[] };
export type MetricsBody = { workload: string; environment?: string; outcome: string; series: { ref: string; label: string; baseline?: true }[]; measurements: Measurement[] };
/** Where a Result's content is canonically kept, and which revision of it the Result captured. */
export type Canonical = { file: string; root: string; sha256: string } | { commit: string } | { tracker: string; revision: string };
/** A demo value: a number, a yes/no flag, or a line of text, fixed in type by its initial value. */
export type DemoLiteral = number | boolean | string;
export const DEMO_OPS = ["eq", "ne", "lt", "le", "gt", "ge"] as const;
export type DemoOp = (typeof DEMO_OPS)[number];
/** A bounded condition over demo values. There is no other expression: nothing in a demo is evaluated as source code. */
export type Condition = { value: string; op: DemoOp; to: DemoLiteral } | { all: Condition[] } | { any: Condition[] } | { not: Condition };
export type Effect = { set: DemoLiteral } | { add: number } | { toggle: true };
export type Transition = { from?: string[]; when?: Condition; to?: string; set?: Record<string, Effect> };
/** A declarative state demo. An action takes its first transition that leaves the current state and whose condition
 *  holds; reset returns to `start` and every value's `initial`. The page keeps the demo's state in the browser only. */
export type Demo = {
  values: { name: string; label: string; initial: DemoLiteral }[];
  states: { name: string; label: string; description?: string }[];
  start: string;
  actions: { name: string; label: string; transitions: Transition[] }[];
};
export type QuizRule = { choice: string } | { text: string[]; case_sensitive: boolean } | { number: number; tolerance: number };
export type Quiz = { questions: { ref: string; prompt: string; explanation: string; choices?: { ref: string; label: string }[]; answer: QuizRule }[] };
/** `revision` counts whole republications of the Result with `revises`; `captured` is when this one was submitted. */
export type Result = {
  id: string; stage: string; shape: Shape; title: string; summary?: string; columns?: string[]; entries: Entry[]; changed: number;
  axes?: ReviewAxis[];
  edit?: number;
  document?: DocumentBody; demo?: Demo; artifact?: string; quiz?: Quiz; comparison?: ComparisonBody; metrics?: MetricsBody; attachments?: string[]; canonical?: Canonical; revision?: number; captured?: string; jump?: string;
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
  runtime?: "html" | "local-app" | "terminal";
  bundle?: { entry: string; files: { path: string; file: string; size: number }[] };
};
export type Io = {
  capture(path: string, type: AttachmentType, where: string): { revision: string; file: string; size: number; name: string; from: { root: string; path: string } };
  /** The canonical file `path` names, resolved from the working directory, or from the named `root` when given. */
  canonical(path: string, where: string, root?: string): { file: string; root: string; sha256: string };
};
/** One explicit lifecycle change of the whole Flow. Retention counts from the latest close; nothing else moves it. */
export type Lifecycle = { event: "closed" | "reopened"; time: string };

type ReadingBlock = { id: string; kind: "background" | "topic" | "question" | "result" | "assumed" | "close"; stage?: string };
type Publication = ReadingBlock & { position: number; publication: number };
type ReadingOrder = { historical: ReadingBlock[]; publications: Publication[] };

export type State = {
  schema: number;
  flow: { id: string; slug: string; title: string; created: string; crumb?: string };
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
  /** Closes and reopens, oldest first. A Flow with none, or whose latest is a reopen, is open. */
  lifecycle: Lifecycle[];
  reading: ReadingOrder;
  migrated?: { from: string; sha256: string; time: string; records: Record<string, unknown>[]; anchors: Record<string, string> };
};

/** Fills fields absent from earlier structured states. */
export function upgrade(s: State): State {
  s.attachments ??= [];
  s.history ??= [];
  s.lifecycle ??= [];
  s.reading ??= retainedReading(s);
  return s;
}

export function retainedReading(s: State): ReadingOrder {
  const historical: ReadingBlock[] = [];
  for (const st of s.stages) {
    for (const [kind, blocks] of [
      ["background", s.backgrounds], ["result", s.results], ["assumed", s.assumed],
    ] as const) for (const b of blocks) if (b.stage === st.id) historical.push({ id: b.id, kind, stage: st.id });
    const items = [
      ...s.rounds.filter((r) => r.stage === st.id).map((r) => ({ seq: r.seq, blocks: s.questions.filter((q) => q.round === r.id).sort((a, b) => a.q - b.q).map((q): ReadingBlock => ({ id: q.id, kind: "question", stage: st.id })) })),
      ...s.closes.filter((c) => c.stage === st.id).map((c) => ({ seq: c.seq, blocks: [{ id: c.id, kind: "close" as const, stage: st.id }] })),
    ].sort((a, b) => a.seq - b.seq);
    historical.push(...items.flatMap((i) => i.blocks));
  }
  historical.push(...s.topics.map((t): ReadingBlock => ({ id: t.id, kind: "topic" })));
  return { historical, publications: [] };
}

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TICKET = /^#?[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const WHOLE: Record<string, string> = { document: "a Document", prototype: "a demo", comparison: "a Comparison", metrics: "a Metrics Result", quiz: "a Quiz" };
const OUTCOMES = ["succeeded", "failed", "blocked", "skipped", "unknown", "noted"] as const;
export type TimelineOutcome = (typeof OUTCOMES)[number];
const TIME = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2}))?$/;
function realTime(t: string): boolean {
  const m = t.match(TIME);
  if (!m) return false;
  const [y, mo, d, h, mi, sec] = m.slice(1).map((x) => Number(x ?? 0));
  const days = new Date(`${m[1]}-${m[2]}-01T00:00:00Z`);
  days.setUTCMonth(days.getUTCMonth() + 1, 0);
  const offset = t.match(/[+-](\d{2}):(\d{2})$/);
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days.getUTCDate() && h < 24 && mi < 60 && sec < 60 && (!offset || (Number(offset[1]) <= 23 && Number(offset[2]) < 60));
}
const LANGUAGE = /^[a-z0-9][a-z0-9+#.-]*$/i;
const CLAIM_STATES = ["confirmed", "cleared", "unproven"] as const;
export type ClaimState = (typeof CLAIM_STATES)[number];
/** A citation marker in Document prose or a list item. */
export const CITE = /\[@([a-z0-9][a-z0-9-]*)\]/g;
const LINK = /\[[^\]]*\]\(([^)\s]*)\)/g;
function safeLinks(t: string, where: string): string {
  for (const m of t.matchAll(LINK)) if (!/^(https?:\/\/|#)/i.test(m[1])) refuse(where, `the link ${JSON.stringify(m[1])} uses an unsafe or unsupported scheme; links must start with https://, http://, or #`);
  return t;
}
const all = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
export const letter = (i: number) => String.fromCharCode(65 + i);
const letterIndex = (s: string) => (/^[A-Z]$/.test(s) ? s.charCodeAt(0) - 65 : -1);
/** The full label, such as "B. Second", of the option a letter names. */
export const optionLabel = (q: Question, l: string) => q.options[letterIndex(l)].label;

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


export function newFlow(id: string, slug: string, title: string, time: string): State {
  if (title.trim() === "") refuse("open", "--title must be non-empty");
  return {
    schema: SCHEMA, flow: { id, slug, title, created: time }, revision: 0, next: {}, seq: 0,
    stages: [], rounds: [], questions: [], answers: [], closes: [], backgrounds: [], topics: [], results: [], assumed: [], retirements: [], sources: [],
    aliases: [`folder:${id}`], submissions: {}, attachments: [], history: [], lifecycle: [], reading: { historical: [], publications: [] },
  };
}

export function openStage(s: State, skill: string, ticket: string | undefined, time: string, parent?: string): Stage {
  if (!SLUG.test(skill)) refuse("open", `--skill must be a skill name of lowercase letters, digits, and hyphens, got ${JSON.stringify(skill)}`);
  if (ticket !== undefined && !TICKET.test(ticket)) refuse("open", `--ticket must be a ticket id such as 269 or #269, got ${JSON.stringify(ticket)}`);
  if (closedAt(s) !== undefined) refuse("open", `Flow ${s.flow.id} is closed; continue it with reopen, which opens the new Stage`);
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

/** When the Flow was closed, or undefined while it is open. */
export const closedAt = (s: State): string | undefined => (s.lifecycle.at(-1)?.event === "closed" ? s.lifecycle.at(-1)!.time : undefined);

/** Closes an open Flow whose Stages are all finished. */
export function closeFlow(s: State, time: string): void {
  if (closedAt(s) !== undefined) refuse("close", `Flow ${s.flow.id} is already closed, since ${closedAt(s)}`);
  const busy = s.stages.filter((st) => st.state !== "finished").map((st) => st.id);
  if (busy.length) refuse("close", `Flow ${s.flow.id} still has work in progress: finish Stage ${all(busy)} first`);
  s.lifecycle.push({ event: "closed", time });
  s.revision++;
}

/** Reopens a closed Flow with the new Stage that continues it, in one revision. Earlier Stages stay as they were. */
export function reopenFlow(s: State, skill: string, ticket: string | undefined, time: string, parent?: string): Stage {
  if (closedAt(s) === undefined) refuse("reopen", `Flow ${s.flow.id} is open; add a Stage to it with open --flow`);
  s.lifecycle.push({ event: "reopened", time });
  return openStage(s, skill, ticket, time, parent);
}

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

const optText = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : text(o, k, where));
const optTexts = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : texts(o, k, where));
function ref(o: Obj, where: string): string | undefined {
  if (o.ref === undefined) return undefined;
  if (typeof o.ref !== "string" || !REF.test(o.ref)) refuse(where, "ref must be lowercase letters, digits, and hyphens");
  if (CODE_ID.test(o.ref as string)) refuse(where, `ref ${o.ref} looks like an id the script assigns; choose another ref`);
  return o.ref as string;
}

export type Receipt = { refs: Record<string, string>; ask?: { questions: { id: string; question: string; options: { label: string }[]; recommended?: number }[] } };

const KINDS = ["background", "topic", "attachment", "result", "revise", "assumed", "round", "answer", "close", "stage", ...PROGRESS_KINDS] as const;
type ContributionKind = (typeof KINDS)[number];
type PlannedIds = { id?: string; entries?: string[]; questions?: string[] };
type ContributionHandler = { plan?: (o: Obj, where: string, ids: PlannedIds) => void; apply: (o: Obj, where: string, ids: PlannedIds) => void };

const stableJson = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(stableJson).join(",")}]` : isObj(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableJson(v[k])}`).join(",")}}` : JSON.stringify(v);

/**
 * Applies `input` to Stage `stageId` of `s` in place, or throws a Refusal and leaves the caller to discard `s`.
 * A repeat of the Stage's latest contribution changes nothing and returns that contribution's receipt and revision.
 */
export function contribute(s: State, stageId: string, input: unknown, time: string, io: Io): Receipt & { revision: number; repeated?: true } {
  const env = fields(input, "contribution", ["version", "items"]);
  if (env.version !== CONTRIBUTION_VERSION) refuse("contribution", `version ${JSON.stringify(env.version)} is not supported; flow-page reads contribution version ${CONTRIBUTION_VERSION}`);
  const items = list(env, "items", "contribution");
  const stage = stageOf(s, stageId, "contribution");
  const digest = createHash("sha256").update(stableJson(input)).digest("hex");
  const last = s.submissions[stage.id];
  if (last?.digest === digest) return { ...last.receipt, revision: last.revision, repeated: true };
  if (stage.state === "finished") refuse("contribution", `Stage ${stage.id} is finished, so it takes no more content; open a new Stage to continue the Flow`);
  const rev = s.revision + 1;

  const published = new Set([...s.reading.historical, ...s.reading.publications].map((b) => b.id));
  const publish = (kind: ReadingBlock["kind"], id: string) => {
    if (published.has(id)) return;
    published.add(id);
    s.reading.publications.push({ id, kind, stage: stage.id, position: s.reading.publications.length + 1, publication: rev });
  };
  const refs: Record<string, string> = {};
  const kinds: Record<string, string> = {};
  const claim = (r: string | undefined, id: string, kind: string, where: string) => {
    if (r === undefined) return;
    if (refs[r] !== undefined) refuse(where, `ref ${r} is already used in this contribution`);
    refs[r] = id;
    kinds[r] = kind;
  };
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
  const nextEntry = new Map<string, number>();
  const authoredFigures: Figure[] = [];
  const figure = (raw: unknown, id: string, where: string): Figure => {
    const o = fields(raw, where, [], ["attachment", "text", "kind"]);
    if (["attachment", "text"].filter((k) => o[k] !== undefined).length !== 1) refuse(where, "a figure needs exactly one of attachment or text");
    const kind = o.kind === undefined ? undefined : visualKind(o.kind, where);
    const f: Figure = { id, ...(kind ? { kind } : {}), ...(o.text === undefined ? { attachment: resolve(o.attachment, "attachment", where) } : { text: text(o, "text", where) }) };
    authoredFigures.push(f);
    return f;
  };
  const receipt: Receipt = { refs };
  let rounds = 0;
  const handlers: Record<ContributionKind, ContributionHandler> = {
    background: {
      apply(o, where, ids) {
        fields(o, where, ["kind", "title", "summary", "sections", "sources"], ["figures"]);
        const other = s.backgrounds.find((b) => b.stage === stage.id);
        if (other) refuse(where, `Stage ${stage.id} already has ${other.id}; a Stage has one Background`);
        const sections = list(o, "sections", where).map((sec, j) => {
          const sw = `${where}: section ${j + 1}`;
          const so = fields(sec, sw, ["heading", "body"]);
          return { heading: text(so, "heading", sw), body: text(so, "body", sw) };
        });
        const id = newId(s, "background");
        const figures = o.figures === undefined ? undefined : list(o, "figures", where).map((f, j) => figure(f, `${id}-figure-${j + 1}`, `${where}: figure ${j + 1}`));
        s.backgrounds.push({ id, stage: stage.id, title: text(o, "title", where), summary: text(o, "summary", where), sections, sources: texts(o, "sources", where).map((t) => sourceId(s, t)), ...(figures ? { figures } : {}) });
        publish("background", id);
      },
    },
    topic: {
      plan(o, where, ids) {
        claim(ref(o, where), (ids.id = newId(s, "topic")), "topic", where);
      },
      apply(o, where, ids) {
        fields(o, where, ["kind", "title", "summary", "body", "sources"], ["ref"]);
        s.topics.push({ id: ids.id!, title: text(o, "title", where), summary: text(o, "summary", where), body: text(o, "body", where), sources: texts(o, "sources", where).map((t) => sourceId(s, t)) });
        publish("topic", ids.id!);
      },
    },
    attachment: {
      plan(o, where, ids) {
        claim(ref(o, where), (ids.id = newId(s, "attachment")), "attachment", where);
      },
      apply(o, where, ids) {
        s.attachments.push(parseAttachment(o, where, stage.id, ids.id!, time, io));
      },
    },
    result: {
      plan(o, where, ids) {
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
      },
      apply(o, where, ids) {
        const r = parseResult(o, where, stage.id, ids.id!, ids.entries!, rev, (v, w) => resolve(v, "attachment", w), (t) => sourceId(s, t), io);
        if (r.shape === "review" && s.results.some((other) => other.stage === stage.id && other.shape === "review" && other.id !== r.id)) refuse(where, "a Stage has one authoritative review Result; revise the existing review instead");
        r.captured = time;
        const i = s.results.findIndex((x) => x.id === r.id);
        if (i < 0) {
          r.revision = 1;
          s.results.push(r);
          publish("result", r.id);
          return;
        }
        const old = s.results[i];
        if (r.canonical === undefined && old.canonical !== undefined) {
          if (!("file" in old.canonical)) refuse(where, `${old.id} was captured from ${"commit" in old.canonical ? `commit ${old.canonical.commit}` : `${old.canonical.tracker} at ${old.canonical.revision}`}; give canonical again with the revision this one captures`);
          r.canonical = io.canonical(old.canonical.file, where, old.canonical.root);
        }
        r.revision = (old.revision ?? 1) + 1;
        s.history.push(old);
        s.results[i] = r;
      },
    },
    revise: {
      plan(o, where, ids) {
        if (Array.isArray(o.add) && typeof o.result === "string" && !o.result.includes("/")) {
          const rid = kinds[o.result] === "result" ? refs[o.result] : o.result;
          const r = s.results.find((x) => x.id === rid);
          if (r) {
            const next = nextEntry.get(rid) ?? Math.max(0, ...r.entries.map((e) => /^e\d+$/.test(e.id) ? Number(e.id.slice(1)) : 0)) + 1;
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
      },
      apply(o, where, ids) {
        revise(s, o, where, stage.id, ids.entries, rev, time, resolve);
      },
    },
    assumed: {
      plan(o, where, ids) {
        claim(ref(o, where), (ids.id = newId(s, "assumed")), "assumed pick", where);
      },
      apply(o, where, ids) {
        fields(o, where, ["kind", "decision", "pick", "why"], ["ref"]);
        s.assumed.push({ id: ids.id!, stage: stage.id, decision: text(o, "decision", where), pick: text(o, "pick", where), why: text(o, "why", where) });
        publish("assumed", ids.id!);
      },
    },
    round: {
      plan(o, where, ids) {
        if (Array.isArray(o.questions))
          ids.questions = o.questions.map((q, j) => {
            const qid = newId(s, "question");
            if (isObj(q)) claim(ref(q, `${where}: question ${j + 1}`), qid, "question", `${where}: question ${j + 1}`);
            return qid;
          });
      },
      apply(o, where, ids) {
        fields(o, where, ["kind", "questions"]);
        if (++rounds > 1) refuse(where, "a contribution asks at most one round, because one round is one ask");
        const qs = list(o, "questions", where);
        const round: Round = { id: newId(s, "round"), stage: stage.id, n: Math.max(0, ...s.rounds.filter((r) => r.stage === stage.id).map((r) => r.n)) + 1, seq: ++s.seq, time };
        s.rounds.push(round);
        const parsed = qs.map((q, j) => parseQuestion(q, `${where}: question ${j + 1}`, ids.questions![j], stage.id, round.id, resolve, figure));
        assignQNumbers(s, parsed, stage.id, where);
        s.questions.push(...parsed);
        for (const q of parsed) publish("question", q.id);
        receipt.ask = {
          questions: [...parsed].sort((a, b) => a.q - b.q).map((q) => {
            const rec = q.options.findIndex((op) => op.recommended !== undefined);
            return { id: q.id, question: `Q${q.q}. ${q.title}`, options: q.options.map((op) => ({ label: op.label })), ...(rec >= 0 ? { recommended: rec } : {}) };
          }),
        };
        for (const q of parsed) for (const f of q.today ?? []) f.source = sourceId(s, f.source);
      },
    },
    answer: {
      apply(o, where, ids) {
        fields(o, where, ["kind", "question", "response"], ["reading"]);
        const qid = resolve(o.question, "question", `${where}: question`);
        const q = s.questions.find((x) => x.id === qid) ?? refuse(where, `question ${qid} does not exist`);
        if (q.stage !== stage.id) refuse(where, `question ${qid} belongs to Stage ${q.stage}, not the bound Stage ${stage.id}`);
        if (s.answers.some((a) => a.question === qid)) refuse(where, `question ${qid} already has an answer; to reopen the decision, ask it again in a later round with again: ${qid}, which keeps this answer`);
        const response = parseResponse(o.response, `${where}: response`, q);
        const reading = parseReading(o.reading, `${where}: reading`, q, response);
        s.answers.push({ question: qid, time, response, ...(reading ? { reading } : {}) });
      },
    },
    close: {
      apply(o, where, ids) {
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
        const assumed = visibleAssumed(s, stage.id).map((a) => a.id);
        if (decisions.length === 0 && assumed.length === 0 && extra === undefined) refuse(where, "a close with no decisions and no Assumed picks needs extra bullets");
        s.closes.push({ id: newId(s, "close"), stage: stage.id, seq: ++s.seq, time, decisions, assumed, ...(extra ? { extra } : {}) });
        publish("close", s.closes.at(-1)!.id);
      },
    },
    stage: {
      apply(o, where, ids) {
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
      },
    },
    ...Object.fromEntries(PROGRESS_KINDS.map((kind) => {
      const handler = progressHandlers[kind];
      return [kind, {
        plan(o: Obj, where: string, ids: PlannedIds) {
          if (handler.update !== undefined && o[handler.update] === undefined) claim(ref(o, where), (ids.id = newId(s, kind)), kind, where);
        },
        apply(o: Obj, where: string, ids: PlannedIds) {
          handler.apply({ s, stage: stage.id, o, where, plannedId: ids.id, resolve, time });
        },
      }];
    })) as Record<ProgressKind, ContributionHandler>,
  };
  const planned = items.map((raw, i) => {
    const kind = isObj(raw) ? raw.kind : undefined;
    const where = `item ${i + 1}${typeof kind === "string" ? ` (${kind})` : ""}`;
    if (typeof kind !== "string" || !KINDS.includes(kind as ContributionKind)) refuse(where, `kind must be ${listed(KINDS)}, got ${JSON.stringify(kind)}`);
    const o = raw as Obj;
    const ids: PlannedIds = {};
    const handler = handlers[kind as ContributionKind];
    handler.plan?.(o, where, ids);
    return { o, where, ids, handler };
  });
  for (const { o, where, ids, handler } of planned) handler.apply(o, where, ids);
  for (const f of authoredFigures) if ("attachment" in f) {
    const a = s.attachments.find((a) => a.id === f.attachment) ?? refuse(f.id, `attachment ${f.attachment} does not exist`);
    if (!["image", "svg"].includes(a.type) || a.availability !== "captured") refuse(f.id, `attachment ${a.id} must be a captured image or SVG figure`);
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
  if (shape === "prototype") {
    fields(o, where, ["kind", "shape", "title"], [...shared, "demo", "artifact"]);
    if ((o.demo === undefined) === (o.artifact === undefined)) refuse(where, "a prototype needs exactly one of demo or artifact");
    return head(o.demo !== undefined ? { demo: parseDemo(o.demo, `${where}: demo`) } : { artifact: attachment(o.artifact, `${where}: artifact`) });
  }
  if (shape === "comparison") {
    fields(o, where, ["kind", "shape", "title", "alternatives", "criteria", "assessments", "verdict"], shared);
    return head({ comparison: parseComparison(o, where, attachment) });
  }
  if (shape === "metrics") {
    fields(o, where, ["kind", "shape", "title", "workload", "outcome", "series", "measurements"], [...shared, "environment"]);
    return head({ metrics: parseMetrics(o, where) });
  }
  if (shape === "quiz") {
    fields(o, where, ["kind", "shape", "title", "questions"], shared);
    return head({ quiz: parseQuiz(o, where) });
  }
  if (shape === "review") {
    fields(o, where, ["kind", "shape", "title", "axes", "entries"], shared);
    if (!Array.isArray(o.entries)) refuse(where, "entries must be an array, empty when the review has no findings");
    const entries = (o.entries as unknown[]).map((e, j) => parseEntry(shape, undefined, e, `${where}: entry ${j + 1}`, entryIds[j].split("/")[1], rev, attachment));
    const axes = parseReviewAxes(o.axes, `${where}: axes`);
    checkReview(axes, entries, where);
    return head({ axes, entries });
  }
  fields(o, where, ["kind", "shape", "title", table ? "columns" : "entries", ...(table ? ["rows"] : [])], shared);
  const columns = table ? texts(o, "columns", where) : undefined;
  const entries = list(o, table ? "rows" : "entries", where).map((e, j) => parseEntry(shape, columns, e, `${where}: ${table ? "row" : "entry"} ${j + 1}`, entryIds[j].split("/")[1], rev, attachment));
  return head({ ...(columns ? { columns } : {}), entries });
}

function parseQuiz(o: Obj, where: string): Quiz {
  const seen = new Set<string>();
  const questions = list(o, "questions", where).map((raw, i) => {
    const w = `${where}: quiz question ${i + 1}`;
    const q = fields(raw, w, ["ref", "prompt", "answer", "explanation"], ["choices"]);
    const name = text(q, "ref", w);
    if (!REF.test(name) || seen.has(name)) refuse(w, "ref must be unique lowercase letters, digits, and hyphens");
    seen.add(name);
    const a = fields(q.answer, `${w}: answer`, [], ["choice", "text", "case_sensitive", "number", "tolerance"]);
    if (["choice", "text", "number"].filter((k) => a[k] !== undefined).length !== 1) refuse(w, "answer needs exactly one of choice, text, or number");
    let answer: QuizRule;
    let choices: { ref: string; label: string }[] | undefined;
    if (a.choice !== undefined) {
      fields(a, w, ["choice"]);
      const names = new Set<string>();
      choices = list(q, "choices", w).map((raw) => {
        const c = fields(raw, w, ["ref", "label"]);
        const name = text(c, "ref", w);
        if (!REF.test(name) || names.has(name)) refuse(w, "choice refs must be unique lowercase letters, digits, and hyphens");
        names.add(name);
        return { ref: name, label: safeLinks(text(c, "label", w), w) };
      });
      if (choices.length < 2 || !names.has(text(a, "choice", w))) refuse(w, "answer must name one of at least two choices");
      answer = { choice: a.choice as string };
    } else {
      if (q.choices !== undefined) refuse(w, "choices require a choice answer");
      if (a.text !== undefined) {
        fields(a, w, ["text"], ["case_sensitive"]);
        if (a.case_sensitive !== undefined && typeof a.case_sensitive !== "boolean") refuse(w, "case_sensitive must be true or false");
        answer = { text: texts(a, "text", w), case_sensitive: a.case_sensitive === true };
      } else {
        fields(a, w, ["number"], ["tolerance"]);
        if (typeof a.number !== "number" || !Number.isFinite(a.number) || (a.tolerance !== undefined && (typeof a.tolerance !== "number" || !Number.isFinite(a.tolerance) || a.tolerance < 0))) refuse(w, "number must be finite and tolerance must be finite and nonnegative");
        answer = { number: a.number as number, tolerance: (a.tolerance as number | undefined) ?? 0 };
      }
    }
    return { ref: name, prompt: safeLinks(text(q, "prompt", w), w), explanation: safeLinks(text(q, "explanation", w), w), ...(choices ? { choices } : {}), answer };
  });
  return { questions };
}

function parseEntry(shape: Shape, columns: string[] | undefined, e: unknown, ew: string, id: string, changed: number, attachment: (v: unknown, where: string) => string): Entry {
  if (shape === "cards" || shape === "review") {
    const c = fields(e, ew, ["title", "label", "blocking", "impact", "action", "evidence", ...(shape === "review" ? ["axis", "location"] : [])], ["ref"]);
    if (typeof c.blocking !== "boolean") refuse(ew, "blocking must be true or false");
    if (shape === "review" && !REVIEW_AXES.includes(c.axis as never)) refuse(ew, `axis must be ${listed([...REVIEW_AXES])}`);
    return { id, ...(c.ref ? { ref: c.ref } : {}), title: text(c, "title", ew), label: text(c, "label", ew), blocking: c.blocking, impact: text(c, "impact", ew), action: text(c, "action", ew), evidence: text(c, "evidence", ew), ...(shape === "review" ? { axis: c.axis, location: text(c, "location", ew) } : {}), changed };
  }
  if (shape === "ledger") {
    const c = fields(e, ew, ["claim", "status", "evidence", "missing_proof", "consequence"], ["ref"]);
    if (!CLAIM_STATES.includes(c.status as ClaimState)) refuse(ew, `status must be ${listed(CLAIM_STATES)}`);
    return { id, ...(c.ref ? { ref: c.ref } : {}), claim: text(c, "claim", ew), status: c.status, evidence: text(c, "evidence", ew), missing_proof: text(c, "missing_proof", ew), consequence: text(c, "consequence", ew), changed };
  }
  if (shape === "code") {
    const c = fields(e, ew, ["file"], ["ref", "line", "revision", "language", "code", "diff", "note"]);
    const file = text(c, "file", ew);
    if (/[\r\n]/.test(file)) refuse(ew, "file must be one line, the path of the source file");
    if ((c.code === undefined) === (c.diff === undefined)) refuse(ew, "needs exactly one of code or diff");
    if (c.language !== undefined && (typeof c.language !== "string" || !LANGUAGE.test(c.language))) refuse(ew, "language must be a language name such as ts or python");
    const revision = optText(c, "revision", ew);
    if (revision !== undefined && /[\r\n]/.test(revision)) refuse(ew, "revision must be one line, such as a commit hash");
    const body: Record<string, unknown> = {};
    if (c.code !== undefined) {
      body.code = text(c, "code", ew);
      if (c.line !== undefined && (!Number.isInteger(c.line) || (c.line as number) < 1)) refuse(ew, "line must be a positive whole number, the source line of the first line of code");
      if (c.line !== undefined) body.line = c.line;
    } else {
      if (c.line !== undefined) refuse(ew, "line goes with code; a diff's hunk headers give its lines");
      const parsed = parseDiff(text(c, "diff", ew));
      if (typeof parsed === "string") refuse(ew, `diff: ${parsed}`);
      body.diff = c.diff;
    }
    return {
      id, ...(c.ref ? { ref: c.ref } : {}), file, ...(revision !== undefined ? { revision } : {}), ...(c.language !== undefined ? { language: c.language } : {}), ...body,
      ...(c.note !== undefined ? { note: safeLinks(text(c, "note", ew), ew) } : {}), changed,
    };
  }
  if (shape === "timeline") {
    const c = fields(e, ew, ["title", "outcome"], ["ref", "time", "detail", "evidence", "attachments"]);
    if (!OUTCOMES.includes(c.outcome as TimelineOutcome)) refuse(ew, `outcome must be ${listed(OUTCOMES)}, got ${JSON.stringify(c.outcome)}`);
    const time = optText(c, "time", ew);
    if (time !== undefined && !realTime(time)) refuse(ew, `time must be a real ISO 8601 date such as 2026-10-28, or a date-time with its offset such as 2026-10-28T10:05:00+07:00, got ${JSON.stringify(time)}; leave time out when it is not known`);
    const opt = (k: string) => (c[k] !== undefined ? { [k]: safeLinks(text(c, k, ew), ew) } : {});
    return {
      id, ...(c.ref ? { ref: c.ref } : {}), title: safeLinks(text(c, "title", ew), ew), outcome: c.outcome, ...(time !== undefined ? { time } : {}), ...opt("detail"), ...opt("evidence"),
      ...(c.attachments !== undefined ? { attachments: texts(c, "attachments", ew).map((a) => attachment(a, `${ew}: attachments`)) } : {}), changed,
    };
  }
  const c = fields(e, ew, ["cells"], ["ref"]);
  if (!Array.isArray(c.cells) || c.cells.length !== columns!.length || c.cells.some((x) => typeof x !== "string")) refuse(ew, `cells must list ${columns!.length} strings, one per column`);
  return { id, ...(c.ref ? { ref: c.ref } : {}), cells: c.cells as string[], changed };
}

function parseReviewAxes(raw: unknown, where: string): ReviewAxis[] {
  if (!Array.isArray(raw) || raw.length !== REVIEW_AXES.length) refuse(where, "must state Standards, Spec, and Blast radius exactly once");
  const axes = (raw as unknown[]).map((x, i): ReviewAxis => {
    const w = `${where}: axis ${i + 1}`;
    const a = fields(x, w, ["axis", "status"], ["reason"]);
    if (!REVIEW_AXES.includes(a.axis as never)) refuse(w, `axis must be ${listed([...REVIEW_AXES])}`);
    if (!REVIEW_STATES.includes(a.status as never)) refuse(w, `status must be ${listed([...REVIEW_STATES])}`);
    return { axis: a.axis as ReviewAxis["axis"], status: a.status as ReviewAxis["status"], ...(a.status !== "findings" ? { reason: text(a, "reason", w) } : a.reason !== undefined ? { reason: text(a, "reason", w) } : {}) };
  });
  if (new Set(axes.map((a) => a.axis)).size !== REVIEW_AXES.length) refuse(where, "must state each review axis exactly once");
  return REVIEW_AXES.map((axis) => axes.find((a) => a.axis === axis)!);
}

function checkReview(axes: ReviewAxis[], entries: Entry[], where: string): void {
  for (const a of axes) {
    const count = entries.filter((e) => e.axis === a.axis).length;
    if (a.status === "findings" && count === 0) refuse(where, `${a.axis} has findings status but no findings`);
    if (!["findings", "blocked"].includes(a.status) && count > 0) refuse(where, `${a.axis} is ${a.status}, so it cannot carry findings`);
  }
}

function revise(s: State, o: Obj, where: string, stage: string, entryIds: string[] | undefined, rev: number, time: string, resolve: (v: unknown, kind: string, where: string) => string): void {
  fields(o, where, ["kind", "result"], ["base", "set", "add"]);
  if (o.set === undefined && o.add === undefined) refuse(where, "needs set, add, or both");
  if (typeof o.result !== "string") refuse(where, "result must name a Result as <result ref or id>, or an entry as <result ref or id>/<entry ref or id>");
  const [rname, ename] = (o.result as string).split("/", 2);
  const rid = resolve(rname, "result", `${where}: result`);
  const r = s.results.find((x) => x.id === rid) ?? refuse(where, `Result ${rid} does not exist`);
  if (r.stage !== stage) refuse(where, `Result ${rid} belongs to Stage ${r.stage}, not the bound Stage ${stage}`);
  const entry = ename === undefined ? undefined : (r.entries.find((e) => e.id === ename || e.ref === ename) ?? refuse(where, `Result ${rid} has no entry ${ename}`));
  const previous = structuredClone(r);
  if (o.set !== undefined) {
    if (!Number.isInteger(o.base) || (o.base as number) < 1 || (o.base as number) > s.revision) refuse(where, `set needs base, the Flow revision you read ${o.result} at (1 to ${s.revision}); show prints it as changed`);
    const base = o.base as number;
    const changed = entry ? entry.changed : r.changed;
    if (changed > base) refuse(where, `conflict: ${o.result} changed in revision ${changed}, after your base ${base}; read it again with show and resubmit your edit`);
    if (!isObj(o.set)) refuse(`${where}: set`, "must be an object of the fields to replace");
    const set = o.set as Obj;
    if (entry) {
      if (set.ref !== undefined) refuse(`${where}: set`, "ref is not a field here; an entry keeps its ref");
      const { id, changed: _, figures, ...content } = entry;
      const at = r.entries.indexOf(entry);
      r.entries[at] = { ...parseEntry(r.shape, r.columns, { ...content, ...set }, `${where}: set`, id, rev, (v, w) => resolve(v, "attachment", w)), ...(figures ? { figures } : {}) };
    } else {
      fields(set, `${where}: set`, [], ["title", "summary", ...(r.shape === "review" ? ["axes"] : [])]);
      if (set.title !== undefined) r.title = text(set, "title", `${where}: set`);
      if (set.summary !== undefined) r.summary = text(set, "summary", `${where}: set`);
      if (set.axes !== undefined) r.axes = parseReviewAxes(set.axes, `${where}: set: axes`);
      r.changed = rev;
    }
  } else if (o.base !== undefined) refuse(where, "base goes with set; add appends entries without one");
  if (o.add !== undefined) {
    if (entry) refuse(where, "add appends entries to a Result; name the Result, not an entry");
    if (WHOLE[r.shape]) refuse(where, `${rid} is ${WHOLE[r.shape]}, which has no entries; publish its next revision with revises`);
    if (entryIds === undefined) refuse(where, `add appends to a Result from an earlier contribution; put new entries of ${o.result} in its result item`);
    const adds = list(o, "add", where);
    r.entries.push(...adds.map((e, j) => parseEntry(r.shape, r.columns, e, `${where}: add ${j + 1}`, entryIds![j].split("/")[1], rev, (v, w) => resolve(v, "attachment", w))));
  }
  if (r.shape === "review") checkReview(r.axes!, r.entries, where);
  s.history.push(previous);
  r.edit = rev;
  r.captured = time;
}

function optionLetter(q: Question, p: string, where: string): string {
  if (letterIndex(p) < 0 || letterIndex(p) >= q.options.length) refuse(where, `question ${q.id} has no option ${JSON.stringify(p)}; its options are ${listed(q.options.map((_, i) => letter(i)))}`);
  return p;
}

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
  if (a.legacy) return a.legacy.other !== undefined ? "written" : "unresolved";
  if (a.response?.status !== "answered") return "unresolved";
  if (a.response.picks) return "picked";
  return a.reading?.outcome === "resolved" ? "resolved" : "unresolved";
}
const settled = (state: AnswerState) => state === "picked" || state === "written" || state === "resolved";

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
          if (bo.language !== undefined && (typeof bo.language !== "string" || !LANGUAGE.test(bo.language))) refuse(bw, "language must be a language name such as ts or python");
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

const DEMO_LIMITS = { values: 16, states: 32, actions: 32, transitions: 16, depth: 4 };
const TYPE_WORD: Record<string, string> = { number: "a number", boolean: "true or false", string: "text" };

function parseDemo(raw: unknown, where: string): Demo {
  const o = fields(raw, where, ["states", "start", "actions"], ["values"]);
  const named = (k: string, what: string, max: number, required: string[], optional: string[] = []) => {
    const xs = list(o, k, where);
    if (xs.length > max) refuse(`${where}: ${k}`, `a demo has at most ${max} ${k}`);
    const seen = new Set<string>();
    return xs.map((x, j) => {
      const w = `${where}: ${what} ${j + 1}`;
      const xo = fields(x, w, ["name", ...required], optional);
      if (typeof xo.name !== "string" || !REF.test(xo.name)) refuse(w, "name must be lowercase letters, digits, and hyphens");
      const name = xo.name as string;
      if (seen.has(name)) refuse(w, `${what} ${name} is already a ${what} of this demo`);
      seen.add(name);
      return { xo, name, w: `${where}: ${what} ${name}` };
    });
  };

  const values = o.values === undefined ? [] : named("values", "value", DEMO_LIMITS.values, ["label", "initial"]).map(({ xo, name, w }) => {
    const initial = xo.initial;
    if (!(typeof initial === "boolean" || typeof initial === "string" || (typeof initial === "number" && Number.isFinite(initial)))) refuse(w, "initial must be a number, true or false, or a string");
    return { name, label: text(xo, "label", w), initial: initial as DemoLiteral };
  });
  const typeOfValue = new Map(values.map((v) => [v.name, typeof v.initial]));
  const valueType = (name: unknown, w: string): string => {
    if (typeof name !== "string" || !typeOfValue.has(name)) refuse(w, `${JSON.stringify(name)} names no value of this demo`);
    return typeOfValue.get(name as string)!;
  };
  const states = named("states", "state", DEMO_LIMITS.states, ["label"], ["description"]).map(({ xo, name, w }) => ({
    name, label: text(xo, "label", w), ...(xo.description !== undefined ? { description: safeLinks(text(xo, "description", w), w) } : {}),
  }));
  const stateNames = new Set(states.map((st) => st.name));
  const state = (v: unknown, w: string): string => {
    if (typeof v !== "string" || !stateNames.has(v)) refuse(w, `${JSON.stringify(v)} is not a state of this demo`);
    return v as string;
  };
  const start = state(o.start, `${where}: start`);

  const condition = (raw: unknown, w: string, depth: number): Condition => {
    if (depth > DEMO_LIMITS.depth) refuse(w, `conditions nest at most ${DEMO_LIMITS.depth} deep`);
    if (!isObj(raw)) refuse(w, `must be a condition: { "value": "<name>", <op>: <literal> }, { "all": [...] }, { "any": [...] }, or { "not": {...} }; a demo evaluates no source code`);
    const c = raw as Obj;
    for (const k of ["all", "any"] as const)
      if (c[k] !== undefined) {
        fields(c, w, [k]);
        return { [k]: list(c, k, w).map((x, j) => condition(x, `${w}: ${k} ${j + 1}`, depth + 1)) } as Condition;
      }
    if (c.not !== undefined) {
      fields(c, w, ["not"]);
      return { not: condition(c.not, `${w}: not`, depth + 1) };
    }
    const ops = Object.keys(c).filter((k) => k !== "value");
    if (c.value === undefined || ops.length !== 1 || !(DEMO_OPS as readonly string[]).includes(ops[0])) refuse(w, `a comparison is { "value": "<name>", <op>: <literal> } with one op of ${listed([...DEMO_OPS])}, got ${ops.length ? ops.join(", ") : "none"}`);
    const op = ops[0] as DemoOp;
    const type = valueType(c.value, w);
    const to = c[op];
    if (op !== "eq" && op !== "ne" && type !== "number") refuse(w, `${c.value} holds ${TYPE_WORD[type]}; ${op} compares numbers only`);
    if (typeof to !== type || (type === "number" && !Number.isFinite(to))) refuse(w, `${c.value} holds ${TYPE_WORD[type]}, so ${op} compares it with ${TYPE_WORD[type]}, got ${JSON.stringify(to)}`);
    return { value: c.value as string, op, to: to as DemoLiteral };
  };

  const effect = (e: unknown, name: string, w: string): Effect => {
    const type = valueType(name, w);
    if (isObj(e) && e.add !== undefined) {
      fields(e, w, ["add"]);
      if (type !== "number") refuse(w, `${name} holds ${TYPE_WORD[type]}, so add cannot change it`);
      if (typeof e.add !== "number" || !Number.isFinite(e.add)) refuse(w, "add must be a number");
      return { add: e.add as number };
    }
    if (isObj(e) && e.toggle !== undefined) {
      fields(e, w, ["toggle"]);
      if (type !== "boolean") refuse(w, `${name} holds ${TYPE_WORD[type]}, so toggle cannot change it`);
      if (e.toggle !== true) refuse(w, "toggle must be true");
      return { toggle: true };
    }
    if (isObj(e) || Array.isArray(e)) refuse(w, `an effect is a literal, { "add": <number> }, or { "toggle": true }`);
    if (typeof e !== type || (type === "number" && !Number.isFinite(e))) refuse(w, `${name} holds ${TYPE_WORD[type]}, got ${JSON.stringify(e)}; a demo evaluates no expressions`);
    return { set: e as DemoLiteral };
  };

  const actions = named("actions", "action", DEMO_LIMITS.actions, ["label", "transitions"]).map(({ xo, name, w }) => {
    const ts = list(xo, "transitions", w);
    if (ts.length > DEMO_LIMITS.transitions) refuse(w, `an action has at most ${DEMO_LIMITS.transitions} transitions`);
    const transitions = ts.map((t, j): Transition => {
      const tw = `${w}: transition ${j + 1}`;
      const to = fields(t, tw, [], ["from", "when", "to", "set"]);
      const out: Transition = {};
      if (to.from !== undefined) out.from = texts(to, "from", tw).map((x) => state(x, `${tw}: from`));
      if (to.when !== undefined) out.when = condition(to.when, `${tw}: when`, 1);
      if (to.to !== undefined) out.to = state(to.to, `${tw}: to`);
      if (to.set !== undefined) {
        if (!isObj(to.set) || Object.keys(to.set).length === 0) refuse(`${tw}: set`, "must be an object that names one or more values");
        out.set = Object.fromEntries(Object.entries(to.set as Obj).map(([k, e]) => [k, effect(e, k, `${tw}: set ${k}`)]));
      }
      return out;
    });
    return { name, label: text(xo, "label", w), transitions };
  });

  const reached = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const at = queue.shift()!;
    for (const a of actions)
      for (const t of a.transitions)
        if (!t.from || t.from.includes(at)) {
          const next = t.to ?? at;
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
  }
  const unreached = states.filter((st) => !reached.has(st.name)).map((st) => st.name);
  if (unreached.length) refuse(where, `no transition from ${start} reaches ${all(unreached)}; add a transition to ${unreached.length === 1 ? "it" : "them"} or remove ${unreached.length === 1 ? "it" : "them"}`);
  return { values, states, start, actions };
}

function localRefs<T extends { ref: string }>(xs: T[], where: string, what: string): T[] {
  const seen = new Set<string>();
  xs.forEach((x, j) => {
    if (seen.has(x.ref)) refuse(`${where}: ${what} ${j + 1}`, `ref ${x.ref} is already a ${what} of this Result`);
    seen.add(x.ref);
  });
  return xs;
}
function localRef(o: Obj, where: string): string {
  if (typeof o.ref !== "string" || !REF.test(o.ref)) refuse(where, "ref must be lowercase letters, digits, and hyphens");
  return o.ref as string;
}
function oneOf(v: unknown, refs: string[], where: string, what: string): string {
  if (typeof v !== "string" || !refs.includes(v)) refuse(where, `${JSON.stringify(v)} names no ${what} of this Result; the ${what}s are ${listed(refs)}`);
  return v as string;
}
const safeText = (o: Obj, k: string, where: string) => safeLinks(text(o, k, where), where);
const optSafeText = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : safeText(o, k, where));
function num(o: Obj, k: string, where: string): number {
  const v = o[k];
  if (typeof v !== "number" || !Number.isFinite(v)) refuse(where, `${k} must be a number, got ${JSON.stringify(v)}; give the unit in the measurement's unit`);
  return v as number;
}

function parseComparison(o: Obj, where: string, attachment: (v: unknown, where: string) => string): ComparisonBody {
  const alternatives = localRefs(list(o, "alternatives", where).map((a, j): Alternative => {
    const aw = `${where}: alternative ${j + 1}`;
    const ao = fields(a, aw, ["ref", "name"], ["summary", "attachments"]);
    const summary = optSafeText(ao, "summary", aw);
    return {
      ref: localRef(ao, aw), name: safeText(ao, "name", aw), ...(summary !== undefined ? { summary } : {}),
      ...(ao.attachments !== undefined ? { attachments: texts(ao, "attachments", aw).map((x) => attachment(x, `${aw}: attachments`)) } : {}),
    };
  }), where, "alternative");
  if (alternatives.length < 2) refuse(where, "alternatives must list two or more alternatives to compare");
  const criteria = localRefs(list(o, "criteria", where).map((c, j): Criterion => {
    const cw = `${where}: criterion ${j + 1}`;
    const co = fields(c, cw, ["ref", "name"], ["description"]);
    const description = optSafeText(co, "description", cw);
    return { ref: localRef(co, cw), name: safeText(co, "name", cw), ...(description !== undefined ? { description } : {}) };
  }), where, "criterion");
  const altRefs = alternatives.map((a) => a.ref);
  const critRefs = criteria.map((c) => c.ref);
  const pairs = new Set<string>();
  const assessments = list(o, "assessments", where).map((x, j): Assessment => {
    const xw = `${where}: assessment ${j + 1}`;
    const xo = fields(x, xw, ["alternative", "criterion", "finding"], ["evidence"]);
    const alternative = oneOf(xo.alternative, altRefs, `${xw}: alternative`, "alternative");
    const criterion = oneOf(xo.criterion, critRefs, `${xw}: criterion`, "criterion");
    if (pairs.has(`${alternative}/${criterion}`)) refuse(xw, `${alternative} is already assessed on ${criterion}; give each alternative one assessment per criterion`);
    pairs.add(`${alternative}/${criterion}`);
    const evidence = optSafeText(xo, "evidence", xw);
    return { alternative, criterion, finding: safeText(xo, "finding", xw), ...(evidence !== undefined ? { evidence } : {}) };
  });
  const vw = `${where}: verdict`;
  const vo = fields(o.verdict, vw, ["outcome", "reason"], ["alternative"]);
  if (!VERDICTS.includes(vo.outcome as never)) refuse(vw, `outcome must be ${listed([...VERDICTS])}, got ${JSON.stringify(vo.outcome)}`);
  const outcome = vo.outcome as ComparisonBody["verdict"]["outcome"];
  if (outcome === "chosen" && vo.alternative === undefined) refuse(vw, "a chosen verdict names the alternative it chose");
  if (outcome !== "chosen" && vo.alternative !== undefined) refuse(vw, `a ${outcome} verdict chooses no alternative; use outcome chosen to name one`);
  const chosen = vo.alternative === undefined ? undefined : oneOf(vo.alternative, altRefs, `${vw}: alternative`, "alternative");
  return { alternatives, criteria, assessments, verdict: { outcome, ...(chosen !== undefined ? { alternative: chosen } : {}), reason: safeText(vo, "reason", vw) } };
}

function parseMetrics(o: Obj, where: string): MetricsBody {
  const series = localRefs(list(o, "series", where).map((x, j) => {
    const sw = `${where}: series ${j + 1}`;
    const so = fields(x, sw, ["ref", "label"], ["baseline"]);
    if (so.baseline !== undefined && so.baseline !== true) refuse(sw, "baseline must be true, or left out");
    return { ref: localRef(so, sw), label: safeText(so, "label", sw), ...(so.baseline === true ? { baseline: true as const } : {}) };
  }), where, "series");
  if (series.filter((x) => x.baseline).length > 1) refuse(where, "at most one series is the baseline that deltas are measured from");
  const refs = series.map((x) => x.ref);
  const measurements = localRefs(list(o, "measurements", where).map((m, j): Measurement => {
    const mw = `${where}: measurement ${j + 1}`;
    const mo = fields(m, mw, ["ref", "name", "unit", "values"], ["better", "verdict"]);
    if (mo.better !== undefined && mo.better !== "lower" && mo.better !== "higher") refuse(mw, `better must be lower or higher, got ${JSON.stringify(mo.better)}`);
    if (mo.verdict !== undefined && !MEASURE_VERDICTS.includes(mo.verdict as never)) refuse(mw, `verdict must be ${listed([...MEASURE_VERDICTS])}, got ${JSON.stringify(mo.verdict)}`);
    const seen = new Set<string>();
    const values = list(mo, "values", mw).map((v, k): Measured => {
      const vw = `${mw}: value ${k + 1}`;
      const forms = isObj(v) ? ["value", "missing"].filter((x) => v[x] !== undefined) : [];
      if (forms.length !== 1) refuse(vw, "needs exactly one of value, the measured number, or missing, the reason there is none");
      const vo = v as Obj;
      const s = oneOf(vo.series, refs, `${vw}: series`, "series");
      if (seen.has(s)) refuse(vw, `series ${s} already has a value in this measurement`);
      seen.add(s);
      if (forms[0] === "missing") {
        fields(vo, vw, ["series", "missing"]);
        return { series: s, missing: safeText(vo, "missing", vw) };
      }
      fields(vo, vw, ["series", "value"], ["samples", "uncertainty"]);
      const value = num(vo, "value", vw);
      if (vo.samples !== undefined && (!Number.isInteger(vo.samples) || (vo.samples as number) < 1)) refuse(vw, `samples must be a whole number of 1 or more, got ${JSON.stringify(vo.samples)}`);
      let uncertainty: Uncertainty | undefined;
      if (vo.uncertainty !== undefined) {
        const uw = `${vw}: uncertainty`;
        const range = isObj(vo.uncertainty) && vo.uncertainty.plusminus === undefined;
        const uo = fields(vo.uncertainty, uw, range ? ["low", "high", "of"] : ["plusminus", "of"]);
        const of = safeText(uo, "of", uw);
        if (range) {
          const [low, high] = [num(uo, "low", uw), num(uo, "high", uw)];
          if (low > high) refuse(uw, `low ${low} is above high ${high}`);
          uncertainty = { low, high, of };
        } else {
          const plusminus = num(uo, "plusminus", uw);
          if (plusminus < 0) refuse(uw, "plusminus must be 0 or more");
          uncertainty = { plusminus, of };
        }
      }
      return { series: s, value, ...(vo.samples !== undefined ? { samples: vo.samples as number } : {}), ...(uncertainty ? { uncertainty } : {}) };
    });
    return {
      ref: localRef(mo, mw), name: safeText(mo, "name", mw), unit: safeText(mo, "unit", mw), values,
      ...(mo.better !== undefined ? { better: mo.better as "lower" | "higher" } : {}), ...(mo.verdict !== undefined ? { verdict: mo.verdict as Measurement["verdict"] } : {}),
    };
  }), where, "measurement");
  const environment = optSafeText(o, "environment", where);
  return { workload: safeText(o, "workload", where), ...(environment !== undefined ? { environment } : {}), outcome: safeText(o, "outcome", where), series, measurements };
}

function parseAttachment(o: Obj, where: string, stage: string, id: string, time: string, io: Io): Attachment {
  const type = o.type as AttachmentType;
  if (!ATTACHMENT_TYPES.includes(type)) refuse(where, `type must be ${listed([...ATTACHMENT_TYPES])}, got ${JSON.stringify(o.type)}`);
  const base = { id, stage, type, time };
  if (type === "artifact") {
    fields(o, where, ["kind", "type", "caption", "origin", "launch", "revision"], ["ref", "url", "runtime", "bundle", "unavailable"]);
    const revision = text(o, "revision", where);
    const runtime = o.runtime as Attachment["runtime"];
    if (runtime !== undefined && !["html", "local-app", "terminal"].includes(runtime)) refuse(where, "runtime must be html, local-app, or terminal");
    if (o.url !== undefined && (typeof o.url !== "string" || !/^https?:\/\/[^\s]+$/i.test(o.url))) refuse(where, "url must be an http:// or https:// URL");
    if (runtime === "local-app") {
      let url: URL;
      try { url = new URL(text(o, "url", where)); } catch { return refuse(where, "a local-app needs a loopback http URL"); }
      if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.username || url.password || !url.port) refuse(where, "a local-app URL must use http://127.0.0.1:<port> with no credentials");
    }
    let bundle: Attachment["bundle"];
    if (runtime === "html") {
      const b = fields(o.bundle, `${where}: bundle`, ["entry", "files"]);
      const path = (v: string) => {
        if (!/^[A-Za-z0-9_-][A-Za-z0-9._/-]*$/.test(v) || v.split("/").some((part) => !part || part === "." || part === "..")) refuse(where, "bundle paths must be relative paths with no traversal");
        return v;
      };
      const files = list(b, "files", where).map((raw, i) => {
        const w = `${where}: bundle file ${i + 1}`;
        const f = fields(raw, w, ["path", "source"]);
        const c = io.capture(text(f, "source", w), "artifact", w);
        return { path: path(text(f, "path", w)), file: c.file, size: c.size };
      });
      const entry = path(text(b, "entry", where));
      if (!/\.html?$/i.test(entry) || !files.some((f) => f.path === entry)) refuse(where, "bundle entry must name a registered HTML file");
      if (new Set(files.map((f) => f.path)).size !== files.length) refuse(where, "bundle file paths must be unique");
      bundle = { entry, files };
    } else if (o.bundle !== undefined) refuse(where, "bundle belongs only to runtime html");
    return {
      ...base, caption: safeLinks(text(o, "caption", where), where), origin: safeLinks(text(o, "origin", where), where),
      availability: o.unavailable !== undefined ? "unavailable" : bundle ? "captured" : "external",
      launch: safeLinks(text(o, "launch", where), where), revision: bundle ? createHash("sha256").update(stableJson(bundle)).digest("hex") : revision,
      ...(runtime ? { runtime } : {}), ...(bundle ? { bundle } : {}), ...(o.url !== undefined ? { url: o.url as string } : {}),
      ...(o.unavailable !== undefined ? { reason: text(o, "unavailable", where) } : {}),
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

export function visualKind(raw: unknown, where: string): Exclude<VisualKind, "prose"> {
  if (typeof raw !== "string" || raw === "prose" || !Object.hasOwn(VISUAL_KINDS, raw)) refuse(where, `kind must name a Visual kind other than prose: ${listed(Object.keys(VISUAL_KINDS).filter((k) => k !== "prose"))}`);
  return raw as Exclude<VisualKind, "prose">;
}

export function readerNeeds(raw: unknown, where: string): ReaderNeed[] {
  const o = { needs: raw };
  return list(o, "needs", where).map((raw, i) => {
    const w = `${where}: needs ${i + 1}`;
    const n = fields(raw, w, ["need", "kind"]);
    const kind = text(n, "kind", w);
    if (!Object.hasOwn(VISUAL_KINDS, kind)) refuse(w, `kind must be ${listed(Object.keys(VISUAL_KINDS))}`);
    return { need: text(n, "need", w), kind: kind as VisualKind };
  });
}

function parseQuestion(raw: unknown, where: string, id: string, stage: string, round: string, resolve: (v: unknown, kind: string, where: string) => string, figure: (raw: unknown, id: string, where: string) => Figure): Question {
  const o = fields(raw, where, ["title", "description", "options", "needs"], ["ref", "again", "reopens", "today", "terms", "topics", "results", "example", "figures"]);
  const options = list(o, "options", where).map((op, i) => {
    const ow = `${where}: option ${i + 1}`;
    const oo = fields(op, ow, ["label", "does", "gains", "costs"], ["recommended", "preview"]);
    const label = text(oo, "label", ow);
    if (/^[A-Z]\.\s/.test(label)) refuse(ow, `label starts with "${label.slice(0, 3)}"; give the label alone, the script adds the option letter`);
    return { label: `${letter(i)}. ${label}`, does: text(oo, "does", ow), gains: texts(oo, "gains", ow), costs: texts(oo, "costs", ow), ...(oo.recommended !== undefined ? { recommended: text(oo, "recommended", ow) } : {}), ...(oo.preview !== undefined ? { preview: figure(oo.preview, `${id}-option-${i + 1}-preview`, `${ow}: preview`) } : {}) };
  });
  if (options.length > 26) refuse(where, "options must be 26 or fewer");
  if (options.filter((op) => op.recommended !== undefined).length > 1) refuse(where, "at most one option can be recommended");
  const pairs = (k: string, a: string, b: string) =>
    o[k] === undefined ? undefined : list(o, k, where).map((x, j) => {
      const xw = `${where}: ${k} ${j + 1}`;
      const xo = fields(x, xw, [a, b]);
      return { [a]: text(xo, a, xw), [b]: text(xo, b, xw) };
    });
  const q: Question = { id, stage, round, q: 0, title: text(o, "title", where), description: text(o, "description", where), options, needs: readerNeeds(o.needs, where) };
  if (o.figures !== undefined) q.figures = list(o, "figures", where).map((f, j) => figure(f, `${id}-figure-${j + 1}`, `${where}: figure ${j + 1}`));
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
  const shown = [
    ...(q.figures ?? []).map((f) => ({ f, preview: false })),
    ...q.options.flatMap((o) => o.preview ? [{ f: o.preview, preview: true }] : []),
  ];
  for (const { f, preview } of shown) {
    if (f.kind === undefined) refuse(where, `figure ${f.id} must declare its Visual kind`);
    if (f.kind === "option-preview" && !preview) refuse(where, "kind option-preview goes only on an option preview");
    if (!q.needs!.some((n) => n.kind === f.kind)) refuse(where, `no need names kind ${f.kind}`);
  }
  for (const n of q.needs!) if (n.kind !== "prose" && !shown.some(({ f }) => f.kind === n.kind)) refuse(where, `no visual or option preview on this question is a ${n.kind}`);
  return q;
}

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
  for (const [id, figures] of figureOwners(s)) for (const f of figures) if ("attachment" in f) {
    if (!attachments.has(f.attachment)) refuse(id, `attachment ${f.attachment} does not exist`);
    used.add(f.attachment);
  }
  for (const r of [...s.results, ...s.history]) if (r.artifact && s.attachments.find((a) => a.id === r.artifact)?.type !== "artifact") refuse(`result ${r.id}`, "artifact must name a runnable artifact attachment");
  for (const r of [...s.results, ...s.history])
    for (const a of attachmentsOf(r)) {
      if (!attachments.has(a)) refuse(`result ${r.id}`, `attachment ${a} does not exist`);
      used.add(a);
    }
  for (const a of s.attachments) if (!used.has(a.id)) refuse(`attachment ${a.id}`, "is attached to no Result; name it in a Result's or Timeline event's attachments or a Document figure");
}

/** Every attachment a Result shows, including figures, alternatives' evidence, and event evidence. */
export function attachmentsOf(r: Result): string[] {
  const figures = (r.document?.sections ?? []).flatMap((sec) => sec.blocks.flatMap((b) => ("figure" in b ? [b.figure] : [])));
  const sides = (r.comparison?.alternatives ?? []).flatMap((a) => a.attachments ?? []);
  return [...new Set([...figures, ...sides, ...(r.artifact ? [r.artifact] : []), ...(r.attachments ?? []), ...r.entries.flatMap((e) => (e.attachments as string[] | undefined) ?? [])])];
}
/** Figure owners also count as attachment uses, so migrated evidence is not lost on the next contribution. */
export function figureOwners(s: Pick<State, "questions" | "backgrounds" | "results" | "history">): [string, Figure[]][] {
  return [
    ...s.questions.map((q): [string, Figure[]] => [q.id, [...(q.figures ?? []), ...q.options.flatMap((o) => o.preview ? [o.preview] : [])]]),
    ...s.backgrounds.map((b): [string, Figure[]] => [b.id, b.figures ?? []]),
    ...[...s.results, ...s.history].flatMap((r) => r.entries.map((e): [string, Figure[]] => [`${r.id}/${e.id}`, (e.figures as Figure[] | undefined) ?? []])),
  ];
}

/** The source file, revision, and known lines of one Code/diff entry. */
export type CodeLocation = { file: string; revision?: string; lines?: { first: number; last: number }; hunks?: (Hunk & { anchor: string })[] };
function codeLocation(e: Entry, anchor: string): CodeLocation {
  const loc: CodeLocation = { file: e.file as string, ...(e.revision !== undefined ? { revision: e.revision as string } : {}) };
  if (typeof e.line === "number") loc.lines = { first: e.line, last: e.line + linesOf(e.code as string).length - 1 };
  if (typeof e.diff === "string") loc.hunks = (parseDiff(e.diff) as { hunks: Hunk[] }).hunks.map((h, i) => ({ anchor: `${anchor}-h${i + 1}`, ...h }));
  return loc;
}

/** `picks` holds option labels only for an explicit pick; `why` says why an unresolved answer is not consent. */
export type AnswerView = { state: AnswerState; why?: ResponseStatus | NonConsent; id?: string; time?: string; response?: AskResponse; reading?: Reading; picks?: string[]; legacy?: Answer["legacy"] };
export type QuestionView = Question & { answer: AnswerView; open: boolean; latest: boolean; retired?: { reason: string; time?: string }; decided_in?: string; asked_again_by: string[] };
export type DocView = {
  sections: { anchor: string; heading: string; blocks: Block[] }[];
  citations: { anchor: string; n: number; ref: string; source: string; text: string; cited_in: string[] }[]; citationsAnchor: string;
  limitations: string[]; limitationsAnchor: string;
  sources: string[]; sourceTexts: string[]; sourcesAnchor: string;
  figures: string[];
};
export type ComparisonView = {
  alternatives: (Alternative & { anchor: string })[];
  criteria: (Criterion & { anchor: string })[];
  /** One cell per alternative and criterion, in criteria order; a cell with no assessment is a gap. */
  cells: { alternative: string; criterion: string; anchor: string; assessment?: Assessment }[];
  verdict: ComparisonBody["verdict"] & { anchor: string };
};
/** One series' value of one measurement. `missing` holds the producer's reason, or no reason when it gave no value. */
export type ValueView = {
  series: string; label: string; baseline: boolean; anchor: string;
  value?: number; samples?: number; uncertainty?: Uncertainty; missing?: { reason?: string };
  /** Difference from the baseline series' value, and that difference as a percentage of it, when both were measured. */
  delta?: number; relative?: number; delta_unavailable?: true;
};
export type MetricsView = Omit<MetricsBody, "measurements"> & {
  baseline?: string;
  /** `chart` holds the shared scale of the bars, absent when the values cannot be drawn as bars from zero. */
  measurements: (Omit<Measurement, "values"> & { anchor: string; chart?: { max: number }; values: ValueView[] })[];
};
export type ResultView = Omit<Result, "entries" | "document" | "comparison" | "metrics"> & {
  /** The id this rendering of the Result anchors at: the Result id, or `<id>-r<n>` for an earlier revision. */
  anchor: string;
  revision: number;
  entries: (Entry & { anchor: string; questions: string[]; location?: CodeLocation })[];
  doc?: DocView;
  comparison?: ComparisonView;
  metrics?: MetricsView;
  review?: ReviewRow[];
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
  open_questions: number;
};
export type View = {
  flow: State["flow"]; revision: number; stages: StageView[]; lifecycle: Lifecycle[];
  reading: ReadingOrder;
  next: string[];
  topics: (Topic & { sourceTexts: string[]; questions: string[] })[];
  sources: (Source & { cited_by: string[] })[];
  questions: Map<string, QuestionView>;
  attachments: (Attachment & { used_by: string[] })[];
  progress: ProgressView;
  migrated?: State["migrated"];
};

const words = (skill: string) => skill.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());

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
  const recorded = { ...(a.id ? { id: a.id } : {}), ...(a.time ? { time: a.time } : {}), ...(a.response ? { response: a.response } : {}), ...(a.reading ? { reading: a.reading } : {}), ...(a.legacy ? { legacy: a.legacy } : {}) };
  if (state === "picked") return { state, ...recorded, picks: a.response!.picks!.map((p) => optionLabel(q, p)) };
  if (state === "resolved" || state === "written" || a.legacy) return { state, ...recorded };
  return { state, why: a.reading && a.reading.outcome !== "resolved" ? a.reading.outcome : a.response!.status, ...recorded };
}

function comparisonView(c: ComparisonBody, anchor: string): ComparisonView {
  const alternatives = c.alternatives.map((a, j) => ({ ...a, anchor: `${anchor}-a${j + 1}` }));
  const criteria = c.criteria.map((k, i) => ({ ...k, anchor: `${anchor}-k${i + 1}` }));
  const cells = criteria.flatMap((k, i) => alternatives.map((a, j) => {
    const assessment = c.assessments.find((x) => x.alternative === a.ref && x.criterion === k.ref);
    return { alternative: a.ref, criterion: k.ref, anchor: `${anchor}-k${i + 1}-a${j + 1}`, ...(assessment ? { assessment } : {}) };
  }));
  return { alternatives, criteria, cells, verdict: { ...c.verdict, anchor: `${anchor}-verdict` } };
}

function decimalPlaces(n: number): number {
  const [mantissa, exponent = "0"] = String(n).split(/e/i);
  return Math.max(0, (mantissa.split(".")[1]?.length ?? 0) - Number(exponent));
}

function metricsView(m: MetricsBody, anchor: string): MetricsView {
  const baseline = m.series.find((x) => x.baseline)?.ref;
  const measurements = m.measurements.map((me, i) => {
    const at = `${anchor}-m${i + 1}`;
    const of = (series: string) => me.values.find((v) => v.series === series);
    const base = baseline === undefined ? undefined : of(baseline);
    const b = base && "value" in base ? base.value : undefined;
    const values = m.series.map((sr, j): ValueView => {
      const row = { series: sr.ref, label: sr.label, baseline: sr.baseline === true, anchor: `${at}-s${j + 1}` };
      const v = of(sr.ref);
      if (!v || "missing" in v) return { ...row, missing: v ? { reason: v.missing } : {} };
      const out: ValueView = { ...row, value: v.value, ...(v.samples !== undefined ? { samples: v.samples } : {}), ...(v.uncertainty ? { uncertainty: v.uncertainty } : {}) };
      if (b !== undefined && !row.baseline) {
        const difference = v.value - b;
        const precision = Math.max(decimalPlaces(v.value), decimalPlaces(b));
        const delta = Number(precision <= 100 ? difference.toFixed(precision) : difference.toPrecision(14));
        if (Number.isFinite(delta)) {
          out.delta = delta;
          const relative = (delta / Math.abs(b)) * 100;
          if (b !== 0 && Number.isFinite(relative)) out.relative = relative;
        } else out.delta_unavailable = true;
      }
      return out;
    });
    const measured = values.flatMap((v) => (v.value === undefined ? [] : [v.value]));
    const drawable = measured.length > 0 && measured.every((x) => x >= 0);
    const { values: _, ...rest } = me;
    return { ...rest, anchor: at, values, ...(drawable ? { chart: { max: Math.max(...measured) || 1 } } : {}) };
  });
  return { ...m, ...(baseline ? { baseline } : {}), measurements };
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
    const { document: d, comparison: c, metrics: m, ...rest } = r;
    const rv: ResultView = {
      ...rest, anchor, revision: r.revision ?? 1, shown: attachmentsOf(r).map((a) => attachment.get(a)!), history: [],
      entries: r.entries.map((e) => {
        const ea = `${anchor}-${e.id}`;
        return { ...e, anchor: ea, questions: current ? linking(`${r.id}/${e.id}`) : [], ...(r.shape === "code" ? { location: codeLocation(e, ea) } : {}) };
      }),
    };
    if (r.axes) rv.review = r.axes.flatMap((axis): ReviewRow[] => {
      const findings = rv.entries.filter((e) => e.axis === axis.axis);
      return findings.length ? findings.map((e) => ({
        ...axis, finding: e.title as string, impact: e.impact as string, location: e.location as string, blocking: e.blocking as boolean, target: e.anchor,
      })) : [{ ...axis }];
    });
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
    if (c) rv.comparison = comparisonView(c, anchor);
    if (m) rv.metrics = metricsView(m, anchor);
    if (current) rv.history = s.history.filter((h) => h.id === r.id).map((h) => resultView(h, `${r.id}-r${h.revision ?? 1}${h.edit === undefined ? "" : `-edit${h.edit}`}`, false));
    return rv;
  };
  const stages = [...s.stages].sort((a, b) => a.order - b.order).map((st): StageView => {
    const bg = s.backgrounds.find((b) => b.stage === st.id);
    const results = s.results.filter((r) => r.stage === st.id).map((r) => resultView(r, r.id, true));
    const closes = s.closes.filter((c) => c.stage === st.id);
    const lastClose = closes.at(-1)?.id;
    const seqOfRound = (r: Round) => r.seq;
    const items = [
      ...s.rounds.filter((r) => r.stage === st.id).map((round) => ({ type: "round" as const, seq: seqOfRound(round), round, questions: s.questions.filter((q) => q.round === round.id).map((q) => questions.get(q.id)!) })),
      ...closes.map((close) => ({ type: "close" as const, seq: close.seq, close, latest: close.id === lastClose })),
    ].sort((a, b) => a.seq - b.seq).map(({ seq: _, ...item }) => item);
    const asked = [...latestAsks(s, st.id).values()].map((q) => questions.get(q.id)!);
    return {
      ...st, label: labels.get(st.id)!, children: s.stages.filter((x) => x.parent === st.id).map((x) => x.id), results, items,
      assumed: s.assumed.filter((a) => a.stage === st.id).map((a) => {
        const by = s.questions.find((q) => q.reopens === a.id)?.id;
        return by ? { ...a, reopened_by: by } : a;
      }),
      asked,
      open_questions: st.state === "in-progress" ? asked.filter((q) => q.open).length : 0,
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
    flow: s.flow, revision: s.revision, stages, questions, progress: progressView(s), lifecycle: s.lifecycle, ...(s.migrated ? { migrated: s.migrated } : {}),
    reading: s.reading,
    next: stages.filter((st) => st.state === "in-progress").reverse().flatMap((st) => st.asked.filter((q) => q.open).map((q) => q.id)),
    topics: s.topics.map((t) => ({ ...t, sourceTexts: t.sources.map((x) => sourceText.get(x)!), questions: s.questions.filter((q) => q.topics?.includes(t.id)).map((q) => q.id) })),
    sources: s.sources.map((x) => ({ ...x, cited_by: citers(x.id) })),
    attachments: s.attachments.map((a) => ({
      ...a,
      used_by: [...new Set([
        ...[...s.results, ...s.history].filter((r) => attachmentsOf(r).includes(a.id)).map((r) => r.id),
        ...figureOwners(s).filter(([, fs]) => fs.some((f) => "attachment" in f && f.attachment === a.id)).map(([id]) => id),
      ])],
    })),
  };
}

/** The `show` snapshot: ids, numbers, states, labels, and links, with no presentation markup. */
export function snapshot(v: View) {
  return {
    flow: v.flow, revision: v.revision, open: v.lifecycle.at(-1)?.event !== "closed", lifecycle: v.lifecycle, ...(v.migrated ? { migrated: { from: v.migrated.from, sha256: v.migrated.sha256, time: v.migrated.time, anchors: v.migrated.anchors } } : {}),
    next: v.next,
    reading: v.reading,
    stages: v.stages.map((st) => ({
      id: st.id, label: st.label, skill: st.skill, ...(st.ticket ? { ticket: st.ticket } : {}), ...(st.parent ? { parent: st.parent } : {}), children: st.children,
      state: st.state, order: st.order, opened: st.opened, ...(st.finished ? { finished: st.finished } : {}),
      open_questions: st.open_questions,
      background: st.background?.id,
      ...(st.background?.figures ? { background_figures: st.background.figures } : {}),
      results: st.results.map((r) => ({
        id: r.id, shape: r.shape, revision: r.revision, ...(r.captured ? { captured: r.captured } : {}), ...(r.canonical ? { canonical: r.canonical } : {}), changed: r.changed,
        ...(r.demo ? { demo: { start: r.demo.start, states: r.demo.states.map((x) => x.name), actions: r.demo.actions.map((x) => x.name), values: r.demo.values.map((x) => x.name) } } : {}),
        ...(r.artifact ? { artifact: r.artifact } : {}),
        ...(r.review ? { review: r.review } : {}),
        revisions: [...r.history, r].filter((x, i, all) => !all.slice(i + 1).some((later) => later.revision === x.revision)).map((x) => ({ revision: x.revision, ...(x.captured ? { captured: x.captured } : {}), ...(x.canonical ? { canonical: x.canonical } : {}), attachments: x.shown.map((a) => a.id) })),
        history: r.history.map((x) => ({ anchor: x.anchor, revision: x.revision, ...(x.edit === undefined ? {} : { edit: x.edit }), ...(x.canonical ? { canonical: x.canonical } : {}), attachments: x.shown.map((a) => a.id) })),
        attachments: r.shown.map((a) => a.id),
        entries: r.entries.map(({ anchor: _, ...e }) => ({ ...e, id: `${r.id}/${e.id}`, questions: e.questions })),
        ...(r.doc ? {
          document: {
            sections: r.doc.sections.map((sec) => sec.anchor),
            citations: r.doc.citations.map((c) => ({ anchor: c.anchor, n: c.n, source: c.source, cited_in: c.cited_in })),
            figures: r.doc.figures, limitations: r.doc.limitations.length, limitations_anchor: r.doc.limitationsAnchor, sources: r.doc.sources,
          },
        } : {}),
        ...(r.comparison ? {
          comparison: {
            alternatives: r.comparison.alternatives.map((a) => ({ ref: a.ref, anchor: a.anchor, attachments: a.attachments ?? [] })),
            criteria: r.comparison.criteria.map((k) => ({ ref: k.ref, anchor: k.anchor })),
            cells: r.comparison.cells.map((x) => ({ alternative: x.alternative, criterion: x.criterion, anchor: x.anchor, assessed: x.assessment !== undefined })),
            verdict: { outcome: r.comparison.verdict.outcome, ...(r.comparison.verdict.alternative ? { alternative: r.comparison.verdict.alternative } : {}), anchor: r.comparison.verdict.anchor },
          },
        } : {}),
        ...(r.metrics ? {
          metrics: {
            ...(r.metrics.baseline ? { baseline: r.metrics.baseline } : {}),
            measurements: r.metrics.measurements.map((me) => ({
              ref: me.ref, anchor: me.anchor, unit: me.unit, ...(me.better ? { better: me.better } : {}), ...(me.verdict ? { verdict: me.verdict } : {}), chart: me.chart !== undefined,
              values: me.values.map(({ label: _, missing, ...x }) => ({ ...x, ...(missing ? { missing: true } : {}) })),
            })),
          },
        } : {}),
      })),
      assumed: st.assumed.map((a) => ({ id: a.id, ...(a.reopened_by ? { reopened_by: a.reopened_by } : {}) })),
      rounds: st.items.filter((i) => i.type === "round").map((i) => ({ id: i.round.id, n: i.round.n, time: i.round.time, questions: i.questions.map((q) => q.id) })),
      questions: st.items.flatMap((i) => (i.type === "round" ? i.questions : [])).map((q) => ({
        id: q.id, q: q.q, latest: q.latest, open: q.open, answer: q.answer, ...(q.retired ? { retired: q.retired } : {}),
        ...(q.again ? { again: q.again } : {}), asked_again_by: q.asked_again_by, ...(q.reopens ? { reopens: q.reopens } : {}),
        results: q.entries ?? [], topics: q.topics ?? [], ...(q.decided_in ? { decided_in: q.decided_in } : {}),
        ...(q.figures ? { figures: q.figures } : {}),
        ...(q.needs ? { needs: q.needs } : {}),
        ...(q.options.some((o) => o.preview) ? { options: q.options.map((o) => ({ label: o.label, ...(o.preview ? { preview: o.preview } : {}) })) } : {}),
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
      ...(a.type === "artifact" ? { launch: a.launch, ...(a.runtime ? { runtime: a.runtime } : {}), ...(a.url ? { url: a.url } : {}), ...(a.reason ? { reason: a.reason } : {}), ...(a.bundle ? { bundle: a.bundle } : {}) } : {}),
    })),
    progress: progressSnapshot(v.progress),
  };
}
