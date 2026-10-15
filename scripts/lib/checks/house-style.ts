// House style lints (ADR 0008; spec #63 "Register check"). Which Dispositions each lint covers comes from the
// scope of its row or rule in house-style.yaml, through house-style.ts `inScope`/`selectRows`:
// - house-style-leftover: a row's `from` still in text its row covers (adopt: required rows only).
// - skill-ref, spawn-vocab, worktree-cmd, tmp-path: adapted rules (adapt, merge, and original text).
// - fan-out, single-spawn, agent-spawns, headless-run: the spawn lints (ADR 0004, 0007), adapted rules too.
//   The forms they read are in plugin/skills/vstack-fan-out/FORMS.md.
// - ask-tool: a required rule, so adopt artifacts too.

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { findRow, inScope, selectRows, type Rule } from "../house-style.ts";
import { isHeld } from "../vstack-repo.ts";
import { isMarkdown, lintTargets, shippedSkillNames, type LintTarget, type TextFile } from "./scope.ts";
import type { Check, CheckContext, Failure } from "./types.ts";

export const HOUSE_STYLE_COPY = "plugin/skills/migrate-to-vstack/references/house-style.yaml";

interface Hit {
  path: string;
  line: number;
  excerpt: string;
}

const lineOf = (text: string, offset: number) => text.slice(0, offset).split("\n").length;
const excerpt = (s: string) => {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 100 ? `${t.slice(0, 97)}...` : t;
};

function summary(hits: Hit[]): string {
  const shown = hits.slice(0, 3).map((h) => `${h.path}:${h.line}: ${h.excerpt}`);
  return shown.join("; ") + (hits.length > 3 ? `; and ${hits.length - 3} more` : "");
}

/** Lines of a markdown file with their state: inside the frontmatter, inside a code fence. */
function* markdownLines(text: string): Generator<{ n: number; line: string; frontmatter: boolean; fence: boolean }> {
  const lines = text.split("\n");
  let frontmatter = lines[0] === "---";
  let fence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (frontmatter) {
      yield { n: i + 1, line, frontmatter: true, fence: false };
      if (i > 0 && line === "---") frontmatter = false;
      continue;
    }
    const marker = /^\s*(```|~~~)/.test(line);
    yield { n: i + 1, line, frontmatter: false, fence: fence || marker };
    if (marker) fence = !fence;
  }
}

function eachLine(files: TextFile[], onlyMarkdown: boolean, test: (line: string, file: TextFile) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    if (onlyMarkdown && !isMarkdown(f.path)) continue;
    f.text.split("\n").forEach((line, i) => {
      if (test(line, f)) hits.push({ path: f.path, line: i + 1, excerpt: excerpt(line) });
    });
  }
  return hits;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Every skill name a bare `/name` token could mean: shipped skills plus the Upstream names of kept skill and principle rows. */
function vstackSkillNames(ctx: CheckContext): string[] {
  const names = shippedSkillNames(ctx);
  for (const r of ctx.validRows) {
    if (r.disposition === "reject" || (r.kind !== "skill" && r.kind !== "principle")) continue;
    const p = isHeld(r) ? r.held_path : r.path;
    if (p) names.add(basename(p));
  }
  return [...names].sort((a, b) => b.length - a.length);
}

type RuleLint = (target: LintTarget, rule: Rule, ctx: CheckContext) => Hit[];

const SPAWN_TERMS = /subagent_type|generalPurpose|`Task`/;
const SPAWN_WORDS = /\b(?:spawn|spawns|spawned|spawning|(?:spin|spins|spinning|spun)\s+up)\b/i;
const DISPATCH_WORDS = /\bdispatch(?:es|ed|ing)?\b/i;
const DELEGATION_CONTEXT = /\b(?:sub[- ]?agents?|agents?|helpers?|workers?|explorers?|reviewers?|designers?|verifiers?|investigators?|runners?)\b/i;
const SPAWN_LINES = /Spawn one |Headless batch \(/;
const WORKTREE_ADD = /git(\s+-C\s+\S+)?\s+worktree\s+add\s+[^\s`'"]/;
const TMP_PATHS = [/\$\{?TMPDIR\}?\//, /(?<![\w.~/-])\/tmp(?![\w-])/, /\b(?:the\s+)?OS(?:'s)?\s+temp(?:orary)?\s+dir(?:ectory)?\b/i];
const NEGATION = /\b(?:don['’]t|do not|never|not)\s+$/i;

// Spawn forms (plugin/skills/vstack-fan-out/FORMS.md). Each form is one markdown line.
const FAN_OUT_MARK = /Fan-out (?:gate )?\(/;
const FAN_OUT_FORM = /Fan-out \(`?skill:\/\/vstack-fan-out`?\): parts: one per .+?\. One /;
const FAN_OUT_STOP = /If they cannot start(?: or isolation is off)?, stop: \S/;
const BRANCH = /^\s*(?:[-*+]|\d+[.)])\s+(fan-out|inline)\s*(?:→|->)/;
const HEADLESS = /Headless batch \(|\bomp\s+(?:-p|--print)\b/;
const VSTACK_ROOT = /the vstack root/;
const ISOLATED_ARGS = "isolated=True, apply=False, merge=False";
const NAMED_AGENT = /\bagent:\s*"([^"]*)"|\bagent\s*=\s*"([^"]*)"/g;
const SINGLE_SPAWN = /Spawn one `([^`]+)` via (?:`task` \(`agent: "([^"]*)"`\)|eval `agent\([^`]*?\bagent="([^"]*)"[^`]*\)`)/;
const SINGLE_STOP = /If it cannot be spawned, stop: \S/;
const SINGLE_SKIP = /If it cannot be spawned, skip it: \S/;
const SKIP_SITE = { artifact: "plugin/skills/compare-attempts", marker: "`cross-judge: not run`" };

/** Markdown lines outside code fences (and frontmatter, unless asked): a form quoted in a fence is an example, not a spawn. */
function proseLines(files: TextFile[], withFrontmatter = false): { path: string; n: number; line: string }[] {
  const out: { path: string; n: number; line: string }[] = [];
  for (const f of files) {
    if (!isMarkdown(f.path)) continue;
    for (const { n, line, frontmatter, fence } of markdownLines(f.text)) if (!fence && (withFrontmatter || !frontmatter)) out.push({ path: f.path, n, line });
  }
  return out;
}

function frontmatterOf(text: string): Record<string, unknown> | undefined {
  const m = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!m) return undefined;
  try {
    const v = Bun.YAML.parse(m[1]);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const agentCache = new WeakMap<CheckContext, Set<string>>();

/** The vstack agents: every agent the plugin ships, by its `name:` (else its file name). */
function vstackAgents(ctx: CheckContext): Set<string> {
  const hit = agentCache.get(ctx);
  if (hit) return hit;
  const names = new Set<string>();
  for (const a of ctx.pluginArtifacts) {
    if (!a.startsWith("plugin/agents/") || !a.endsWith(".md")) continue;
    let name: unknown;
    try {
      name = frontmatterOf(readFileSync(join(ctx.root, a), "utf8"))?.name;
    } catch {
      // unreadable: the file name stands in
    }
    names.add(typeof name === "string" && name.trim() ? name.trim() : basename(a, ".md"));
  }
  agentCache.set(ctx, names);
  return names;
}

/** Problems with the agents a line names through `agent: "x"` or `agent="x"`. */
function namedAgentProblems(line: string, agents: Set<string>): string[] {
  const names = [...line.matchAll(NAMED_AGENT)].map((m) => m[1] ?? m[2]);
  if (names.length === 0) return ["names no agent"];
  const bad = [...new Set(names.filter((n) => !agents.has(n)))];
  return bad.length > 0 ? [`names ${bad.map((n) => JSON.stringify(n)).join(", ")}, not a vstack agent`] : [];
}

/** What every subagent prompt carries (ADR 0007). */
function promptProblems(line: string): string[] {
  return VSTACK_ROOT.test(line) ? [] : ["does not pass the vstack root"];
}

function singleSpawnProblems(line: string, agents: Set<string>, artifact: string): string[] {
  const m = SINGLE_SPAWN.exec(line);
  if (!m) return ["a Spawn one line that is neither via `task` (`agent: \"…\"`) nor via eval `agent(…, agent=\"…\", …)`"];
  const out: string[] = [];
  const [, name, viaTask, viaEval] = m;
  const via = viaTask ?? viaEval;
  if (!agents.has(name)) out.push(`spawns ${JSON.stringify(name)}, not a vstack agent`);
  if (via !== name) out.push(`names ${JSON.stringify(name)} but passes agent ${JSON.stringify(via)}`);
  if (viaEval !== undefined && !line.includes(ISOLATED_ARGS)) out.push(`the eval form lacks ${ISOLATED_ARGS}`);
  if (SINGLE_SKIP.test(line)) {
    if (artifact !== SKIP_SITE.artifact || !line.includes(SKIP_SITE.marker)) out.push("ends `If it cannot be spawned, skip it: …`, which only compare-attempts' cross-judge may use");
  } else if (!SINGLE_STOP.test(line)) out.push("does not end `If it cannot be spawned, stop: …`");
  return [...out, ...promptProblems(line)];
}

function fanOutProblems(line: string, agents: Set<string>): string[] {
  if (line.includes("Fan-out gate (")) return ["the `Fan-out gate (` line of the removed judge-gated form; copy the Fan-out line in FORMS.md"];
  if (line.includes("Fan-out (always")) return ["the `Fan-out (always` line, removed with the judge-gated form; copy the Fan-out line in FORMS.md"];
  if (BRANCH.test(line)) return ["a fan-out or inline branch line of the removed judge-gated form; copy the Fan-out line in FORMS.md"];
  const out: string[] = [];
  if (!FAN_OUT_FORM.test(line)) out.push("does not start `Fan-out (skill://vstack-fan-out): parts: one per ….`");
  if (line.includes("One `task` call") && line.includes("`tasks[]`")) out.push(...namedAgentProblems(line, agents));
  else if (line.includes("One eval cell") && /\bagent\(/.test(line)) {
    out.push(...namedAgentProblems(line, agents));
    if (!line.includes(ISOLATED_ARGS)) out.push(`the eval batch lacks ${ISOLATED_ARGS}`);
    if (!line.includes("`wait()`")) out.push("the eval batch says neither `wait()` on all handles nor no `wait()`");
  } else out.push("is neither one `task` call with `tasks[]` nor one eval cell of `agent()` calls");
  if (!FAN_OUT_STOP.test(line)) out.push("does not end `If they cannot start, stop: …` or `If they cannot start or isolation is off, stop: …`");
  return [...out, ...promptProblems(line)];
}

const isFanOutLine = (line: string) => FAN_OUT_MARK.test(line) || BRANCH.test(line);

/** Lines a spawn lint flags, with the reasons in the excerpt. */
const flagged = (path: string, n: number, problems: string[], line: string): Hit => ({ path, line: n, excerpt: `${problems.join("; ")}: ${excerpt(line)}` });

function phraseRegex(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`(?<![\\w-])${body}${/\w$/.test(phrase.trim()) ? "(?![\\w-])" : ""}`, "gi");
}

interface Lint {
  /** The House style rule whose scope and allowlist the lint follows. */
  rule: string;
  run: RuleLint;
}

/** Every rule lint, keyed by failure class. */
const LINTS: Record<string, Lint> = {
  "skill-ref": {
    rule: "skill-ref",
    run: (t, _rule, ctx) => {
      const names = vstackSkillNames(ctx);
      if (names.length === 0) return [];
      const bare = new RegExp(`(?<![\\w.:/~>-])/(?:${names.map(escape).join("|")})(?![\\w/-])`);
      return eachLine(t.files, true, (line) => bare.test(line.replace(/\bomp(?:['’]s)?\s+(?:built-in|builtin)\s+`\/[a-z][\w-]*`/gi, "")));
    },
  },
  "spawn-vocab": {
    rule: "spawn-vocab",
    run: (t) =>
      proseLines(t.files)
        .filter(({ line }) => {
          if (SPAWN_TERMS.test(line)) return true;
          const wording = line.replace(/`[^`]*`/g, "");
          return !SPAWN_LINES.test(line) && !isFanOutLine(line) &&
            (SPAWN_WORDS.test(wording) || wording.split(/(?<=[.!?])\s+/).some((sentence) => DISPATCH_WORDS.test(sentence) && DELEGATION_CONTEXT.test(sentence)));
        })
        .map(({ path, n, line }) => ({ path, line: n, excerpt: excerpt(line) })),
  },
  "fan-out": {
    rule: "fan-out",
    run: (t, _rule, ctx) => {
      const agents = vstackAgents(ctx);
      const hits: Hit[] = [];
      for (const { path, n, line } of proseLines(t.files)) {
        if (!isFanOutLine(line)) continue;
        const problems = fanOutProblems(line, agents);
        if (problems.length > 0) hits.push(flagged(path, n, problems, line));
      }
      return hits;
    },
  },
  "single-spawn": {
    rule: "single-spawn",
    run: (t, _rule, ctx) => {
      const agents = vstackAgents(ctx);
      const hits: Hit[] = [];
      for (const { path, n, line } of proseLines(t.files)) {
        if (isFanOutLine(line)) continue;
        let problems: string[];
        if (line.includes("Spawn one ")) problems = singleSpawnProblems(line, agents, t.artifact);
        else {
          problems = [...line.matchAll(NAMED_AGENT)].length > 0 ? namedAgentProblems(line, agents) : [];
          if (/\bagent\(/.test(line) && !/\bagent\s*=\s*"/.test(line)) problems.push("an eval `agent()` call that names no agent");
          if (/via `task`|`task` call|`tasks\[\]`/.test(line) && !/\bagent:\s*"/.test(line)) problems.push("a `task` call that names no agent");
        }
        if (problems.length > 0) hits.push(flagged(path, n, problems, line));
      }
      return hits;
    },
  },
  "agent-spawns": {
    rule: "single-spawn",
    run: (t, _rule, ctx) => {
      if (!t.artifact.startsWith("plugin/agents/")) return [];
      const agents = vstackAgents(ctx);
      const hits: Hit[] = [];
      for (const f of t.files) {
        if (!isMarkdown(f.path)) continue;
        const spawns = frontmatterOf(f.text)?.spawns;
        if (spawns === undefined || spawns === null) continue;
        const names = (Array.isArray(spawns) ? spawns.map(String) : String(spawns).split(",")).map((s) => s.trim()).filter(Boolean);
        const bad = names.filter((s) => s === "*" || !agents.has(s));
        if (bad.length === 0) continue;
        const n = f.text.split("\n").findIndex((l) => /^spawns:/.test(l)) + 1;
        hits.push({ path: f.path, line: n, excerpt: `spawns: lists ${bad.map((s) => JSON.stringify(s)).join(", ")}, not a vstack agent` });
      }
      return hits;
    },
  },
  "headless-run": {
    rule: "headless-run",
    run: (t) => proseLines(t.files).filter(({ line }) => HEADLESS.test(line)).map(({ path, n, line }) => flagged(path, n, ["a Headless run"], line)),
  },
  "worktree-cmd": { rule: "worktree-cmd", run: (t) => eachLine(t.files, false, (line) => WORKTREE_ADD.test(line)) },
  "tmp-path": { rule: "tmp-path", run: (t) => eachLine(t.files, false, (line) => !line.includes("mktemp") && TMP_PATHS.some((r) => r.test(line))) },
  "ask-tool": {
    rule: "ask-tool",
    run: (t, rule) => {
      const phrases = (rule.phrases ?? []).map(phraseRegex);
      const hits: Hit[] = [];
      for (const f of t.files) {
        if (!isMarkdown(f.path)) continue;
        for (const { n, line, frontmatter, fence } of markdownLines(f.text)) {
          if (frontmatter || fence) continue;
          for (const sentence of line.split(/(?<=[.!?])\s+/)) {
            if (sentence.includes("`ask`")) continue;
            const asks = phrases.some((re) => [...sentence.matchAll(re)].some((m) => !NEGATION.test(sentence.slice(0, m.index))));
            if (asks) hits.push({ path: f.path, line: n, excerpt: excerpt(sentence) });
          }
        }
      }
      return hits;
    },
  },
};

export const houseStyleChecks: Check = {
  classes: ["invalid-house-style", "house-style-leftover", ...Object.keys(LINTS)],
  async run(ctx) {
    const out: Failure[] = ctx.houseStyleProblems.map((p) => ({ class: "invalid-house-style", item: `house-style.yaml:${p.id}`, message: p.message }));
    const shipped = shippedSkillNames(ctx);
    const rules = new Map(ctx.houseStyle.rules.map((r) => [r.id, r]));

    for (const t of lintTargets(ctx)) {
      const rows = selectRows(ctx.houseStyle.replacements, { upstreams: t.upstreams, disposition: t.disposition, shippedNames: shipped });
      for (const row of rows) {
        const hits: Hit[] = [];
        for (const f of t.files) {
          if (f.path === HOUSE_STYLE_COPY) continue;
          for (const at of findRow(f.text, row)) {
            const n = lineOf(f.text, at);
            hits.push({ path: f.path, line: n, excerpt: excerpt(f.text.split("\n")[n - 1]) });
          }
        }
        if (hits.length > 0) {
          out.push({ class: "house-style-leftover", item: t.item, message: `row ${row.id} (${JSON.stringify(row.from)} → ${JSON.stringify(row.to)}) still matches: ${summary(hits)}` });
        }
      }

      for (const [cls, lint] of Object.entries(LINTS)) {
        const rule = rules.get(lint.rule);
        if (!rule || !inScope(rule.scope, t.disposition)) continue; // a missing rule is an invalid-house-style failure
        if (rule.allowlist?.some((name) => t.artifact === `plugin/skills/${name}`)) continue; // the form is allowed in these skills
        const hits = lint.run(t, rule, ctx);
        if (hits.length > 0) out.push({ class: cls, item: t.item, message: `${t.disposition} text breaks ${lint.rule}: ${summary(hits)}` });
      }
    }
    return out;
  },
};
