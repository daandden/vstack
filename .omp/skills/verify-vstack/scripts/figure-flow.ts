import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, cpSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
const [checkout, runDir, session, agent] = process.argv.slice(2);
if (!checkout || !runDir || !session || !agent) throw new Error("Usage: bun scripts/figure-flow.ts <checkout> <verify run> <own session> <own agent>");
const root = resolve(checkout), run = resolve(runDir), home = join(run, "data/figure-home"), evidence = join(run, "figure-flow");
if (existsSync(evidence)) throw new Error("Use a fresh Verify run so prior Flow evidence survives.");
mkdirSync(evidence, { recursive: true });
const page = join(root, "plugin/skills/flow-page/scripts/flow-page.ts"), logs: unknown[] = [];
const port = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
const env = { ...process.env, VSTACK_FLOW_PORT: String(port.port) }; port.stop(true);
async function command(args: string[], expected = 0) {
  const argv = [process.execPath, page, ...args, "--home", home, "--session", session, "--agent", agent];
  const p = Bun.spawn(argv, { cwd: root, env, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  logs.push({ argv, code, stdout, stderr }); writeFileSync(join(evidence, "commands.json"), JSON.stringify(logs, null, 2));
  assert.equal(code, expected, stderr);
  if (code) { assert.equal(stdout, ""); return; }
  return JSON.parse(stdout);
}
const opened = await command(["open", "--skill", "grill-with-docs", "--title", "Disposable isolated-home figure verification"]);
writeFileSync(join(evidence, "open.json"), JSON.stringify(opened, null, 2));
const scratch = dirname(dirname(dirname(opened.page)));
const assets = join(scratch, `figure-fixture-${opened.flow}`); mkdirSync(assets, { recursive: true });
const svg = join(assets, "order.svg"); copyFileSync(join(run, "figures/one.svg"), svg);
const original = readFileSync(svg), hash = new Bun.CryptoHasher("sha256").update(original).digest("hex");
const file = join(evidence, "submit.json");
const question = { title: "Which order path needs attention?", description: "Disposable fixture, not a real user decision.", needs: [{ need: "Follow the group and child roles.", kind: "context-diagram" }], options: [{ label: "Review", does: "Inspect the group.", gains: ["Visible scope"], costs: ["Time"] }, { label: "Continue", does: "Keep the child meanings.", gains: ["Consistency"], costs: ["No new selection"] }] };
writeFileSync(file, JSON.stringify({ version: 1, items: [
  { kind: "attachment", ref: "order", type: "svg", caption: "Disposable proof of group focus and child roles", origin: "Actual renderer CLI output", path: svg },
  { kind: "result", shape: "document", title: "Disposable figure proof", sections: [{ heading: "Captured figure", blocks: [{ figure: "order" }] }] },
  { kind: "round", questions: [{ ...question, ref: "choose", figures: [{ attachment: "order", kind: "context-diagram" }] }] }
] }));
const submitted = await command(["submit", file]);
writeFileSync(join(evidence, "receipt.json"), JSON.stringify(submitted, null, 2));
const shown = await command(["show", "--flow", submitted.flow]);
writeFileSync(join(evidence, "show.json"), JSON.stringify(shown, null, 2));
function files(path: string): string[] { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)]); }
const captured = files(dirname(opened.page)).find(p => p !== svg && p.endsWith(".svg") && readFileSync(p).equals(original));
assert(captured, "Flow did not retain the exact SVG bytes");
copyFileSync(captured, join(evidence, "captured.svg"));
writeFileSync(svg, "changed original source after capture");
await command(["render", "--flow", submitted.flow]);
assert(readFileSync(captured).equals(original));
const prior = readFileSync(opened.page);
const invalid = join(evidence, "refused.json");
writeFileSync(invalid, JSON.stringify({ version: 1, items: [{ kind: "round", questions: [question] }] }));
await command(["submit", invalid], 1);
assert(readFileSync(opened.page).equals(prior));
cpSync(dirname(opened.page), join(evidence, "export"), { recursive: true });
const summary = { ok: true, home, flow: submitted.flow, page: opened.page, live: submitted.live, hash, bytes: original.length, captured, exactBytesAfterSourceEdit: true, refusedWithoutPageChange: true };
writeFileSync(join(evidence, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
