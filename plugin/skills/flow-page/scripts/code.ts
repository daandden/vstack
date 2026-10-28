// Code/diff content: the unified-diff parser that checks a diff and numbers its lines, and the small syntax
// highlighter the renderer uses. Both are pure. A token is escaped text with an optional class; nothing here
// reads input as markup.

export type Hunk = { old: { start: number; count: number }; new: { start: number; count: number } };
/** One line of a diff as submitted, with the old and new line numbers it stands at. */
export type DiffLine = { kind: "meta" | "hunk" | "ctx" | "del" | "add" | "note"; text: string; old?: number; new?: number; hunk?: number };

const HEADER = /^(diff |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|dissimilarity index|rename from|rename to|copy from|copy to)/;
const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** The lines of `s`, without the empty piece after a final line break. */
export const linesOf = (s: string) => {
  const ls = s.split("\n");
  if (ls.at(-1) === "") ls.pop();
  return ls;
};

/** Parses one file's unified diff, or returns why it is not one. Hunk counts must match the lines that follow. */
export function parseDiff(diff: string): { lines: DiffLine[]; hunks: Hunk[] } | string {
  const lines: DiffLine[] = [];
  const hunks: Hunk[] = [];
  let old = 0;
  let neu = 0;
  let leftOld = 0;
  let leftNew = 0;
  const ended = () => {
    const h = hunks.length;
    if (h && (leftOld > 0 || leftNew > 0)) return `hunk ${h} ends early: its header counts ${hunks[h - 1].old.count} old and ${hunks[h - 1].new.count} new lines, but ${leftOld} old and ${leftNew} new lines are missing`;
    return undefined;
  };
  for (const [i, text] of linesOf(diff).entries()) {
    const at = `line ${i + 1}`;
    if (leftOld > 0 || leftNew > 0) {
      const mark = text[0] ?? " ";
      if (mark === "\\") {
        lines.push({ kind: "note", text });
        continue;
      }
      if (mark === " ") {
        if (leftOld < 1 || leftNew < 1) return `hunk ${hunks.length} has more lines than its header counts, at ${at}`;
        lines.push({ kind: "ctx", text, old: old++, new: neu++, hunk: hunks.length });
        leftOld--;
        leftNew--;
      } else if (mark === "-") {
        if (leftOld < 1) return `hunk ${hunks.length} has more removed lines than its header counts, at ${at}`;
        lines.push({ kind: "del", text, old: old++, hunk: hunks.length });
        leftOld--;
      } else if (mark === "+") {
        if (leftNew < 1) return `hunk ${hunks.length} has more added lines than its header counts, at ${at}`;
        lines.push({ kind: "add", text, new: neu++, hunk: hunks.length });
        leftNew--;
      } else return `${at} of hunk ${hunks.length} starts with ${JSON.stringify(mark)}; a hunk line starts with a space, -, +, or \\`;
      continue;
    }
    const m = text.match(HUNK);
    if (m) {
      const h: Hunk = { old: { start: Number(m[1]), count: m[2] === undefined ? 1 : Number(m[2]) }, new: { start: Number(m[3]), count: m[4] === undefined ? 1 : Number(m[4]) } };
      hunks.push(h);
      [old, neu, leftOld, leftNew] = [h.old.start, h.new.start, h.old.count, h.new.count];
      lines.push({ kind: "hunk", text, hunk: hunks.length });
      continue;
    }
    if (text.startsWith("\\")) {
      lines.push({ kind: "note", text });
      continue;
    }
    if (HEADER.test(text)) {
      if (hunks.length) return `${at} starts another file's diff; an entry holds one file's diff, so give each file its own entry`;
      lines.push({ kind: "meta", text });
      continue;
    }
    if (hunks.length) return `hunk ${hunks.length} has more lines than its header counts, at ${at}`;
    return `${at} is not part of a unified diff; a diff is @@ hunks, optionally after its file header lines`;
  }
  const early = ended();
  if (early) return early;
  if (!hunks.length) return "a unified diff needs at least one @@ hunk";
  return { lines, hunks };
}

// ---------------------------------------------------------------------------------------------------------------
// Syntax highlighting: comments, strings, numbers, and keywords for common languages. Unknown languages stay plain.

export type Token = { text: string; kind?: "kw" | "str" | "com" | "num" | "ws" };
type Lang = { line: string[]; block?: [string, string]; quotes: string[]; keywords: Set<string>; hashNeedsSpace?: boolean };

const kw = (s: string) => new Set(s.split(" "));
const JS = kw("async await break case catch class const continue debugger default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of private protected public readonly return satisfies static super switch this throw true try type typeof undefined var void while with yield as declare keyof");
const C_FAMILY = kw("auto bool break case catch char class const continue default delete do double else enum extern false final float for fun func goto if import int interface let long namespace new null nil override package private protected public return self short signed sizeof static struct super switch this throw true try typedef union unsigned using val var virtual void volatile when while");
const GO = kw("break case chan const continue default defer else fallthrough false for func go goto if import interface map nil package range return select struct switch true type var");
const RUST = kw("as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while");
const PY = kw("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield");
const SH = kw("case do done elif else esac exit export fi for function if in local readonly return set shift then unset until while");
const SQL = kw("ADD ALL ALTER AND AS ASC BEGIN BETWEEN BY CASE COMMIT CREATE DELETE DESC DISTINCT DROP ELSE END EXISTS FROM GROUP HAVING IN INDEX INNER INSERT INTO IS JOIN KEY LEFT LIMIT NOT NULL ON OR ORDER OUTER PRIMARY RETURNING RIGHT ROLLBACK SELECT SET TABLE THEN UNION UPDATE VALUES WHEN WHERE WITH");
const LITERALS = kw("true false null");

const C_LIKE = (keywords: Set<string>): Lang => ({ line: ["//"], block: ["/*", "*/"], quotes: ['"', "'", "`"], keywords });
const HASH = (keywords: Set<string>): Lang => ({ line: ["#"], quotes: ['"', "'"], keywords, hashNeedsSpace: true });
const LANGS: Record<string, Lang> = {};
for (const n of ["js", "jsx", "mjs", "cjs", "javascript", "ts", "tsx", "mts", "cts", "typescript"]) LANGS[n] = C_LIKE(JS);
for (const n of ["c", "h", "cpp", "c++", "cc", "hpp", "cs", "csharp", "java", "kotlin", "kt", "swift", "scala", "dart"]) LANGS[n] = C_LIKE(C_FAMILY);
LANGS.go = C_LIKE(GO);
LANGS.rust = LANGS.rs = C_LIKE(RUST);
for (const n of ["py", "python"]) LANGS[n] = HASH(PY);
for (const n of ["sh", "bash", "zsh", "shell", "fish"]) LANGS[n] = HASH(SH);
for (const n of ["yaml", "yml", "toml", "ini"]) LANGS[n] = HASH(LITERALS);
LANGS.json = { line: [], quotes: ['"'], keywords: LITERALS };
LANGS.sql = { line: ["--"], block: ["/*", "*/"], quotes: ["'", '"'], keywords: SQL };

const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)/;
const WORD = /^[A-Za-z_$][\w$]*/;

/** A highlighter for one language, carrying block-comment state from line to line until `reset`. */
export function highlighter(language: string | undefined) {
  const lang = language ? LANGS[language.toLowerCase()] : undefined;
  let inBlock = false;
  const line = (s: string): Token[] => {
    if (!lang) return s ? [{ text: s }] : [];
    const out: Token[] = [];
    const push = (text: string, kind?: Token["kind"]) => {
      if (!text) return;
      const last = out.at(-1);
      if (last && last.kind === kind) last.text += text;
      else out.push(kind ? { text, kind } : { text });
    };
    let i = 0;
    while (i < s.length) {
      if (inBlock) {
        const end = s.indexOf(lang.block![1], i);
        if (end < 0) {
          push(s.slice(i), "com");
          break;
        }
        push(s.slice(i, end + lang.block![1].length), "com");
        i = end + lang.block![1].length;
        inBlock = false;
        continue;
      }
      const rest = s.slice(i);
      const lc = lang.line.find((t) => rest.startsWith(t) && (!lang.hashNeedsSpace || i === 0 || /\s/.test(s[i - 1])));
      if (lc) {
        push(rest, "com");
        break;
      }
      if (lang.block && rest.startsWith(lang.block[0])) {
        inBlock = true;
        push(lang.block[0], "com");
        i += lang.block[0].length;
        continue;
      }
      const q = lang.quotes.find((x) => rest.startsWith(x));
      if (q) {
        let j = i + 1;
        while (j < s.length && s[j] !== q) j += s[j] === "\\" ? 2 : 1;
        push(s.slice(i, Math.min(j + 1, s.length)), "str");
        i = Math.min(j + 1, s.length);
        continue;
      }
      const prev = i > 0 ? s[i - 1] : "";
      const num = /[\w$]/.test(prev) ? null : rest.match(NUMBER);
      if (num) {
        push(num[0], "num");
        i += num[0].length;
        continue;
      }
      const word = rest.match(WORD);
      if (word) {
        push(word[0], lang.keywords.has(word[0]) || (language?.toLowerCase() === "sql" && lang.keywords.has(word[0].toUpperCase())) ? "kw" : undefined);
        i += word[0].length;
        continue;
      }
      push(s[i]);
      i++;
    }
    return out;
  };
  return { line, reset: () => void (inBlock = false) };
}

/** `tokens` with the line's trailing spaces and tabs split off as their own token, so a page can show them. */
export function markTrailing(tokens: Token[]): Token[] {
  const last = tokens.at(-1);
  const ws = last?.text.match(/[ \t]+$/);
  if (!last || !ws) return tokens;
  const head = last.text.slice(0, -ws[0].length);
  return [...tokens.slice(0, -1), ...(head ? [{ ...last, text: head }] : []), { text: ws[0], kind: "ws" }];
}
