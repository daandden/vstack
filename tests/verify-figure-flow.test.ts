import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV } from "./support/fixture.ts";

const checkout = join(import.meta.dir, "..");
const helper = join(checkout, ".omp/skills/verify-vstack/scripts/figure-flow.ts");
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("Verify figure Flow helper captures files, refuses invalid contributions, and retains its export through the store", async () => {
  const run = mkdtempSync(join(tmpdir(), "verify-figure-flow-"));
  dirs.push(run);
  mkdirSync(join(run, "figures"));
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50" fill="#1e1e2e"/></svg>';
  const source = "flowchart LR\n cart[Cart]:::ok --> stock[Stock]:::store\n stock --> pending[Pending]:::warn\n pending --> failed[Failed]:::bad\n failed --> changed[Changed]:::changed\n changed --> person[Person]:::actor\n person --> outside[Outside]:::external\n";
  writeFileSync(join(run, "figures/one.svg"), svg);
  writeFileSync(join(run, "figures/01-roles.mmd"), source);
  const proc = Bun.spawn([process.execPath, helper, checkout, run, "figure-helper-session", "figure-helper-agent"], {
    cwd: checkout, env: { ...ENV, VSTACK_FLOW_HOST: "off" }, stdout: "pipe", stderr: "pipe",
  });
  const [code, stdout, stderr] = await Promise.all([proc.exited, new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" });
  const summary = JSON.parse(stdout);
  expect(summary).toMatchObject({ ok: true, exactBytesAfterSourceEdit: true, refusedWithoutContentChange: true });
  const evidence = join(run, "figure-flow");
  expect(readFileSync(join(evidence, "captured.svg"), "utf8")).toBe(svg);
  const commands = JSON.parse(readFileSync(join(evidence, "commands.json"), "utf8"));
  expect(commands.filter((command: any) => command.code === 1)).toHaveLength(4);
  const shown = JSON.parse(readFileSync(join(evidence, "show.json"), "utf8"));
  expect(shown.flow.id).toBe(summary.flow);
  expect(shown.stages[0].results[0].shape).toBe("document");
  expect(shown.stages[0].results[0].document.sections).toHaveLength(2);
  const exported = JSON.parse(readFileSync(join(evidence, "export/data/state.json"), "utf8"));
  expect(exported.flow.id).toBe(summary.flow);
  expect(exported.revision).toBe(JSON.parse(readFileSync(join(evidence, "receipt.json"), "utf8")).revision);
  expect(readFileSync(join(evidence, "export/assets", summary.hash, "order.svg"), "utf8")).toBe(svg);
  expect(readFileSync(join(evidence, "export/assets", summary.sourceHash, "roles.mmd"), "utf8")).toBe(source);
});
