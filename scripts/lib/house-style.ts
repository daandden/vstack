// House style (ADR 0008): the replacement rows and rules of house-style.yaml, and how rows apply.
//   parseHouseStyle(doc, upstreams)  validate a parsed house-style.yaml
//   selectRows(rows, filter)         the rows that apply to one text (use, Upstreams, Disposition)
//   applyRows(text, rows)            run rows over a text in list order
//   findRow(text, row)               where a row's `from` still matches
//   inScope(scope, disposition)      the one place that says which Dispositions a scope covers

export const MATCH_KINDS = ["literal", "name", "ref"] as const;
export const SCOPES = ["required", "adapted"] as const;
export const USES = ["update", "migration"] as const;

export type MatchKind = (typeof MATCH_KINDS)[number];
export type Scope = (typeof SCOPES)[number];
export type Use = (typeof USES)[number];
/** What a text is: a register Disposition (reject ships nothing) or a vstack original. */
export type TextDisposition = "adopt" | "adapt" | "merge" | "original";

export interface Replacement {
  id: string;
  from: string;
  to: string;
  match: MatchKind;
  /** An Upstream key, or `any`. */
  upstream: string;
  /** Absent on migration-only rows. */
  scope?: Scope;
  uses: Use[];
}

export interface Rule {
  id: string;
  scope: Scope;
  text: string;
  lint?: string;
  /** The only skills a form may appear in (headless-run, spawn-vocab). */
  allowlist?: string[];
  /** ask-tool's phrase list. */
  phrases?: string[];
}

export interface HouseStyle {
  replacements: Replacement[];
  rules: Rule[];
}

/** One bad row or rule; `id` is its id (or `replacements[i]` / `rules[i]`). Bad entries are left out of the result. */
export interface HouseStyleProblem {
  id: string;
  message: string;
}

export class HouseStyleError extends Error {}

/** Rule ids check-register lints; each has to be present so its scope is known. */
export const LINTED_RULES = ["skill-ref", "spawn-vocab", "fan-out", "single-spawn", "headless-run", "worktree-cmd", "tmp-path", "ask-tool"] as const;

/**
 * Whether text with Disposition `d` follows a row or rule of `scope`. required: every shipped text, adopt
 * included. adapted: adapt, merge, and original text. No scope (migration-only rows): no shipped text.
 */
export function inScope(scope: Scope | undefined, d: TextDisposition): boolean {
  if (scope === "required") return true;
  if (scope === "adapted") return d !== "adopt";
  return false;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A global regex that matches exactly the part of a text the row replaces. */
export function rowRegex(row: Pick<Replacement, "from" | "match">): RegExp {
  const f = escape(row.from);
  switch (row.match) {
    case "literal":
      return new RegExp(f, "g");
    case "name":
      return new RegExp(`(?<![\\w-])${f}(?![\\w-])`, "g");
    case "ref":
      // /x (a slash command, not a path segment), `x`, **x**, skill://x; only the name itself is replaced.
      return new RegExp(`(?:(?<=(?:^|[^\\w./:~-])/)${f}(?![\\w/-])|(?<=\`)${f}(?=\`)|(?<=\\*\\*)${f}(?=\\*\\*)|(?<=skill://)${f}(?![\\w-]))`, "gm");
  }
}

/** Offsets where the row's `from` matches in `text`. */
export function findRow(text: string, row: Pick<Replacement, "from" | "match">): number[] {
  return [...text.matchAll(rowRegex(row))].map((m) => m.index!);
}

/** Runs the rows over the text one after another, in the given order. */
export function applyRows(text: string, rows: readonly Replacement[]): string {
  return rows.reduce((t, row) => t.replace(rowRegex(row), () => row.to), text);
}

export interface RowFilter {
  /** Only rows whose `uses` include this. */
  use?: Use;
  /** The Upstreams of the register rows behind the text. Absent: every Upstream (an original). */
  upstreams?: readonly string[];
  /** Only rows whose scope covers this Disposition (see inScope). */
  disposition?: TextDisposition;
  /** For originals: skill names vstack ships; a row whose `from` is one of them is skipped. */
  shippedNames?: ReadonlySet<string>;
}

/** The rows that apply to one text, in list order. */
export function selectRows(rows: readonly Replacement[], f: RowFilter): Replacement[] {
  const original = f.disposition === "original" || f.upstreams === undefined;
  return rows.filter(
    (r) =>
      (f.use === undefined || r.uses.includes(f.use)) &&
      (f.upstreams === undefined || r.upstream === "any" || f.upstreams.includes(r.upstream)) &&
      (f.disposition === undefined || inScope(r.scope, f.disposition)) &&
      !(original && f.shippedNames?.has(r.from)),
  );
}

const str = (v: unknown) => typeof v === "string" && v !== "";
const strList = (v: unknown) => Array.isArray(v) && v.every(str);

/** Validates replacement rows, including the shipped Migration copy. */
export function parseReplacements(doc: any, upstreams: ReadonlySet<string>): { replacements: Replacement[]; problems: HouseStyleProblem[] } {
  if (!Array.isArray(doc?.replacements)) throw new HouseStyleError("missing replacements: list");
  const problems: HouseStyleProblem[] = [];
  const replacements: Replacement[] = [];
  const ids = new Set<string>();

  doc.replacements.forEach((r: any, i: number) => {
    const id = str(r?.id) ? (r.id as string) : `replacements[${i}]`;
    const bad: string[] = [];
    if (!str(r?.id)) bad.push("id is missing");
    else if (ids.has(id)) bad.push("id is used by an earlier row");
    if (!str(r?.from)) bad.push("from is missing");
    if (typeof r?.to !== "string") bad.push("to is missing");
    if (!(MATCH_KINDS as readonly string[]).includes(r?.match)) bad.push(`match ${JSON.stringify(r?.match)} is not one of ${MATCH_KINDS.join(", ")}`);
    if (r?.upstream !== "any" && !upstreams.has(r?.upstream)) bad.push(`upstream ${JSON.stringify(r?.upstream)} is not any or a key in pins.yaml`);
    const uses = Array.isArray(r?.uses) ? r.uses : [];
    if (uses.length === 0 || !uses.every((u: unknown) => (USES as readonly unknown[]).includes(u)) || new Set(uses).size !== uses.length) {
      bad.push(`uses ${JSON.stringify(r?.uses)} is not a list of distinct ${USES.join(", ")}`);
    }
    const migrationOnly = uses.length === 1 && uses[0] === "migration";
    if (r?.scope === undefined) {
      if (!migrationOnly) bad.push("scope is missing (only migration-only rows omit it)");
    } else if (!(SCOPES as readonly unknown[]).includes(r.scope)) bad.push(`scope ${JSON.stringify(r.scope)} is not one of ${SCOPES.join(", ")}`);
    else if (migrationOnly) bad.push("a migration-only row has no scope");
    if (str(r?.id)) ids.add(id);
    if (bad.length > 0) return problems.push(...bad.map((message) => ({ id, message })));

    const row: Replacement = { id, from: r.from, to: r.to, match: r.match, upstream: r.upstream, uses: [...uses] };
    if (r.scope !== undefined) row.scope = r.scope;
    // A row whose `from` an earlier row rewrites never matches: the earlier row changed the text first.
    const shadow = replacements.find((e) => findRow(row.from, e).length > 0);
    if (shadow) return problems.push({ id, message: `row ${shadow.id} (earlier) rewrites this row's from, so it never matches; move it above ${shadow.id}` });
    replacements.push(row);
  });

  return { replacements, problems };
}

/** Validates both lists of the root House style. */
export function parseHouseStyle(doc: any, upstreams: ReadonlySet<string>): { houseStyle: HouseStyle; problems: HouseStyleProblem[] } {
  const { replacements, problems } = parseReplacements(doc, upstreams);
  if (!Array.isArray(doc?.rules)) throw new HouseStyleError("missing rules: list");
  const rules: Rule[] = [];
  const ruleIds = new Set<string>();
  doc.rules.forEach((r: any, i: number) => {
    const id = str(r?.id) ? (r.id as string) : `rules[${i}]`;
    const bad: string[] = [];
    if (!str(r?.id)) bad.push("id is missing");
    else if (ruleIds.has(id)) bad.push("id is used by an earlier rule");
    if (!(SCOPES as readonly unknown[]).includes(r?.scope)) bad.push(`scope ${JSON.stringify(r?.scope)} is not one of ${SCOPES.join(", ")}`);
    if (!str(r?.text)) bad.push("text is missing");
    if (r?.lint !== undefined && !str(r.lint)) bad.push("lint is not text");
    if (r?.allowlist !== undefined && !strList(r.allowlist)) bad.push("allowlist is not a list of skill names");
    if (r?.phrases !== undefined && !(strList(r.phrases) && r.phrases.length > 0)) bad.push("phrases is not a non-empty list of phrases");
    if (id === "ask-tool" && r?.phrases === undefined) bad.push("ask-tool needs its phrases");
    if (str(r?.id)) ruleIds.add(id);
    if (bad.length > 0) return problems.push(...bad.map((message) => ({ id, message })));
    const rule: Rule = { id, scope: r.scope, text: r.text };
    if (r.lint !== undefined) rule.lint = r.lint;
    if (r.allowlist !== undefined) rule.allowlist = [...r.allowlist];
    if (r.phrases !== undefined) rule.phrases = [...r.phrases];
    rules.push(rule);
  });
  for (const id of LINTED_RULES) {
    if (!ruleIds.has(id)) problems.push({ id, message: "rule is missing; check-register lints it and needs its scope" });
  }
  return { houseStyle: { replacements, rules }, problems };
}
