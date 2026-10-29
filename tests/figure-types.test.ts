import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SKILL = join(import.meta.dir, "..", "plugin", "skills", "vstack-figures");
const SCRIPT = join(SKILL, "scripts", "render.ts");
const REFERENCE = join(SKILL, "references", "mermaid-types.md");
const EXAMPLES = join(SKILL, "references", "examples");
const KEYWORDS = [
  "flowchart", "sequenceDiagram", "stateDiagram-v2", "swimlane-beta", "erDiagram", "classDiagram",
  "architecture-beta", "block-beta", "timeline", "gantt", "journey", "mindmap", "kanban",
  "quadrantChart", "xychart", "pie", "sankey", "radar-beta", "treemap-beta", "venn-beta",
  "ishikawa-beta", "wardley-beta", "C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment",
  "gitGraph", "treeView-beta", "agentflow-beta", "cynefin-beta", "eventmodeling", "packet",
  "requirementDiagram", "usecase-beta", "railroad-beta", "railroad-ebnf-beta", "railroad-abnf-beta", "railroad-peg-beta",
  "graph", "flowchart-elk", "stateDiagram", "xychart-beta", "sankey-beta", "block", "packet-beta", "treemap", "ishikawa", "info",
];
const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("every documented Mermaid keyword renders through the figure CLI", async () => {
  const reference = readFileSync(REFERENCE, "utf8");
  const files = readdirSync(EXAMPLES).filter((file) => file.endsWith(".mmd")).sort();
  const keywords = files.map((file) => file.slice(0, -4));
  expect([...keywords].sort()).toEqual([...KEYWORDS].sort());
  const examples = files.map((file) => {
    expect(reference).toContain(`](examples/${file})`);
    const source = readFileSync(join(EXAMPLES, file), "utf8");
    expect(source.trimStart().split(/\s/)[0]).toBe(file.slice(0, -4));
    return source;
  });
  const dir = mkdtempSync(join(tmpdir(), "vstack-figure-types-"));
  dirs.push(dir);
  for (const [index, source] of examples.entries()) {
    const output = join(dir, `${index}-${keywords[index]}.svg`);
    const process = Bun.spawn(["bun", SCRIPT, "-", output], {
      stdin: new Blob([source]), stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    expect({ keyword: keywords[index], stderr, code }).toEqual({ keyword: keywords[index], stderr: "", code: 0 });
    expect(stdout.trim()).toBe(output);
    expect(readFileSync(output, "utf8")).toContain("<svg");
  }
}, 30000);
