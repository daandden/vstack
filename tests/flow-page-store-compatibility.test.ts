import { afterAll, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTree } from "./support/copy-tree.ts";
import { ENV, git } from "./support/fixture.ts";

const checkout = join(import.meta.dir, "..");
const fixture = join(import.meta.dir, "fixtures", "flow-store-previous");
const script = join(checkout, "plugin/skills/flow-page/scripts/flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-store-compatibility-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));

test("previous-release JSON imports once and pre-SQLite code refuses the renamed backups", () => {
  const project = join(root, "project");
  const home = join(root, "home");
  mkdirSync(project, { recursive: true });
  mkdirSync(home);
  git(project, "init", "-q", "-b", "main");
  git(project, "commit", "-q", "--allow-empty", "-m", "base");
  const previous = join(root, "previous/flow-page/scripts");
  mkdirSync(previous, { recursive: true });
  writeFileSync(join(previous, "store.ts"), readFileSync(join(fixture, "store.ts.txt")));
  symlinkSync(join(checkout, "plugin/skills/flow-page/scripts/model.ts"), join(previous, "model.ts"));
  const scratch = join(root, "previous/vstack-tmp/scripts");
  mkdirSync(scratch, { recursive: true });
  symlinkSync(join(checkout, "plugin/skills/vstack-tmp/scripts/scratch.ts"), join(scratch, "scratch.ts"));
  const env = { ...ENV, VSTACK_FLOW_HOST: "off" };
  const old = (expression: string) => {
    const proc = Bun.spawnSync([process.execPath, "--eval", `import * as store from ${JSON.stringify(join(previous, "store.ts"))}; console.log(JSON.stringify(${expression}));`], { cwd: project, env, stdout: "pipe", stderr: "pipe" });
    expect(proc.stderr.toString()).toBe("");
    expect(proc.exitCode).toBe(0);
    return JSON.parse(proc.stdout.toString());
  };
  const dir = old(`store.flowsDir(${JSON.stringify(home)}, ${JSON.stringify(project)})`);
  copyTree(join(fixture, "flow"), dir);
  const cli = (args: string[], input?: unknown) => {
    const proc = Bun.spawnSync([process.execPath, script, ...args, "--home", home, "--session", "fixture-session", "--agent", "fixture-agent"], { cwd: project, env, stdin: input === undefined ? "ignore" : new TextEncoder().encode(JSON.stringify(input)), stdout: "pipe", stderr: "pipe" });
    expect(proc.stderr.toString()).toBe("");
    expect(proc.exitCode).toBe(0);
    return JSON.parse(proc.stdout.toString());
  };
  const flow = "previous-release-ca075c";
  expect(cli(["show", "--flow", flow]).flow.title).toBe("Previous release Flow");
  expect(cli(["bound"]).binding).toMatchObject({ flow, stage: "stage-1" });
  const opened = cli(["open", "--flow", flow, "--skill", "research"]);
  expect(opened.revision).toBe(2);
  const receipt = cli(["submit"], { version: 1, items: [{ kind: "result", shape: "cards", title: "Current contribution", entries: [{ title: "Compatibility", label: "info", blocking: false, impact: "Existing Flow content stays readable.", action: "Continue the Flow.", evidence: "The previous release fixture." }] }] });
  expect(receipt.revision).toBe(3);
  const shown = cli(["show", "--flow", flow]);
  expect(shown.stages.find((s: any) => s.id === opened.stage).results[0].entries[0].title).toBe("Compatibility");
  const readPrevious = (id: string) => old(`(store.folderOfId(${JSON.stringify(dir)}, ${JSON.stringify(id)}) ? store.readState(store.folderOfId(${JSON.stringify(dir)}, ${JSON.stringify(id)})) : null)`);
  expect(readPrevious(flow)).toBeNull();
  expect(existsSync(join(dir, flow, "data/state.json"))).toBe(false);
  expect(readFileSync(join(dir, flow, "data/state.imported.json"))).toEqual(readFileSync(join(fixture, "flow", flow, "data/state.json")));
  const current = cli(["open", "--title", "Current release Flow", "--skill", "explain"]);
  expect(readPrevious(current.flow)).toBeNull();
});
