import type { Attachment, QuestionView, ResultView, StageView, View } from "#flow/model.ts";
import type { Runtimes } from "#flow/live.ts";
import type { Content, Observations } from "#flow/host-api.ts";
import { inline } from "./format";

export type { Attachment, QuestionView, ResultView, StageView, Runtimes, Observations, Content };
export type ReadingBlock = View["reading"]["historical"][number];

export type Flow = Content & {
  question: Map<string, QuestionView>;
  stage: Map<string, StageView>;
  aliases: Map<string, string>;
};

export function flowOf(content: Content): Flow {
  const aliases = new Map<string, string>(Object.entries(content.migrated?.anchors ?? {}).filter(([old, target]) => old !== target));
  for (const st of content.stages) aliases.set(`tab-${st.id}`, st.id);
  return {
    ...content,
    question: new Map(content.questions.map((q) => [q.id, q])),
    stage: new Map(content.stages.map((st) => [st.id, st])),
    aliases,
  };
}

export const optionLabel = (q: QuestionView, letter: string) => q.options[letter.charCodeAt(0) - 65]?.label ?? letter;

export function sourceText(flow: Flow, id: string): string {
  return flow.sources.find((x) => x.id === id)?.text ?? id;
}

type QuestionOutcome = { cls: string; html: string };

export function questionOutcome(q: QuestionView): QuestionOutcome & { previous?: QuestionOutcome } {
  if (q.asked_again_by.length) {
    return {
      cls: "text-flow-subtext",
      html: "Re-asked",
      previous: q.answer.state === "open" ? undefined : answerOutcome(q),
    };
  }
  return answerOutcome(q);
}

function answerOutcome(q: QuestionView): QuestionOutcome {
  const a = q.answer;
  if (a.picks) return { cls: "text-flow-yellow", html: `Your pick: ${inline(a.picks.join(", "))}` };
  if (a.legacy?.other !== undefined) return { cls: "text-flow-yellow", html: `Recorded answer: ${inline(a.legacy.other)}` };
  if (a.state === "resolved" && a.reading?.outcome === "resolved") return { cls: "text-flow-teal", html: `${inline(a.reading.decision)} <span class="quiet">(read from your words)</span>` };
  if (a.correction && a.state === "unresolved") return { cls: "text-flow-subtext", html: `Unresolved after correction${a.reading && a.reading.outcome !== "resolved" ? `: ${inline(a.reading.unresolved)}` : ""}` };
  if (a.state === "unresolved") {
    const status = a.response?.status;
    const nonConsent = status === "headless" ? "Headless, not your answer"
      : status === "cancelled" ? "Cancelled, not your answer"
      : status === "timed-out" ? "Timed out, not your answer"
      : status === "empty" ? "Empty response, not your answer"
      : a.reading && a.reading.outcome !== "resolved" ? `Unresolved: ${inline(a.reading.unresolved)}` : q.asked_again_by.length ? "No decision recorded at this attempt" : "Not answered";
    return { cls: "text-flow-subtext", html: `${q.retired ? "Retired: " : ""}${nonConsent}` };
  }
  if (q.retired) return { cls: "text-flow-subtext", html: "Retired" };
  return { cls: "text-flow-subtext", html: "Open" };
}

/** A question's Q number, with its attempt when its Stage asked that Q number more than once: "Q1 (attempt 2)". */
export function askLabel(flow: Flow, id: string): string {
  const q = flow.question.get(id);
  if (!q) return id;
  let count = 0;
  let attempt = 0;
  for (const ask of flow.questions) {
    if (ask.stage !== q.stage || ask.q !== q.q) continue;
    count++;
    if (ask.id === q.id) attempt = count;
  }
  return count > 1 ? `Q${q.q} (attempt ${attempt})` : `Q${q.q}`;
}

export function blockLabel(flow: Flow, b: ReadingBlock): string {
  const st = b.stage ? flow.stage.get(b.stage) : undefined;
  if (b.kind === "question") return askLabel(flow, b.id);
  if (b.kind === "result") {
    const r = st?.results.find((x) => x.id === b.id);
    return r?.jump ?? r?.title ?? b.id;
  }
  if (b.kind === "background") return st?.background?.jump ?? st?.background?.title ?? b.id;
  if (b.kind === "topic") return flow.topics.find((t) => t.id === b.id)?.title ?? b.id;
  if (b.kind === "assumed") return `Assumed: ${st?.assumed.find((a) => a.id === b.id)?.decision ?? b.id}`;
  if (b.kind === "reading") return `Answer reading: ${flow.question.get(st?.readings.find(r => r.id === b.id)?.question ?? "")?.title ?? b.id}`;
  return "Summary";
}
