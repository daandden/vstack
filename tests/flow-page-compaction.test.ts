import { afterAll, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repoKey } from "../plugin/skills/vstack-tmp/scripts/scratch.ts";
import { ENV, git } from "./support/fixture.ts";

const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-compaction-")));
const script = join(import.meta.dir, "../plugin/skills/flow-page/scripts/flow-page.ts");
const cleanup = join(import.meta.dir, "../plugin/skills/vstack-tmp/scripts/clean.ts");
const DAY = 86_400_000;
let serial = 0;
afterAll(() => rmSync(root, { recursive: true, force: true }));

function world() {
  const base = join(root, String(serial++)), cwd = join(base, "project"), home = join(base, "home");
  mkdirSync(cwd, { recursive: true });
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "commit", "-q", "--allow-empty", "-m", "base");
  const scratch = join(home, ".vstack/tmp", repoKey(cwd));
  return { base, cwd, home, scratch, database: join(scratch, "flow.db"), env: { ...ENV, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" } };
}
type World = ReturnType<typeof world>;
function execute(w: World, command: string[], input?: unknown) {
  const proc = Bun.spawnSync([process.execPath, ...command], { cwd: w.cwd, env: w.env, stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe" });
  expect(proc.stderr.toString()).toBe("");
  expect(proc.exitCode).toBe(0);
  return JSON.parse(proc.stdout.toString());
}
const cli = (w: World, args: string[], input?: unknown) => execute(w, [script, ...args, "--home", w.home, "--session", "compaction-fixture", "--agent", "fixture"], input);
const clean = (w: World, args: string[] = []) => execute(w, [cleanup, "--home", w.home, "--now", new Date(Date.now() + 20 * DAY).toISOString(), ...args]);
const snapshots = (listing: ReturnType<typeof clean>, paths: string[]): string[] => paths.map(path => {
  const row = listing.rows.find((row: { path: string }) => row.path === path);
  expect(row?.snapshot).toEqual(expect.any(String));
  return row.snapshot;
});
const document = (title: string, prose: string) => ({ version: 1, items: [{ kind: "result", shape: "document", title, sections: [{ heading: "Content", blocks: [{ prose }] }] }] });
function open(w: World, title: string, prose: string, closed = false) {
  const flow = cli(w, ["open", "--title", title, "--skill", "explain"]);
  cli(w, ["submit"], document(title, prose));
  if (closed) {
    cli(w, ["submit"], { version: 1, items: [{ kind: "stage", state: "finished" }] });
    cli(w, ["close"]);
  }
  return { ...flow, folder: join(w.scratch, "flow", flow.flow) };
}

test("confirmed Flow deletion shrinks the database and preserves remaining Flows and cleanup output", () => {
  const w = world();
  const expired = [open(w, "Expired A", "Discard this evidence. ".repeat(6000), true), open(w, "Expired B", "Discard this result. ".repeat(6000), true)];
  const keep = open(w, "Keep this Flow", "The retained result is unchanged.");
  const before = cli(w, ["show", "--flow", keep.flow]);
  const reader = new Database(w.database);
  try {
    reader.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    const bytes = statSync(w.database).size;
    const listing = clean(w);
    expect(listing.rows.map((row: { path: string }) => row.path).sort()).toEqual(expired.map(flow => flow.folder).sort());
    const result = clean(w, ["--delete", ...snapshots(listing, expired.map(flow => flow.folder))]);
    expect(result).toMatchObject({ deleted: expired.map(flow => ({ removed: [flow.folder] })), skipped: [], partial: [], pruned: [], maintenance_errors: [] });
    expect(statSync(w.database).size).toBeLessThan(bytes);
    expect(cli(w, ["show", "--flow", keep.flow])).toEqual(before);
    for (const flow of expired) expect(existsSync(flow.folder)).toBe(false);
  } finally { reader.close(); }
});

test("fully imported projects with no Flow deletion leave the database bytes unchanged", () => {
  const w = world();
  const keep = open(w, "Open Flow", "Never compact a project that deletes no Flows.");
  const before = readFileSync(w.database);
  const other = join(w.scratch, "to-tickets", "old-record");
  mkdirSync(join(w.scratch, "to-tickets"));
  writeFileSync(other, "Other Scratch");
  utimesSync(other, new Date(0), new Date(0));
  const listing = clean(w);
  expect(listing.rows.map((row: { path: string }) => row.path)).toEqual([other]);
  expect(listing.kept).toBe(1);
  expect(existsSync(keep.folder)).toBe(true);
  expect(readFileSync(w.database)).toEqual(before);
  expect(clean(w, ["--delete", ...snapshots(listing, [other])])).toMatchObject({
    deleted: [{ removed: [other] }], skipped: [], partial: [], pruned: [join(w.scratch, "to-tickets")], maintenance_errors: [],
  });
  expect(readFileSync(w.database)).toEqual(before);
});

test("a submit waits for an overlapping compaction and commits exactly once", async () => {
  const w = world();
  const expired = open(w, "Expired evidence", "Old result. ".repeat(10000), true);
  const keep = open(w, "Concurrent writer", "Original result.");
  const before = cli(w, ["show", "--flow", keep.flow]);
  const library = join(w.base, process.platform === "darwin" ? "gate.dylib" : "gate.so");
  const compiled = Bun.spawnSync(["cc", ...(process.platform === "darwin" ? ["-dynamiclib"] : ["-shared"]), "-fPIC", "-O2", join(import.meta.dir, "fixtures/flow-compaction-gate.c"), "-o", library], { stdout: "pipe", stderr: "pipe" });
  expect(compiled.stderr.toString()).toBe("");
  expect(compiled.exitCode).toBe(0);
  const preload = join(import.meta.dir, "support/flow-compaction-preload.ts");
  const compacting = join(w.base, "compacting"), writing = join(w.base, "writing"), release = join(w.base, "release");
  const env = { ...w.env, FLOW_COMPACTION_LIBRARY: library };
  const cleaner = Bun.spawn([process.execPath, "--preload", preload, cleanup, "--home", w.home, "--now", new Date(Date.now() + 20 * DAY).toISOString(), "--delete", ...snapshots(clean(w), [expired.folder])], {
    cwd: w.cwd, env: { ...env, FLOW_COMPACTION_ENTERED: compacting, FLOW_COMPACTION_RELEASE: release }, stdout: "pipe", stderr: "pipe",
  });
  const startWriter = () => Bun.spawn([process.execPath, "--preload", preload, script, "submit", "--home", w.home, "--session", "compaction-fixture", "--agent", "fixture"], {
    cwd: w.cwd, env: { ...env, FLOW_COMPACTION_ENTERED: writing }, stdin: new TextEncoder().encode(JSON.stringify(document("After compaction", "Committed once."))), stdout: "pipe", stderr: "pipe",
  });
  let writer: ReturnType<typeof startWriter> | undefined;
  const waitFor = async (path: string) => {
    const deadline = Date.now() + 4000;
    while (!existsSync(path) && Date.now() < deadline) await Bun.sleep(5);
    expect(existsSync(path)).toBe(true);
  };
  try {
    await waitFor(compacting);
    writer = startWriter();
    await waitFor(writing);
    expect(writer.exitCode).toBeNull();
    expect(cleaner.exitCode).toBeNull();
    writeFileSync(release, "");
    const [cleanCode, cleanOutput, cleanError, writeCode, writeOutput, writeError] = await Promise.all([
      cleaner.exited, new Response(cleaner.stdout).text(), new Response(cleaner.stderr).text(),
      writer.exited, new Response(writer.stdout).text(), new Response(writer.stderr).text(),
    ]);
    expect(cleanError).toBe("");
    expect(cleanCode).toBe(0);
    expect(JSON.parse(cleanOutput).deleted).toMatchObject([{ removed: [expired.folder] }]);
    expect(writeError).toBe("");
    expect(writeCode).toBe(0);
    expect(JSON.parse(writeOutput)).toMatchObject({ flow: keep.flow, stage: keep.stage, revision: before.revision + 1 });
    const after = cli(w, ["show", "--flow", keep.flow]);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.stages[0].results.map((result: { changed: number }) => result.changed)).toEqual([2, 3]);
    expect(after.stages[0].results[0]).toEqual(before.stages[0].results[0]);
  } finally {
    writeFileSync(release, "");
    await Promise.all([cleaner.exited, writer?.exited]);
  }
});
