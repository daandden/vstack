import { strict as assert } from "node:assert";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, copyFileSync, cpSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { projectStore } from "../../../../plugin/skills/flow-page/scripts/store.ts";
const [checkout, runDir, session, agent] = process.argv.slice(2);
if (!checkout || !runDir || !session || !agent) throw new Error("Usage: bun scripts/figure-flow.ts <checkout> <verify run> <own session> <own agent>");
const root = resolve(checkout), run = resolve(runDir), home = join(run, "data/figure-home"), evidence = join(run, "figure-flow");
if (existsSync(evidence)) throw new Error("Use a fresh Verify run so prior Flow evidence survives.");
mkdirSync(evidence, { recursive: true });
const page = join(root, "plugin/skills/flow-page/scripts/flow-page.ts"), logs: { argv: string[]; code: number; stdout: string; stderr: string }[] = [];
const port = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response("") });
const env = { ...process.env, VSTACK_FLOW_PORT: String(port.port) }; port.stop(true);
async function command(args: string[], expected = 0) {
  const argv = [process.execPath, page, ...args, "--home", home, "--session", session, "--agent", agent];
  const p = Bun.spawn(argv, { cwd: root, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  logs.push({ argv, code, stdout, stderr }); writeFileSync(join(evidence, "commands.json"), JSON.stringify(logs, null, 2));
  assert.equal(code, expected, stderr);
  if (code) { const refused = JSON.parse(stdout); assert.equal(refused.ok, false); assert(refused.diagnostics.length > 0); return refused; }
  return JSON.parse(stdout);
}
const opened = await command(["open", "--skill", "grill-with-docs", "--title", "Disposable isolated-home figure verification"]);
writeFileSync(join(evidence, "open.json"), JSON.stringify(opened, null, 2));
const store = projectStore(home, root);
const folder = join(evidence, "export");
const scratch = store.scratch;
const assets = join(scratch, `figure-fixture-${opened.flow}`); mkdirSync(assets, { recursive: true });
const svg = join(assets, "order.svg"); copyFileSync(join(run, "figures/one.svg"), svg);
const original = readFileSync(svg), hash = new Bun.CryptoHasher("sha256").update(original).digest("hex");
const sourceFile = readdirSync(join(run, "figures")).find(name => /^\d+-roles\.mmd$/.test(name));
assert(sourceFile, "Run figures.ts first to retain the seven-role Mermaid source");
const mermaid = join(assets, "roles.mmd"), source = readFileSync(join(run, "figures", sourceFile), "utf8");
writeFileSync(mermaid, source);
const sourceHash = new Bun.CryptoHasher("sha256").update(source).digest("hex");
writeFileSync(join(evidence, "roles.mmd"), source);
const file = join(evidence, "submit.json");
const now = "The renderer captured the group diagram and the seven-role source.";
const question = { title: "Which order path needs attention?", description: "Disposable fixture, not a real user decision.", needs: [{ need: "Follow the group and child roles.", kind: "context-diagram" }], options: [{ label: "Review", does: "Inspect the group.", gains: ["Visible scope"], costs: ["Time"] }, { label: "Continue", does: "Keep the child meanings.", gains: ["Consistency"], costs: ["No new selection"] }] };
const brief = { unblocks: "Choose which path to inspect.", undo: "Return to either captured figure.", no_recommendation: "The fixture compares how both figures render." };
writeFileSync(file, JSON.stringify({ version: 1, items: [
  { kind: "attachment", ref: "order", type: "svg", caption: "Disposable proof of group focus and child roles", origin: "Actual renderer CLI output", path: svg },
  { kind: "attachment", ref: "roles", type: "mermaid", caption: "Disposable seven-role source figure", origin: "Retained seven-role Mermaid fixture", path: mermaid, focus: ["cart"] },
  { kind: "result", shape: "document", title: "Disposable figure proof", sections: [
    { heading: "Captured figure", blocks: [{ figure: "order" }] },
    { heading: "Shared reader roles", blocks: [{ figure: "roles" }, { code: source, language: "mermaid", source: "Retained seven-role Mermaid fixture" }] }
  ] },
  { kind: "round", now, questions: [{ ...question, ref: "choose", brief, figures: [{ attachment: "order", kind: "context-diagram" }, { attachment: "roles", kind: "context-diagram" }] }] }
] }));
const submitted = await command(["submit", file]);
writeFileSync(join(evidence, "receipt.json"), JSON.stringify(submitted, null, 2));
const shown = await command(["show", "--flow", submitted.flow]);
writeFileSync(join(evidence, "show.json"), JSON.stringify(shown, null, 2));
const capturedAssets = store.assets(opened.flow);
function files(path: string): string[] { return readdirSync(path, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(join(path, e.name)) : [join(path, e.name)]); }
const captured = files(capturedAssets).find(p => p !== svg && p.endsWith(".svg") && readFileSync(p).equals(original));
assert(captured, "Flow did not retain the exact SVG bytes");
copyFileSync(captured, join(evidence, "captured.svg"));
const capturedSource = files(capturedAssets).find(p => p.endsWith(".mmd") && readFileSync(p, "utf8") === source);
assert(capturedSource, "Flow did not retain the exact Mermaid source");
writeFileSync(svg, "changed original source after capture");
writeFileSync(mermaid, "changed original Mermaid after capture");
await command(["show", "--flow", submitted.flow]);
assert(readFileSync(captured).equals(original));
assert.equal(readFileSync(capturedSource, "utf8"), source);
const prior = store.read(opened.flow);
const invalid = join(evidence, "refused.json");
writeFileSync(invalid, JSON.stringify({ version: 1, items: [{ kind: "round", now, questions: [{ ...question, brief }] }] }));
const refused = await command(["submit", invalid], 1);
assert(refused.diagnostics.some((d: { message: string }) => d.message.includes("no visual or option preview on this question is a context-diagram")));
assert.deepEqual(store.read(opened.flow), prior);
for (const [name, text, focus, diagnostic] of [
  ["unknown-role", "flowchart LR\n A[Unknown]:::okk\n", [], "Unknown color role: okk"],
  ["authored-paint", "flowchart LR\n A[Paint]\n classDef unused fill:#ff0000\n", [], "The Mermaid sets its own color"],
  ["text-only-focus", "treeView-beta\nproject/\n README.md icon(none)\n", ["README.md"], "no visible owned marks"],
] as const) {
  const badSource = join(assets, `${name}.mmd`), input = join(evidence, `${name}.json`);
  writeFileSync(badSource, text);
  writeFileSync(input, JSON.stringify({ version: 1, items: [
    { kind: "attachment", ref: "bad", type: "mermaid", caption: "Disposable refusal proof", origin: "Invalid source fixture", path: badSource, ...(focus.length ? { focus } : {}) },
    { kind: "result", shape: "document", sections: [{ heading: "Refused", blocks: [{ figure: "bad" }] }] },
  ] }));
  await command(["submit", input], 1);
  assert(logs.at(-1)!.stderr.includes(diagnostic), `${name} refused before its intended semantic check`);
  assert.deepEqual(store.read(opened.flow), prior, `${name} changed stored Flow state`);
}
mkdirSync(join(folder, "data"), { recursive: true });
writeFileSync(join(folder, "data/state.json"), JSON.stringify(store.read(opened.flow)));
writeFileSync(join(folder, "observation-project.json"), JSON.stringify(store.readObservation(opened.flow)));
cpSync(capturedAssets, join(folder, "assets"), { recursive: true });
const summary = { ok: true, home, flow: submitted.flow, folder, live: submitted.live, hash, sourceHash, bytes: original.length, captured, capturedSource, exactBytesAfterSourceEdit: true, refusedWithoutContentChange: true };
writeFileSync(join(evidence, "summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));
