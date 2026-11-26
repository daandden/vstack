import { spawn } from "bun";
import { randomBytes } from "node:crypto";
import {
  appendFileSync, closeSync, constants, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  realpathSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";

const root = realpathSync(import.meta.dir);
const runtime = join(root, "runtime");
const journal = join(runtime, "state.jsonl");
const archive = join(root, "last-state.jsonl");
const rwHome = join(runtime, "rw-home");
const downloadHome = join(runtime, "download-home");
const privateDir = join(root, "private");
const rwToken = join(privateDir, "rw-token");
const ownerRequest = join(runtime, "owner-request.json");
const folderReceipt = join(runtime, "folder-receipt.json");
const downloadOnlyPath = join(runtime, "download-only-id");
const binary = join(privateDir, "pikpak-cli");
const rwLauncher = join(root, "pikpak-rw");
const driver = join(root, "driver");
const inner = [process.execPath, "--no-env-file", import.meta.path];
const jsonFlags = ["-F", "json"];
const id = /^[a-zA-Z0-9_][a-zA-Z0-9_-]{0,127}$/;
const baselineName = /^[a-f0-9]{64}\.fig$/;
const runName = /^vstack-621-[a-f0-9]{24}$/;
const cursor = /^[a-zA-Z0-9_+\/=%.-]{1,1024}$/;

type Start = { type: "start"; folder: string; name: string; fixture: string };
type RecordEntry = Start | { type: "file" | "cursor"; value: string };
type State = Start & { files: Set<string>; cursors: Set<string>; downloadOnly?: string };
type Result = { status: number; out: string; err: string };
type ListedItem = { id: string; kind: string; name?: string; parent: string };
type Listing = { files: ListedItem[]; next: string };
type FolderReceipt = { id: string; name: string; parent: "" };
type DriverRequest = { action: "create"; value: string } | { action: "remove" | "preflight"; value?: never } |
  { action: "parent"; value?: string };

class Refusal extends Error {}
function refuse(reason: string): never { throw new Refusal(reason); }
function matches(re: RegExp, value: unknown): value is string {
  return typeof value === "string" && re.test(value);
}
function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function parse(text: string, reason: string): Record<string, unknown> {
  let value: unknown;
  try { value = JSON.parse(text); } catch { refuse(reason); }
  if (!isObject(value)) refuse(reason);
  return value;
}
function appendJournalEntry(entry: RecordEntry) {
  const fd = openSync(journal, constants.O_WRONLY | constants.O_APPEND);
  try { appendFileSync(fd, JSON.stringify(entry) + "\n"); } finally { closeSync(fd); }
}
function state(): State {
  let text: string;
  try { text = readFileSync(journal, "utf8"); } catch { refuse("missing run state"); }
  const [header, ...rows] = text.trimEnd().split("\n");
  const start = parse(header, "invalid run state");
  if (start.type !== "start" || !matches(id, start.folder) || !matches(runName, start.name) ||
      typeof start.fixture !== "string" || !isAbsolute(start.fixture)) refuse("invalid run state");
  const s: State = { type: "start", folder: start.folder, name: start.name, fixture: start.fixture,
    files: new Set(), cursors: new Set() };
  for (const row of rows) {
    const e = parse(row, "invalid run state");
    if (e.type === "file" && matches(id, e.value) && e.value !== s.folder) s.files.add(e.value);
    else if (e.type === "cursor" && matches(cursor, e.value) && !e.value.startsWith("-")) s.cursors.add(e.value);
    else refuse("invalid run state");
  }
  if (exists(downloadOnlyPath)) {
    const file = readFileSync(downloadOnlyPath, "utf8");
    if (!s.files.has(file)) refuse("invalid download-only file ID");
    s.downloadOnly = file;
  }
  return s;
}
function beneath(rootPath: string, path: string) {
  const rel = relative(rootPath, path);
  return rel !== "" && rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
}
function exists(path: string) {
  try { lstatSync(path); return true; } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return false;
    refuse("local path cannot be checked");
  }
}
function localPath(s: State, input: string, download: boolean) {
  if (!input || input.startsWith("-") || /[\x00-\x1f\x7f]/.test(input) || input.split("/").includes("..")) {
    refuse("invalid local path or traversal");
  }
  const path = resolve(input);
  if (!beneath(s.fixture, path)) refuse("local path is outside the fixture directory");
  try {
    if (!download) {
      const verified = realpathSync(path);
      const st = statSync(verified);
      if (!beneath(s.fixture, verified) || !st.isFile() || st.nlink !== 1 || !verified.endsWith(".fig")) {
        refuse("upload needs an in-fixture regular .fig file");
      }
      return verified;
    }
    if (input.endsWith("/") || !basename(path).endsWith(".fig")) refuse("download needs a .fig output path");
    const parent = realpathSync(dirname(path));
    const verified = join(parent, basename(path));
    if (!beneath(s.fixture, verified)) refuse("local path is outside the fixture directory");
    if (exists(verified) || exists(verified + ".part")) refuse("download output or partial already exists");
    return verified;
  } catch (e) {
    if (e instanceof Refusal) throw e;
    refuse("local path cannot be resolved");
  }
}
function isJsonFlag(a: string[], i: number) { return a[i] === "-F" && a[i + 1] === "json"; }
function guard(s: State, a: string[]) {
  if (s.downloadOnly && (a[0] !== "download" || a[1] !== s.downloadOnly)) {
    refuse("download-only launcher accepts only the bound file ID");
  }
  switch (a[0]) {
    case "ls":
      if (!(a.length === 4 && isJsonFlag(a, 2)) &&
          !(a.length === 6 && a[2] === "-t" && isJsonFlag(a, 4))) refuse("unsupported ls arguments");
      if (a[1] !== s.folder) refuse("folder ID not in run scope");
      if (a.length === 6 && !s.cursors.has(a[3])) refuse("unknown listing cursor");
      return a;
    case "get":
      if (a.length !== 4 || !isJsonFlag(a, 2)) refuse("unsupported get arguments");
      if (!s.files.has(a[1])) refuse("file ID not in run scope");
      return a;
    case "download":
      if (a.length !== 4 || a[2] !== "-o") refuse("unsupported download arguments");
      if (!s.files.has(a[1])) refuse("file ID not in run scope");
      return [a[0], a[1], "-o", localPath(s, a[3], true)];
    case "upload": {
      if (a.length !== 9 || a[2] !== "-p" || a[4] !== "-n" || a[6] !== "-w" || !isJsonFlag(a, 7)) {
        refuse("unsupported upload arguments");
      }
      if (a[3] !== s.folder) refuse("folder ID not in run scope");
      const path = localPath(s, a[1], false);
      if (!matches(baselineName, a[5])) refuse("upload name must be a SHA-256 .fig");
      return [a[0], path, ...a.slice(2)];
    }
    default: refuse("subcommand not allowed");
  }
}
function listing(text: string, reason: string): Listing {
  const value = parse(text, reason);
  const rows: unknown = value.files;
  const next = value.next_page_token ?? "";
  if (!Array.isArray(rows) || (next !== "" && (!matches(cursor, next) || next.startsWith("-")))) refuse(reason);
  const files: ListedItem[] = [];
  for (const row of rows as unknown[]) {
    if (!isObject(row)) refuse(reason);
    const { id: itemId, kind, name } = row;
    const parent = normalizeRootParent(row.parent_id);
    if (!matches(id, itemId) || typeof kind !== "string" || !kind ||
        (name !== undefined && typeof name !== "string") || (parent !== "" && !matches(id, parent))) refuse(reason);
    files.push({ id: itemId, kind, name, parent });
  }
  return { files, next };
}
function register(s: State, args: string[], out: string) {
  if (args[0] === "upload") {
    const file = parse(out, "unexpected upload response");
    if (file.phase !== "PHASE_TYPE_COMPLETE" || !matches(id, file.file_id) || file.file_id === s.folder ||
        (file.parent_id !== undefined && file.parent_id !== s.folder)) refuse("upload response does not prove an in-scope file ID");
    if (!s.files.has(file.file_id)) appendJournalEntry({ type: "file", value: file.file_id });
  } else if (args[0] === "ls") {
    const { files, next } = listing(out, "unexpected listing response");
    for (const f of files) {
      if (f.kind === "file" && f.parent === s.folder && f.id !== s.folder && !s.files.has(f.id)) {
        appendJournalEntry({ type: "file", value: f.id });
      }
    }
    if (next && !s.cursors.has(next)) appendJournalEntry({ type: "cursor", value: next });
  }
}
function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PIKPAK_")) delete env[key];
  return env;
}
async function captured(cmd: string[], options: { env?: Record<string, string | undefined>; cwd?: string } = {}): Promise<Result> {
  const child = spawn(cmd, { ...options, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [status, out, err] = await Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]);
  return { status, out, err };
}
async function callCli(args: string[], home = rwHome): Promise<Result> {
  let token: string;
  try {
    const st = statSync(rwToken);
    if (!st.isFile() || (st.mode & 0o777) !== 0o600 || st.uid !== process.getuid!()) refuse("token file must be owned and mode 0600");
    token = readFileSync(rwToken, "utf8").replace(/\r?\n$/, "");
    if (!/^[!-~]+$/.test(token)) refuse("token file must contain one nonempty token");
  } catch (e) {
    if (e instanceof Refusal) throw e;
    refuse("token file unavailable");
  }
  if (args.some((arg) => arg.includes(token)) || binary.includes(token)) refuse("credential in CLI arguments");
  const result = await captured([binary, ...args], { cwd: home, env: {
    PATH: "/usr/bin:/bin", HOME: home, XDG_CONFIG_HOME: home, TMPDIR: home,
    PIKPAK_DIR: home, PIKPAK_PAT_PATH: join(home, ".pat.json"),
    PIKPAK_CREDENTIALS: join(home, ".credentials.json"), PIKPAK_TOKEN: token,
    PIKPAK_NO_LOG: "1", PIKPAK_NO_UPDATE_NOTIFIER: "1", PIKPAK_NO_SKILL_SYNC: "1",
  } });
  const hide = (value: string) => value.split(token).join("[redacted]".includes(token) ? "" : "[redacted]");
  return { status: result.status, out: hide(result.out), err: hide(result.err) };
}
function emit(result: Result) {
  process.stdout.write(result.out);
  process.stderr.write(result.err);
  return result.status;
}
async function launch(args: string[]) {
  const s = state();
  const safe = guard(s, args);
  const result = await callCli(safe, s.downloadOnly ? downloadHome : rwHome);
  if (result.status === 0) register(s, safe, result.out);
  return emit(result);
}
function restrictToDownload([file, ...rest]: string[]) {
  const s = state();
  if (s.downloadOnly) refuse("launcher is already download-only");
  if (!file || rest.length || !s.files.has(file)) refuse("download-only needs one in-scope file ID");
  try {
    mkdirSync(downloadHome, { mode: 0o700 });
    const entries = readdirSync(downloadHome);
    if (entries.length) refuse("download-only CLI home is not empty");
    writeFileSync(downloadOnlyPath, file, { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ download_only: file, initial_home: { name: basename(downloadHome), entries } }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") refuse("launcher is already download-only");
    throw error;
  }
  return 0;
}
function commandAfterSeparator(args: string[]) {
  if (args[0] !== "--" || !args[1]) refuse("expected -- followed by a command");
  return args.slice(1);
}
async function runDriverCliInChild(request: DriverRequest) {
  writeFileSync(ownerRequest, JSON.stringify(request), { flag: "wx", mode: 0o600 });
  try { return await captured([...inner, "driver-cli"]); }
  finally { rmSync(ownerRequest, { force: true }); }
}
function parentArgs(next?: string) {
  return ["ls", ...(next ? ["-t", next] : []), ...jsonFlags];
}
function readFolderReceipt(): FolderReceipt {
  let text: string;
  try { text = readFileSync(folderReceipt, "utf8"); } catch { refuse("missing run-folder receipt"); }
  const receipt = parse(text, "invalid run-folder receipt");
  if (!matches(id, receipt.id) || !matches(runName, receipt.name) || receipt.parent !== "") {
    refuse("invalid run-folder receipt");
  }
  return { id: receipt.id, name: receipt.name, parent: receipt.parent };
}
function normalizeRootParent(parent: unknown) {
  return parent ?? "";
}
async function driverCli(args: string[]) {
  if (args.length || !exists(ownerRequest)) refuse("missing owner request");
  const request = parse(readFileSync(ownerRequest, "utf8"), "invalid owner request");
  const { action, value } = request;
  rmSync(ownerRequest);
  if (action === "create" && matches(runName, value) && !exists(journal) && !exists(folderReceipt)) {
    const created = await callCli(["mkdir", value, ...jsonFlags]);
    if (created.status !== 0) return emit(created);
    const item = parse(created.out, "unexpected mkdir response");
    const parent = normalizeRootParent(item.parent_id);
    if (!matches(id, item.id) || item.name !== value || parent !== "") {
      refuse("mkdir did not identify the unique root run folder");
    }
    const receipt: FolderReceipt = { id: item.id, name: item.name, parent };
    writeFileSync(folderReceipt, JSON.stringify(receipt), { flag: "wx", mode: 0o600 });
    return emit(created);
  }
  if (action === "preflight" && Object.keys(request).length === 1) {
    readFolderReceipt();
    return preflight();
  }
  if (action === "remove") {
    if (Object.keys(request).length !== 1) refuse("remove request must contain only the action");
    const receipt = readFolderReceipt();
    const item = await findInParent(receipt.id, (next) => callCli(parentArgs(next)));
    if (item?.kind !== "folder" || item.name !== receipt.name || item.parent !== receipt.parent) {
      refuse("run-folder receipt does not match the parent listing");
    }
    return emit(await callCli(["rm", receipt.id, ...jsonFlags]));
  }
  if (action === "parent" && (value === undefined || matches(cursor, value) && !value.startsWith("-"))) {
    return emit(await callCli(parentArgs(value)));
  }
  refuse("unsupported driver CLI operation");
}
async function findInParent(folder: string, loadPage: (next: string) => Promise<Result>) {
  const seen = new Set<string>();
  let next = "";
  do {
    const p = await loadPage(next);
    if (p.status !== 0) refuse("parent listing failed during cleanup");
    const page = listing(p.out, "unexpected parent listing response");
    const item = page.files.find((f) => f.id === folder);
    if (item) return item;
    next = page.next;
    if (next && seen.has(next)) refuse("parent listing repeated a cursor");
    seen.add(next);
  } while (next);
}
function requireRemovalAccepted(out: string) {
  if (!/^Move-to-trash request accepted for 1 items(?:; [^\r\n]*)?$/.test(out.trim())) {
    refuse("rm response did not accept exactly one item");
  }
}
async function preflight() {
  const page = async (args: string[]) => {
    const result = await callCli(args);
    if (result.status !== 0) { emit(result); refuse("preflight listing failed"); }
    return listing(result.out, "unexpected preflight listing response");
  };
  const first = await page(["ls", "-l", "1", ...jsonFlags]);
  if (first.next) {
    const second = await page(["ls", "-l", "1", "-t", first.next, ...jsonFlags]);
    if (second.next === first.next) refuse("preflight listing repeated a cursor");
  }
  console.log(JSON.stringify({ pagination_followed: Boolean(first.next) }));

  return 0;
}
async function drive(args: string[]) {
  const checkCli = args[0] === "--preflight";
  if (checkCli) args = args.slice(1);
  const [fixtureArg, ...rest] = args;
  const command = commandAfterSeparator(rest);
  if (!fixtureArg) refuse("run needs a fixture directory");
  const fixture = realpathSync(fixtureArg);
  if (!statSync(fixture).isDirectory() || fixture === root || beneath(root, fixture) || beneath(fixture, root)) {
    refuse("fixture directory must be separate from the launchers");
  }
  mkdirSync(runtime, { mode: 0o700 });
  const name = "vstack-621-" + randomBytes(12).toString("hex");
  let folder: string | undefined;
  let status = 1;
  let controller: ReturnType<typeof spawn> | undefined;
  let signal: NodeJS.Signals | undefined;
  const interrupt = (sig: NodeJS.Signals) => {
    signal = sig;
    controller?.kill(sig);
  };
  process.on("SIGINT", interrupt);
  process.on("SIGTERM", interrupt);
  try {
    mkdirSync(rwHome, { mode: 0o700 });
    console.log(JSON.stringify({ initial_home: basename(rwHome), entries: readdirSync(rwHome) }));
    console.log(JSON.stringify({ creating: name }));
    const created = await runDriverCliInChild({ action: "create", value: name });
    if (created.status !== 0) { emit(created); refuse("run-folder creation failed"); }
    const item = parse(created.out, "unexpected mkdir response");
    if (!matches(id, item.id) || item.name !== name) refuse("mkdir did not identify the unique run folder");
    folder = item.id;
    writeFileSync(journal, JSON.stringify({ type: "start", fixture, folder, name }) + "\n", { flag: "wx", mode: 0o600 });
    console.log(JSON.stringify({ created: folder, name }));
    if (signal) refuse("interrupted before the proof command");
    const initial = await captured([rwLauncher, "ls", folder, ...jsonFlags], { env: cleanEnvironment() });
    if (initial.status !== 0) { emit(initial); refuse("initial run-folder listing failed"); }
    const page = listing(initial.out, "unexpected initial listing response");
    if (page.files.length || page.next) refuse("new run folder is not empty");
    console.log(JSON.stringify({ initial_folder: folder, files: [] }));
    if (checkCli) {
      const result = await runDriverCliInChild({ action: "preflight" });
      emit(result);
      if (result.status !== 0) refuse("live preflight did not complete");
    }
    if (signal) refuse("interrupted before the proof command");
    controller = spawn(command, { stdin: "inherit", stdout: "inherit", stderr: "inherit", env: {
      ...cleanEnvironment(), PIKPAK_RW: rwLauncher, PIKPAK_FIXTURE_DIR: fixture,
      PIKPAK_RUN_FOLDER_ID: folder, PIKPAK_DRIVER: driver, PIKPAK_STATE: journal,
    } });
    status = await controller.exited;
    controller = undefined;
    if (signal) status = signal === "SIGINT" ? 130 : 143;
  } finally {
    try {
      try {
        const hasJournal = exists(journal);
        if (hasJournal) renameSync(journal, archive);
        console.log(JSON.stringify({ journal_archive: hasJournal ? "saved" : "no-journal" }));
      } catch (error) {
        status = 1;
        console.error(JSON.stringify({ journal_archive: "failed", code: (error as NodeJS.ErrnoException).code }));
      }
      if (folder) {
        const removed = await runDriverCliInChild({ action: "remove" });
        emit(removed);
        if (removed.status !== 0) refuse("run folder removal did not succeed");
        if (await findInParent(folder, (next) => runDriverCliInChild({ action: "parent", value: next || undefined }))) {
          refuse("run folder still appears in its parent");
        }
        requireRemovalAccepted(removed.out);
        console.log(JSON.stringify({ removed: folder, absent_from_parent: true }));
      }
    } catch (e) {
      if (folder) console.error(JSON.stringify({ cleanup_unverified: folder }));
      throw e;
    } finally {
      try { rmSync(runtime, { recursive: true }); } finally {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", interrupt);
      }
    }
  }
  return status;
}

try {
  const [action, ...args] = process.argv.slice(2);
  switch (action) {
    case "launch": process.exitCode = await launch(args); break;
    case "run": process.exitCode = await drive(args); break;
    case "download-only": process.exitCode = restrictToDownload(args); break;
    case "driver-cli": process.exitCode = await driverCli(args); break;
    default: refuse("expected run or download-only");
  }
} catch (error) {
  console.error(`PikPak proof: ${error instanceof Refusal ? error.message : "local tooling or CLI start failed"}`);
  process.exitCode = 1;
}