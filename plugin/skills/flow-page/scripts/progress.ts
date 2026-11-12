import { fields, listed, type Obj, refuse, text, texts } from "./fields.ts";
import type { State } from "./model.ts";

export const TASK_STATES = ["pending", "active", "done", "skipped", "inapplicable"] as const;
export type TaskState = (typeof TASK_STATES)[number];
/** End states in the order a delivery goes through them; `none` requests no delivery at all. */
export const END_STATES = ["commit", "merge-ready", "shipped"] as const;
export type EndState = (typeof END_STATES)[number];
const REQUESTS = [...END_STATES, "none"] as const;
const PR_STATES = ["open", "merged", "closed"] as const;
export type PrState = (typeof PR_STATES)[number];
const CHECK_OUTCOMES = ["passed", "failed", "pending"] as const;
export type CheckOutcome = (typeof CHECK_OUTCOMES)[number];
const NOT_WORK: TaskState[] = ["skipped", "inapplicable"];
const OPEN_WORK: TaskState[] = ["pending", "active"];

type Stamp = { time: string; stage: string };
export type Task = { id: string; stage: string; title: string; state: TaskState; evidence: string[]; reason?: string; updates: (Stamp & { state: TaskState })[] };
export type Blocker = { id: string; stage: string; text: string; tasks: string[]; opened: string; resolved?: Stamp & { text: string } };
export type Pr = { id: string; url: string; title?: string; state: PrState; reported: Stamp };
export type Check = { id: string; name: string; outcome: CheckOutcome; evidence: string[]; reported: Stamp };
export type Progress = {
  tasks: Task[];
  blockers: Blocker[];
  requested?: Stamp & { value: EndState | "none" };
  reached?: Stamp & { value: EndState; evidence: string[] };
  prs: Pr[];
  checks: Check[];
};

export const PROGRESS_KINDS = ["task", "blocker", "end-state", "pr", "check"] as const;
export type ProgressKind = (typeof PROGRESS_KINDS)[number];
const emptyProgress = (): Progress => ({ tasks: [], blockers: [], prs: [], checks: [] });

/** A Flow stored before progress existed has none; it reads as empty. */
export function progressOf(s: State): Progress {
  s.progress ??= emptyProgress();
  return s.progress;
}

const oneOf = <T extends string>(o: Obj, k: string, allowed: readonly T[], where: string): T => {
  if (!allowed.includes(o[k] as T)) refuse(where, `${k} must be ${listed([...allowed])}, got ${JSON.stringify(o[k])}`);
  return o[k] as T;
};
const URL_RE = /^https?:\/\/[^\s"'<>`]+$/;

type Resolve = (v: unknown, kind: string, where: string) => string;

type ProgressItem = { s: State; stage: string; o: Obj; where: string; plannedId?: string; resolve: Resolve; time: string };
type ProgressHandler = { update?: string; apply(item: ProgressItem): void };

export const progressHandlers: Record<ProgressKind, ProgressHandler> = {
  task: {
    update: "task",
    apply({ s, stage, o, where, plannedId, resolve, time }) {
      const p = progressOf(s);
      const stamp = { time, stage };
      let t: Task;
      if (o.task === undefined) {
        fields(o, where, ["kind", "title"], ["ref", "state", "evidence", "reason"]);
        t = { id: plannedId!, stage, title: text(o, "title", where), state: "pending", evidence: [], updates: [] };
        p.tasks.push(t);
      } else {
        fields(o, where, ["kind", "task"], ["state", "evidence", "reason"]);
        if (o.state === undefined && o.evidence === undefined && o.reason === undefined) refuse(where, "a task update needs state, evidence, or reason");
        const tid = resolve(o.task, "task", `${where}: task`);
        t = p.tasks.find((x) => x.id === tid) ?? refuse(where, `task ${tid} does not exist`);
      }
      const state = o.state === undefined ? t.state : oneOf(o, "state", TASK_STATES, where);
      if (o.evidence !== undefined) for (const e of texts(o, "evidence", where)) if (!t.evidence.includes(e)) t.evidence.push(e);
      if (NOT_WORK.includes(state)) {
        if (o.reason === undefined && (t.reason === undefined || state !== t.state)) refuse(where, `a ${state} task needs a reason, so the page says why the step does not apply`);
        if (o.reason !== undefined) t.reason = text(o, "reason", where);
      } else {
        if (o.reason !== undefined) refuse(where, `reason explains a skipped or inapplicable task, not a ${state} one`);
        delete t.reason;
      }
      if (state === "done" && t.evidence.length === 0) refuse(where, `task ${t.id} is done only with evidence of the work, such as a command and its outcome or a commit`);
      if (state !== t.state || t.updates.length === 0) t.updates.push({ ...stamp, state });
      t.state = state;
    },
  },
  blocker: {
    update: "blocker",
    apply({ s, stage, o, where, plannedId, resolve, time }) {
      const p = progressOf(s);
      const stamp = { time, stage };
      if (o.blocker === undefined) {
        fields(o, where, ["kind", "text"], ["ref", "tasks"]);
        const tasks = o.tasks === undefined ? [] : texts(o, "tasks", where).map((x) => resolve(x, "task", `${where}: tasks`));
        for (const tid of tasks) if (!p.tasks.some((t) => t.id === tid)) refuse(where, `task ${tid} does not exist`);
        p.blockers.push({ id: plannedId!, stage, text: text(o, "text", where), tasks, opened: time });
      } else {
        fields(o, where, ["kind", "blocker", "resolved"]);
        const bid = resolve(o.blocker, "blocker", `${where}: blocker`);
        const b = p.blockers.find((x) => x.id === bid) ?? refuse(where, `blocker ${bid} does not exist`);
        if (b.resolved) refuse(where, `blocker ${bid} is already resolved`);
        b.resolved = { ...stamp, text: text(o, "resolved", where) };
      }
    },
  },
  "end-state": {
    apply({ s, stage, o, where, time }) {
      const p = progressOf(s);
      const stamp = { time, stage };
      fields(o, where, ["kind"], ["requested", "reached", "evidence"]);
      if (o.requested === undefined && o.reached === undefined) refuse(where, "needs requested, reached, or both");
      if (o.requested !== undefined) p.requested = { ...stamp, value: oneOf(o, "requested", REQUESTS, where) };
      if (o.reached !== undefined) {
        const value = oneOf(o, "reached", END_STATES, where);
        if (p.requested === undefined) refuse(where, "record the requested End state before a reached one");
        if (p.requested!.value === "none") refuse(where, "this Flow requested no delivery, so it reaches no End state; request one first if it now delivers");
        p.reached = { ...stamp, value, evidence: texts(o, "evidence", where) };
      } else if (o.evidence !== undefined) refuse(where, "evidence goes with reached");
    },
  },
  pr: {
    update: "pr",
    apply({ s, stage, o, where, plannedId, resolve, time }) {
      const p = progressOf(s);
      const stamp = { time, stage };
      if (o.pr === undefined) {
        fields(o, where, ["kind", "url", "state"], ["ref", "title"]);
        const url = text(o, "url", where);
        if (!URL_RE.test(url)) refuse(where, "url must be an http or https link to the PR");
        p.prs.push({ id: plannedId!, url, ...(o.title !== undefined ? { title: text(o, "title", where) } : {}), state: oneOf(o, "state", PR_STATES, where), reported: stamp });
      } else {
        fields(o, where, ["kind", "pr", "state"]);
        const pid = resolve(o.pr, "pr", `${where}: pr`);
        const pr = p.prs.find((x) => x.id === pid) ?? refuse(where, `pr ${pid} does not exist`);
        pr.state = oneOf(o, "state", PR_STATES, where);
        pr.reported = stamp;
      }
    },
  },
  check: {
    update: "check",
    apply({ s, stage, o, where, plannedId, resolve, time }) {
      const p = progressOf(s);
      const stamp = { time, stage };
      let c: Check;
      if (o.check === undefined) {
        fields(o, where, ["kind", "name", "outcome"], ["ref", "evidence"]);
        c = { id: plannedId!, name: text(o, "name", where), outcome: "pending", evidence: [], reported: stamp };
        p.checks.push(c);
      } else {
        fields(o, where, ["kind", "check", "outcome"], ["evidence"]);
        const cid = resolve(o.check, "check", `${where}: check`);
        c = p.checks.find((x) => x.id === cid) ?? refuse(where, `check ${cid} does not exist`);
      }
      c.outcome = oneOf(o, "outcome", CHECK_OUTCOMES, where);
      c.reported = stamp;
      if (o.evidence !== undefined) c.evidence = texts(o, "evidence", where);
      if (c.outcome !== "pending" && c.evidence.length === 0) refuse(where, `a ${c.outcome} check needs evidence, such as the command and its output`);
    },
  },
};

export type ProgressView = Omit<Progress, "tasks"> & {
  tasks: (Task & { blocked_by: string[] })[];
  stages: { finished: number; total: number };
  /** Unfinished tasks, then open blockers. */
  remaining: string[];
  /** Undefined until an End state is requested. */
  delivery?: boolean;
  /** The reached End state is at least the requested one; true for a Flow that requested none. */
  end_state_met: boolean;
  complete: boolean;
};

/** A Flow is complete when it has tasks, none is left open or blocked, and a delivery reached its requested End state. */
export function progressView(s: State): ProgressView {
  const p = s.progress ?? emptyProgress();
  const open = p.blockers.filter((b) => !b.resolved);
  const tasks = p.tasks.map((t) => ({ ...t, blocked_by: OPEN_WORK.includes(t.state) ? open.filter((b) => b.tasks.includes(t.id)).map((b) => b.id) : [] }));
  const remaining = [...tasks.filter((t) => OPEN_WORK.includes(t.state)).map((t) => t.id), ...open.map((b) => b.id)];
  const delivery = p.requested === undefined ? undefined : p.requested.value !== "none";
  const rank = (v: string | undefined) => END_STATES.indexOf(v as EndState);
  const end_state_met = delivery === false || (delivery === true && p.reached !== undefined && rank(p.reached.value) >= rank(p.requested!.value));
  return {
    ...p, tasks, remaining, ...(delivery === undefined ? {} : { delivery }), end_state_met,
    stages: { finished: s.stages.filter((st) => st.state === "finished").length, total: s.stages.length },
    complete: tasks.length > 0 && remaining.length === 0 && end_state_met,
  };
}

/** The progress part of the `show` snapshot: ids, states, counts, and links, with no prose. */
export function progressSnapshot(v: ProgressView) {
  return {
    complete: v.complete,
    remaining: v.remaining,
    stages: v.stages,
    tasks: v.tasks.map((t) => ({ id: t.id, title: t.title, stage: t.stage, state: t.state, evidence: t.evidence.length, blocked_by: t.blocked_by, ...(t.reason ? { reason: true } : {}) })),
    blockers: v.blockers.map((b) => ({ id: b.id, state: b.resolved ? "resolved" : "open", tasks: b.tasks })),
    end_state: {
      ...(v.requested ? { requested: v.requested.value } : {}),
      ...(v.reached ? { reached: v.reached.value } : {}),
      ...(v.delivery === undefined ? {} : { delivery: v.delivery }),
      met: v.end_state_met,
    },
    prs: v.prs.map((x) => ({ id: x.id, state: x.state })),
    checks: v.checks.map((x) => ({ id: x.id, outcome: x.outcome })),
  };
}
