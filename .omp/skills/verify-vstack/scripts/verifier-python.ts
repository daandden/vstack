import { createHash } from "node:crypto";
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const cases = ["pinned", "inherited-override", "unsafe-restore", "outside-prefix", "broken-lock", "declared-environment"] as const;
const [operation, runArg, caseArg] = Bun.argv.slice(2);
if (!runArg || !["seed", "audit"].includes(operation ?? "")) {
  throw new Error(`usage: bun verifier-python.ts seed <new case dir> <${cases.join("|")}> | audit <case dir>`);
}
const run = resolve(runArg);
const data = join(run, "data");
const shared = join(data, "shared");
const sharedEnv = join(shared, ".venv");
const outsideEnv = join(data, "outside-env");
const app = join(run, "app.json");
const fixturePath = join(run, "fixture.json");
const fixtureStep = "editable-app";
const writeJSON = (path: string, value: unknown) => writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
const readJSON = (path: string) => JSON.parse(readFileSync(path, "utf8"));
function hashes(root: string) {
  const rows: [string, number, string][] = [];
  function visit(name: string) {
    const path = join(root, name);
    const info = lstatSync(path);
    if (info.isDirectory()) {
      rows.push([name, info.mode, "dir"]);
      for (const child of readdirSync(path).sort()) visit(join(name, child));
    } else if (info.isSymbolicLink()) rows.push([name, info.mode, readlinkSync(path)]);
    else rows.push([name, info.mode, createHash("sha256").update(readFileSync(path)).digest("hex")]);
  }
  visit(".");
  return rows;
}
function environments() {
  return { shared: hashes(sharedEnv), ...(existsSync(outsideEnv) ? { outside: hashes(outsideEnv) } : {}) };
}
function requireEvidence(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

if (operation === "audit") {
  const fixture = readJSON(fixturePath);
  const before = readJSON(join(run, "env-before.json"));
  const after = environments();
  writeJSON(join(run, "env-after.json"), after);
  requireEvidence(JSON.stringify(before) === JSON.stringify(after), "A Python environment outside the head checkout changed");
  const record = readJSON(join(run, "record.json"));
  requireEvidence(record.head_sha === fixture.head && record.base_sha === fixture.base && record.patch_id === fixture.patch_id, "Verdict identifiers do not match the fixture");
  if (fixture.case === "pinned" || fixture.case === "inherited-override") {
    requireEvidence(["PASS", "PASS+NOTES"].includes(record.verdict), "Expected a passing Verdict");
    requireEvidence(record.proof_steps?.some((s: { id: string; outcome: string }) => s.id === fixtureStep && s.outcome === "passed"), "No passing editable-app proof step");
    const checkout = readJSON(join(run, "checkout.json"));
    const proof = readJSON(app);
    requireEvidence(checkout.backend === "ovnfs" && checkout.removed === true, "No removed ovnfs head checkout record");
    requireEvidence(proof.prefix === join(proof.head, ".venv") && proof.module === join(proof.head, "src/vstack_verify_fixture.py") && proof.value === "head", "The app did not use the head environment and source");
    requireEvidence(proof.head === checkout.path && !existsSync(checkout.path), "The recorded head and app do not match or the head still exists");
  } else {
    requireEvidence(record.verdict === "REFUSED" && !existsSync(app) && record.proof_steps?.length === 0, "Expected a pre-check REFUSED without app checks");
    const notes = (record.notes ?? []).join(" ");
    if (fixture.case === "declared-environment") {
      requireEvidence(notes.includes("Isolated clone") && notes.includes(".venv") && !existsSync(join(run, "checkout.json")), "Expected refusal at Isolated-clone preflight");
    } else {
      const checkout = readJSON(join(run, "checkout.json"));
      requireEvidence(checkout.removed === true && !existsSync(checkout.path), "The attempted head was not removed");
      if (fixture.case === "broken-lock") requireEvidence(notes.includes("uv.lock") && notes.includes(".verify/restore.sh"), "Expected the failing restore command and lockfile error");
      else requireEvidence(notes.includes(fixture.override), "Expected the unsafe destination or observed external prefix");
    }
  }
  requireEvidence(!record.cleanup_error, "Head cleanup failed");
  console.log(JSON.stringify({ case: fixture.case, verdict: record.verdict, app_ran: existsSync(app), environments_unchanged: true }));
  process.exit(0);
}

const scenario = cases.find(value => value === caseArg);
if (!scenario) throw new Error(`Unknown case: ${caseArg}`);
const uv = Bun.which("uv");
const python = Bun.which("python3");
if (!uv || !python) throw new Error("Install uv and a local Python 3 interpreter before this offline fixture");
mkdirSync(run);
mkdirSync(join(shared, "src"), { recursive: true });
mkdirSync(join(shared, ".verify"));
const caseEnv = { PATH: process.env.PATH!, HOME: data, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1", GIT_OPTIONAL_LOCKS: "0" };
function command(label: string, argv: string[]) {
  const p = Bun.spawnSync(argv, { cwd: shared, env: caseEnv, stdout: "pipe", stderr: "pipe" });
  const stdout = p.stdout.toString(); const stderr = p.stderr.toString();
  writeJSON(join(run, `${label}.json`), { cwd: shared, argv, exit: p.exitCode, stdout, stderr });
  if (p.exitCode !== 0) throw new Error(`${label} failed: ${stderr.trim() || stdout.trim()}`);
  return stdout.trim();
}
const quote = (str: string) => `'${str.replaceAll("'", "'\\''")}'`;
const lock = join(shared, "uv.lock");
writeFileSync(join(shared, "pyproject.toml"), `[project]\nname = "vstack-verify-fixture"\nversion = "0.1.0"\nrequires-python = ">=3.10"\ndependencies = []\n\n[build-system]\nrequires = []\nbuild-backend = "fixture_backend"\nbackend-path = ["."]\n`);
copyFileSync(join(import.meta.dir, "../fixtures/verifier-python/fixture_backend.py"), join(shared, "fixture_backend.py"));
writeFileSync(join(shared, ".gitignore"), ".venv/\n__pycache__/\n.verify-uv.*/\n");
writeFileSync(join(shared, ".verify/restore.sh"), `#!/bin/sh
set -eu
root=$(pwd -P)
[ -f "$root/uv.lock" ] && [ -f "$root/pyproject.toml" ] || exit 2
if [ -e "$root/.venv" ] || [ -L "$root/.venv" ]; then
  printf 'Refusing to overwrite environment: %s\\n' "$root/.venv" >&2
  exit 2
fi
runtime=$(mktemp -d "$root/.verify-uv.XXXXXX")
trap 'rm -rf -- "$runtime"' EXIT
printf 'Restore in %s\\nIncoming UV_PROJECT_ENVIRONMENT=%s\\nPinned UV_PROJECT_ENVIRONMENT=%s\\n' "$root" "\${UV_PROJECT_ENVIRONMENT-}" "$root/.venv"
env -i PATH="$PATH" HOME="$runtime" TMPDIR="$runtime" UV_PROJECT_ENVIRONMENT="$root/.venv" \\
  ${quote(uv)} sync --locked --offline --no-python-downloads --no-managed-python --no-config \\
  --python ${quote(python)} --project "$root" --cache-dir "$runtime/cache"
`);
writeFileSync(join(shared, ".verify/check.py"), `import json\nimport sys\nfrom pathlib import Path\n\nimport vstack_verify_fixture as package\n\nroot = Path(__file__).resolve().parents[1]\nprefix = Path(sys.prefix).resolve(strict=True)\nmodule = Path(package.__file__).resolve(strict=True)\nassert prefix == root / ".venv", prefix\nassert module == root / "src/vstack_verify_fixture.py", module\nassert package.VALUE == "head", package.VALUE\nproof = json.dumps(dict(head=str(root), prefix=str(prefix), module=str(module), value=package.VALUE))\nPath(sys.argv[1]).write_text(proof + "\\n")\nprint(proof)\n`);
const override = scenario === "inherited-override" ? sharedEnv : ["unsafe-restore", "outside-prefix"].includes(scenario) ? outsideEnv : null;
const interpreter = scenario === "outside-prefix" ? quote(join(outsideEnv, "bin/python")) : "./.venv/bin/python";
const restore = scenario === "unsafe-restore" ? "uv sync --locked --offline --no-config --no-python-downloads" : "/bin/sh .verify/restore.sh";
const verify = join(shared, ".verify/SKILL.md");
writeFileSync(verify, `---\nname: verify-ovnfs-python-fixture\ndescription: Verify the disposable uv editable package and its interpreter prefix.\n---\n\n# Verify the fixture\n\n## Launch\n\nRestore: run \`${restore}\` with cwd set to the prepared head checkout.\n\nBefore app checks, run \`${interpreter} -IB -c 'import sys; from pathlib import Path; print(Path(sys.prefix).resolve(strict=True))'\` from that same checkout and retain its output.\n\n## Drive\n\nStep \`${fixtureStep}\`: Run \`${interpreter} -IB .verify/check.py ${quote(app)}\` from the prepared head checkout. Require the prefix inside that checkout, and the module at the head's \`src/vstack_verify_fixture.py\` with value \`head\`.\n\n## Cleanup\n\nThe Verifier removes its prepared head checkout. Keep the app JSON in the case directory.\n`);
const module = join(shared, "src/vstack_verify_fixture.py");
writeFileSync(module, 'VALUE = "base"\n');
const git = (label: string, ...argv: string[]) => command(label, ["git", "-c", "user.name=Verify", "-c", "user.email=verify@example.invalid", ...argv]);
git("init", "init", "-q", "-b", "main");
command("lock", [uv, "lock", "--offline", "--no-config", "--no-python-downloads", "--no-managed-python", "--python", python, "--cache-dir", join(data, "uv-cache")]);
git("stage", "add", ".");
git("commit-base", "commit", "-qm", "base fixture");
const base = git("base", "rev-parse", "HEAD");
command("shared-restore", ["/bin/sh", ".verify/restore.sh"]);
if (override === outsideEnv) command("outside-venv", [uv, "venv", "--offline", "--no-config", "--no-python-downloads", "--no-managed-python", "--python", python, "--cache-dir", join(data, "uv-cache"), outsideEnv]);
if (scenario === "broken-lock") writeFileSync(lock, "not a uv lockfile\n");
writeFileSync(module, 'VALUE = "head"\n');
git("commit-head", "commit", "-qam", "head fixture");
const head = git("head", "rev-parse", "HEAD");
const diff = git("diff", "diff", "--no-ext-diff", "--no-textconv", `${base}...${head}`);
const patch = Bun.spawnSync(["git", "patch-id", "--stable"], { cwd: shared, env: caseEnv, stdin: Buffer.from(`${diff}\n`) });
const patch_id = patch.stdout.toString().trim().split(/\s+/)[0];
if (patch.exitCode !== 0 || !patch_id) throw new Error("Could not compute the fixture patch id");
const fixture = { case: scenario, shared: realpathSync(shared), verify, base, head, patch_id, override, app };
writeJSON(fixturePath, fixture);
writeJSON(join(run, "inputs.json"), scenario === "declared-environment" ? [".venv"] : []);
writeJSON(join(run, "expected.json"), { head_sha: head, base_sha: base, patch_id, required_steps: [fixtureStep] });
writeJSON(join(run, "env-before.json"), environments());
console.log(JSON.stringify(fixture));
