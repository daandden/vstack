import { expect, test } from "bun:test";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// The public CLI and real OMP discovery are the acceptance boundary.
test("a failed regeneration preserves the installed skill and unrelated workspace configuration", () => {
  const root = mkdtempSync(join(tmpdir(), "vstack-test-"));
  try {
    for (const name of ["config", "overlays", "scripts", ".cache"]) {
      cpSync(resolve(name), join(root, name), { recursive: true });
    }
    const workspace = join(root, "workspace");
    mkdirSync(join(workspace, ".omp/skills/local-only"), { recursive: true });
    const local = join(workspace, ".omp/skills/local-only/SKILL.md");
    writeFileSync(local, "---\nname: local-only\ndescription: Local user work\n---\nKeep me.\n");
    const config = join(workspace, ".omp/config.yml");
    writeFileSync(config, "theme: dark\nskills:\n  customDirectories: [./local-skills]\n");
    const run = (...args: string[]) => Bun.spawnSync(["bun", "scripts/stack.ts", ...args], { cwd: root });
    expect(run("build").exitCode).toBe(0);
    expect(run("install", workspace).exitCode).toBe(0);
    expect(run("build").exitCode).toBe(0);
    const before = readFileSync(join(root, "generated/current/skills/wizard/template.sh"), "utf8");
    const installedConfig = readFileSync(config, "utf8");
    writeFileSync(join(root, "overlays/matt/wizard.patch"), "not a patch\n");
    expect(run("build").exitCode).not.toBe(0);
    expect(readFileSync(join(root, "generated/current/skills/wizard/template.sh"), "utf8")).toBe(before);
    expect(readFileSync(config, "utf8")).toBe(installedConfig);
    expect(readFileSync(local, "utf8")).toContain("Keep me.");
    const settings = Bun.YAML.parse(installedConfig) as { theme: string; skills: { customDirectories: string[] } };
    expect(settings.theme).toBe("dark");
    expect(settings.skills.customDirectories).toContain("./local-skills");
    const discovery = Bun.spawnSync(["omp", "--mode", "rpc", "--no-extensions", "--no-lsp", "--no-rules", "--no-session"], {
      cwd: workspace,
      stdin: Buffer.from('{"id":"discovery","type":"get_available_commands"}\n'),
      stdout: "pipe", stderr: "pipe", timeout: 30000,
    });
    expect(discovery.exitCode).toBe(0);
    const response = discovery.stdout.toString().split("\n").filter(line => line.startsWith("{")).map(line => JSON.parse(line)).find(frame => frame.id === "discovery");
    expect(response.success).toBe(true);
    const commands = response.data.commands.map((command: { name: string }) => command.name);
    expect(commands).toContain("skill:wizard");
    expect(commands).toContain("skill:local-only");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}, 60000);
