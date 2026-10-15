/** One jev `noul` question: the situation in which the judge picks the Addon. */
export interface AddonQuestion {
  type: "noul";
  instructions: string;
  criteria: { true: string; false: string };
}

/** The parsed catalog. jev reads `preamble` once in the state. `questions` holds one question per Addon, keyed by its skill name. */
export interface AddonCatalog {
  preamble: string;
  questions: Record<string, AddonQuestion>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses the catalog JSON. Throws an Error that names the first field with a wrong shape. */
export function parseAddonCatalog(value: unknown): AddonCatalog {
  if (!isObject(value)) throw new Error("expected an object with preamble and questions");
  if (typeof value.preamble !== "string" || !value.preamble.trim()) throw new Error("preamble must be a non-empty string");
  if (!isObject(value.questions)) throw new Error("questions must be an object keyed by Addon name");
  const questions: Record<string, AddonQuestion> = {};
  for (const [name, question] of Object.entries(value.questions)) {
    if (!isObject(question) || question.type !== "noul" || typeof question.instructions !== "string" || !isObject(question.criteria) ||
      typeof question.criteria.true !== "string" || typeof question.criteria.false !== "string") {
      throw new Error(`questions.${name} must be a noul question with instructions and true and false criteria`);
    }
    questions[name] = { type: "noul", instructions: question.instructions, criteria: { true: question.criteria.true, false: question.criteria.false } };
  }
  return { preamble: value.preamble, questions };
}

export function addonJudgeState(catalog: AddonCatalog, request: string): { request: string; preamble: string } {
  return { request, preamble: catalog.preamble };
}
