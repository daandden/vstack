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
  return { dir, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ENV_FILE: join(dir, ".env") } };
}

const template = join(import.meta.dir, "../plugin/skills/wizard/template.sh");
function drive(f: ReturnType<typeof fixture>, input: string) {
  return Bun.spawnSync(["bash", template], { cwd: f.dir, env: f.env, stdin: Buffer.from(input), stdout: "pipe", stderr: "pipe" });
}

test("wizard writes literal dotenv values privately and preserves a symlink on rerun", () => {
  const f = fixture();
  const publicKey = "pk_test space $HOME 'quoted'";
  const secret = "sk_test # value $HOME 'secret'";
  const first = drive(f, `\n${publicKey}\n${secret}\n`);
  expect(first.exitCode).toBe(0);
  expect(statSync(f.env.ENV_FILE).mode & 0o777).toBe(0o600);
  const values = Bun.spawnSync(["bash", "-c", 'source "$ENV_FILE"; printf "%s\\n%s" "$STRIPE_PUBLISHABLE_KEY" "$STRIPE_SECRET_KEY"'], { env: f.env, stdout: "pipe", stderr: "pipe" });
  expect(values.exitCode).toBe(0);
  expect(values.stdout.toString()).toBe(`${publicKey}\n${secret}`);

  const target = join(f.dir, "credentials.env");
  writeFileSync(target, readFileSync(f.env.ENV_FILE));
  chmodSync(target, 0o640);
  rmSync(f.env.ENV_FILE);
  symlinkSync(target, f.env.ENV_FILE);
  expect(drive(f, "\n\n\n").exitCode).toBe(0);
  expect(lstatSync(f.env.ENV_FILE).isSymbolicLink()).toBe(true);
  expect(statSync(target).mode & 0o777).toBe(0o640);
  expect(readFileSync(target, "utf8")).toBe(readFileSync(f.env.ENV_FILE, "utf8"));
  const rerun = Bun.spawnSync(["bash", "-c", 'source "$ENV_FILE"; printf "%s\\n%s" "$STRIPE_PUBLISHABLE_KEY" "$STRIPE_SECRET_KEY"'], { env: f.env, stdout: "pipe", stderr: "pipe" });
  expect(rerun.exitCode).toBe(0);
  expect(rerun.stdout.toString()).toBe(`${publicKey}\n${secret}`);
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
