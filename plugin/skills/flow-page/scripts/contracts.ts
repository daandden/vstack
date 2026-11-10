import { isObj, Refusal, VISUAL_KINDS, type Obj } from "./fields.ts";

export type Diagnostic = { code: string; path: string; message: string; allowed?: readonly unknown[] | string };
export type Contract = {
  type: "object" | "array" | "string" | "number" | "boolean" | "literal" | "union" | "record" | "unknown";
  purpose?: string;
  fields?: Record<string, Contract>;
  required?: readonly string[];
  oneOf?: readonly string[];
  items?: Contract;
  min?: number;
  max?: number;
  integer?: boolean;
  values?: readonly unknown[];
  variants?: Record<string, Contract>;
  discriminator?: string;
  select?: (value: Obj) => Contract;
  expected?: string;
  check?: (value: Obj, path: string) => Diagnostic[];
};
const string: Contract = { type: "string" };
const number: Contract = { type: "number" };
const boolean: Contract = { type: "boolean" };
const enumeration = (...values: unknown[]): Contract => ({ type: "literal", values });
const array = (items: Contract, min = 1, max?: number): Contract => ({ type: "array", items, min, ...(max === undefined ? {} : { max }) });
const strings: Contract = { ...array(string), expected: "array of non-empty strings" };
const unknown: Contract = { type: "unknown", expected: "field value checked against the target Result" };
const object = (fields: Record<string, Contract>, required = Object.keys(fields)): Contract => ({ type: "object", fields, required });
const union = (variants: Record<string, Contract>, discriminator?: string): Contract => ({ type: "union", variants, ...(discriminator ? { discriminator } : {}) });
const optional = (required: Record<string, Contract>, extra: Record<string, Contract> = {}) => object({ ...required, ...extra }, Object.keys(required));
const ref = string;
const figure = union({ attachment: optional({ attachment: ref }, { kind: enumeration(...Object.keys(VISUAL_KINDS).filter(k => k !== "prose")) }), text: optional({ text: string }, { kind: enumeration(...Object.keys(VISUAL_KINDS).filter(k => k !== "prose")) }) });
const canonical = union({ file: object({ file: string }), commit: object({ commit: string }), tracker: object({ tracker: string, revision: string }) });
const axes = array(optional({ axis: enumeration("standards", "spec", "blast-radius"), status: enumeration("findings", "clean", "skipped", "unavailable", "blocked") }, { reason: string }));
const card = optional({ title: string, label: string, blocking: boolean, impact: string, action: string, evidence: string }, { ref });
const entryContracts: Record<string, Contract> = {
  cards: card,
  review: optional({ ...card.fields!, axis: enumeration("standards", "spec", "blast-radius"), location: string }, {}),
  ledger: optional({ claim: string, status: enumeration("confirmed", "cleared", "unproven"), evidence: string, missing_proof: string, consequence: string }, { ref }),
  table: optional({ cells: { ...array({ type: "string", expected: "string" }, 0) } }, { ref }),
  code: { ...optional({ file: string }, { ref, line: { ...number, integer: true, min: 1 }, revision: string, language: string, code: string, diff: string, note: string }), oneOf: ["code", "diff"] },
  timeline: optional({ title: string, outcome: enumeration("succeeded", "failed", "blocked", "skipped", "unknown", "noted") }, { ref, time: string, detail: string, evidence: string, attachments: strings }),
};
entryContracts.review.required = [...card.required!, "axis", "location"];
const block = union({ prose: object({ prose: string }), list: optional({ list: strings }, { ordered: boolean }), steps: object({ steps: array(object({ title: string, text: string })) }), code: optional({ code: string }, { language: string, source: string }), figure: object({ figure: ref }) });
const uncertainty = union({ plusminus: object({ plusminus: { ...number, min: 0 }, of: string }), low: object({ low: number, high: number, of: string }) });
const points = array(object({ x: number, y: number }));
const measuredValue = optional({ series: ref }, {
  value: number, points,
  samples: { type: "union", variants: { count: { ...number, integer: true, min: 1 }, raw: array(number) }, expected: "positive integer count or non-empty array of finite numbers" },
  uncertainty,
});
const missingMeasurement = object({ series: ref, missing: string });
const measured: Contract = { type: "union", variants: { measured: measuredValue, missing: missingMeasurement }, select: value => value.missing !== undefined ? missingMeasurement : measuredValue };
const measurement = optional({ ref, name: string, unit: string, values: array(measured) }, {
  chart: enumeration("line", "scatter", "histogram"), better: enumeration("lower", "higher"), verdict: enumeration("better", "worse", "no-difference", "inconclusive"),
});
measurement.check = (value, path) => {
  if (!Array.isArray(value.values)) return [];
  if (value.chart !== undefined && value.values.every(v => isObj(v) && v.missing !== undefined)) {
    return [{ code: "invalid_chart_data", path: `${path}.values`, message: "a chart needs at least one measured series", allowed: "at least one series with chart data" }];
  }
  return value.values.flatMap((v, i): Diagnostic[] => {
    if (!isObj(v) || v.missing !== undefined) return [];
    const at = `${path}.values[${i}]`;
    const diagnostics: Diagnostic[] = [];
    const require = (field: string, expected: string) => {
      if (v[field] === undefined) diagnostics.push({ code: "required_field", path: `${at}.${field}`, message: `needs ${field}`, allowed: expected });
    };
    if (value.chart === "line" || value.chart === "scatter") {
      require("points", "non-empty array of { x: number, y: number }");
      if (Array.isArray(v.samples)) diagnostics.push({ code: "invalid_type", path: `${at}.samples`, message: "point charts use a sample count", allowed: "positive integer" });
    } else if (value.chart === "histogram") {
      require("samples", "non-empty array of finite numbers");
      if (v.samples !== undefined && !Array.isArray(v.samples)) diagnostics.push({ code: "invalid_type", path: `${at}.samples`, message: "histograms need raw samples", allowed: "non-empty array of finite numbers" });
      if (v.points !== undefined) diagnostics.push({ code: "invalid_value", path: `${at}.points`, message: "histograms use samples, not points", allowed: "omit points" });
    } else if (value.chart === undefined) {
      require("value", "finite number");
      if (v.points !== undefined) diagnostics.push({ code: "invalid_value", path: `${at}.points`, message: "points need a line or scatter chart", allowed: ["line", "scatter"] });
      if (Array.isArray(v.samples)) diagnostics.push({ code: "invalid_type", path: `${at}.samples`, message: "scalar measurements use a sample count", allowed: "positive integer" });
    }
    return diagnostics;
  });
};
const condition: Contract = { type: "union", select: value => condition.variants!["all" in value ? "all" : "any" in value ? "any" : "not" in value ? "not" : "value"] };
const literal: Contract = { type: "union", variants: { string: { type: "string", expected: "string" }, number, boolean }, expected: "string, finite number, or boolean" };
condition.variants = { all: object({ all: array(condition) }), any: object({ any: array(condition) }), not: object({ not: condition }), value: optional({ value: ref }, Object.fromEntries(["eq", "ne", "lt", "le", "gt", "ge"].map(k => [k, literal]))) };
const effect: Contract = { type: "union", variants: { add: object({ add: number }), toggle: object({ toggle: enumeration(true) }), literal }, select: value => effect.variants!["add" in value ? "add" : "toggle"] };
const demo = optional({
  states: array(optional({ name: ref, label: string }, { description: string }), 1, 32), start: ref,
  actions: array(object({ name: ref, label: string, transitions: array(optional({}, { from: strings, when: condition, to: ref, set: { type: "record", items: effect, min: 1 } }), 1, 16) }), 1, 32),
}, { values: array(object({ name: ref, label: string, initial: literal }), 1, 16) });
const quizAnswer = union({ choice: object({ choice: ref }), text: optional({ text: strings }, { case_sensitive: boolean }), number: optional({ number }, { tolerance: { ...number, min: 0 } }) });
const shared = { ref, summary: string, attachments: strings, canonical, revises: ref };
const result = (purpose: string, fields: Record<string, Contract>, extra: Record<string, Contract> = {}): Contract => ({ ...optional({ kind: enumeration("result"), shape: string, title: string, ...fields }, { ...shared, ...extra }), purpose });

export const resultContracts: Record<string, Contract> = {
  cards: result("Present findings or actions as individual cards.", { entries: array(entryContracts.cards) }),
  ledger: result("Track claims, evidence, missing proof, and consequences.", { entries: array(entryContracts.ledger) }),
  table: result("Compare rows under shared columns.", { columns: array({ ...union({ text: string, column: optional({ label: string }, { type: enumeration("text", "number", "status") }) }), expected: "string or column object" }), rows: array(entryContracts.table) }),
  document: result("Explain a topic in ordered sections with text, code, and figures.", { sections: array(object({ heading: string, blocks: array(block) })) }, { citations: array(object({ ref, source: string })), limitations: strings, sources: strings }),
  prototype: { ...result("Let readers try a state demo or a captured runnable artifact.", {}, { demo, artifact: ref }), oneOf: ["demo", "artifact"] },
  comparison: result("Assess alternatives against criteria and record a verdict.", { alternatives: array(optional({ ref, name: string }, { summary: string, attachments: strings }), 2), criteria: array(optional({ ref, name: string }, { description: string })), assessments: array(optional({ alternative: ref, criterion: ref, finding: string }, { evidence: string })), verdict: optional({ outcome: enumeration("chosen", "tie", "inconclusive"), reason: string }, { alternative: ref }) }),
  metrics: result("Report measured values, baselines, and uncertainty.", { workload: string, outcome: string, series: array(optional({ ref, label: string }, { baseline: enumeration(true) })), measurements: array(measurement) }, { environment: string }),
  code: result("Show source excerpts or unified diffs with file locations.", { entries: array(entryContracts.code) }),
  timeline: result("Record events and their outcomes in publication order.", { entries: array(entryContracts.timeline) }),
  quiz: result("Check understanding with choice, text, or numeric questions.", { questions: array(optional({ ref, prompt: string, answer: quizAnswer, explanation: string }, { choices: array(object({ ref, label: string })) })) }),
  review: result("Report standards, spec, and blast-radius review findings.", { axes, entries: array(entryContracts.review, 0) }),
};
for (const [shape, contract] of Object.entries(resultContracts)) contract.fields!.shape = enumeration(shape);
resultContracts.table.check = (value, path) => {
  if (!Array.isArray(value.columns) || !Array.isArray(value.rows)) return [];
  const width = value.columns.length;
  return value.rows.flatMap((row, index) => isObj(row) && Array.isArray(row.cells) && row.cells.length !== width
    ? [{ code: "invalid_length", path: `${path}.rows[${index}].cells`, message: `cells must list ${width} strings, one per column`, allowed: `${width} strings, one per column` }] : []);
};

const question = optional({ title: string, description: string, needs: array(object({ need: string, kind: enumeration(...Object.keys(VISUAL_KINDS)) })), options: array(optional({ label: string, does: string, gains: strings, costs: strings }, { recommended: string, preview: figure }), 1, 26) }, { ref, again: ref, reopens: ref, today: array(object({ text: string, source: string })), terms: array(object({ term: string, text: string })), topics: strings, results: strings, example: string, figures: array(figure), multi: boolean });
const attachmentFields = { kind: enumeration("attachment"), type: enumeration("image", "video", "svg", "mermaid", "file", "trace", "evidence"), caption: string, origin: string };
const attachment = optional(attachmentFields, { ref, description: string, path: string, unavailable: string });
const mermaid = optional({ ...attachmentFields, type: enumeration("mermaid") }, { ref, description: string, path: string, unavailable: string, focus: strings });
const artifact = optional({ ...attachmentFields, type: enumeration("artifact"), launch: string, revision: string }, { ref, description: string, url: string, runtime: enumeration("html", "local-app", "terminal"), bundle: object({ entry: string, files: array(object({ path: string, source: string })) }), unavailable: string });
const taskStates = enumeration("pending", "active", "done", "skipped", "inapplicable");
const checkOutcomes = enumeration("passed", "failed", "pending");
const prStates = enumeration("open", "merged", "closed");
const item = (fields: Record<string, Contract>, extra: Record<string, Contract> = {}) => optional({ kind: string, ...fields }, extra);
const update = (key: string, create: Contract, edit: Contract): Contract => ({ type: "object", select: value => value[key] === undefined ? create : edit });
export const contributionKinds: Record<string, Contract> = {
  background: item({ title: string, summary: string, sections: array(object({ heading: string, body: string })), sources: strings }, { figures: array(figure) }),
  topic: item({ title: string, summary: string, body: string, sources: strings }, { ref }),
  attachment: { type: "object", select: value => value.type === "artifact" ? artifact : value.type === "mermaid" ? mermaid : attachment },
  result: union(resultContracts, "shape"),
  revise: item({ result: ref }, { base: { ...number, integer: true, min: 1 }, set: { type: "record", items: unknown }, add: array({ type: "record", items: unknown }) }),
  assumed: item({ decision: string, pick: string, why: string }, { ref }),
  round: item({ questions: array(question) }),
  answer: item({ question: ref, response: optional({ status: enumeration("answered", "empty", "cancelled", "timed-out", "headless") }, { picks: strings, text: string, note_on: string }) }, { reading: { type: "object", select: value => value.outcome === "resolved" ? optional({ outcome: enumeration("resolved"), decision: string, basis: string }, { maps_to: string }) : object({ outcome: enumeration("question", "concern", "ambiguous"), unresolved: string }) } }),
  close: item({ decisions: array(object({ question: ref, text: string }), 0) }, { extra: strings }),
  stage: item({ state: enumeration("finished") }, { retire: array(object({ question: ref, reason: string })) }),
  task: update("task", item({ title: string }, { ref, state: taskStates, evidence: strings, reason: string }), item({ task: ref }, { state: taskStates, evidence: strings, reason: string })),
  blocker: update("blocker", item({ text: string }, { ref, tasks: strings }), item({ blocker: ref, resolved: string })),
  "end-state": item({}, { requested: enumeration("commit", "merge-ready", "shipped", "none"), reached: enumeration("commit", "merge-ready", "shipped"), evidence: strings }),
  pr: update("pr", item({ url: string, state: prStates }, { ref, title: string }), item({ pr: ref, state: prStates })),
  check: update("check", item({ name: string, outcome: checkOutcomes }, { ref, evidence: strings }), item({ check: ref, outcome: checkOutcomes }, { evidence: strings })),
};
export const contributionContract = object({ version: enumeration(1), items: array(union(contributionKinds, "kind")) });
const fieldPath = (path: string, key: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;

export function contractDiagnostics(input: unknown): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const visit = (value: unknown, contract: Contract, path: string): void => {
    const report = (code: string, message: string, allowed?: Diagnostic["allowed"]) => diagnostics.push({ code, path, message, ...(allowed === undefined ? {} : { allowed }) });
    if (contract.type === "unknown") return;
    if (contract.select) {
      if (!isObj(value)) {
        if (contract === effect) { visit(value, literal, path); return; }
        report("invalid_type", "must be an object", "object"); return;
      }
      visit(value, contract.select(value), path);
      return;
    }
    if (contract.type === "union") {
      const variants = contract.variants!;
      if (contract.discriminator) {
        if (!isObj(value)) { report("invalid_type", "must be an object", "object"); return; }
        const key = value[contract.discriminator];
        if (typeof key !== "string" || !Object.hasOwn(variants, key)) {
          diagnostics.push({ code: "invalid_enum", path: fieldPath(path, contract.discriminator), message: `${contract.discriminator} must be one of ${Object.keys(variants).join(", ")}, got ${JSON.stringify(key)}`, allowed: Object.keys(variants) });
          return;
        }
        visit(value, variants[key], path);
      } else if (contract.expected) {
        const candidates = Object.values(variants);
        const chosen = candidates.find(c => c.type === typeof value || (isObj(value) && c.type === "object" && Object.keys(c.fields ?? {}).some(k => k in value)) || (Array.isArray(value) && c.type === "array"));
        if (chosen) visit(value, chosen, path);
        else report("invalid_type", `must be ${contract.expected}`, contract.expected);
      } else {
        const keys = isObj(value) ? Object.keys(variants).filter(k => value[k] !== undefined) : [];
        if (keys.length !== 1) { report("invalid_union", `must have exactly one of ${Object.keys(variants).join(", ")}`, Object.keys(variants)); return; }
        visit(value, variants[keys[0]], path);
      }
      return;
    }
    if (contract.type === "literal") {
      if (!contract.values!.includes(value)) report("invalid_enum", `must be one of ${contract.values!.map(v => JSON.stringify(v)).join(", ")}, got ${JSON.stringify(value)}`, contract.values);
      return;
    }
    if (contract.type === "object" || contract.type === "record") {
      if (!isObj(value)) { report("invalid_type", "must be an object", "object"); return; }

      if (contract.type === "record") {
        if (contract.min && Object.keys(value).length < contract.min) report("too_few_items", "must name one or more fields", "one or more fields");
        for (const [key, v] of Object.entries(value)) visit(v, contract.items!, fieldPath(path, key));
        return;
      }
      for (const key of Object.keys(value)) if (!Object.hasOwn(contract.fields!, key)) diagnostics.push({ code: "unknown_field", path: fieldPath(path, key), message: `${key} is not a field here; the fields are ${Object.keys(contract.fields!).join(", ")}`, allowed: Object.keys(contract.fields!) });
      if (contract.oneOf && contract.oneOf.filter(key => value[key] !== undefined).length !== 1) report("invalid_union", `must have exactly one of ${contract.oneOf.join(" or ")}`, contract.oneOf);
      for (const key of contract.required!) if (value[key] === undefined) diagnostics.push({ code: "required_field", path: fieldPath(path, key), message: `needs ${key}`, allowed: contract.fields![key].expected ?? contract.fields![key].values ?? contract.fields![key].type });
      for (const [key, c] of Object.entries(contract.fields!)) if (value[key] !== undefined) visit(value[key], c, fieldPath(path, key));
      diagnostics.push(...(contract.check?.(value, path) ?? []));
      return;
    }
    if (contract.type === "array") {
      if (!Array.isArray(value)) { report("invalid_type", `must be ${contract.expected ?? "an array"}`, contract.expected ?? "array"); return; }
      if (value.length < (contract.min ?? 0)) report("too_few_items", `must be an array with at least ${contract.min} items`, contract.min === 1 ? "one or more items" : `at least ${contract.min} items`);
      if (contract.max !== undefined && value.length > contract.max) report("too_many_items", `must have at most ${contract.max} items`, `at most ${contract.max} items`);
      value.forEach((v, i) => visit(v, contract.items!, `${path}[${i}]`));
      return;
    }
    if (typeof value !== contract.type || (contract.type === "number" && !Number.isFinite(value))) { report("invalid_type", `must be ${contract.expected ?? contract.type}`, contract.expected ?? (contract.type === "number" ? "finite number" : contract.type)); return; }
    if (contract.type === "string" && contract.expected !== "string" && !(value as string).trim()) report("invalid_value", "must be a non-empty string", "non-empty string");
    if (contract.type === "number") {
      if (contract.integer && !Number.isInteger(value)) report("invalid_value", "must be a whole number", "integer");
      if (contract.min !== undefined && (value as number) < contract.min) report("out_of_range", `must be ${contract.min} or more`, `number >= ${contract.min}`);
    }
  };
  visit(input, contributionContract, "$");
  return diagnostics;
}
export class ContributionRefusal extends Refusal {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(d => {
      const location = [...d.path.matchAll(/\.([a-z]+)\[(\d+)\]/g)].map(([, key, index]) => `${key === "entries" ? "entry" : key === "add" ? "add" : key.endsWith("s") ? key.slice(0, -1) : key} ${Number(index) + 1}`).join(": ");
      return `${d.code} ${d.path}${location ? ` (${location})` : ""}: ${d.message}`;
    }).join("\n"));
  }
}

const collectionNames: Record<string, string> = { item: "items", question: "questions", option: "options", entry: "entries", row: "rows", section: "sections", block: "blocks", step: "steps", citation: "citations", alternative: "alternatives", criterion: "criteria", assessment: "assessments", measurement: "measurements", value: "values", figure: "figures", decision: "decisions", axis: "axes", transition: "transitions", state: "states", action: "actions" };

export function contributionPath(input: unknown, where: string): string {
  let path = "$";
  let value = input;
  for (const part of where.split(": ")) {
    if (part === "contribution") continue;
    const indexed = /^(?:quiz )?([a-z-]+) (\d+)(?: \([^)]+\))?$/.exec(part);
    const named = /^([a-z-]+) ([a-z0-9-]+)$/.exec(part);
    const key = indexed ? (collectionNames[indexed[1]] ?? indexed[1]) : named ? (collectionNames[named[1]] ?? named[1]) : part;
    if (!isObj(value) || !Object.hasOwn(value, key)) break;
    value = value[key];
    path = fieldPath(path, key);
    if (indexed && Array.isArray(value)) {
      const index = Number(indexed[2]) - 1;
      path += `[${index}]`;
      value = value[index];
    } else if (named && Array.isArray(value)) {
      const index = value.findIndex(v => isObj(v) && v.name === named[2]);
      if (index < 0) break;
      path += `[${index}]`;
      value = value[index];
    } else if (named && isObj(value)) {
      path = fieldPath(path, named[2]);
      value = value[named[2]];
    }
  }
  return path;
}

export function refusalDiagnostic(error: unknown, input: unknown): Diagnostic {
  if (!(error instanceof Refusal)) throw error;
  const location = error.location;
  let path = location ? contributionPath(input, location.where) : "$";
  if (location?.field) path = fieldPath(path, location.field);
  return { code: "invalid_value", path, message: error.message, ...(location?.allowed === undefined ? {} : { allowed: location.allowed }) };
}
