import { afterEach, expect, test } from "bun:test";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "vstack-wizard-"));
  dirs.push(dir);
  const bin = join(dir, "bin");
  mkdirSync(bin);
  for (const name of ["wslview", "gh"]) {
    const file = join(bin, name);
    writeFileSync(file, "#!/bin/sh\nexit 0\n");
    chmodSync(file, 0o755);
  }
  const env: NodeJS.ProcessEnv & { PATH: string; ENV_FILE: string } = { ...process.env, PATH: `${bin}:${process.env.PATH}`, ENV_FILE: join(dir, ".env") };
  return { dir, env };
}

const template = join(import.meta.dir, "../plugin/skills/wizard/template.sh");
const bash = Bun.which("bash")!;
function drive(f: ReturnType<typeof fixture>, input: string) {
  return Bun.spawnSync([bash, template], { cwd: f.dir, env: f.env, stdin: Buffer.from(input), stdout: "pipe", stderr: "pipe" });
}

function consume(f: ReturnType<typeof fixture>) {
  const result = Bun.spawnSync([process.execPath, "--no-env-file", "--env-file", f.env.ENV_FILE, "-e",
    "console.log(JSON.stringify([process.env.STRIPE_PUBLISHABLE_KEY, process.env.STRIPE_SECRET_KEY]))"],
    { cwd: f.dir, env: {}, stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode).toBe(0);
  return JSON.parse(result.stdout.toString());
}

test("wizard writes literal dotenv values privately and preserves a symlink on rerun", () => {
  const f = fixture();
  Object.assign(f.env, { STRIPE_PUBLISHABLE_KEY: "inherited-public", STRIPE_SECRET_KEY: "inherited-secret" });
  const publicKey = "pk_test space $HOME 'quoted'";
  const secret = "sk_test # value $HOME 'secret'";
  const first = drive(f, `\n${publicKey}\n${secret}\n`);
  expect(first.exitCode).toBe(0);
  expect(statSync(f.env.ENV_FILE).mode & 0o777).toBe(0o600);
  expect(consume(f)).toEqual([publicKey, secret]);

  const target = join(f.dir, "credentials.env");
  writeFileSync(target, readFileSync(f.env.ENV_FILE));
  chmodSync(target, 0o640);
  rmSync(f.env.ENV_FILE);
  symlinkSync(target, f.env.ENV_FILE);
  expect(drive(f, "\n\n\n").exitCode).toBe(0);
  expect(lstatSync(f.env.ENV_FILE).isSymbolicLink()).toBe(true);
  expect(statSync(target).mode & 0o777).toBe(0o640);
  expect(readFileSync(target, "utf8")).toBe(readFileSync(f.env.ENV_FILE, "utf8"));
  expect(consume(f)).toEqual([publicKey, secret]);
});

test.each([
  ["double quotes", 'value "quoted" # keep'],
  ["all quote delimiters", "value'\"`tail"],
  ["literal escape sequences", String.raw`value\n\r\t\\tail`],
  ["dollars and backslashes", "value\\$HOME ${HOME} $$ $UNKNOWN"],
  ["command text", "`touch marker` $(touch marker)"],
  ["padding", "  value # keep  "],
  ["trailing backslash", "value\\"],
  ["empty", ""],
  ["unicode", "synthetic café 🔑"],
])("wizard preserves %s through Bun and Enter re-entry", (_, value) => {
  const f = fixture();
  expect(drive(f, `\n${value}\n${value}\n`).exitCode).toBe(0);
  expect(consume(f)).toEqual([value, value]);
  expect(drive(f, "\n\n\n").exitCode).toBe(0);
  expect(consume(f)).toEqual([value, value]);
  expect(() => statSync(join(f.dir, "marker"))).toThrow();
});

function authored(f: ReturnType<typeof fixture>, body: string, input = "") {
  const file = join(f.dir, "authored.sh");
  const library = readFileSync(template, "utf8").split("\nrun_wizard() {")[0];
  writeFileSync(file, `${library}\nrun_wizard() {\n${body}\n}\nrun_wizard "$@"; exit\n`);
  return Bun.spawnSync([bash, file], { cwd: f.dir, env: f.env, stdin: Buffer.from(input), stdout: "pipe", stderr: "pipe" });
}

test.each([
  ["all delimiters with comment text", "synthetic 'single' \"double\" `tick` # keep"],
  ["newline", "synthetic\nsecond line"],
  ["carriage return", "synthetic\rsecond line"],
])("wizard refuses %s without creating or changing an env-file", (_, value) => {
  for (const existing of [false, true]) {
    const f = fixture();
    const original = "KEEP=unchanged\n";
    if (existing) {
      writeFileSync(f.env.ENV_FILE, original);
      chmodSync(f.env.ENV_FILE, 0o640);
    }
    const result = authored({ ...f, env: { ...f.env, TEST_VALUE: value } }, 'write_env WIZARD_PROBE "$TEST_VALUE"');
    expect(result.exitCode).not.toBe(0);
    expect(result.stdout.toString() + result.stderr.toString()).not.toContain(value);
    if (existing) {
      expect(readFileSync(f.env.ENV_FILE, "utf8")).toBe(original);
      expect(statSync(f.env.ENV_FILE).mode & 0o777).toBe(0o640);
    } else expect(() => statSync(f.env.ENV_FILE)).toThrow();
  }
});

test("env-file writes require Bun but CI-only procedures do not", () => {
  const f = fixture();
  f.env.PATH = join(f.dir, "bin");
  writeFileSync(f.env.ENV_FILE, "KEEP=unchanged\n");
  expect(authored(f, 'write_env WIZARD_PROBE "synthetic"').exitCode).not.toBe(0);
  expect(readFileSync(f.env.ENV_FILE, "utf8")).toBe("KEEP=unchanged\n");
  expect(authored(f, 'ENV_FILE=""\nask_secret CI_TOKEN "Token:"\nset_secret CI_TOKEN "$CI_TOKEN"', "synthetic\n").exitCode).toBe(0);
  expect(readFileSync(f.env.ENV_FILE, "utf8")).toBe("KEEP=unchanged\n");
});

test("wizard refuses a multiline existing default without changing the file", () => {
  const f = fixture();
  const original = 'WIZARD_PROBE="synthetic\nsecond line"\n';
  writeFileSync(f.env.ENV_FILE, original);
  const result = authored(f, 'ask WIZARD_PROBE "Value:"\nwrite_env WIZARD_PROBE "$WIZARD_PROBE"', "\n");
  expect(result.exitCode).not.toBe(0);
  expect(readFileSync(f.env.ENV_FILE, "utf8")).toBe(original);
  expect(result.stdout.toString() + result.stderr.toString()).not.toContain("synthetic");
});

test("wizard refuses invalid UTF-8 bytes without changing the env-file", () => {
  const f = fixture();
  writeFileSync(f.env.ENV_FILE, "KEEP=unchanged\n");
  const result = authored(f, "write_env WIZARD_PROBE $'synthetic\\377'");
  expect(result.exitCode).not.toBe(0);
  expect(readFileSync(f.env.ENV_FILE, "utf8")).toBe("KEEP=unchanged\n");
  expect(result.stdout.toString() + result.stderr.toString()).not.toContain("synthetic");
});

test("wizard stops at EOF before writing credentials", () => {
  const f = fixture();
  const result = drive(f, "\n");
  expect(result.exitCode).not.toBe(0);
  expect(() => statSync(f.env.ENV_FILE)).toThrow();
});

test("wizard parses later stages before showing its first prompt", () => {
  const f = fixture();
  const malformed = join(f.dir, "malformed.sh");
  writeFileSync(malformed, readFileSync(template, "utf8").replace("\nfinish\n", "\nif then\nfinish\n"));
  const result = Bun.spawnSync(["bash", malformed], { cwd: f.dir, env: f.env, stdin: Buffer.from("\npublic\nsecret\n"), stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode).not.toBe(0);
  expect(result.stdout.toString()).toBe("");
});
