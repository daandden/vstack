import { afterEach, beforeEach, expect, test } from "bun:test";
import { appendFileSync, chmodSync, existsSync, lstatSync, lutimesSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { ENV } from "./support/fixture.ts";
import { legacyFlowFixture } from "./support/flow-store.ts";
import { holdSessionLease, stopSessionLeaseHolders } from "./support/session-lease-holder.ts";

const CLEAN = join(import.meta.dir, "..", "plugin", "skills", "vstack-tmp", "scripts", "clean.ts");
const PATH_SCRIPT = join(dirname(CLEAN), "path.ts");
const CLEAN_FAULT = join(import.meta.dir, "support", "cleanup-fault.ts");
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

let dir: string;
let home: string;
let root: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-clean-test-")));
  home = join(dir, "home");
  root = join(home, ".vstack", "tmp");
  mkdirSync(root, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

interface Listed {
  path: string;
  repo_key: string;
  kind: string;
  label: string;
  snapshot: string;
  age_days: number;
  size: number;
}

function runClean(args: string[], fault?: string, path?: string, extraEnv?: Record<string, string>) {
  const preload = fault ? ["--preload", CLEAN_FAULT] : [];
  const env = fault ? { ...ENV, CLEAN_FAULT: fault, CLEAN_FAULT_PATH: path ?? "", ...extraEnv } : ENV;
  const r = Bun.spawnSync([process.execPath, ...preload, CLEAN, ...args], { cwd: dir, env, stdout: "pipe", stderr: "pipe" });
  const stdout = r.stdout.toString();
  return { code: r.exitCode, stdout, stderr: r.stderr.toString(), json: r.exitCode === 0 ? JSON.parse(stdout) : undefined };
}
const clean = (...args: string[]) => runClean(args);
const list = (olderThan = "14d") => clean("--home", home, "--older-than", olderThan);
const listed = (olderThan?: string): Listed[] => list(olderThan).json.rows;
const listedPaths = (olderThan?: string) => listed(olderThan).map(row => row.path).sort();

/** Writes a file, creating parents, and sets its mtime. */
function file(rel: string, content: string, age: number) {
  const p = join(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
  utimesSync(p, daysAgo(age), daysAgo(age));
  return p;
}

const WITNESS = "019abcde-1234-7abc-8def-000000000001";
const SESSION = "019abcde-1234-7abc-8def-000000000002";
const ANOTHER = "019abcde-1234-7abc-8def-000000000003";
const leaseArgs = () => ["--omp-home", home, "--witness", WITNESS];

function marked(repo: string, kind: string, id = SESSION) {
  const path = Bun.spawnSync([
    process.execPath, PATH_SCRIPT, "--scratch-dir", join(root, repo), "--session-id", id, kind,
  ], { cwd: dir, env: ENV, stdout: "pipe", stderr: "pipe" });
  expect(path.exitCode).toBe(0);
  return join(path.stdout.toString().trim(), ".");
}

function archive(id: string, start: string, title: string, activity: number, ...mentions: string[]) {
  return archiveIn("project", id, start, title, activity, ...mentions);
}

function archiveIn(bucket: string, id: string, start: string, title: string, activity: number, ...mentions: string[]) {
  const base = join(home, ".omp", "agent", "sessions", bucket, `${start}_${id}`);
  mkdirSync(dirname(base), { recursive: true });
  writeFileSync(`${base}.jsonl`, [
    { type: "title", title },
    { type: "session", id, timestamp: start, cwd: "/project" },
    ...mentions.map(text => ({ type: "message", message: { role: "user", content: text } })),
  ].map(record => JSON.stringify(record)).join("\n") + "\n");
  utimesSync(`${base}.jsonl`, daysAgo(activity), daysAgo(activity));
  return base;
}

test.skipIf(process.platform === "win32")("joins archive-named old Scratch to marked members and deletes only the rebuilt row", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    marked("shop", "verify");
    marked("other", "verify");
    const markedFile = file(`shop/verify/${SESSION}/report.txt`, "abc", 30);
    const other = file(`other/verify/${SESSION}/report.txt`, "keep", 30);
    const old = file("shop/verify/historical/report.txt", "defg", 25);
    const base = archive(SESSION, "2026-10-12T08-00-00", "Recovered diagnostics", 25, old);
    const args = ["--home", home, ...leaseArgs()];
    const listing = clean(...args);
    expect(listing.code).toBe(0);
    expect(listing.json.rows).toMatchObject([
      { repo_key: "other", kind: "session", size: 4 },
      { repo_key: "shop", kind: "session", label: "Recovered diagnostics", size: 7, age_days: 25 },
    ]);
    expect(listing.json.withheld).toEqual([]);
    expect(lstatSync(old).mtimeMs).toBeLessThan(Date.now() - 24 * DAY);
    const result = clean(...args, "--delete", listing.json.rows[1].snapshot);
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      deleted: [{ repo_key: "shop", kind: "session", removed: [dirname(markedFile), dirname(old)], freed: 7 }],
      skipped: [], partial: [],
    });
    expect(existsSync(markedFile)).toBe(false);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(other)).toBe(true);
    expect(existsSync(`${base}.jsonl`)).toBe(true);
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("scans one archive once when deleting two rows in a repo with old Scratch", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    for (const id of [SESSION, ANOTHER]) {
      marked("shop", "verify", id);
      file(`shop/verify/${id}/report.txt`, "marked", 30);
    }
    const old = file("shop/verify/unmarked/report.txt", "old", 30);
    const base = archive(ANOTHER, "2026-10-12T08-00-00", "Recovered diagnostics", 25, old);
    mkdirSync(base);
    const log = join(base, "1.bash.log");
    writeFileSync(log, "Tool history\n");
    const args = ["--home", home, ...leaseArgs()];
    const list = clean(...args);
    expect(list.json.rows).toHaveLength(2);
    const snapshots = (list.json.rows as Listed[]).sort((a, b) => a.size - b.size).map(row => row.snapshot);
    const deleted = runClean([...args, "--delete", ...snapshots], "archive-read", log);
    expect(deleted.code).toBe(0);
    expect(deleted.json.deleted).toHaveLength(2);
    expect(deleted.json.skipped).toEqual([]);
    expect(existsSync(old)).toBe(false);
    expect(readFileSync(`${log}.opens`, "utf8")).toBe("opened\n");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("uses exact normalized paths in the session, subagent transcript, and tool log", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const tilde = file("shop/verify/report.txt", "a", 30);
    const escaped = file('shop/verify/quoted "report"/child.txt', "bb", 30);
    const subagent = file("shop/explain/worker-only/run.txt", "ccc", 30);
    const tool = file("shop/interrogate/tool-only/run.txt", "dddd", 30);
    const unlinked = file("shop/verify/actual", "eeeee", 25);
    file("shop/verify/more", "ffffff", 35);
    const ticket = file("shop/to-tickets/record/approved.json", "ggggggg", 30);
    const base = archive(SESSION, "2026-10-12T08-00-00", "Paths from all archive sources", 10,
      `~${tilde.slice(home.length)}/`, ticket, "actual", `${unlinked}-copy`, `${unlinked}[suffix]`);
    writeFileSync(`${base}.jsonl`,
      JSON.stringify({ type: "message", message: { content: escaped } }).replaceAll("/", "\\/").replace(".vstack", "\\u002evstack") + "\n",
      { flag: "a" });
    mkdirSync(join(base, "worker"), { recursive: true });
    writeFileSync(join(base, "worker", "worker.child.jsonl"), JSON.stringify({ path: subagent }));
    const leadingBytes = 1024 * 1024 - tool.indexOf(".vstack") - "wrote `".length - 4;
    writeFileSync(join(base, "1.bash.log"), `${"x".repeat(leadingBytes)}\nwrote \`${tool}\`\nignored ${unlinked}[suffix]\n`);
    const args = ["--home", home, ...leaseArgs()];
    const { code, json } = clean(...args);
    expect(code).toBe(0);
    expect(json.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ repo_key: "shop", kind: "session", session_id: SESSION, size: 10, age_days: 30 }),
      expect.objectContaining({ repo_key: "shop", kind: "to-tickets", path: dirname(ticket), size: 7 }),
    ]));
    if (process.platform === "linux") {
      expect(json.rows).toHaveLength(2);
      expect(json.withheld).toEqual([{ reason: "unnamed lease holders cannot be enumerated on Linux", count: 1 }]);
    } else {
      expect(json.rows).toHaveLength(3);
      expect(json.rows).toContainEqual(expect.objectContaining({ kind: "folder", name: "verify", size: 11, age_days: 25 }));
      expect(json.withheld).toEqual([]);
    }
    expect(readFileSync(unlinked, "utf8")).toBe("eeeee");
    expect(readFileSync(tool, "utf8")).toBe("dddd");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("uses archive activity rather than start time and protects the winning row from a late non-owner lease", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  const holders = [witness];
  try {
    const markedFile = join(marked("shop", "verify"), "marked");
    file(`shop/verify/${SESSION}/marked`, "abc", 30);
    const old = file("shop/verify/old.md", "defg", 30);
    const earlier = archive(SESSION, "2026-09-10T08-00-00", "Earlier start", 5, old);
    const later = archive(ANOTHER, "2026-10-10T08-00-00", "Later start", 20, old);
    const args = ["--home", home, ...leaseArgs()];
    const initial = clean(...args).json;
    expect(initial.rows).toMatchObject([{ kind: "session", name: SESSION, size: 7 }]);
    const selected = initial.rows[0].snapshot;
    const lateLease = await holdSessionLease(ANOTHER, { home });
    holders.push(lateLease);
    expect(clean(...args).json).toMatchObject({ rows: [], kept: 1, withheld: [] });
    expect(clean(...args, "--delete", selected).json.skipped)
      .toMatchObject([{ reason: "A session linked by the archive holds a lease" }]);
    await stopSessionLeaseHolders([lateLease]);
    holders.pop();

    const tied = daysAgo(5);
    utimesSync(`${earlier}.jsonl`, tied, tied);
    utimesSync(`${later}.jsonl`, tied, tied);
    expect(clean(...args).json.rows).toMatchObject([{ name: SESSION, size: 7 }]);
    utimesSync(`${later}.jsonl`, daysAgo(1), daysAgo(1));
    expect(clean(...args, "--delete", selected).json.skipped)
      .toMatchObject([{ reason: "Row members changed or were replaced" }]);
    expect(clean(...args).json.rows).toMatchObject([{ name: SESSION, size: 3 }, { name: ANOTHER, size: 4 }]);
    expect(readFileSync(old, "utf8")).toBe("defg");
    expect(readFileSync(markedFile, "utf8")).toBe("abc");
  } finally {
    await stopSessionLeaseHolders(holders);
  }
});

test.skipIf(process.platform === "win32")("a live non-owner mentioning two old paths on separate lines protects both rows", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const first = file("shop/verify/old.md", "first", 30);
    const second = file("other/verify/old.md", "second", 30);
    archive(SESSION, "2026-10-10", "Shop diagnostics", 5, first);
    archive(ANOTHER, "2026-10-11", "Other diagnostics", 5, second);
    const args = ["--home", home, ...leaseArgs()];
    expect(clean(...args).json.rows).toMatchObject([
      { repo_key: "other", name: ANOTHER }, { repo_key: "shop", name: SESSION },
    ]);
    archive(WITNESS, "2026-10-12", "Live non-owner", 20, `${first}\n${second}`);
    expect(clean(...args).json).toMatchObject({ rows: [], kept: 2, withheld: [] });
    expect(readFileSync(first, "utf8")).toBe("first");
    expect(readFileSync(second, "utf8")).toBe("second");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete protects old Scratch mentioned at the lease scan", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    const live = `${archive(WITNESS, "2026-10-10", "Live witness", 20)}.jsonl`;
    archive(SESSION, "2026-10-11", "Owner", 5, old);
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows[0].snapshot;
    const result = runClean([...args, "--delete", selection], "late-lease-mention", undefined,
      { CLEAN_LATE_ARCHIVE: live, CLEAN_LATE_PATH: old });

    expect(readFileSync(live, "utf8")).toContain(old);
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      deleted: [], partial: [], skipped: [{ reason: "A session linked by the archive holds a lease" }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete skips a row whose session acquires a lease while deleting the preceding row", async () => {
  const holders = [await holdSessionLease(WITNESS, { home })];
  try {
    marked("shop", "verify", SESSION);
    marked("shop", "verify", ANOTHER);
    const first = file(`shop/verify/${SESSION}/report.txt`, "delete", 30);
    const second = file(`shop/verify/${ANOTHER}/report.txt`, "keep", 30);
    const args = ["--home", home, ...leaseArgs()];
    const { rows } = clean(...args).json;
    expect(rows.map((row: { name: string }) => row.name)).toEqual([SESSION, ANOTHER]);
    const release = join(dir, "release-removal");
    const deletion = Bun.spawn([
      process.execPath, "--preload", CLEAN_FAULT, CLEAN, ...args, "--delete", rows[0].snapshot, rows[1].snapshot,
    ], {
      cwd: dir, env: { ...ENV, CLEAN_FAULT: "pause-remove", CLEAN_FAULT_PATH: first, CLEAN_RELEASE: release },
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = deletion.stderr.getReader();
    try {
      const paused = await stderr.read();
      expect(new TextDecoder().decode(paused.value)).toBe("Scratch removal paused\n");
      holders.push(await holdSessionLease(ANOTHER, { home }));
    } finally {
      writeFileSync(release, "");
      await deletion.exited;
      stderr.releaseLock();
    }

    expect(deletion.exitCode).toBe(0);
    expect(JSON.parse(await new Response(deletion.stdout).text())).toMatchObject({
      deleted: [{ name: SESSION }], partial: [],
      skipped: [{ name: ANOTHER, reason: "Session holds a lease" }],
    });
    expect(existsSync(first)).toBe(false);
    expect(readFileSync(second, "utf8")).toBe("keep");
    expect(readFileSync(join(dirname(second), ".vstack-scratch-session"), "utf8")).toBe(`${ANOTHER}\n`);
  } finally {
    await stopSessionLeaseHolders(holders);
  }
});

test.skipIf(process.platform === "win32")("delete skips a row when its fresh lease scan fails", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    marked("shop", "verify");
    const old = file(`shop/verify/${SESSION}/report.txt`, "keep", 30);
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows[0].snapshot;
    const result = runClean([...args, "--delete", selection], "fresh-lease");

    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      deleted: [], partial: [],
      skipped: [{ name: SESSION, reason: expect.stringContaining("Injected lease scan failure") }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete keeps old Scratch that a held archive mentions after its read", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    marked("shop", "verify", ANOTHER);
    const markedFile = file(`shop/verify/${ANOTHER}/report.txt`, "delete", 30);
    const live = `${archive(WITNESS, "2026-10-10", "Live witness", 20)}.jsonl`;
    const owner = `${archive(SESSION, "2026-10-11", "Owner", 5, old)}.jsonl`;
    const args = ["--home", home, ...leaseArgs()];
    const rows = clean(...args).json.rows as (Listed & { name: string })[];
    expect(rows.map(row => row.name).sort()).toEqual([SESSION, ANOTHER]);
    const result = runClean([...args, "--delete", ...rows.map(row => row.snapshot)], "late-archive-mention", owner,
      { CLEAN_LATE_ARCHIVE: live, CLEAN_LATE_PATH: old });

    expect(readFileSync(live, "utf8")).toContain(old);
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      deleted: [{ name: ANOTHER }], partial: [],
      skipped: [{ name: SESSION, reason: "A session linked by the archive holds a lease" }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
    expect(existsSync(markedFile)).toBe(false);
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete removes old Scratch when a held archive changes without mentioning it", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const old = file("shop/verify/old.md", "delete", 30);
    const live = `${archive(WITNESS, "2026-10-10", "Live witness", 20)}.jsonl`;
    const owner = `${archive(SESSION, "2026-10-11", "Owner", 5, old)}.jsonl`;
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows[0].snapshot;
    const result = runClean([...args, "--delete", selection], "late-archive-mention", owner,
      { CLEAN_LATE_ARCHIVE: live, CLEAN_LATE_PATH: "unrelated live output" });

    expect(readFileSync(live, "utf8")).toContain("unrelated live output");
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({ deleted: [{ name: SESSION }], partial: [], skipped: [] });
    expect(existsSync(old)).toBe(false);
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete skips old Scratch that a session missing from the first lease read mentions during the search", async () => {
  const holders = [await holdSessionLease(WITNESS, { home })];
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    const newlyHeld = `${archive(ANOTHER, "2026-10-10", "Not yet live", 20)}.jsonl`;
    const owner = `${archive(SESSION, "2026-10-11", "Old Scratch owner", 5, old)}.jsonl`;
    const markedId = "019abcde-1234-7abc-8def-000000000004";
    marked("shop", "verify", markedId);
    const markedFile = file(`shop/verify/${markedId}/report.txt`, "delete", 30);
    const args = ["--home", home, ...leaseArgs()];
    const { rows } = clean(...args).json;
    const selections = [SESSION, markedId].map(id => rows.find((row: { name: string }) => row.name === id).snapshot);
    const release = join(dir, "release-archive");
    const deletion = Bun.spawn([process.execPath, "--preload", CLEAN_FAULT, CLEAN, ...args, "--delete", ...selections], {
      cwd: dir, env: { ...ENV, CLEAN_FAULT: "pause-archive", CLEAN_FAULT_PATH: owner, CLEAN_RELEASE: release },
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = deletion.stderr.getReader();
    try {
      const paused = await stderr.read();
      expect(new TextDecoder().decode(paused.value)).toBe("Scratch archive read paused\n");
      holders.push(await holdSessionLease(ANOTHER, { home }));
      appendFileSync(newlyHeld, `${JSON.stringify({ type: "message", text: old })}\n`);
    } finally {
      writeFileSync(release, "");
      await deletion.exited;
      stderr.releaseLock();
    }

    expect(deletion.exitCode).toBe(0);
    expect(JSON.parse(await new Response(deletion.stdout).text())).toMatchObject({
      deleted: [{ name: markedId }], partial: [],
      skipped: [{ name: SESSION, reason: "Row is missing" }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
    expect(existsSync(markedFile)).toBe(false);
  } finally {
    await stopSessionLeaseHolders(holders);
  }
});

test.skipIf(process.platform === "win32")("delete skips old Scratch mentioned in a new archive folder by a session missing from the first lease read", async () => {
  const holders = [await holdSessionLease(WITNESS, { home })];
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    const owner = `${archive(SESSION, "2026-10-11", "Old Scratch owner", 5, old)}.jsonl`;
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows.find((row: { name: string }) => row.name === SESSION).snapshot;
    const release = join(dir, "release-archive");
    const deletion = Bun.spawn([process.execPath, "--preload", CLEAN_FAULT, CLEAN, ...args, "--delete", selection], {
      cwd: dir, env: { ...ENV, CLEAN_FAULT: "pause-archive", CLEAN_FAULT_PATH: owner, CLEAN_RELEASE: release },
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = deletion.stderr.getReader();
    try {
      const paused = await stderr.read();
      expect(new TextDecoder().decode(paused.value)).toBe("Scratch archive read paused\n");
      archiveIn("late", WITNESS, "2026-10-12", "Live witness", 0, "live output");
      archiveIn("late", ANOTHER, "2026-10-12", "Newly live", 0, old);
      holders.push(await holdSessionLease(ANOTHER, { home }));
    } finally {
      writeFileSync(release, "");
      await deletion.exited;
      stderr.releaseLock();
    }

    expect(deletion.exitCode).toBe(0);
    expect(JSON.parse(await new Response(deletion.stdout).text())).toMatchObject({
      deleted: [], partial: [], skipped: [{ name: SESSION, reason: "Row is missing" }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders(holders);
  }
});

test.skipIf(process.platform === "win32")("delete keeps old Scratch that a live session mentions while the preceding row is removed", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    marked("shop", "verify", ANOTHER);
    const first = file(`shop/verify/${ANOTHER}/report.txt`, "delete", 30);
    const live = `${archive(WITNESS, "2026-10-10", "Live witness", 20)}.jsonl`;
    archive(SESSION, "2026-10-11", "Owner", 5, old);
    const args = ["--home", home, ...leaseArgs()];
    const { rows } = clean(...args).json;
    const selections = [ANOTHER, SESSION].map(id => rows.find((row: { name: string }) => row.name === id).snapshot);
    const release = join(dir, "release-removal");
    const deletion = Bun.spawn([process.execPath, "--preload", CLEAN_FAULT, CLEAN, ...args, "--delete", ...selections], {
      cwd: dir, env: { ...ENV, CLEAN_FAULT: "pause-remove", CLEAN_FAULT_PATH: first, CLEAN_RELEASE: release },
      stdout: "pipe", stderr: "pipe",
    });
    const stderr = deletion.stderr.getReader();
    try {
      const paused = await stderr.read();
      expect(new TextDecoder().decode(paused.value)).toBe("Scratch removal paused\n");
      appendFileSync(live, `${JSON.stringify({ type: "message", text: old })}\n`);
      utimesSync(live, daysAgo(20), daysAgo(20));
    } finally {
      writeFileSync(release, "");
      await deletion.exited;
      stderr.releaseLock();
    }

    expect(deletion.exitCode).toBe(0);
    expect(JSON.parse(await new Response(deletion.stdout).text())).toMatchObject({
      deleted: [{ name: ANOTHER }], partial: [],
      skipped: [{ name: SESSION, reason: "A session linked by the archive holds a lease" }],
    });
    expect(existsSync(first)).toBe(false);
    expect(readFileSync(old, "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("delete keeps a row whose session takes its lease while a live archive is reread", async () => {
  const holders = [await holdSessionLease(WITNESS, { home })];
  try {
    const old = file("shop/verify/old.md", "keep", 30);
    const live = `${archive(WITNESS, "2026-10-10", "Live witness", 20)}.jsonl`;
    archive(SESSION, "2026-10-11", "Owner", 5, old);
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows[0].snapshot;
    const release = join(dir, "release-reread");
    const deletion = Bun.spawn([process.execPath, "--preload", CLEAN_FAULT, CLEAN, ...args, "--delete", selection], {
      cwd: dir, stdout: "pipe", stderr: "pipe", env: {
        ...ENV, CLEAN_FAULT: "pause-reread", CLEAN_FAULT_PATH: live, CLEAN_RELEASE: release,
        CLEAN_LATE_ARCHIVE: live, CLEAN_LATE_PATH: "unrelated live output",
      },
    });
    const stderr = deletion.stderr.getReader();
    try {
      const paused = await stderr.read();
      expect(new TextDecoder().decode(paused.value)).toBe("Archive reread paused\n");
      holders.push(await holdSessionLease(SESSION, { home }));
    } finally {
      writeFileSync(release, "");
      await deletion.exited;
      stderr.releaseLock();
    }

    expect(deletion.exitCode).toBe(0);
    expect(JSON.parse(await new Response(deletion.stdout).text())).toMatchObject({
      deleted: [], partial: [], skipped: [{ name: SESSION, reason: "Session holds a lease" }],
    });
    expect(readFileSync(old, "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders(holders);
  }
});

test.skipIf(process.platform === "win32")("keeps the title of an attributed session with a compressed archive", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const old = file("shop/verify/archived/report.txt", "old", 30);
    const base = archive(SESSION, "2026-10-12T08-00-00", "Compressed diagnostics", 25, old);
    writeFileSync(`${base}.jsonl.gz`, Bun.gzipSync(readFileSync(`${base}.jsonl`)));
    rmSync(`${base}.jsonl`);
    expect(clean("--home", home, ...leaseArgs()).json).toMatchObject({
      rows: [{ kind: "session", label: "Compressed diagnostics", name: SESSION, size: 3 }],
      withheld: [],
    });
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("labels marked-only Scratch from a compressed archive header", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    for (const id of [SESSION, ANOTHER]) {
      marked("shop", "verify", id);
      file(`shop/verify/${id}/report.txt`, "old", 30);
    }
    const compressed = archive(SESSION, "2026-10-12", "Compressed diagnostics", 25, "x".repeat(96_000));
    writeFileSync(`${compressed}.jsonl.gz`, Bun.gzipSync(readFileSync(`${compressed}.jsonl`)));
    rmSync(`${compressed}.jsonl`);
    const invalid = archive(ANOTHER, "2026-10-13", "Unreadable diagnostics", 25);
    writeFileSync(`${invalid}.jsonl.gz`, "not a gzip stream");
    rmSync(`${invalid}.jsonl`);

    expect(clean("--home", home, ...leaseArgs()).json).toMatchObject({
      rows: [
        { label: "Compressed diagnostics", name: SESSION },
        { label: ANOTHER.slice(0, 8), name: ANOTHER },
      ],
      withheld: [],
    });
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("does not use a partial archive search when listing or deleting", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    marked("marked-only", "verify");
    file(`marked-only/verify/${SESSION}/report.txt`, "untouched", 30);
    const linked = file("first/verify/previous/run.txt", "linked", 30);
    const unlinked = file("second/explain/previous.txt", "unlinked", 30);
    const ticket = file("first/to-tickets/record/approved.json", "ticket", 30);
    const base = archive(SESSION, "2026-10-12T08-00-00", "Read before failure", 25, linked);
    const args = ["--home", home, ...leaseArgs()];
    const list = clean(...args);
    const selected = list.json.rows.find((row: Listed) => row.repo_key === "first" && row.kind === "session").snapshot;
    const mtime = lstatSync(linked).mtimeMs;
    mkdirSync(base);
    const corrupt = join(base, "1.bash.log.gz");
    writeFileSync(corrupt, "not a gzip stream");

    const after = clean(...args);
    expect(after.code).toBe(0);
    expect(after.json.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ repo_key: "marked-only", kind: "session" }),
      expect.objectContaining({ repo_key: "first", kind: "to-tickets", path: dirname(ticket) }),
    ]));
    expect(after.json.rows).toHaveLength(2);
    expect(after.json.withheld).toEqual([{ reason: expect.stringContaining(corrupt), count: 2 }]);
    const result = clean(...args, "--delete", selected);
    expect(result.code).toBe(0);
    expect(result.json).toMatchObject({
      skipped: [{ repo_key: "first", kind: "session", reason: expect.stringContaining(corrupt) }],
      deleted: [], partial: [],
    });
    expect(readFileSync(linked, "utf8")).toBe("linked");
    expect(lstatSync(linked).mtimeMs).toBe(mtime);
    expect(readFileSync(unlinked, "utf8")).toBe("unlinked");
    expect(readFileSync(corrupt, "utf8")).toBe("not a gzip stream");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test.skipIf(process.platform === "win32")("lists one row across kinds per session and repo and labels by archive title or short id", async () => {
  const lease = await holdSessionLease(WITNESS, { home });
  try {
    for (const [repo, kind, id] of [
      ["first", "verify", SESSION], ["first", "explain", SESSION], ["second", "verify", SESSION],
      ["first", "verify", ANOTHER], ["first", "explain", WITNESS],
    ]) {
      marked(repo!, kind!, id);
      file(`${repo}/${kind}/${id}/report.txt`, "old", 28);
    }
    const archive = join(home, ".omp", "agent", "sessions", "project", `2026-10-12T08-00-00_${SESSION}.jsonl`);
    mkdirSync(dirname(archive), { recursive: true });
    writeFileSync(archive, [
      JSON.stringify({ type: "title", title: "Explain checkout ownership" }),
      JSON.stringify({ type: "session", id: SESSION, cwd: "/project" }),
    ].join("\n") + "\n");
    const result = clean("--home", home, ...leaseArgs());
    expect(result.code).toBe(0);
    expect(result.json.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ repo_key: "first", kind: "session", session_id: SESSION, label: "Explain checkout ownership", size: 6, age_days: 28 }),
      expect.objectContaining({ repo_key: "second", kind: "session", session_id: SESSION, label: "Explain checkout ownership", size: 3, age_days: 28 }),
      expect.objectContaining({ repo_key: "first", kind: "session", session_id: ANOTHER, label: ANOTHER.slice(0, 8), size: 3 }),
    ]));
    expect(result.json.rows).toHaveLength(3);
    expect(result.json.kept).toBe(1);
    expect(result.json.withheld).toEqual([]);
  } finally {
    await stopSessionLeaseHolders([lease]);
  }
});

test.skipIf(process.platform === "win32")("a changed session snapshot skips the whole row while an unrelated tick still deletes", async () => {
  const lease = await holdSessionLease(WITNESS, { home });
  try {
    marked("shop", "verify");
    marked("shop", "explain");
    const first = file(`shop/verify/${SESSION}/one`, "abc", 30);
    const second = file(`shop/explain/${SESSION}/two`, "def", 35);
    const ticket = file("shop/to-tickets/old-ticket/approved.json", "g", 25);
    const args = ["--home", home, ...leaseArgs()];
    const listing = clean(...args).json;
    const session = listing.rows.find((row: { kind: string }) => row.kind === "session");
    const record = listing.rows.find((row: { kind: string }) => row.kind === "to-tickets");
    expect(session.snapshot).toEqual(expect.any(String));
    expect(record.snapshot).toEqual(expect.any(String));
    utimesSync(first, daysAgo(31), daysAgo(31));
    const result = clean(...args, "--delete", session.snapshot, record.snapshot);
    expect(result.code).toBe(0);
    expect(result.json.skipped).toMatchObject([{ kind: "session", reason: "Newest file or its time changed" }]);
    expect(result.json.deleted).toMatchObject([{ kind: "to-tickets", removed: [dirname(ticket)], freed: 1 }]);
    expect(result.json.partial).toEqual([]);
    expect(existsSync(first)).toBe(true);
    expect(existsSync(second)).toBe(true);
    expect(existsSync(ticket)).toBe(false);
  } finally {
    await stopSessionLeaseHolders([lease]);
  }
});

test.skipIf(process.platform === "win32")("old Scratch withholds one row per kind and every session in that repo only", async () => {
  const lease = await holdSessionLease(WITNESS, { home });
  try {
    marked("mixed", "verify");
    marked("marked-only", "verify");
    file(`mixed/verify/${SESSION}/old`, "keep", 30);
    file(`marked-only/verify/${SESSION}/old`, "offer", 30);
    const selected = clean("--home", home, ...leaseArgs()).json.rows.find((row: Listed) => row.repo_key === "mixed");
    const uuidWithoutMark = file(`mixed/verify/${ANOTHER}/notes`, "old", 30);
    file("mixed/verify/old.md", "old", 30);
    file("mixed/explain/old.md", "old", 30);
    file("mixed/to-tickets/record/approved.json", "offer", 25);
    const listing = clean("--home", home, ...leaseArgs()).json;
    expect(listing.rows).toMatchObject([
      { repo_key: "marked-only", kind: "session" }, { repo_key: "mixed", kind: "to-tickets" },
    ]);
    expect(listing.withheld).toEqual([{ reason: expect.stringContaining("attribution"), count: 3 }]);
    const result = clean("--home", home, ...leaseArgs(), "--delete", selected.snapshot);
    expect(result.json.deleted).toEqual([]);
    expect(result.json.skipped).toMatchObject([{ repo_key: "mixed", kind: "session", reason: expect.stringContaining("attribution") }]);
    expect(existsSync(uuidWithoutMark)).toBe(true);
    expect(existsSync(join(root, `mixed/verify/${SESSION}/old`))).toBe(true);
  } finally {
    await stopSessionLeaseHolders([lease]);
  }
});

test.skipIf(process.platform === "win32")("unreadable Scratch inventory withholds only rows that depend on it", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  try {
    const flow = legacyFlowFixture(home, dir);
    flow.state.lifecycle = [{ event: "closed", time: daysAgo(40).toISOString() }];
    writeFileSync(flow.source, JSON.stringify(flow.state));
    const repo = basename(dirname(dirname(flow.folder)));
    const ticket = file(`${repo}/to-tickets/record/approved.json`, "ticket", 30);
    const inaccessible = join(root, repo, "explain");
    for (const [project, kind] of [[repo, "explain"], [repo, "verify"], ["other", "verify"]] as const) {
      marked(project, kind);
      file(`${project}/${kind}/${SESSION}/report.txt`, "keep", 30);
    }
    const args = ["--home", home, ...leaseArgs()];
    const initial = clean(...args).json.rows as Listed[];
    const affected = initial.find(row => row.repo_key === repo && row.kind === "session")!;
    const record = initial.find(row => row.kind === "to-tickets")!;

    const listing = runClean(args, "inventory", inaccessible);
    expect(listing.code).toBe(0);
    expect(listing.json.rows).toMatchObject([
      { kind: "flow", path: flow.folder },
      { kind: "to-tickets", path: dirname(ticket) },
      { kind: "session", repo_key: "other" },
    ]);
    expect(listing.json.withheld).toEqual([{ reason: expect.stringContaining(inaccessible), count: 2 }]);

    const projectFault = runClean(args, "inventory", join(root, repo));
    expect(projectFault.code).toBe(0);
    expect(projectFault.json.rows).toMatchObject([{ kind: "session", repo_key: "other" }]);
    expect(projectFault.json.withheld).toEqual([{ reason: expect.stringContaining(repo), count: 1 }]);

    const deletion = runClean([...args, "--delete", affected.snapshot, record.snapshot], "inventory", inaccessible);
    expect(deletion.code).toBe(0);
    expect(deletion.json).toMatchObject({
      deleted: [{ kind: "to-tickets", removed: [dirname(ticket)] }],
      partial: [], skipped: [{ kind: "session", reason: expect.stringContaining(inaccessible) }],
    });
    expect(readFileSync(join(inaccessible, SESSION, "report.txt"), "utf8")).toBe("keep");
    expect(readFileSync(join(root, repo, "verify", SESSION, "report.txt"), "utf8")).toBe("keep");
  } finally {
    await stopSessionLeaseHolders([witness]);
  }
});

test("each to-tickets slug is aged by its newest file and offered on its own", () => {
  const old = file("shop/to-tickets/old/approved.json", "12345", 20);
  const earlier = file("shop/to-tickets/earlier/approved.json", "abc", 30);
  file("shop/to-tickets/earlier/archive/report.txt", "1234567", 30);
  file("shop/to-tickets/current/approved.json", "x", 60);
  file("shop/to-tickets/current/publication.json", "y", 2);
  const result = list();
  expect(result.code).toBe(0);
  expect(result.json.rows).toMatchObject([
    { path: dirname(earlier), kind: "to-tickets", size: 10, age_days: 30 },
    { path: dirname(old), kind: "to-tickets", size: 5, age_days: 20 },
  ]);
  expect(result.json.kept).toBe(1);
  expect(result.json.withheld).toEqual([]);
});

test.skipIf(process.platform === "win32")("one recent member keeps the session while new directory and mark times do not", async () => {
  const lease = await holdSessionLease(WITNESS, { home });
  try {
    marked("shop", "verify");
    marked("shop", "explain");
    file(`shop/verify/${SESSION}/verify.txt`, "a", 40);
    const fresh = file(`shop/explain/${SESSION}/nested/still-written.txt`, "b", 1);
    const list = () => clean("--home", home, ...leaseArgs()).json;
    expect(list()).toMatchObject({ rows: [], kept: 1, withheld: [] });
    utimesSync(fresh, daysAgo(28), daysAgo(28));
    expect(list().rows).toMatchObject([{ kind: "session", age_days: 28, size: 2 }]);
  } finally {
    await stopSessionLeaseHolders([lease]);
  }
});

test("--older-than overrides the 15-day default", () => {
  const old = file("shop/to-tickets/record/approved.json", "a", 60);
  const paths = [dirname(old)];
  expect(listedPaths("90d")).toEqual([]);
  expect(listedPaths("30d")).toEqual(paths);
  expect(listedPaths("4w")).toEqual(paths);
  expect(listedPaths("30")).toEqual(paths);
  expect(listedPaths("2000h")).toEqual([]);
  utimesSync(old, daysAgo(14), daysAgo(14));
  expect(clean("--home", home).json).toMatchObject({ older_than: "15d", rows: [] });
  utimesSync(old, daysAgo(16), daysAgo(16));
  expect(clean("--home", home).json.rows).toMatchObject([{ label: "record" }]);
});

test("an unreadable historical Grilling folder stays protected without hiding a to-tickets row", () => {
  const historical = file("shop/grilling/run/page.jsonl", "{broken", 40);
  const tickets = file("shop/to-tickets/record/approved.json", "x", 40);
  expect(list()).toMatchObject({
    code: 0, json: { rows: [{ path: dirname(tickets) }], kept: 0, withheld: [{ reason: "Historical Grilling state is unreadable", count: 1 }] },
  });
  expect(existsSync(historical)).toBe(true);
});

test("a home with no Scratch lists nothing", () => {
  rmSync(join(home, ".vstack"), { recursive: true });
  const r = list();
  expect(r.code).toBe(0);
  expect(r.json.rows).toEqual([]);
});

test("symlinks are never followed: not for the newest mtime, the size, or the delete", () => {
  const outside = join(dir, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "precious.txt"), "fresh and big ".repeat(100));
  // An entry dir holding a link to a fresh outside dir.
  file("shop/to-tickets/with-link/notes.md", "abc", 30);
  const inner = join(root, "shop/to-tickets/with-link/data");
  symlinkSync(outside, inner);
  lutimesSync(inner, daysAgo(25), daysAgo(25));
  const linkEntry = join(root, "shop/to-tickets/record-link");
  symlinkSync(outside, linkEntry);
  lutimesSync(linkEntry, daysAgo(30), daysAgo(30));

  const rows = listed();
  expect(rows).toMatchObject([
    { path: linkEntry, age_days: 30, size: lstatSync(linkEntry).size },
    { path: dirname(inner), age_days: 25, size: 3 + lstatSync(inner).size },
  ]);
  writeFileSync(join(outside, "precious.txt"), "fresh and big ".repeat(10000));
  expect(listed()).toEqual(rows);

  const r = clean("--home", home, "--older-than", "14d", "--delete", ...rows.map(row => row.snapshot));
  expect(r.code).toBe(0);
  expect(r.json.deleted).toMatchObject([{ removed: [linkEntry] }, { removed: [dirname(inner)] }]);
  expect(existsSync(dirname(inner))).toBe(false);
  expect(() => lstatSync(linkEntry)).toThrow();
  expect(readdirSync(outside)).toEqual(["precious.txt"]);
});

test("a linked key or kind dir is not walked", () => {
  const outside = join(dir, "outside-key");
  mkdirSync(join(outside, "to-tickets"), { recursive: true });
  writeFileSync(join(outside, "to-tickets", "old"), "x");
  utimesSync(join(outside, "to-tickets", "old"), daysAgo(30), daysAgo(30));
  symlinkSync(outside, join(root, "linked-key"));
  mkdirSync(join(root, "linked-kind"));
  symlinkSync(join(outside, "to-tickets"), join(root, "linked-kind", "to-tickets"));
  expect(listedPaths()).toEqual([]);
});

test.each(["Scratch root", "Scratch ancestor"])("a linked %s cannot lead deletion outside home", (component) => {
  file("shop/to-tickets/old/notes.md", "x", 30);
  const selected = listed()[0]!.snapshot;
  const outside = join(dir, "outside");
  const linked = component === "Scratch root" ? root : dirname(root);
  const outsideRoot = component === "Scratch root" ? outside : join(outside, "tmp");
  const precious = join(outsideRoot, "shop", "to-tickets", "old", "notes.md");
  mkdirSync(dirname(precious), { recursive: true });
  writeFileSync(precious, "keep me");
  utimesSync(precious, daysAgo(30), daysAgo(30));
  rmSync(linked, { recursive: true });
  symlinkSync(outside, linked);

  const result = clean("--home", home, "--older-than", "14d", "--delete", selected);
  expect(result.code).toBe(2);
  expect(existsSync(precious)).toBe(true);
});

test("deleting prunes the kind and key dirs it empties, and keeps the Scratch root", () => {
  file("shop/to-tickets/a/approved.json", "a", 30);
  file("shop/to-tickets/b/approved.json", "b", 30);
  file("other/to-tickets/expired/approved.json", "h", 30);
  file("other/to-tickets/keep/approved.json", "k", 1);

  const r = clean("--home", home, "--older-than", "14d", "--delete", ...listed().map(row => row.snapshot));
  expect(r.code).toBe(0);
  expect(r.json.deleted).toHaveLength(3);
  expect(existsSync(join(root, "shop"))).toBe(false);
  expect(r.json.pruned).toEqual([join(root, "shop/to-tickets"), join(root, "shop")]);
  expect(readdirSync(join(root, "other/to-tickets"))).toEqual(["keep"]);
  expect(existsSync(root)).toBe(true);
});

test.skipIf(process.platform === "win32" || process.getuid?.() === 0)("deletes nested read-only snapshots without changing symlink targets or preview permissions", () => {
  const entry = join(root, "shop/to-tickets/run1");
  const snapshot = join(entry, "base-snapshot");
  const tests = join(snapshot, "tests");
  const outside = join(dir, "outside");
  const readonlyDirs = [snapshot, tests, outside];
  const document = file("shop/to-tickets/run1/base-snapshot/decision-register.yaml", "retained proof", 10);
  const source = file("shop/to-tickets/run1/base-snapshot/tests/vstack-clean.test.ts", "test fixture", 10);
  mkdirSync(outside);
  writeFileSync(join(outside, "precious.txt"), "keep");
  const link = join(snapshot, "outside");
  symlinkSync(outside, link);
  lutimesSync(link, daysAgo(10), daysAgo(10));
  chmodSync(document, 0o444);
  chmodSync(source, 0o444);
  for (const path of readonlyDirs) chmodSync(path, 0o555);
  try {
    expect(listedPaths("3d")).toEqual([entry]);
    for (const path of readonlyDirs) expect(lstatSync(path).mode & 0o777).toBe(0o555);

    const r = clean("--home", home, "--older-than", "3d", "--delete", listed("3d")[0]!.snapshot);
    expect(r.code).toBe(0);
    expect(r.json.deleted).toMatchObject([{ removed: [entry] }]);
    expect(existsSync(entry)).toBe(false);
    expect(readdirSync(outside)).toEqual(["precious.txt"]);
    expect(lstatSync(outside).mode & 0o777).toBe(0o555);
  } finally {
    for (const path of readonlyDirs) if (existsSync(path)) chmodSync(path, 0o755);
  }
});

test.each(["fresh", "replaced", "age", "home"])("a %s mismatch leaves the entire row alone", (change) => {
  const newest = file("shop/to-tickets/record/old.txt", "a", 30);
  const selection = listed()[0]!.snapshot;
  let targetHome = home, targetAge = "14d";
  if (change === "fresh") utimesSync(newest, new Date(), new Date());
  if (change === "replaced") {
    renameSync(dirname(newest), join(dir, "previous-member"));
    file("shop/to-tickets/record/old.txt", "a", 30);
  }
  if (change === "age") targetAge = "15d";
  if (change === "home") targetHome = join(dir, "different-home");
  const result = clean("--home", targetHome, "--older-than", targetAge, "--delete", selection);
  expect(result.code).toBe(0);
  expect(result.json.deleted).toEqual([]);
  const reason = change === "fresh" ? "Newer than the TTL"
    : change === "replaced" ? "Row members changed or were replaced" : "Snapshot home or age does not match";
  expect(result.json.skipped).toMatchObject([{ kind: "to-tickets", label: "record", reason }]);
  expect(existsSync(newest)).toBe(true);
});

test.skipIf(process.platform === "win32")("delete rejects an added member, a late lease, and lost lease evidence", async () => {
  const witness = await holdSessionLease(WITNESS, { home });
  let resumed: Awaited<ReturnType<typeof holdSessionLease>> | undefined;
  try {
    marked("shop", "verify");
    const original = file(`shop/verify/${SESSION}/old.txt`, "keep", 30);
    const args = ["--home", home, ...leaseArgs()];
    const selection = () => clean(...args).json.rows[0].snapshot;
    const beforeAddition = selection();
    marked("shop", "explain");
    const addition = file(`shop/explain/${SESSION}/old.txt`, "keep too", 40);
    expect(clean(...args, "--delete", beforeAddition).json.skipped)
      .toMatchObject([{ reason: "Row members changed or were replaced" }]);
    const selected = selection();
    resumed = await holdSessionLease(SESSION, { home });
    expect(clean(...args).json).toMatchObject({ rows: [], kept: 1, withheld: [] });
    expect(clean(...args, "--delete", selected).json.skipped).toMatchObject([{ reason: "Session holds a lease" }]);
    expect(runClean([...args, "--delete", selected], "lease").json.skipped)
      .toMatchObject([{ reason: expect.stringContaining("Injected lease scan failure") }]);
    expect(existsSync(original)).toBe(true);
    expect(existsSync(addition)).toBe(true);
  } finally {
    await stopSessionLeaseHolders(resumed ? [witness, resumed] : [witness]);
  }
});

test("a failed lease scan withholds dependent rows without hiding to-tickets", () => {
  for (const id of [SESSION, ANOTHER]) {
    marked("shop", "verify", id);
    file(`shop/verify/${id}/report.txt`, "x", 28);
  }
  const record = file("shop/to-tickets/record/publication.json", "{}", 29);
  const args = ["--home", home, ...leaseArgs()];
  const result = runClean(args, "lease");
  expect(result.code).toBe(0);
  expect(result.json).toMatchObject({
    rows: [{ kind: "to-tickets", path: dirname(record) }],
    kept: 0,
    withheld: [{ reason: expect.stringMatching(/Injected lease scan failure|leases are named mutexes on Windows/), count: 2 }],
  });
});

test("a child measurement fault skips the whole row before removing anything", () => {
  const old = file("shop/to-tickets/record/deep/old.txt", "x", 40);
  const newest = file("shop/to-tickets/record/last.txt", "y", 30);
  const r = runClean(["--home", home, "--older-than", "14d", "--delete", listed()[0]!.snapshot], "measure", old);
  expect(r.code).toBe(0);
  expect(r.json).toMatchObject({
    deleted: [], partial: [], skipped: [{ reason: expect.stringContaining("Injected unreadable child") }],
  });
  expect(existsSync(old)).toBe(true);
  expect(existsSync(newest)).toBe(true);
});

test.skipIf(process.platform === "win32")("a removal fault reports a partly deleted row and its individual failure", async () => {
  const lease = await holdSessionLease(WITNESS, { home });
  try {
    const completed = marked("shop", "explain");
    const failed = marked("shop", "verify");
    file(`shop/explain/${SESSION}/report.txt`, "gone", 40);
    const fault = file(`shop/verify/${SESSION}/report.txt`, "left", 36);
    const args = ["--home", home, ...leaseArgs()];
    const selection = clean(...args).json.rows[0].snapshot;
    const r = runClean([...args, "--delete", selection], "remove", fault);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({
      deleted: [], skipped: [],
      partial: [{ kind: "session", removed: [completed], freed: 4, failed_entries: [{ path: failed, reason: "Injected removal failure" }] }],
    });
    expect(existsSync(completed)).toBe(false);
    expect(existsSync(fault)).toBe(true);
  } finally {
    await stopSessionLeaseHolders([lease]);
  }
});

test("delete refuses an old entry path before removing any selected rows", () => {
  const p = file("shop/to-tickets/record/approved.json", "a", 30);
  const result = clean("--home", home, "--older-than", "14d", "--delete", listed()[0]!.snapshot, dirname(p));
  expect(result.code).toBe(2);
  expect(result.stderr).toContain("not an entry path");
  expect(existsSync(p)).toBe(true);
});

test("a listing larger than a pipe buffer reaches a reader that starts after the script exits", async () => {
  for (let i = 0; i < 400; i++) file(`shop/to-tickets/record-${String(i).padStart(3, "0")}/approved.json`, "x", 30);
  const proc = Bun.spawn(["sh", "-c", 'bun "$0" --home "$1" --older-than 14d | (sleep 1; cat)', CLEAN, home], { cwd: dir, env: ENV, stdout: "pipe" });
  const stdout = await new Response(proc.stdout).text();
  expect(await proc.exited).toBe(0);
  expect(JSON.parse(stdout).rows).toHaveLength(400);
});

test("--home is required and --older-than must be a duration", () => {
  expect(clean("--older-than", "14d").code).toBe(2);
  expect(clean("--home", home, "--older-than", "soon").code).toBe(2);
  expect(clean("--home", home, "--older-than", "-3d").code).toBe(2);
});
