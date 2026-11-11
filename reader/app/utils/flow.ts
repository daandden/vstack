import type { Attachment, QuestionView, ResultView, StageView, View } from "#flow/model.ts";
import type { Runtimes } from "#flow/live.ts";
import type { Observations } from "#flow/observations.ts";

export type { Attachment, QuestionView, ResultView, StageView, Runtimes, Observations };
export type Content = Omit<View, "questions"> & { questions: QuestionView[]; runtimes: Runtimes };
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

export function entryTitle(flow: Flow, ref: string): { result: string; entry: string; name: string } | undefined {
  const [rid, eid] = ref.split("/");
  const r = flow.stages.flatMap((st) => st.results).find((x) => x.id === rid);
  const e = r?.entries.find((x) => x.id === eid);
  if (!r || !e) return undefined;
  const name = r.shape === "code" ? (e.file as string) : r.shape === "ledger" ? (e.claim as string) : r.shape === "table" ? (e.cells as string[])[0] || e.id : (e.title as string);
  return { result: r.title, entry: e.id, name };
}

export function blockLabel(flow: Flow, b: ReadingBlock): string {
  const st = b.stage ? flow.stage.get(b.stage) : undefined;
  if (b.kind === "question") {
    const q = flow.question.get(b.id);
    if (!q) return b.id;
    let count = 0;
    let attempt = 0;
    for (const ask of flow.questions) {
      if (ask.stage !== q.stage || ask.q !== q.q) continue;
      count++;
      if (ask.id === q.id) attempt = count;
    }
    return count > 1 ? `Q${q.q} (attempt ${attempt})` : `Q${q.q}`;
  }
  if (b.kind === "result") {
    const r = st?.results.find((x) => x.id === b.id);
    return r?.jump ?? r?.title ?? b.id;
  }
  if (b.kind === "background") return st?.background?.jump ?? st?.background?.title ?? b.id;
  if (b.kind === "topic") return flow.topics.find((t) => t.id === b.id)?.title ?? b.id;
  if (b.kind === "assumed") return `Assumed: ${st?.assumed.find((a) => a.id === b.id)?.decision ?? b.id}`;
  return "Summary";
}
