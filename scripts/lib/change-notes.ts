import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const CHANGE_NOTES = "change-notes";
export type VersionLevel = "patch" | "minor" | "major";
export interface ChangeNote { path: string; level: VersionLevel; entries: string[] }
const levels: VersionLevel[] = ["patch", "minor", "major"];

function git(root: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", root, ...args], { stdout: "pipe", stderr: "pipe" });
  if (result.exitCode !== 0) throw new Error(result.stderr.toString().trim());
  return result.stdout.toString();
}

function parseNote(path: string, text: string): ChangeNote {
  const note = JSON.parse(text);
  if (note.schema !== 1 || !levels.includes(note.level) || !Array.isArray(note.entries) || !note.entries.length || note.entries.some((entry: unknown) => typeof entry !== "string" || !entry.trim() || entry.includes("\n"))) {
    throw new Error(`${path}: expected schema 1, a patch, minor, or major level, and nonempty one-line entries`);
  }
  return { path, level: note.level, entries: note.entries };
}

/** Reads the pending set in a commit, or the working tree when ref is omitted. */
export function pendingNotes(root: string, ref?: string): ChangeNote[] {
  const paths = ref
    ? git(root, ["ls-tree", "-r", "--name-only", ref, "--", CHANGE_NOTES]).trim().split("\n").filter(Boolean)
    : existsSync(join(root, CHANGE_NOTES)) ? readdirSync(join(root, CHANGE_NOTES)).map(name => `${CHANGE_NOTES}/${name}`) : [];
  return paths.sort().map(path => {
    if (!/^change-notes\/[a-zA-Z0-9-]+\.json$/.test(path)) throw new Error(`Invalid Change note path: ${path}`);
    return parseNote(path, ref ? git(root, ["show", `${ref}:${path}`]) : readFileSync(join(root, path), "utf8"));
  });
}

export function highestLevel(notes: readonly Pick<ChangeNote, "level">[]): VersionLevel | undefined {
  return notes.reduce<VersionLevel | undefined>((highest, note) => highest === undefined || levels.indexOf(note.level) > levels.indexOf(highest) ? note.level : highest, undefined);
}

export function noteText(level: VersionLevel, entries: string[]): string {
  const text = `${JSON.stringify({ schema: 1, level, entries: [...new Set(entries)] }, null, 2)}\n`;
  parseNote(`${CHANGE_NOTES}/note.json`, text);
  return text;
}

export function writeNote(root: string, note: ChangeNote): void {
  const text = noteText(note.level, note.entries);
  parseNote(note.path, text);
  if (!/^change-notes\/[a-zA-Z0-9-]+\.json$/.test(note.path)) throw new Error(`Invalid Change note path: ${note.path}`);
  mkdirSync(dirname(join(root, note.path)), { recursive: true });
  writeFileSync(join(root, note.path), text);
}

/** Folds the caller's prepared set without re-reading newer pending notes. */
export function foldNotes(changelog: string, version: string, notes: readonly ChangeNote[], date = new Date().toISOString().slice(0, 10)): string {
  const lines = changelog.split("\n");
  const first = lines.findIndex(line => line.startsWith("## "));
  const insertion = first < 0 ? lines.length : first;
  return [...lines.slice(0, insertion).join("\n").trimEnd().split("\n"), "", `## [${version}] - ${date}`, "", ...notes.flatMap(note => note.entries.map(entry => `- ${entry}`)), "", ...lines.slice(insertion)].join("\n").replace(/\n*$/, "\n");
}
