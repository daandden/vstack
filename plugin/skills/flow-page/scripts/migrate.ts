import { createHash } from "node:crypto";
import { answerState, latestAsks, newFlow, parseAlias, SLUG, slugOf, type Entry, type Figure, type Io, type State } from "./model.ts";
import { unsafeMarkup } from "./assets.ts";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { CODE_ID, isObj, newId, REF as ID, Refusal, text } from "./fields.ts";

type Old = Record<string, any>;
const TYPES = ["page", "flow", "stage", "round", "question", "answer", "close", "background", "topic", "report"];
const fail = (where: string, message: string): never => { throw new Refusal(`migrate ${where}: ${message}`); };
const object = (x: unknown, where: string): Old => isObj(x) ? x : fail(where, "must be an object");
const str = (o: Old, k: string, w: string): string => text(o, k, `migrate ${w}`);
const int = (o: Old, k: string, w: string): number => Number.isInteger(o[k]) && o[k] > 0 ? o[k] : fail(w, `${k} must be a positive integer`);
const list = (o: Old, k: string, w: string, empty = false): any[] => Array.isArray(o[k]) && (empty || o[k].length) ? o[k] : fail(w, `${k} must be a list${empty ? "" : " with at least one item"}`);
const texts = (o: Old, k: string, w: string): string[] => list(o, k, w).map((s) => typeof s === "string" && s.trim() ? s : fail(w, `${k} must hold non-empty strings`));
const pick = (o: Old, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

export function parseHistorical(raw: string) {
  const records: Old[] = [];
  const latest = new Map<string, Old>();
  raw.split("\n").forEach((line, i) => {
    if (!line.trim()) return;
    let value: unknown;
    try { value = JSON.parse(line); } catch { fail(`line ${i + 1}`, "not valid JSON"); }
    const r = object(value, `line ${i + 1}`);
    if (r.type === "answer" && r.id === undefined && typeof r.question === "string") r.id = `answer-${r.question}`;
    if (typeof r.id !== "string" || !ID.test(r.id)) fail(`line ${i + 1}`, "id must be lowercase letters, digits, and hyphens");
    if (!TYPES.includes(r.type)) fail(`line ${i + 1}`, `unsupported record type ${JSON.stringify(r.type)}`);
    const prev = latest.get(r.id);
    if (prev && prev.type !== r.type) fail(`line ${i + 1}`, `id ${r.id} changes type`);
    records.push(r);
    latest.set(r.id, r);
  });
  const all = [...latest.values()];
  const pages = all.filter((r) => r.type === "page");
  if (pages.length !== 1) fail("state", "needs exactly one page record");
  const page = pages[0];
  str(page, "title", "page");
  const flows = all.filter((r) => r.type === "flow");
  if (flows.length > 1) fail("state", "has more than one flow record");
  const flow = flows[0];
  if (flow && !["open", "closed"].includes(flow.state)) fail("flow", "state must be open or closed");
  return { records, all, page, flow, slug: flow && typeof flow.slug === "string" && SLUG.test(flow.slug) ? flow.slug : slugOf(page.title), sha256: createHash("sha256").update(raw).digest("hex") };
}
export function historicalAliases(h: ReturnType<typeof parseHistorical>): string[] {
  const f = h.flow;
  return [...new Set([
    `slug:${h.slug}`,
    ...(f ? [f.key, ...(f.old_keys ?? [])].map((k) => `folder:${k}`) : []),
    ...["spec", "branch"].flatMap((k) => f?.[k] ? [`${k}:${f[k]}`] : []),
    ...(f?.tickets ?? []).map((x: string) => `ticket:${x}`),
    ...(f?.runs ?? []).map((x: string) => `run:${x}`),
  ].map(parseAlias))];
}

export function historicalFlows(scratch: string) {
  const dir = join(scratch, "grilling");
  if (!existsSync(dir) || !lstatSync(dir).isDirectory()) return [];
  return readdirSync(dir).flatMap((name) => {
    const source = join(dir, name);
    const path = join(source, "page.jsonl");
    try {
      if (!lstatSync(source).isDirectory() || !lstatSync(path).isFile()) return [];
      const h = parseHistorical(readFileSync(path, "utf8"));
      return [{ source: realpathSync(source), title: h.page.title as string, aliases: historicalAliases(h), open: h.flow?.state !== "closed" }];
    } catch { return []; }
  });
}


export function migrateHistorical(h: ReturnType<typeof parseHistorical>, id: string, from: string, time: string, io: Io): State {
  const s = newFlow(id, h.slug, h.page.title, time);
  s.revision = 1;
  if (h.page.crumb !== undefined) s.flow.crumb = str(h.page, "crumb", "page");
  s.migrated = { from, sha256: h.sha256, time, records: h.records, anchors: {} };
  const anchors = s.migrated.anchors;
  const allIds = new Set(h.all.map((r) => r.id));
  if ([...allIds].some((x) => x === "overview" || x === "topics")) fail("state", "a record id collides with a reserved page anchor");
  for (const r of h.all) {
    const m = r.id.match(CODE_ID);
    if (m) s.next[m[1]] = Math.max(s.next[m[1]] ?? 0, Number(m[2]));
  }
  const fresh = (kind: string) => {
    let next: string;
    do { next = newId(s, kind); } while (allIds.has(next));
    allIds.add(next);
    return next;
  };
  const source = (t: string) => {
    const have = s.sources.find((x) => x.text === t);
    if (have) return have.id;
    const src = { id: fresh("source"), text: t };
    s.sources.push(src);
    return src.id;
  };
  const byType = (type: string) => h.all.filter((r) => r.type === type);
  const oldStages = byType("stage").sort((a, b) => int(a, "order", a.id) - int(b, "order", b.id));
  for (const r of oldStages) {
    const skill = str(r, "skill", r.id);
    if (!SLUG.test(skill)) fail(r.id, "skill must be a skill name");
    if (!["not-started", "in-progress", "finished"].includes(r.state)) fail(r.id, "invalid Stage state");
    s.stages.push({ id: r.id, skill, state: r.state, order: r.order });
    anchors[`stage-${r.id}`] = r.id;
    anchors[`tab-stage-${r.id}`] = `tab-${r.id}`;
  }
  const hasStage = (id: string, w: string) => s.stages.some((st) => st.id === id) ? id : fail(w, `Stage ${id} does not exist`);
  const order = h.all.filter((r) => r.type === "round" || r.type === "close");
  const sessionStages = new Map<number, string>();
  const implicit = new Map<number, string>();
  for (const r of byType("round")) {
    const session = int(r, "session", r.id);
    let stage = r.stage;
    if (stage === undefined) {
      stage = implicit.get(session);
      if (!stage) {
        stage = fresh("stage");
        implicit.set(session, stage);
        const last = order.filter((x) => x.session === session).at(-1);
        s.stages.push({ id: stage, skill: "grilling", state: last?.type === "close" ? "finished" : "in-progress", order: 0 });
        if (implicit.size === 1) { anchors["stage-_grilling"] = stage; anchors["tab-stage-_grilling"] = `tab-${stage}`; }
      }
    }
    hasStage(stage, r.id);
    const previous = sessionStages.get(session);
    if (previous !== undefined && previous !== stage) fail(r.id, `session ${session} crosses Stages`);
    sessionStages.set(session, stage);
  }
  const stageSessions = new Map<string, number>();
  for (const [session, stage] of sessionStages) {
    if (stageSessions.has(stage)) fail(stage, "has multiple question sessions; their Q-number scopes cannot be merged");
    stageSessions.set(stage, session);
  }
  s.stages.sort((a, b) => a.order - b.order).forEach((st, i) => { st.order = i + 1; });
  for (const r of order) {
    const stage = r.type === "round" ? sessionStages.get(r.session)! : (sessionStages.get(r.session) ?? r.stage);
    hasStage(stage, r.id);
    if (r.type === "round") {
      const roundTime = str(r, "time", r.id);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(roundTime) || !Number.isFinite(Date.parse(roundTime))) fail(r.id, "time must be an ISO timestamp");
      s.rounds.push({ id: r.id, stage, n: int(r, "round", r.id), session: r.session, seq: ++s.seq, time: roundTime });
      anchors[`round-${r.id}`] = r.id;
    } else {
      s.closes.push({ id: r.id, stage, seq: ++s.seq, assumed: [], decisions: list(r, "decisions", r.id, true).map((d) => ({ question: str(object(d, r.id), "question", r.id), text: str(d, "text", r.id), answer: "open" })), ...(r.extra === undefined ? {} : { extra: texts(r, "extra", r.id) }) });
      anchors[`close-${r.id}`] = r.id;
    }
  }
  const figures = (v: unknown, prefix: string, stage: string): Figure[] => {
    if (v === undefined) return [];
    const vs = Array.isArray(v) ? v : [v];
    if (!vs.length) fail(prefix, "visual list is empty");
    return vs.map((raw, i) => {
      const vis = object(raw, prefix);
      const fid = `${prefix}${i ? `-${i + 1}` : ""}`;
      if (["text", "html", "svg"].filter((k) => vis[k] !== undefined).length !== 1) fail(fid, "visual needs exactly one of text, html, or svg");
      if (vis.text !== undefined) return { id: fid, text: str(vis, "text", fid) };
      if (vis.html !== undefined) {
        const html = str(vis, "html", fid);
        const problems = unsafeMarkup(html);
        if (problems.length) fail(fid, `unsafe HTML: ${problems.join("; ")}`);
        if (vis.css !== undefined && /@|<\/|expression\(|javascript:/i.test(str(vis, "css", fid))) fail(fid, "CSS must contain plain scoped rules, with no imports, closing tags, or scripts");
        return { id: fid, html, ...(vis.css === undefined ? {} : { css: vis.css }) };
      }
      const path = str(vis, "svg", fid);
      const aid = fresh("attachment");
      const base = { id: aid, stage, type: "svg" as const, time, caption: `Historical figure ${fid}`, origin: `Grilling page ${from}: ${path}` };
      try {
        const c = io.capture(path, "svg", fid);
        s.attachments.push({ ...base, availability: "captured", ...c });
      } catch (e) {
        if (!(e instanceof Refusal)) throw e;
        s.attachments.push({ ...base, availability: "unavailable", reason: e.message });
      }
      return { id: fid, attachment: aid };
    });
  };
  const withFigures = (v: unknown, prefix: string, stage: string) => {
    const fs = figures(v, prefix, stage);
    return fs.length ? { figures: fs } : {};
  };
  for (const r of byType("question")) {
    if (["plain", "why", "settled"].some((k) => r[k] !== undefined)) fail(r.id, "this question predates the supported description format");
    const round = s.rounds.find((x) => x.id === str(r, "round", r.id)) ?? fail(r.id, `round ${r.round} does not exist`);
    const options = list(r, "options", r.id).map((raw, i) => {
      const o = object(raw, r.id);
      const label = str(o, "label", r.id);
      if (!label.startsWith(`${String.fromCharCode(65 + i)}. `)) fail(r.id, "option labels must have their stored letters");
      const preview = o.preview === undefined ? undefined : figures(o.preview, `q-${r.id}-${String.fromCharCode(97 + i)}`, round.stage)[0];
      return { label, does: str(o, "does", r.id), gains: texts(o, "gains", r.id), costs: texts(o, "costs", r.id), ...(o.recommended === undefined ? {} : { recommended: str(o, "recommended", r.id) }), ...(preview ? { preview } : {}) };
    });
    const today = r.today === undefined ? undefined : list(r, "today", r.id).map((f) => ({ text: str(object(f, r.id), "text", r.id), source: source(str(f, "source", r.id)) }));
    const terms = r.terms === undefined ? undefined : list(r, "terms", r.id).map((t) => ({ term: str(object(t, r.id), "term", r.id), text: str(t, "text", r.id) }));
    s.questions.push({ id: r.id, stage: round.stage, round: round.id, q: int(r, "q", r.id), title: str(r, "title", r.id), description: str(r, "description", r.id), options, ...pick(r, ["again", "example"]), ...(today ? { today } : {}), ...(terms ? { terms } : {}), ...(r.topics ? { topics: texts(r, "topics", r.id) } : {}), ...(r.report_entries ? { entries: texts(r, "report_entries", r.id) } : {}), ...withFigures(r.visual, `q-${r.id}-visual`, round.stage) });
    anchors[`q-${r.id}`] = r.id;
  }
  for (const r of byType("answer")) {
    const q = s.questions.find((x) => x.id === str(r, "question", r.id)) ?? fail(r.id, `question ${r.question} does not exist`);
    if (["picks", "other", "unanswered"].filter((k) => r[k] !== undefined).length !== 1) fail(r.id, "answer needs exactly one of picks, other, or unanswered");
    if (r.note !== undefined) str(r, "note", r.id);
    let a: State["answers"][number];
    if (r.picks !== undefined) {
      const picks = texts(r, "picks", r.id);
      for (const p of picks) if (!/^[A-Z]$/.test(p) || p.charCodeAt(0) - 65 >= q.options.length) fail(r.id, `question ${q.id} has no option ${p}`);
      a = { id: r.id, question: q.id, response: { status: "answered", picks, ...(r.note ? { text: r.note } : {}) } };
    } else {
      if (r.other !== undefined) str(r, "other", r.id);
      if (r.unanswered !== undefined && typeof r.unanswered !== "string") fail(r.id, "unanswered must be a string");
      a = { id: r.id, question: q.id, legacy: pick(r, ["other", "unanswered", "note"]) };
    }
    const i = s.answers.findIndex((x) => x.question === q.id);
    if (i < 0) s.answers.push(a); else s.answers[i] = a;
  }
  for (const r of byType("background")) {
    const stage = hasStage(str(r, "stage", r.id), r.id);
    if (s.backgrounds.some((b) => b.stage === stage)) fail(r.id, `Stage ${stage} has two Backgrounds`);
    s.backgrounds.push({ id: r.id, stage, title: str(r, "title", r.id), summary: str(r, "summary", r.id), sections: list(r, "sections", r.id).map((sec) => ({ heading: str(object(sec, r.id), "heading", r.id), body: str(sec, "body", r.id) })), sources: texts(r, "sources", r.id).map(source), ...pick(r, ["jump"]), ...withFigures(r.visual, `background-${r.id}-visual`, stage) });
    anchors[`background-${r.id}`] = r.id;
  }
  for (const r of byType("topic")) {
    s.topics.push({ id: r.id, title: str(r, "title", r.id), summary: str(r, "summary", r.id), body: str(r, "body", r.id), sources: texts(r, "sources", r.id).map(source) });
    anchors[`topic-${r.id}`] = r.id;
  }
  for (const r of byType("report")) {
    const stage = hasStage(str(r, "stage", r.id), r.id);
    if (!["cards", "ledger", "table"].includes(r.shape)) fail(r.id, `unsupported report shape ${r.shape}`);
    const columns = r.shape === "table" ? texts(r, "columns", r.id) : undefined;
    const seen = new Set<string>();
    const entries = list(r, r.shape === "table" ? "rows" : "entries", r.id).map((raw): Entry => {
      const e = object(raw, r.id);
      if (typeof e.id !== "string" || !ID.test(e.id) || seen.has(e.id)) fail(r.id, "entry ids must be valid and unique");
      seen.add(e.id);
      const fields = r.shape === "cards" ? ["title", "label", "impact", "evidence", "action"] : ["claim", "evidence", "missing_proof", "consequence"];
      if (r.shape !== "table") for (const k of fields) str(e, k, `${r.id}/${e.id}`);
      if (r.shape === "cards" && typeof e.blocking !== "boolean") fail(r.id, "blocking must be a boolean");
      if (r.shape === "ledger" && !["confirmed", "cleared", "unproven"].includes(e.status)) fail(r.id, "invalid claim status");
      if (columns && (!Array.isArray(e.cells) || e.cells.length !== columns.length || e.cells.some((c: unknown) => typeof c !== "string"))) fail(r.id, "table cells must match columns");
      if (e.question !== undefined) {
        const q = s.questions.find((x) => x.id === e.question) ?? fail(r.id, `entry ${e.id} links missing question ${e.question}`);
        q.entries = [...new Set([...(q.entries ?? []), `${r.id}/${e.id}`])];
      }
      anchors[`report-${r.id}_${e.id}`] = `${r.id}-${e.id}`;
      return { id: e.id, changed: 1, ...pick(e, columns ? ["cells"] : [...fields, ...(r.shape === "cards" ? ["blocking"] : ["status"])]), ...withFigures(e.visual, `report-${r.id}_${e.id}_visual`, stage) };
    });
    s.results.push({ id: r.id, stage, shape: r.shape, title: str(r, "title", r.id), ...pick(r, ["summary", "jump"]), ...(columns ? { columns } : {}), entries, changed: 1, revision: 1 });
    anchors[`report-${r.id}`] = r.id;
  }
  for (const q of s.questions) {
    if (q.again && !s.questions.some((x) => x.id === q.again)) fail(q.id, `earlier question ${q.again} does not exist`);
    for (const t of q.topics ?? []) if (!s.topics.some((x) => x.id === t)) fail(q.id, `Topic ${t} does not exist`);
    for (const ref of q.entries ?? []) if (!s.results.some((r) => r.entries.some((e) => `${r.id}/${e.id}` === ref))) fail(q.id, `Report entry ${ref} does not exist`);
  }
  for (const c of s.closes) for (const d of c.decisions) {
    const q = s.questions.find((x) => x.id === d.question) ?? fail(c.id, `question ${d.question} does not exist`);
    if (q.stage !== c.stage) fail(c.id, `question ${q.id} belongs to another Stage`);
    d.answer = answerState(s, q.id);
  }
  for (const st of s.stages.filter((st) => st.state === "finished")) for (const q of latestAsks(s, st.id).values()) {
    if (["open", "unresolved"].includes(answerState(s, q.id))) s.retirements.push({ question: q.id, reason: "This Stage was already finished when the Grilling page was migrated. No settled answer was recorded." });
  }
  const f = h.flow;
  s.aliases.push(...historicalAliases(h).filter((alias) => !s.aliases.includes(alias)));
  if (f?.state === "closed") s.lifecycle.push({ event: "closed", time });
  return s;
}
