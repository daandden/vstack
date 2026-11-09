type RefusalLocation = { where: string; field?: string; allowed?: readonly unknown[] | string };
export class Refusal extends Error {
  constructor(message: string, readonly location?: RefusalLocation) { super(message); }
}
export const refuse = (where: string, message: string, allowed?: RefusalLocation["allowed"], field?: string): never => {
  throw new Refusal(where ? `${where}: ${message}` : message, { where, ...(field === undefined ? {} : { field }), ...(allowed === undefined ? {} : { allowed }) });
};

let collector: ((error: Refusal) => void) | undefined;

export function collecting<T>(report: (error: Refusal) => void, run: () => T): T {
  const previous = collector;
  collector = report;
  try { return run(); } finally { collector = previous; }
}

export function reject(where: string, message: string, allowed?: RefusalLocation["allowed"], field?: string): void {
  const error = new Refusal(where ? `${where}: ${message}` : message, { where, ...(field === undefined ? {} : { field }), ...(allowed === undefined ? {} : { allowed }) });
  if (!collector) throw error;
  collector(error);
}

export function validatedMap<T, U>(values: T[], parse: (value: T, index: number) => U): U[] {
  if (!collector) return values.map(parse);
  const parsed: U[] = [];
  values.forEach((value, index) => {
    try { parsed.push(parse(value, index)); }
    catch (error) {
      if (!(error instanceof Refusal)) throw error;
      collector!(error);
    }
  });
  return parsed;
}

/** The Visual kinds a reader need can declare, with the label readers see. */
export const VISUAL_KINDS = {
  "source-view": "Source view",
  "source-excerpt": "Source excerpt",
  "context-diagram": "Context diagram",
  "option-diagram": "Option diagram",
  "option-preview": "Option preview",
  "before-after": "Before and after",
  "comparison-table": "Comparison table",
  "data-chart": "Data chart",
  scenario: "Scenario walkthrough",
  prose: "Prose",
} as const;

export type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
export const REF = /^[a-z0-9][a-z0-9-]*$/;
export const CODE_ID = /^(stage|round|question|close|background|topic|result|source|assumed|attachment|task|blocker|pr|check)-(\d+)$/;
export const listed = (xs: readonly string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")}, or ${xs.at(-1)}`);

export function fields(v: unknown, where: string, required: string[], optional: string[] = []): Obj {
  if (!isObj(v)) refuse(where, `must be an object with ${listed(required)}`, "object");
  const o = v as Obj;
  for (const k of Object.keys(o)) if (!required.includes(k) && !optional.includes(k)) refuse(where, `${k} is not a field here; the fields are ${listed([...required, ...optional])}`, [...required, ...optional], k);
  for (const k of required) if (o[k] === undefined) refuse(where, `needs ${k}`, undefined, k);
  return o;
}
export function text(o: Obj, k: string, where: string): string {
  const v = o[k];
  if (typeof v !== "string" || v.trim() === "") refuse(where, `${k} must be a non-empty string`, "non-empty string", k);
  return v as string;
}
export function texts(o: Obj, k: string, where: string): string[] {
  const v = o[k];
  if (!Array.isArray(v) || v.length === 0 || v.some((x) => typeof x !== "string" || x.trim() === "")) refuse(where, `${k} must be a list of one or more non-empty strings`, "array of non-empty strings", k);
  return v as string[];
}
export function list(o: Obj, k: string, where: string): unknown[] {
  const v = o[k];
  if (!Array.isArray(v) || v.length === 0) refuse(where, `${k} must be a list of one or more items`, "array with one or more items", k);
  return v as unknown[];
}
export function newId(s: { next: Record<string, number> }, kind: string): string {
  s.next[kind] = (s.next[kind] ?? 0) + 1;
  return `${kind}-${s.next[kind]}`;
}
