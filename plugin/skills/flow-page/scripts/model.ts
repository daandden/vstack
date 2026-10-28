// The Flow page domain: a Flow's stored state, the typed contributions that change it, and the derived view that
// both `show` and the renderer read. Everything here is pure; flow-page.ts does the reading, locking, and writing.

export const SCHEMA = 1;
export const CONTRIBUTION_VERSION = 1;

export type StageState = "in-progress" | "finished";
export type Stage = { id: string; skill: string; ticket?: string; state: StageState; order: number; opened: string; finished?: string };
export type Round = { id: string; stage: string; n: number; seq: number; time: string };
export type Option = { label: string; does: string; gains: string[]; costs: string[]; recommended?: string };
export type Fact = { text: string; source: string };
export type Term = { term: string; text: string };
export type Question = {
  id: string; stage: string; round: string; q: number; title: string; description: string; options: Option[];
  again?: string; today?: Fact[]; terms?: Term[]; topics?: string[]; entries?: string[]; example?: string;
};
export type Answer = { question: string; time: string } & ({ picks: string[]; note?: string } | { other: string } | { unanswered: string });
export type Decision = { question: string; text: string };
export type Close = { id: string; stage: string; seq: number; time: string; decisions: Decision[]; extra?: string[] };
export type Section = { heading: string; body: string };
export type Background = { id: string; stage: string; title: string; summary: string; sections: Section[]; sources: string[] };
export type Topic = { id: string; title: string; summary: string; body: string; sources: string[] };
export type Shape = "cards" | "ledger" | "table";
export type Entry = Record<string, unknown> & { id: string };
export type Result = { id: string; stage: string; shape: Shape; title: string; summary?: string; columns?: string[]; entries: Entry[] };
export type Source = { id: string; text: string };

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
  sources: Source[];
};

export class Refusal extends Error {}
const refuse = (where: string, message: string): never => {
  throw new Refusal(where ? `${where}: ${message}` : message);
};

export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REF = /^[a-z0-9][a-z0-9-]*$/;
const CODE_ID = /^(stage|round|question|close|background|topic|result|source)-\d+$/;
const TICKET = /^#?[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const SHAPES: Shape[] = ["cards", "ledger", "table"];
const CLAIM_STATES = ["confirmed", "cleared", "unproven"];
const listed = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")}, or ${xs.at(-1)}`);
export const letter = (i: number) => String.fromCharCode(65 + i);
const letterIndex = (s: string) => (/^[A-Z]$/.test(s) ? s.charCodeAt(0) - 65 : -1);

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
    stages: [], rounds: [], questions: [], answers: [], closes: [], backgrounds: [], topics: [], results: [], sources: [],
  };
}

export function openStage(s: State, skill: string, ticket: string | undefined, time: string): Stage {
  if (!SLUG.test(skill)) refuse("open", `--skill must be a skill name of lowercase letters, digits, and hyphens, got ${JSON.stringify(skill)}`);
  if (ticket !== undefined && !TICKET.test(ticket)) refuse("open", `--ticket must be a ticket id such as 269 or #269, got ${JSON.stringify(ticket)}`);
  const stage: Stage = { id: newId(s, "stage"), skill, ticket, state: "in-progress", order: s.stages.length + 1, opened: time };
  if (ticket === undefined) delete stage.ticket;
  s.stages.push(stage);
  s.revision++;
  return stage;
}

export function stageOf(s: State, id: string, where: string): Stage {
  return s.stages.find((st) => st.id === id) ?? refuse(where, `Flow ${s.flow.id} has no Stage ${id}`);
}

// ---------------------------------------------------------------------------------------------------------------
// Parsing external input. Every object is checked against its exact field list, so HTML, CSS, scripts, ids, numbers,
// and other code-owned fields are refused rather than dropped.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function fields(v: unknown, where: string, required: string[], optional: string[] = []): Obj {
  if (!isObj(v)) refuse(where, `must be an object with ${listed(required)}`);
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) refuse(where, `${k} is not a field here; the fields are ${listed([...required, ...optional])}`);
  for (const k of required) if (o[k] === undefined) refuse(where, `needs ${k}`);
  return o;
}
function text(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") refuse(where, `${k} must be a non-empty string`);
  return v as string;
}
const optText = (o: Obj, k: string, where: string) => (o[k] === undefined ? undefined : text(o, k, where));
function texts(o: Obj, k: string, where: string): string[] {
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

const KINDS = ["background", "topic", "result", "round", "answer", "close", "stage"];

/** Applies `input` to Stage `stageId` of `s` in place, or throws a Refusal and leaves the caller to discard `s`. */
export function contribute(s: State, stageId: string, input: unknown, time: string): Receipt {
  const env = fields(input, "contribution", ["version", "items"]);
  if (env.version !== CONTRIBUTION_VERSION) refuse("contribution", `version ${JSON.stringify(env.version)} is not supported; flow-page reads contribution version ${CONTRIBUTION_VERSION}`);
  const items = list(env, "items", "contribution");
  const stage = stageOf(s, stageId, "contribution");
  if (stage.state === "finished") refuse("contribution", `Stage ${stage.id} is finished, so it takes no more content; open a new Stage to continue the Flow`);

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

  // Pass 1: give every new referable thing its id, so later items and forward references can name it.
  const planned = items.map((raw, i) => {
    const kind = isObj(raw) ? raw.kind : undefined;
    const where = `item ${i + 1}${typeof kind === "string" ? ` (${kind})` : ""}`;
    if (typeof kind !== "string" || !KINDS.includes(kind)) refuse(where, `kind must be ${listed(KINDS)}, got ${JSON.stringify(kind)}`);
    const o = raw as Obj;
    const ids: { id?: string; entries?: string[]; questions?: string[] } = {};
    if (kind === "topic") claim(ref(o, where), (ids.id = newId(s, "topic")), "topic", where);
    if (kind === "result") {
      claim(ref(o, where), (ids.id = newId(s, "result")), "result", where);
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
      case "result":
        s.results.push(parseResult(o, where, stage.id, ids.id!, ids.entries!));
        break;
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
        const forms = ["picks", "other", "unanswered"].filter((k) => o[k] !== undefined);
        fields(o, where, ["kind", "question"], ["picks", "note", "other", "unanswered"]);
        if (forms.length !== 1) refuse(where, "needs exactly one of picks, other, or unanswered");
        const qid = resolve(o.question, "question", `${where}: question`);
        const q = s.questions.find((x) => x.id === qid) ?? refuse(where, `question ${qid} does not exist`);
        if (q.stage !== stage.id) refuse(where, `question ${qid} belongs to Stage ${q.stage}, not the bound Stage ${stage.id}`);
        let answer: Answer;
        if (o.picks !== undefined) {
          const picks = texts(o, "picks", where);
          for (const p of picks) if (letterIndex(p) < 0 || letterIndex(p) >= q.options.length) refuse(where, `question ${qid} has no option ${p}; its options are ${listed(q.options.map((_, i) => letter(i)))}`);
          answer = { question: qid, time, picks, ...(o.note !== undefined ? { note: text(o, "note", where) } : {}) };
        } else {
          if (o.note !== undefined) refuse(where, "note goes with picks; put the text of an Other answer in other");
          if (o.other !== undefined) answer = { question: qid, time, other: text(o, "other", where) };
          else {
            if (typeof o.unanswered !== "string") refuse(where, "unanswered must be a string, empty when there is no reason");
            answer = { question: qid, time, unanswered: o.unanswered as string };
          }
        }
        s.answers = s.answers.filter((a) => a.question !== qid);
        s.answers.push(answer);
        break;
      }
      case "close": {
        fields(o, where, ["kind", "decisions"], ["extra"]);
        if (!Array.isArray(o.decisions)) refuse(where, "decisions must be a list of { question, text }, empty when the Stage asked nothing");
        const extra = optTexts(o, "extra", where);
        const latest = latestAsks(s, stage.id);
        const named = new Map<number, string>();
        const decisions = (o.decisions as unknown[]).map((d, j) => {
          const dw = `${where}: decision ${j + 1}`;
          const dobj = fields(d, dw, ["question", "text"]);
          const qid = resolve(dobj.question, "question", dw);
          const q = s.questions.find((x) => x.id === qid) ?? refuse(dw, `question ${qid} does not exist`);
          if (q.stage !== stage.id) refuse(dw, `question ${qid} belongs to Stage ${q.stage}, not Stage ${stage.id}`);
          if (latest.get(q.q)?.id !== q.id) refuse(dw, `${qid} is not the latest ask of Q${q.q}; decide ${latest.get(q.q)!.id}`);
          if (named.has(q.q)) refuse(dw, `Q${q.q} already has a decision`);
          named.set(q.q, qid);
          return { question: qid, text: text(dobj, "text", dw) };
        });
        for (const [n, q] of latest) if (!named.has(n)) refuse(where, `Q${n} (${q.id}) has no decision`);
        if (decisions.length === 0 && extra === undefined) refuse(where, "a close with no decisions needs extra bullets, such as its Assumed picks");
        s.closes.push({ id: newId(s, "close"), stage: stage.id, seq: ++s.seq, time, decisions, ...(extra ? { extra } : {}) });
        break;
      }
      case "stage": {
        fields(o, where, ["kind", "state"]);
        if (o.state !== "finished") refuse(where, `a Stage moves only from in-progress to finished; ${JSON.stringify(o.state)} is not a transition from in-progress`);
        stage.state = "finished";
        stage.finished = time;
        break;
      }
    }
  }
  checkLinks(s);
  s.revision++;
  return receipt;
}

function sourceId(s: State, t: string): string {
  const found = s.sources.find((x) => x.text === t);
  if (found) return found.id;
  const src = { id: newId(s, "source"), text: t };
  s.sources.push(src);
  return src.id;
}

function parseResult(o: Obj, where: string, stage: string, id: string, entryIds: string[]): Result {
  if (!SHAPES.includes(o.shape as Shape)) refuse(where, `shape must be ${listed(SHAPES)}, got ${JSON.stringify(o.shape)}`);
  const shape = o.shape as Shape;
  const table = shape === "table";
  fields(o, where, ["kind", "shape", "title", table ? "columns" : "entries", ...(table ? ["rows"] : [])], ["ref", "summary"]);
  const columns = table ? texts(o, "columns", where) : undefined;
  const entries = list(o, table ? "rows" : "entries", where).map((e, j) => {
    const ew = `${where}: ${table ? "row" : "entry"} ${j + 1}`;
    const eid = entryIds[j].split("/")[1];
    if (shape === "cards") {
      const c = fields(e, ew, ["title", "label", "blocking", "impact", "action", "evidence"], ["ref"]);
      if (typeof c.blocking !== "boolean") refuse(ew, "blocking must be true or false");
      return { id: eid, ...(c.ref ? { ref: c.ref } : {}), title: text(c, "title", ew), label: text(c, "label", ew), blocking: c.blocking, impact: text(c, "impact", ew), action: text(c, "action", ew), evidence: text(c, "evidence", ew) };
    }
    if (shape === "ledger") {
      const c = fields(e, ew, ["claim", "status", "evidence", "missing_proof", "consequence"], ["ref"]);
      if (!CLAIM_STATES.includes(c.status as string)) refuse(ew, `status must be ${listed(CLAIM_STATES)}`);
      return { id: eid, ...(c.ref ? { ref: c.ref } : {}), claim: text(c, "claim", ew), status: c.status, evidence: text(c, "evidence", ew), missing_proof: text(c, "missing_proof", ew), consequence: text(c, "consequence", ew) };
    }
    const c = fields(e, ew, ["cells"], ["ref"]);
    if (!Array.isArray(c.cells) || c.cells.length !== columns!.length || c.cells.some((x) => typeof x !== "string")) refuse(ew, `cells must list ${columns!.length} strings, one per column`);
    return { id: eid, ...(c.ref ? { ref: c.ref } : {}), cells: c.cells as string[] };
  });
  return { id, stage, shape, title: text(o, "title", where), ...(o.summary !== undefined ? { summary: text(o, "summary", where) } : {}), ...(columns ? { columns } : {}), entries };
}

function parseQuestion(raw: unknown, where: string, id: string, stage: string, round: string, resolve: (v: unknown, kind: string, where: string) => string): Question {
  const o = fields(raw, where, ["title", "description", "options"], ["ref", "again", "today", "terms", "topics", "results", "example"]);
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

/** Q numbers count up within a Stage. A question asked again takes the Q number of the earlier question it names. */
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
    if (earlier.stage !== stage) refuse(where, `${q.id} asks ${earlier.id} again, which belongs to Stage ${earlier.stage}; again names a question of the same Stage`);
    q.q = earlier.q;
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
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The derived view: labels, open questions, answers, and every backlink, computed from the single stored records.

export type AnswerView = { state: "open" | "answered" | "unanswered"; picks?: string[]; other?: string; note?: string; reason?: string };
export type QuestionView = Question & { answer: AnswerView; open: boolean; latest: boolean; decided_in?: string; asked_again_by: string[] };
export type ResultView = Omit<Result, "entries"> & { entries: (Entry & { anchor: string; questions: string[] })[] };
export type StageView = Stage & {
  label: string;
  background?: Background & { sourceTexts: string[] };
  results: ResultView[];
  items: ({ type: "round"; round: Round; questions: QuestionView[] } | { type: "close"; close: Close; latest: boolean })[];
  asked: QuestionView[];
};
export type View = {
  flow: State["flow"]; revision: number; stages: StageView[];
  topics: (Topic & { sourceTexts: string[]; questions: string[] })[];
  sources: (Source & { cited_by: string[] })[];
  questions: Map<string, QuestionView>;
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

function answerView(q: Question, a: Answer | undefined): AnswerView {
  if (!a) return { state: "open" };
  if ("picks" in a) return { state: "answered", picks: a.picks.map((p) => q.options[letterIndex(p)].label), ...(a.note ? { note: a.note } : {}) };
  if ("other" in a) return { state: "answered", other: a.other };
  return { state: "unanswered", reason: a.unanswered };
}

export function view(s: State): View {
  const sourceText = new Map(s.sources.map((x) => [x.id, x.text]));
  const labels = stageLabels([...s.stages].sort((a, b) => a.order - b.order));
  const decidedIn = new Map<string, string>();
  for (const c of [...s.closes].sort((a, b) => a.seq - b.seq)) for (const d of c.decisions) decidedIn.set(d.question, c.id);
  const latestIds = new Set(s.stages.flatMap((st) => [...latestAsks(s, st.id).values()].map((q) => q.id)));
  const questions = new Map<string, QuestionView>();
  for (const q of s.questions) {
    const answer = answerView(q, s.answers.find((a) => a.question === q.id));
    const latest = latestIds.has(q.id);
    const qv: QuestionView = { ...q, answer, latest, open: latest && answer.state !== "answered", asked_again_by: s.questions.filter((x) => x.again === q.id).map((x) => x.id) };
    if (decidedIn.has(q.id)) qv.decided_in = decidedIn.get(q.id);
    questions.set(q.id, qv);
  }
  const linking = (entry: string) => s.questions.filter((q) => q.entries?.includes(entry)).map((q) => q.id);
  const stages = [...s.stages].sort((a, b) => a.order - b.order).map((st): StageView => {
    const bg = s.backgrounds.find((b) => b.stage === st.id);
    const results = s.results.filter((r) => r.stage === st.id).map((r) => ({ ...r, entries: r.entries.map((e) => ({ ...e, anchor: `${r.id}-${e.id}`, questions: linking(`${r.id}/${e.id}`) })) }));
    const closes = s.closes.filter((c) => c.stage === st.id);
    const lastClose = closes.at(-1)?.id;
    const seqOfRound = (r: Round) => r.seq;
    const items = [
      ...s.rounds.filter((r) => r.stage === st.id).map((round) => ({ type: "round" as const, seq: seqOfRound(round), round, questions: s.questions.filter((q) => q.round === round.id).sort((a, b) => a.q - b.q).map((q) => questions.get(q.id)!) })),
      ...closes.map((close) => ({ type: "close" as const, seq: close.seq, close, latest: close.id === lastClose })),
    ].sort((a, b) => a.seq - b.seq).map(({ seq: _, ...item }) => item);
    return {
      ...st, label: labels.get(st.id)!, results, items,
      asked: [...latestAsks(s, st.id).values()].map((q) => questions.get(q.id)!),
      ...(bg ? { background: { ...bg, sourceTexts: bg.sources.map((x) => sourceText.get(x)!) } } : {}),
    };
  });
  const citers = (id: string) => [
    ...s.backgrounds.filter((b) => b.sources.includes(id)).map((b) => b.id),
    ...s.topics.filter((t) => t.sources.includes(id)).map((t) => t.id),
    ...s.questions.filter((q) => q.today?.some((f) => f.source === id)).map((q) => q.id),
  ];
  return {
    flow: s.flow, revision: s.revision, stages, questions,
    topics: s.topics.map((t) => ({ ...t, sourceTexts: t.sources.map((x) => sourceText.get(x)!), questions: s.questions.filter((q) => q.topics?.includes(t.id)).map((q) => q.id) })),
    sources: s.sources.map((x) => ({ ...x, cited_by: citers(x.id) })),
  };
}

/** The `show` snapshot: ids, numbers, states, labels, and links, with no page markup. */
export function snapshot(v: View, page: string, renderer: number) {
  return {
    flow: v.flow, revision: v.revision, renderer, page,
    stages: v.stages.map((st) => ({
      id: st.id, label: st.label, skill: st.skill, ...(st.ticket ? { ticket: st.ticket } : {}), state: st.state, order: st.order, opened: st.opened, ...(st.finished ? { finished: st.finished } : {}),
      background: st.background?.id,
      results: st.results.map((r) => ({ id: r.id, shape: r.shape, entries: r.entries.map((e) => ({ id: `${r.id}/${e.id}`, questions: e.questions })) })),
      rounds: st.items.filter((i) => i.type === "round").map((i) => ({ id: i.round.id, n: i.round.n, time: i.round.time, questions: i.questions.map((q) => q.id) })),
      questions: st.items.flatMap((i) => (i.type === "round" ? i.questions : [])).map((q) => ({
        id: q.id, q: q.q, latest: q.latest, open: q.open, answer: q.answer, ...(q.again ? { again: q.again } : {}), asked_again_by: q.asked_again_by,
        results: q.entries ?? [], topics: q.topics ?? [], ...(q.decided_in ? { decided_in: q.decided_in } : {}),
      })),
      closes: st.items.filter((i) => i.type === "close").map((i) => ({ id: i.close.id, time: i.close.time, decisions: i.close.decisions.map((d) => d.question) })),
    })),
    topics: v.topics.map((t) => ({ id: t.id, questions: t.questions })),
    sources: v.sources.map((x) => ({ id: x.id, cited_by: x.cited_by })),
  };
}
