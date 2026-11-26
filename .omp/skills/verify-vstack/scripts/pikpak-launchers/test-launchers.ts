import { spawnSync } from "bun";
import { createHash, randomBytes } from "node:crypto";
import {
  appendFileSync, chmodSync, copyFileSync, existsSync, linkSync, mkdirSync, readFileSync, readdirSync,
  realpathSync, rmSync, symlinkSync, writeFileSync,
} from "node:fs";
import { join } from "node:path";

const [phase, pathArg] = process.argv.slice(2);
const evidence = realpathSync(pathArg);
const installation = join(evidence, "install");
const fixture = join(evidence, "fixture");
const rw = join(installation, "pikpak-rw");
const driver = join(installation, "driver");
const cliLog = join(installation, "cli.log");
const folderReceipt = join(installation, "runtime", "folder-receipt.json");
const casesLog = join(evidence, "cases.log");
const folder = "folder_621";
const file = "baseline_621";
const planted = "planted_621";
const fig = join(fixture, "Target.fig");
const decoy = join(fixture, "Decoy.fig");
const bytes = "agreed fixture bytes\n";
const digest = createHash("sha256").update(bytes).digest("hex");
const name = digest + ".fig";
const revisionName = "c".repeat(64) + ".fig";
const cmd = [process.execPath, import.meta.path];
const flags = ["-F", "json"];
const dummyTokenPath = join(evidence, "rw-dummy-token-file");

function check(ok: unknown, reason: string): asserts ok {
  if (!ok) throw new Error(reason);
}
function event(name: string, fields: Record<string, unknown> = {}, success = true) {
  appendFileSync(casesLog, JSON.stringify({ test: name, result: success ? "pass" : "fail", ...fields }) + "\n");
  check(success, name);
}
function trace() { return existsSync(cliLog) ? readFileSync(cliLog, "utf8").trimEnd().split("\n") : []; }
function exec(argv: string[], env?: Record<string, string | undefined>) {
  const r = spawnSync(argv, { env, stdout: "pipe", stderr: "pipe", stdin: "ignore" });
  return { status: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
}
function request(label: string, argv: string[], status: number, extra?: (result: ReturnType<typeof exec>) => boolean) {
  const before = trace().length;
  const result = exec(argv);
  const executed = trace().length - before;
  event(label, { ...result, executed }, result.status === status && executed === (status === 1 ? 0 : 1) && (!extra || extra(result)));
  return result;
}
function allow(label: string, argv: string[], extra?: (result: ReturnType<typeof exec>) => boolean) {
  return request(label, argv, 0, extra);
}
function deny(label: string, argv: string[], reason: string) {
  return request(label, argv, 1, ({ stderr }) => stderr.includes(reason));
}
function download(id: string, path: string) { return [rw, "download", id, "-o", path]; }
function upload(path: string, folderID = folder, fileName = name) {
  return [rw, "upload", path, "-p", folderID, "-n", fileName, "-w", ...flags];
}
function local(fileName: string) { return join(fixture, fileName); }
function source(fileName: string) { return join(installation, fileName); }
function archive() { return readFileSync(source("last-state.jsonl"), "utf8").trim().split("\n").map((line) => JSON.parse(line)); }

function removeRequest(fields = {}) {
  return ["/bin/sh", "-c", 'printf "%s\\n" "$1" > "$2" && exec "$3" driver-cli', "test",
    JSON.stringify({ action: "remove", ...fields }), source("runtime/owner-request.json"), driver];
}
function cleanupRefusals() {
  deny("forged remove request with an unrelated folder ID never reaches the CLI",
    removeRequest({ value: "unrelated_parent_id" }), "remove request must contain only the action");
  const receipt = readFileSync(folderReceipt, "utf8");
  try {
    rmSync(folderReceipt);
    deny("remove without a mkdir receipt never reaches the CLI", removeRequest(), "missing run-folder receipt");

    writeFileSync(folderReceipt, JSON.stringify({ ...JSON.parse(receipt), id: "unrelated_parent_id" }), { mode: 0o600 });
    const before = trace().length;
    const result = exec(removeRequest());
    const calls = trace().slice(before);
    event("tampered receipt for a differently named folder lists the parent but never calls rm",
      { ...result, calls }, result.status === 1 && result.stderr.includes("receipt does not match the parent listing") &&
      calls.length === 1 && calls[0].endsWith("argv=ls -F json"));
  } finally {
    writeFileSync(folderReceipt, receipt, { mode: 0o600 });
  }
}

function proof() {
  event("driver callback has run scope but no credential", { assigned_folder: process.env.PIKPAK_RUN_FOLDER_ID },
    process.env.PIKPAK_RUN_FOLDER_ID === folder && process.env.PIKPAK_RW === rw &&
    process.env.PIKPAK_TOKEN === undefined && process.env.PIKPAK_PROFILE === undefined);
  deny("RW launcher cannot mkdir", [rw, "mkdir", "stray", ...flags], "subcommand not allowed");
  deny("RW launcher cannot remove even the owned folder", [rw, "rm", folder, ...flags], "subcommand not allowed");
  deny("RW launcher cannot mutate credentials", [rw, "auth", "logout"], "subcommand not allowed");
  deny("driver helper cannot be called without an owner request", [driver, "driver-cli"], "missing owner request");
  cleanupRefusals();
  deny("scope rejects unrelated folder for ls", [rw, "ls", "other_folder", ...flags], "folder ID not in run scope");
  deny("scope rejects a root listing", [rw, "ls", ...flags], "unsupported ls arguments");
  deny("scope rejects unrelated upload parent", upload(fig, "other_folder"), "folder ID not in run scope");
  deny("scope rejects unrelated download ID", download("other_file", local("stray.fig")), "file ID not in run scope");
  deny("scope rejects unrelated get ID", [rw, "get", "other_file", ...flags], "file ID not in run scope");
  deny("scope rejects the run folder as a download ID", download(folder, local("stray.fig")), "file ID not in run scope");
  deny("scope rejects extra global/profile flag", [rw, "ls", folder, ...flags, "--profile", "other"], "unsupported ls arguments");
  deny("scope rejects unknown upload flag", [rw, "upload", fig, "-p", folder, "-n", name, "--checkpoint", ...flags], "unsupported upload arguments");
  deny("scope rejects download without -o", [rw, "download", "other_file"], "unsupported download arguments");
  deny("scope rejects unissued pagination cursor", [rw, "ls", folder, "-t", "foreign-page", ...flags], "unknown listing cursor");
  deny("scope rejects an arbitrary upload name", upload(fig, folder, "random.fig"), "upload name must be a SHA-256 .fig");
  deny("scope rejects recursive upload", upload(local("subdir.fig")), "upload needs an in-fixture regular .fig file");
  deny("scope rejects upload outside fixture", upload(join(evidence, "outside.fig")), "outside the fixture directory");
  deny("scope rejects upload via escaping symlink", upload(local("escape.fig")), "upload needs an in-fixture regular .fig file");
  deny("scope rejects ../ even within fixture", upload(`${fixture}/subdir.fig/../Target.fig`), "invalid local path or traversal");
  deny("scope rejects an out-of-fixture hard link", upload(local("hardlink.fig")), "upload needs an in-fixture regular .fig file");
  allow("launcher uploads through an in-fixture symlink and registers the file ID", upload(local("inside.fig")),
    ({ stdout }) => JSON.parse(stdout).file_id === file);
  allow("RW exact-ID download immediately follows upload", download(file, local("rw-download.fig")), () => readFileSync(local("rw-download.fig"), "utf8") === bytes);
  chmodSync(dummyTokenPath, 0o644);
  try {
    deny("invalid token mode refuses without execution", download(file, local("mode-check.fig")), "mode 0600");
  } finally {
    chmodSync(dummyTokenPath, 0o600);
  }
  writeFileSync(source("malformed-listing"), "");
  try {
    const result = exec([rw, "ls", folder, ...flags]);
    event("malformed provider listing is refused before exposing any rows", result,
      result.status === 1 && result.stdout === "" && result.stderr.includes("unexpected listing response"));
    deny("unverified listing registers no file ID", download("unverified_621", local("unverified.fig")), "file ID not in run scope");
    deny("unverified listing registers no cursor", [rw, "ls", folder, "-t", "unverified-page", ...flags], "unknown listing cursor");
  } finally {
    rmSync(source("malformed-listing"));
  }
  allow("RW allowed get redacts token on stdout and stderr", [rw, "get", file, ...flags],
    ({ stdout, stderr }) => stdout.includes("[redacted]") && stderr.includes("[redacted]"));
  allow("RW scoped ls returns the cursor", [rw, "ls", folder, ...flags], ({ stdout }) => JSON.parse(stdout).next_page_token === "page-621");
  allow("RW listed page accepts only returned cursor", [rw, "ls", folder, "-t", "page-621", ...flags]);
  allow("RW in-folder listed ID becomes downloadable", download("listed_621", local("listed.fig")));
  deny("foreign ID from listing cannot be downloaded", download("foreign_621", local("foreign.fig")), "file ID not in run scope");
  deny("subfolder ID from listing cannot be downloaded", download("subfolder_621", local("subfolder.fig")), "file ID not in run scope");
  deny("scope rejects extra IDs in download", [rw, "download", file, "other_file", "-o", local("two.fig")], "unsupported download arguments");
  deny("scope rejects output outside fixture", download(file, join(evidence, "output.fig")), "outside the fixture directory");
  deny("scope rejects output through escaping symlink directory", download(file, `${fixture}/escape-dir/escaped.fig`), "outside the fixture directory");
  deny("scope rejects existing output symlink", download(file, local("escape.fig")), "output or partial already exists");
  deny("scope rejects existing .part symlink", download(file, local("occupied.fig")), "output or partial already exists");
  deny("scope rejects download traversal", download(file, `${fixture}/subdir.fig/../not-present.fig`), "invalid local path or traversal");
  allow("RW can plant mismatched bytes under a different digest", upload(decoy, folder, revisionName));
  allow("RW verifies exact planted ID bytes", download(planted, local("planted-check.fig")), () => readFileSync(local("planted-check.fig"), "utf8") === "decoy bytes\n");
  deny("download-only scope rejects an unknown file ID", [driver, "download-only", "foreign_621"], "in-scope file ID");
  const sealed = exec([driver, "download-only", file]);
  event("driver binds the launcher to exactly one file ID", sealed,
    sealed.status === 0 && JSON.parse(sealed.stdout).download_only === file);
  const initial = JSON.parse(sealed.stdout).initial_home;
  event("download-only receipt records a separate empty CLI home", { initial },
    initial?.name === "download-home" && Array.isArray(initial.entries) && initial.entries.length === 0);
  deny("download-only scope cannot change IDs", [driver, "download-only", planted], "already download-only");
  deny("sealed launcher refuses listing", [rw, "ls", folder, ...flags], "only the bound file");
  deny("sealed launcher refuses metadata lookups", [rw, "get", file, ...flags], "only the bound file");
  deny("sealed launcher refuses uploads", upload(fig), "only the bound file");
  deny("sealed launcher refuses a different known ID", download(planted, local("wrong-id.fig")), "only the bound file");
  deny("sealed launcher refuses download outside fixtures", download(file, join(evidence, "outside-download.fig")), "outside the fixture directory");
  allow("sealed launcher downloads the exact file with the fresh CLI home", download(file, local("offline.fig")),
    () => readFileSync(local("offline.fig"), "utf8") === bytes &&
      /\bentries=0\b.*\bhome=download-home\b/.test(trace().at(-1) ?? ""));
}

function verifyRun(label: string, result: ReturnType<typeof exec>, status: number) {
  writeFileSync(join(evidence, `${label}.stdout`), result.stdout);
  writeFileSync(join(evidence, `${label}.stderr`), result.stderr);
  const cleanup = trace().slice(-5);
  const expected = ["ls -F json", "ls -t root-page-621 -F json", `rm ${folder} -F json`,
    "ls -F json", "ls -t root-page-621 -F json"];
  event(`driver ${label}: lifecycle ends with expected status`, { status: result.status, cleanup }, result.status === status &&
    cleanup.length === expected.length && cleanup.every((call, i) => call.trimEnd().endsWith(`argv=${expected[i]}`)) &&
    result.stdout.includes('"removed":"folder_621","absent_from_parent":true') &&
    result.stdout.includes("Move-to-trash request accepted for 1 items;") && result.stderr.includes("provider remove diagnostic [redacted]") &&
    !result.stdout.includes("unrelated_parent_id") && !result.stdout.includes("unrelated_parent_name") &&
    !existsSync(source("runtime")) && !existsSync(source("folder-record")) && archive()[0]?.folder === folder);
}
function suite() {
  check(readdirSync(evidence).length === 0, "use an empty proof evidence directory");
  mkdirSync(installation, { mode: 0o700 });
  mkdirSync(source("private"), { mode: 0o700 });
  mkdirSync(fixture, { mode: 0o700 });
  for (const item of ["pikpak-rw", "driver", "scope.ts"]) copyFileSync(join(import.meta.dir, item), source(item));
  copyFileSync(join(import.meta.dir, "stub-pikpak"), source("private/pikpak-cli"));
  const writeToken = (path: string) => {
    const token = `test-${randomBytes(24).toString("hex")}-/a+=`;
    writeFileSync(path, token + "\n", { mode: 0o600 });
    return token;
  };
  const rwToken = writeToken(dummyTokenPath);
  symlinkSync(dummyTokenPath, source("private/rw-token"));
  writeFileSync(fig, bytes);
  writeFileSync(decoy, "decoy bytes\n");
  writeFileSync(join(evidence, "outside.fig"), "not in fixture\n");
  symlinkSync(join(evidence, "outside.fig"), local("escape.fig"));
  symlinkSync(join(evidence, "outside.fig"), local("occupied.fig.part"));
  symlinkSync(evidence, local("escape-dir"));
  symlinkSync(fig, local("inside.fig"));
  linkSync(join(evidence, "outside.fig"), local("hardlink.fig"));
  mkdirSync(local("subdir.fig"));
  try {
    deny("missing state rejects RW even before token use", [rw, "ls", folder, ...flags], "missing run state");
    const env = { ...process.env, PIKPAK_TOKEN: "inherited-credential", PIKPAK_PROFILE: "ambient-profile",
      PIKPAK_CREDENTIALS: "/not/allowed", PIKPAK_PAT_PATH: "/not/allowed", PIKPAK_DIR: "/not/allowed" };
    const result = exec([driver, "run", fixture, "--", ...cmd, "proof", evidence], env);
    writeFileSync(join(evidence, "full-run.stdout"), result.stdout);
    writeFileSync(join(evidence, "full-run.stderr"), result.stderr);
    verifyRun("success", result, 0);
    const homes = result.stdout.split("\n").filter((line) => line.startsWith('{"initial_home":')).map((line) => JSON.parse(line));
    event("driver starts one empty CLI home", { homes }, homes.length === 1 && homes[0].initial_home === "rw-home" &&
      homes[0].entries.length === 0);
    const archiveSuccess = join(evidence, "successful-run.state.jsonl");
    copyFileSync(source("last-state.jsonl"), archiveSuccess);
    const records = archive();
    event("state contains registered IDs and no foreign IDs", {},
      records.some((e) => e.value === file) && records.some((e) => e.value === planted) && records.some((e) => e.value === "listed_621") &&
      !records.some((e) => e.value === "foreign_621" || e.value === "subfolder_621"));
    const preflight = exec([driver, "run", "--preflight", fixture, "--", "/usr/bin/true"], env);
    writeFileSync(join(evidence, "preflight.stdout"), preflight.stdout);
    writeFileSync(join(evidence, "preflight.stderr"), preflight.stderr);
    event("driver preflight follows a root cursor without disclosing unrelated listings", { status: preflight.status },
      preflight.status === 0 && preflight.stdout.includes('"pagination_followed":true') &&
      preflight.stdout.includes('"absent_from_parent":true') && !preflight.stdout.includes("unrelated_parent_name"));
    verifyRun("callback-failure", exec([driver, "run", fixture, "--", "/bin/sh", "-c", "exit 23"], env), 23);
    verifyRun("callback-interrupted", exec([driver, "run", fixture, "--", "/bin/sh", "-c", 'kill -TERM "$PPID"; sleep 1'], env), 143);
    const calls = trace();
    event("correct scoped token and isolated config checked for every exec", { cli_calls: calls.length },
      calls.every((line) => line.includes("correct_token=yes isolated_config=yes")));
    event("ps argv contains no token on every CLI call", {}, calls.every((line) => line.includes("ps_check=clean")));
    event("CLI home is empty before the first command of every run", {}, calls.filter((line) => line.startsWith("command=mkdir "))
      .every((line) => line.includes("entries=0")));
    event("only the driver created and removed the folder; no trash listing", {},
      calls.filter((line) => line.startsWith("command=mkdir ")).length === 4 && calls.filter((line) => line.startsWith("command=rm ")).length === 4 &&
      !calls.some((line) => line.startsWith("command=trash ")));
    const archivePath = source("last-state.jsonl");
    rmSync(archivePath);
    mkdirSync(archivePath);
    try {
      const observed = exec([driver, "run", fixture, "--", "/usr/bin/true"], env);
      event("archive failure still removes the receipt-bound folder", observed,
        observed.status === 1 && observed.stderr.includes('"journal_archive":"failed"') &&
        observed.stdout.includes('"removed":"folder_621","absent_from_parent":true') &&
        !existsSync(source("runtime")) && !existsSync(source("folder-record")));
    } finally {
      rmSync(archivePath, { recursive: true });
    }
    for (const [mode, diagnostic] of [["nonzero", "removal did not succeed"], ["still-listed", "still appears in its parent"],
      ["wrong-count", "did not accept exactly one item"]]) {
      writeFileSync(source("rm-mode"), mode + "\n");
      const observed = exec([driver, "run", fixture, "--", "/usr/bin/true"], env);
      event(`driver leaves cleanup unverified: ${mode}`, observed,
        observed.status === 1 && observed.stderr.includes(diagnostic) &&
        observed.stderr.includes('"cleanup_unverified":"folder_621"') && !observed.stdout.includes('"removed":'));
      rmSync(source("folder-record"), { force: true });
    }
    for (const filePath of [casesLog, cliLog, archiveSuccess, source("last-state.jsonl"), ...readdirSync(evidence)
      .filter((name) => name.endsWith(".stdout") || name.endsWith(".stderr")).map((name) => join(evidence, name))]) {
      const data = readFileSync(filePath, "utf8");
      check(!data.includes(rwToken) && !data.includes("inherited-credential"), "credential found in evidence");
    }
    event("redacted evidence and ps-visible CLI argv contain no dummy token", {}, true);
  } finally {
    rmSync(dummyTokenPath, { force: true });
    rmSync(source("private/rw-token"), { force: true });
  }
  console.log(`Launcher tests passed. Evidence: ${casesLog}`);
}

try {
  if (phase === "suite") suite();
  else if (phase === "proof") proof();
  else throw new Error("expected suite or proof");
} catch (e) {
  console.error(`Launcher test failed: ${(e as Error).message}`);
  process.exitCode = 1;
}
