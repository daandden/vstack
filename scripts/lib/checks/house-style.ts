// House style lints (ADR 0008; spec #63 "Register check"). Which Dispositions each lint covers comes from the
// scope of its row or rule in house-style.yaml, through house-style.ts `inScope`/`selectRows`:
// - house-style-leftover: a row's `from` still in text its row covers (adopt: required rows only).
// - skill-ref, spawn-vocab, worktree-cmd, tmp-path: adapted rules (adapt, merge, and original text).
// - ask-tool: a required rule, so adopt artifacts too.

import { basename } from "node:path";
import { findRow, inScope, selectRows, type Rule } from "../house-style.ts";
import { isHeld } from "../vstack-repo.ts";
import { isMarkdown, lintTargets, shippedSkillNames, type LintTarget, type TextFile } from "./scope.ts";
import type { Check, CheckContext, Failure } from "./types.ts";

/** setup-vstack's copy of the migration rows holds every `from` on purpose; the old-phrase scan skips it. */
export const HOUSE_STYLE_COPY = "plugin/skills/setup-vstack/references/house-style.yaml";

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
const SPAWN_WORDS = /\b(?:spawn|spawns|spawned|spawning|dispatch|dispatches|dispatched|dispatching|(?:spin|spins|spinning|spun)\s+up)\b/i;
const SPAWN_LINES = ["Spawn one ", "Fan-out gate (", "Fan-out (always", "Headless batch ("];
const WORKTREE_ADD = /git(\s+-C\s+\S+)?\s+worktree\s+add\s+[^\s`'"]/;
const TMP_PATHS = [/\$\{?TMPDIR\}?\//, /(?<![\w.~/-])\/tmp(?![\w-])/, /\b(?:the\s+)?OS(?:'s)?\s+temp(?:orary)?\s+dir(?:ectory)?\b/i];
const NEGATION = /\b(?:don['’]t|do not|never|not)\s+$/i;

function phraseRegex(phrase: string): RegExp {
  const body = phrase.trim().split(/\s+/).map(escape).join("\\s+");
  return new RegExp(`(?<![\\w-])${body}${/\w$/.test(phrase.trim()) ? "(?![\\w-])" : ""}`, "gi");
}

const RULE_LINTS: Record<string, RuleLint> = {
  "skill-ref": (t, _rule, ctx) => {
    const names = vstackSkillNames(ctx);
    if (names.length === 0) return [];
    const bare = new RegExp(`(?<![\\w.:/~-])/(?:${names.map(escape).join("|")})(?![\\w/-])`);
    return eachLine(t.files, true, (line) => bare.test(line));
  },
  "spawn-vocab": (t) =>
    eachLine(t.files, true, (line) => {
      if (/^\s*spawns:/.test(line)) return false;
      if (SPAWN_TERMS.test(line)) return true;
      return SPAWN_WORDS.test(line) && !SPAWN_LINES.some((m) => line.includes(m));
    }),
  "worktree-cmd": (t) => eachLine(t.files, false, (line) => WORKTREE_ADD.test(line)),
  "tmp-path": (t) => eachLine(t.files, false, (line) => !line.includes("mktemp") && TMP_PATHS.some((r) => r.test(line))),
  "ask-tool": (t, rule) => {
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
};

export const houseStyleChecks: Check = {
  classes: ["invalid-house-style", "house-style-leftover", ...Object.keys(RULE_LINTS)],
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

      for (const [id, lint] of Object.entries(RULE_LINTS)) {
        const rule = rules.get(id);
        if (!rule || !inScope(rule.scope, t.disposition)) continue; // a missing rule is an invalid-house-style failure
        const hits = lint(t, rule, ctx);
        if (hits.length > 0) out.push({ class: id, item: t.item, message: `${t.disposition} text breaks ${id}: ${summary(hits)}` });
      }
    }
    return out;
  },
};
