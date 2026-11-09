import { afterAll, beforeAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "setup-vstack", "scripts", "machine.ts");
const FAKE_OMP = join(import.meta.dir, "support", "fake-omp-machine.ts");
const FAKE_TERN = join(import.meta.dir, "support", "fake-tern-machine.ts");
const TERN_PLUGIN = realpathSync(join(import.meta.dir, "..", "plugin", "tern", "vstack-flow"));
const CONFIGURED = `modelRoles:
  judge: typesafe/jev-latest
ratchet:
  enabled: true
task:
  isolation:
    enabled: true
worktree:
  clone: true
isolation:
  backend: auto
bash:
  gitGuard: true
`;
const KEY = { TYPESAFE_API_KEY: "fake-typesafe-key" };

let dir: string;
let n = 0;
beforeAll(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "vstack-machine-test-")));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

type Check = { id: number; name: string; status: "ok" | "fail" | "warn" | "note"; detail?: string; remedy?: string };
function machineFixture(options: {
  ovnfs?: "path" | "config" | "missing" | "invalid-config";
  backend?: string;
  gitGuard?: boolean;
  config?: string;
  credentials?: boolean;
  tern?: "missing" | "foreign" | "correct";
} = {}) {
  const root = join(dir, `case-${++n}`);
  const home = join(root, "home");
  const cwd = join(root, "proj");
  const bin = join(root, "bin");
  const configDir = join(home, ".omp", "agent");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(cwd);
  mkdirSync(bin);
  const configPath = join(configDir, "config.yml");
  const config = Bun.YAML.parse(options.config ?? CONFIGURED) as any;
  if (options.backend !== undefined) config.isolation = { backend: options.backend };
  if (options.gitGuard !== undefined) config.bash = { gitGuard: options.gitGuard };
  writeFileSync(join(bin, "omp"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_OMP}" "$@"\n`, { mode: 0o755 });
  const ovnfs = join(options.ovnfs === "config" ? home : bin, "ovnfs");
  if (options.ovnfs !== "missing") writeFileSync(ovnfs, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  if (options.ovnfs === "config") config.ovnfs = { path: ovnfs };
  if (options.ovnfs === "invalid-config") config.ovnfs = { path: join(root, "missing-ovnfs") };
  writeFileSync(configPath, Bun.YAML.stringify(config));
  const ternDir = join(home, ".config", "tern", "plugins");
  if (options.tern) {
    writeFileSync(join(bin, "tern"), `#!/bin/sh\nexec "${process.execPath}" "${FAKE_TERN}" "$@"\n`, { mode: 0o755 });
    mkdirSync(ternDir, { recursive: true });
    writeFileSync(join(ternDir, "other-plugin.path"), "/other/plugin\n");
    if (options.tern !== "missing") {
      writeFileSync(join(ternDir, "vstack-flow.path"), `${options.tern === "correct" ? TERN_PLUGIN : "/old/tern-plugins/vstack-flow"}\n`);
    }
  }
  const invoke = (args: string[] = ["--json"], extraEnv: Record<string, string> = {}) => {
    const env = { PATH: bin, HOME: home, TERM: "dumb", ...(options.credentials === false ? {} : KEY), ...extraEnv };
    const r = Bun.spawnSync([process.execPath, SCRIPT, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    return { code: r.exitCode, stdout: r.stdout.toString(), stderr: r.stderr.toString() };
  };
  const readConfig = () => Bun.YAML.parse(readFileSync(configPath, "utf8")) as any;
  const checks = (): Check[] => JSON.parse(invoke().stdout).checks;
  const writes = () => {
    const file = join(configDir, "writes.jsonl");
    return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line)) : [];
  };
  const ternWrites = () => {
    const file = join(ternDir, "writes.jsonl");
    return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").map(line => JSON.parse(line)) : [];
  };
  const ternPlugins = () => {
    const r = Bun.spawnSync([process.execPath, FAKE_TERN, "plugin", "list", "--json"], { env: { HOME: home } });
    expect(r.exitCode).toBe(0);
    return JSON.parse(r.stdout.toString()).plugins;
  };
  return { home, cwd, bin, configPath, invoke, readConfig, checks, writes, ternWrites, ternPlugins };
}

const problems = (checks: Check[]) => checks.filter((c) => c.status === "fail" || c.status === "warn").map((c) => [c.id, c.status]);

test("a configured machine passes all required checks and never prints credentials", () => {
  const f = machineFixture();
  const r = f.invoke();
  expect(r.code).toBe(0);
  expect(problems(JSON.parse(r.stdout).checks)).toEqual([]);
  expect(f.checks().find((c) => c.id === 4)?.status).toBe("note");
  expect(r.stdout).not.toContain(KEY.TYPESAFE_API_KEY);
  const text = f.invoke([]);
  expect(text.code).toBe(0);
  expect(text.stdout.split("\n").filter(Boolean)).toHaveLength(2);
  expect(f.writes()).toEqual([]);
});

test("the machine CLI reports missing ovnfs as a required failure without changing settings", () => {
  const f = machineFixture({ ovnfs: "missing" });
  const before = readFileSync(f.configPath, "utf8");
  const r = f.invoke();
  expect(r.code).toBe(1);
  expect(f.checks().find((c) => c.name === "ovnfs")).toMatchObject({ status: "fail", remedy: expect.stringContaining("ovnfs") });
  expect(readFileSync(f.configPath, "utf8")).toBe(before);
  expect(f.writes()).toEqual([]);
});

test.each(["path", "config"] as const)("the machine CLI finds ovnfs through %s", (ovnfs) => {
  const f = machineFixture({ ovnfs });
  expect(f.invoke().code).toBe(0);
  expect(f.checks().find((c) => c.name === "ovnfs")).toMatchObject({ status: "ok" });
});

test("an invalid configured ovnfs executable fails even when PATH has another binary", () => {
  const f = machineFixture({ ovnfs: "invalid-config" });
  expect(f.invoke().code).toBe(1);
  expect(f.checks().find((c) => c.name === "ovnfs")?.status).toBe("fail");
});

test("the machine CLI changes a non-auto backend only when its setter is explicitly selected", () => {
  const f = machineFixture({ backend: "apfs" });
  const before = readFileSync(f.configPath, "utf8");
  expect(f.invoke().code).toBe(1);
  expect(f.checks().find((c) => c.name === "isolation backend")).toMatchObject({ status: "fail", remedy: expect.stringContaining("auto") });
  expect(readFileSync(f.configPath, "utf8")).toBe(before);
  expect(f.writes()).toEqual([]);
  expect(f.invoke(["--set", "isolation"]).code).toBe(0);
  expect(f.readConfig().isolation.backend).toBe("apfs");
  expect(f.invoke(["--set", "backend"]).code).toBe(0);
  expect(f.readConfig().isolation.backend).toBe("auto");
  expect(f.writes()).toEqual([["task.isolation.enabled", "true"], ["isolation.backend", "auto"]]);
  expect(f.invoke().code).toBe(0);
});

test("the machine CLI offers gitGuard without writing it and sets only an explicitly selected gitGuard", () => {
  const f = machineFixture({ gitGuard: false });
  const before = readFileSync(f.configPath, "utf8");
  expect(f.invoke().code).toBe(0);
  expect(f.checks().find((c) => c.name === "bash.gitGuard")).toMatchObject({ status: "warn" });
  expect(readFileSync(f.configPath, "utf8")).toBe(before);
  expect(f.writes()).toEqual([]);
  expect(f.invoke(["--set", "backend"]).code).toBe(0);
  expect(f.readConfig().bash.gitGuard).toBe(false);
  expect(f.invoke(["--set", "gitGuard"]).code).toBe(0);
  expect(f.readConfig().bash.gitGuard).toBe(true);
  expect(f.writes()).toEqual([["isolation.backend", "auto"], ["bash.gitGuard", "true"]]);
  expect(f.checks().find((c) => c.name === "bash.gitGuard")?.status).toBe("ok");
});

test("unconfigured required settings fail and optional settings warn without any writes", () => {
  const f = machineFixture({ config: `worktree:\n  clone: false\neval:\n  py: false\ndisabledExtensions:\n  - extension-module:vstack\n` });
  const before = readFileSync(f.configPath, "utf8");
  expect(f.invoke().code).toBe(1);
  expect(problems(f.checks())).toEqual([[2, "fail"], [4, "fail"], [5, "warn"], [6, "fail"], [7, "fail"], [8, "warn"], [11, "warn"]]);
  for (const check of f.checks()) if (check.status === "fail" || check.status === "warn") expect(check.remedy).toBeTruthy();
  expect(readFileSync(f.configPath, "utf8")).toBe(before);
  expect(f.writes()).toEqual([]);
});

test("explicit setters preserve unrelated settings and model roles", () => {
  const f = machineFixture({ config: `modelRoles:\n  default: smoke/smoke-model\ntask:\n  agentModelOverrides:\n    reviewer: smoke/reviewer-model\ntheme:\n  dark: catppuccin-mocha\n` });
  expect(f.invoke(["--set", "judge", "isolation", "clone", "ratchet", "backend", "gitGuard"]).code).toBe(0);
  expect(f.readConfig()).toEqual({
    modelRoles: { default: "smoke/smoke-model", judge: "typesafe/jev-latest" },
    task: { agentModelOverrides: { reviewer: "smoke/reviewer-model" }, isolation: { enabled: true } },
    theme: { dark: "catppuccin-mocha" },
    worktree: { clone: true }, ratchet: { enabled: true }, isolation: { backend: "auto" }, bash: { gitGuard: true },
  });
  expect(f.invoke().code).toBe(0);
});

test("disabled optional Ratchet warns, passes, and stays disabled until selected", () => {
  const f = machineFixture({ config: CONFIGURED.replace("ratchet:\n  enabled: true", "ratchet:\n  enabled: false") });
  expect(f.invoke().code).toBe(0);
  expect(problems(f.checks())).toEqual([[8, "warn"]]);
  expect(f.readConfig().ratchet.enabled).toBe(false);
  expect(f.writes()).toEqual([]);
});

test("agent model overrides and other judge providers are notes, not failures", () => {
  const f = machineFixture({ config: CONFIGURED.replace("typesafe/jev-latest", "openrouter/decisions-model").replace("task:\n", "task:\n  agentModelOverrides:\n    vstack-explorer: smoke/smoke-model\n    reviewer: smoke/other-model\n"), credentials: false });
  expect(f.invoke().code).toBe(0);
  expect(f.checks().filter((c) => c.status === "note").map((c) => c.id)).toEqual([2, 3, 4]);
  expect(problems(f.checks())).toEqual([]);
});

test.each([
  [" openrouter/typesafe-ai/jev-1.13 , typesafe/jev-1.13.0 ", 0],
  [" typesafe/jev-1.13.0 , openrouter/decisions-model ", 1],
  ["typesafe/jev-latest", 1],
])("the first judge candidate's provider controls credentials for %s", (judge, code) => {
  const f = machineFixture({ config: CONFIGURED.replace("typesafe/jev-latest", JSON.stringify(judge)), credentials: false });
  expect(f.invoke().code).toBe(code);
  expect(f.checks().find((c) => c.id === 1)?.status).toBe(code ? "fail" : "ok");
});

test("an unavailable Python interpreter warns without failing the machine", () => {
  const f = machineFixture();
  const r = f.invoke(["--json"], { FAKE_OMP_PYTHON_FAIL: "1" });
  expect(r.code).toBe(0);
  expect(problems(JSON.parse(r.stdout).checks)).toEqual([[5, "warn"]]);
});

test("usage errors and a missing omp exit 2 without writing settings", () => {
  const f = machineFixture();
  for (const args of [["--extension-loaded", "yes"], ["--set", "everything"], ["--set"], ["--set", "backend", "everything"]]) {
    expect(f.invoke(args).code).toBe(2);
  }
  expect(f.invoke(["--json"], { PATH: join(dir, "empty-path") }).code).toBe(2);
  expect(f.writes()).toEqual([]);
});

test("a missing Tern vstack-flow link warns with a link remedy without writing", () => {
  const f = machineFixture({ tern: "missing" });
  const r = f.invoke();
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).checks.find((c: Check) => c.name === "Tern vstack-flow")).toMatchObject({
    id: 12,
    status: "warn",
    remedy: expect.stringContaining(`tern plugin link '${TERN_PLUGIN}'`),
  });
  expect(f.ternWrites()).toEqual([]);
  expect(f.ternPlugins()).toEqual([{ id: "other-plugin", path: "/other/plugin" }]);
});

test.each(["missing", "foreign"] as const)("the Tern setter replaces a %s link only when selected and preserves other plugins", (tern) => {
  const f = machineFixture({ tern });
  const before = f.ternPlugins();
  expect(f.checks().find(c => c.id === 12)?.status).toBe("warn");
  expect(f.ternWrites()).toEqual([]);
  expect(f.invoke(["--set", "backend"]).code).toBe(0);
  expect(f.ternPlugins()).toEqual(before);
  expect(f.ternWrites()).toEqual([]);
  const r = f.invoke(["--set", "tern", "tern"]);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain("SET Tern vstack-flow");
  expect(f.ternPlugins()).toEqual([
    { id: "other-plugin", path: "/other/plugin" },
    { id: "vstack-flow", path: TERN_PLUGIN },
  ]);
  expect(f.ternWrites()).toEqual([
    ...(tern === "foreign" ? [["unlink", "vstack-flow"]] : []),
    ["link", TERN_PLUGIN],
  ]);
  expect(f.checks().find(c => c.id === 12)?.status).toBe("ok");
});

test("Tern passes when vstack-flow links the installed vstack copy and changes nothing", () => {
  const f = machineFixture({ tern: "correct" });
  expect(f.invoke().code).toBe(0);
  expect(f.checks().find(c => c.id === 12)).toMatchObject({ name: "Tern vstack-flow", status: "ok" });
  expect(f.ternPlugins()).toContainEqual({ id: "vstack-flow", path: TERN_PLUGIN });
  expect(f.ternWrites()).toEqual([]);
  expect(f.writes()).toEqual([]);
});

test("without Tern the machine CLI omits the plugin check and refuses its setter before writing", () => {
  const f = machineFixture();
  const r = f.invoke();
  expect(r.code).toBe(0);
  expect(JSON.parse(r.stdout).checks.some((c: Check) => c.id === 12 || c.name.includes("Tern"))).toBe(false);
  expect(f.invoke([]).stdout).not.toContain("Tern");
  const setter = f.invoke(["--set", "backend", "tern"]);
  expect(setter.code).toBe(2);
  expect(setter.stderr).toContain("tern is not on PATH");
  expect(f.writes()).toEqual([]);
  expect(f.ternWrites()).toEqual([]);
});
