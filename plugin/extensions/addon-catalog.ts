/** One `noul` question for the Addon judge: the situation in which the judge picks the Addon. */
export interface AddonQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

/**
 * The parsed catalog. The Addon judge reads `preamble` once in the state of a main-session request, and `brief_preamble`
 * once in the state of a subagent-brief request (ADR 0025). `questions` holds one question per Addon, keyed by its skill name.
 */
export interface AddonCatalog {
  preamble: string;
  brief_preamble: string;
  questions: Record<string, AddonQuestion>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses the catalog JSON. Throws an Error that names the first field with a wrong shape. */
export function parseAddonCatalog(value: unknown): AddonCatalog {
  if (!isObject(value)) throw new Error("expected an object with preamble, brief_preamble, and questions");
  if (typeof value.preamble !== "string" || !value.preamble.trim()) throw new Error("preamble must be a non-empty string");
  if (typeof value.brief_preamble !== "string" || !value.brief_preamble.trim()) throw new Error("brief_preamble must be a non-empty string");
  if (!isObject(value.questions)) throw new Error("questions must be an object keyed by Addon name");
  const questions: Record<string, AddonQuestion> = {};
  for (const [name, question] of Object.entries(value.questions)) {
    if (!isObject(question) || question.type !== "noul" || typeof question.instructions !== "string" || !isObject(question.criteria) ||
      typeof question.criteria.true !== "string" || typeof question.criteria.false !== "string") {
      throw new Error(`questions.${name} must be a noul question with instructions and true and false criteria`);
    }
    questions[name] = { type: "noul", instructions: question.instructions, criteria: { true: question.criteria.true, false: question.criteria.false } };
  }
  return { preamble: value.preamble, brief_preamble: value.brief_preamble, questions };
}

export function addonJudgeState(catalog: AddonCatalog, request: string): { request: string; preamble: string } {
  return { request, preamble: catalog.preamble };
}

/** The state for a subagent brief: the same shape, with `brief_preamble` as the preamble. */
export function briefJudgeState(catalog: AddonCatalog, request: string): { request: string; preamble: string } {
  return { request, preamble: catalog.brief_preamble };
}

/** The questions for a subagent brief: every principle except never-block-on-the-human (ADR 0025). */
export function briefQuestions(catalog: AddonCatalog): Record<string, AddonQuestion> {
  return Object.fromEntries(Object.entries(catalog.questions)
    .filter(([name]) => name.startsWith("principle-") && name !== "principle-never-block-on-the-human"));
}
