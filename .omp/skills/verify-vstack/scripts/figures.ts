import { strict as assert } from "node:assert";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error("Usage: bun scripts/figures.ts <checkout> <new evidence directory>");
const root = resolve(checkout), dir = resolve(output);
if (existsSync(dir)) throw new Error("Use a new evidence directory so prior proof survives.");
mkdirSync(dir, { recursive: true });
const cli = join(root, "plugin/skills/vstack-figures/scripts/render.ts");
const examples = join(root, "plugin/skills/vstack-figures/references/examples");
const invocations: unknown[] = [], figures: { name: string; file: string }[] = [];
let serial = 0;
type Options = { elements?: unknown[]; focus?: string[]; raw?: string };
async function run(name: string, source: string, options: Options = {}, expected = 0, destination = name) {
  const prefix = `${++serial}-${name}`, src = join(dir, `${prefix}.mmd`), out = join(dir, `${destination}.svg`);
  writeFileSync(src, source);
  const args = [process.execPath, cli, src, out];
  if (options.elements || options.raw !== undefined) {
    const file = join(dir, `${prefix}.json`);
    writeFileSync(file, options.raw ?? JSON.stringify({ elements: options.elements }));
    args.push("--bindings", file);
  }
  for (const id of options.focus ?? []) args.push("--focus", id);
  const p = Bun.spawn(args, { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([p.exited, new Response(p.stdout).text(), new Response(p.stderr).text()]);
  invocations.push({ args, code, stdout, stderr });
  writeFileSync(join(dir, "commands.json"), JSON.stringify(invocations, null, 2));
  assert.equal(code, expected, `${name}: ${stderr}`);
  assert.equal(stdout, expected ? "" : out + "\n", name);
  if (!expected) { assert.equal(stderr, "", name); figures.push({ name, file: `${destination}.svg` }); }
  return existsSync(out) ? readFileSync(out, "utf8") : undefined;
}
const geometry = (svg: string) => [...svg.matchAll(/\b(?:d|x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|transform|viewBox)="[^"]*"/g)].map(m => m[0]);
const flow = "flowchart LR\n subgraph G[Group]\n A[Orders]\n B[(Data)]:::store\n end\n A edge@-->|Ready| B\n";
await run("one", flow, { elements: [{ id: "G", role: "external" }, { id: "A", category: "Orders" }], focus: ["G"] });
await run("two", flow, { elements: [{ id: "G", role: "bad" }, { id: "A", role: "ok" }] });
await run("sequence", "sequenceDiagram\n actor P as Person\n participant A as Human\n participant D@{ \"type\": \"database\", \"alias\": \"Data\" }\n P->>A: read\n A->>D: load\n", { elements: [{ id: "A", role: "external" }], focus: ["A"] });
const roles = "flowchart TD\n subgraph Checkout[Order checkout]\n cart[Cart accepted]:::ok -->|available| stock{Stock check}:::warn\n stock -->|yes| payment[Payment captured]:::changed\n stock -->|no| retry[Stock unavailable]:::bad\n reader[Reader]:::actor --> cart\n payment --> database[(Captured order)]:::store\n database --> service[Carrier API]:::external\n retry --> service\n end\n";
await run("roles", roles, { focus: ["cart"] });
await run("pie", 'pie\n "Orders": 3\n "Other": 1\n');
for (const mode of ["source", "target", "gradient"]) {
  await run(`sankey-${mode}`, `---\nconfig:\n sankey:\n  linkColor: ${mode}\n---\nsankey\n\nOrders,Other,3\nOrders,Archive,1\nOther,Final,2\nArchive,Final,1\n`, { elements: [{ id: "Orders", role: "ok" }, { id: "Other", role: "bad" }, { id: "Archive", role: "store" }, { id: "Final", role: "external" }] });
}
const targets: Record<string, string> = { C4Context: "user", C4Container: "db", C4Component: "controller", C4Dynamic: "api", C4Deployment: "host", erDiagram: "CUSTOMER", classDiagram: "Order", "architecture-beta": "db", "block-beta": "A", block: "A", requirementDiagram: "latency", "usecase-beta": "checkout" };
for (const file of readdirSync(examples).filter(f => f.endsWith(".mmd")).sort()) {
  const name = file.slice(0, -4), source = readFileSync(join(examples, file), "utf8");
  const plain = await run(`example-${name}`, source);
  if (targets[name]) {
    const colored = await run(`bound-${name}`, source, { elements: [{ id: targets[name], role: "bad" }], focus: [targets[name]] });
    assert.deepEqual(geometry(colored!), geometry(plain!), name);
  }
}
const curated: [string, string, string][] = [
  ["gantt", "gantt\n dateFormat YYYY-MM-DD\n Done :done, d, 2026-01-01, 2d\n Critical :crit, c, 2026-01-03, 2d\n Active :active, a, 2026-01-05, 2d\n", "d"],
  ["timeline", "timeline\n section Orders\n 2026 : Launch\n", "Orders"],
  ["journey", "journey\n section Orders\n Failed: 1: Customer\n Accepted: 5: Customer\n", "Customer"],
  ["kanban", "kanban\n todo[Done failed]\n work[Work]@{ priority: High, assigned: Agent }\n", "todo"],
  ["git", 'gitGraph\n commit id: "start"\n' + Array.from({ length: 20 }, (_, i) => ` branch category-${i}\n commit id: "work-${i}"\n checkout main\n`).join(""), "category-0"],
  ["c4-kinds", 'C4Context\n Person_Ext(person, "Software")\n SystemDb_Ext(outside, "Data")\n SystemDb(data, "Person")\n SystemQueue(queue, "Database")\n System(app, "Failed person database")\n', "data"],
  ["tree", "treeView-beta\nproject/\n src/\n  index.ts icon(file)\n  README.md icon(none)\n", "README.md"],
  ["mindmap", "mindmap\n root((Order))\n  a[Orders]\n   child[Failed database]\n  b[People]\n", "a"],
  ["ishikawa", "ishikawa\n Delay\n  Orders\n   Manual review\n", "Orders"],
  ["wardley", "wardley-beta\n anchor User [0.9, 0.2]\n component Database [0.4, 0.6] (buy)\n evolve Database 0.8\n User -> Database\n", "Database"],
  ["cynefin", 'cynefin-beta\n clear\n  "Failed database"\n complex\n  "Orders"\n', "clear"],
  ["state", 'stateDiagram-v2\n state "Failed" as P {\n A --> B\n }\n class A ok\n [*] --> P\n', "P"],
  ["swimlane", "swimlane-beta LR\n subgraph G[Group]\n A[Failed person]\n B[(Data)]\n end\n A --> B\n class A ok\n", "G"],
  ["agent", 'agentflow-beta LR\n flow G[Failed group]\n A[[Software]] --> B@{ shape: refdoc, label: "File" }\n flow H[Hidden]@{ view: collapsed }\n C[Child]\n end\n end\n A fail@--x B\n', "G"],
  ["event", "eventmodeling\n tf 1 ui Failed\n tf 2 cmd Done\n tf 3 evt Rejected\n tf 4 rmo Orders\n tf 5 pcr Agent\n", "4"],
];
for (const [name, source, id] of curated) {
  const plain = await run(`${name}-plain`, source);
  const colored = await run(`${name}-bound`, source, { elements: [{ id, category: "Orders" }, { id, role: "bad" }, { id, role: "bad" }], focus: [name === "tree" ? "index.ts" : id] });
  assert.deepEqual(geometry(colored!), geometry(plain!), name);
}
const letters = "M".repeat(20), words = Array(30).fill("WWW").join(" ");
await run("readability", `flowchart TD\n Wide[${"W".repeat(20)}] --> Narrow[${"i".repeat(20)}]\n Plain[${letters}] --> Bold["<b><i><u><code>${letters}</code></u></i></b>"]\n Sub["<sub>${letters}</sub>"] --> Sup["<sup>${letters}</sup>"]\n Combined["${"e\u0301".repeat(20)}"] --> Latin[${"e".repeat(20)}]\n CJK["${"界".repeat(20)}"] --> Precomposed["${"é".repeat(20)}"]\n Wrap["${words}"] --> Small["<b><sub>${words}</sub></b>"]\n`);
const refusals: [string, string, Options, number][] = [
  ["missing-focus", flow, { focus: ["Absent"] }, 1],
  ["ambiguous-focus", "flowchart LR\n A A@--> B\n", { focus: ["A"] }, 1],
  ["empty-focus", 'treemap\n "Empty": 0\n "Visible": 1\n', { focus: ["Empty"] }, 1],
  ["text-only-focus", curated.find(c => c[0] === "tree")![1], { focus: ["README.md"] }, 1],
  ["invalid", "flowchart LR\n A[", {}, 1],
  ["unknown", flow, { elements: [{ id: "A", role: "green" }] }, 1],
  ["conflict", flow, { elements: [{ id: "A", role: "ok" }, { id: "A", role: "bad" }] }, 1],
  ["masked-conflict", flow, { elements: [{ id: "A", role: "ok" }, { id: "A", category: "one" }, { id: "A", category: "two" }] }, 1],
  ["json", flow, { raw: "{" }, 2],
  ["entry", flow, { elements: [{ id: "A", role: "ok", category: "one" }] }, 2],
];
for (const family of ["classDiagram", "erDiagram", "block-beta"]) refusals.push([`paint-${family}`, `${family}\n ${family === "classDiagram" ? "class A" : "A"}\n classDef unused fill:#ff0000\n`, {}, 1]);
refusals.push(["masked-class-paint", "classDiagram\n class A:::ok\n classDef ok fill:var(--pele-error)\n", {}, 1]);
for (const declaration of ["Orders: var(--pele-error)", "Unused: red"]) refusals.push([`sankey-paint-${refusals.length}`, `---\nconfig:\n sankey:\n  nodeColors:\n   ${declaration}\n---\nsankey\n\nOrders,Other,1\n`, {}, 1]);
for (const [name, source, id] of [
  ["collapsed", curated.find(c => c[0] === "agent")![1], "C"],
  ["frame", "sequenceDiagram\n participant A\n loop Work\n A->>A: Again\n end\n", "i0"],
  ["pseudostate", "stateDiagram-v2\n [*] --> Open\n", "root_start"],
  ["tree-duplicate", "treeView-beta\nroot/\n one/\n  index.ts\n two/\n  index.ts\n", "index.ts"],
  ["timeline-duplicate", "timeline\n 2026 : First\n 2026 : Second\n", "2026"],
  ["journey-duplicate", "journey\n Work: 1: A\n Work: 5: B\n", "Work"],
  ["board-duplicate", "kanban\n todo[Todo]\n todo[Work]\n", "todo"],
  ["generated-task", "gantt\n dateFormat YYYY-MM-DD\n Build :2026-01-01, 2d\n", "task1"],
  ["generated-commit", "gitGraph\n commit\n", "0-9e3779b"],
  ["cause", "ishikawa\n Delay\n  Orders\n   Manual review\n", "Manual review"],
  ["hidden-item", 'cynefin-beta\n confusion\n  "One"\n  "Two"\n  "Three"\n  "Four"\n  "Five"\n', "Five"],
  ["sankey-link", 'sankey\n\n"A->B",C,1\nA,"B->C",1\n', "A->B->C"],
] as const) {
  refusals.push([`${name}-binding`, source, { elements: [{ id, role: "ok" }] }, 1]);
  refusals.push([`${name}-focus`, source, { focus: [id] }, 1]);
}
for (const [name, source, options, code] of refusals) {
  const old = await run(`${name}-prior`, flow);
  assert.equal(await run(`${name}-old`, source, options, code, `${name}-prior`), old, name);
  assert.equal(await run(`${name}-new`, source, options, code), undefined, name);
}
for (const family of ["pie", "sankey", "treemap"]) {
  const keys = Array.from({ length: 150 }, (_, i) => `category-${i}`);
  for (const [index, names] of [keys, [...keys].reverse(), ["Inserted", ...keys]].entries()) {
    const source = family === "pie" ? `pie\n${names.map(n => ` "${n}": 1`).join("\n")}\n` : family === "sankey" ? `sankey\n\n${names.map(n => `Root,${n},1`).join("\n")}\n` : `treemap\n${names.map(n => ` "${n}": 1`).join("\n")}\n`;
    await run(`keys-${family}-${index}`, source);
  }
}
const baseline = Bun.spawnSync(["git", "show", "9a3a54bbb269732d548c0cc00af18497657d6933:plugin/skills/vstack-figures/scripts/render.ts"], { cwd: root });
assert.equal(baseline.exitCode, 0);
const historical = join(dir, "baseline-render.ts");
writeFileSync(historical, baseline.stdout.toString().replace('from "pele"', `from ${JSON.stringify(join(root, "node_modules/pele/dist/pele.js"))}`));
const source = join(dir, "comparison.mmd");
writeFileSync(source, "flowchart TD\n subgraph G[Group]\n A[Wide label WWW] -->|Route| B[Other label iii]\n A --> C[Third]\n end\n");
for (const [name, renderer] of [["before-9a3a54b", historical], ["after-working-tree", cli]]) {
  const args = [process.execPath, renderer, source, join(dir, `${name}.svg`)];
  const result = Bun.spawnSync(args, { cwd: root });
  invocations.push({ args, code: result.exitCode, stdout: result.stdout.toString(), stderr: result.stderr.toString() });
  assert.equal(result.exitCode, 0, result.stderr.toString());
  figures.push({ name, file: `${name}.svg` });
}
writeFileSync(join(dir, "commands.json"), JSON.stringify(invocations, null, 2));
const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
writeFileSync(join(dir, "revisions.json"), JSON.stringify({ before: "9a3a54bbb269732d548c0cc00af18497657d6933", afterParent: revision, afterRendererSha256: new Bun.CryptoHasher("sha256").update(readFileSync(cli)).digest("hex"), comparison: "Historical versus current includes intended typography, routing, outline, and palette changes. Palette-only pairs use identical current renderer and source with binding changes only." }, null, 2));
writeFileSync(join(dir, "consumer.html"), `<!doctype html><meta charset="utf-8"><title>Disposable figure verification</title>${figures.map(({ name, file }) => `<section id="${name}"><h2>${name}</h2>${readFileSync(join(dir, file), "utf8")}</section>`).join("\n")}`);
writeFileSync(join(dir, "summary.json"), JSON.stringify({ ok: true, invocations: invocations.length, figures }, null, 2));
console.log(JSON.stringify({ ok: true, dir, invocations: invocations.length, figures: figures.length }));
