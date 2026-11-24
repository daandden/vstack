import { afterAll, beforeEach, expect, test } from "bun:test";
import { decisionBrief } from "./support/decision-brief.ts";
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SCRIPT = join(import.meta.dir, "..", "plugin", "skills", "flow-page", "scripts", "flow-page.ts");
const root = realpathSync(mkdtempSync(join(tmpdir(), "flow-planning-test-")));
afterAll(() => rmSync(root, { recursive: true, force: true }));
let home: string;
let cwd: string;
let n = 0;
beforeEach(() => {
  home = join(root, String(n), "home");
  cwd = join(root, String(n++), "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(cwd, { recursive: true });
});
function run(args: string[], session: string, items?: object[]) {
  const p = Bun.spawnSync(["bun", SCRIPT, ...args, "--home", home, "--session", session], {
    cwd, env: { PATH: process.env.PATH!, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
    stdin: items ? new TextEncoder().encode(JSON.stringify({ version: 1, items })) : "ignore",
    stdout: "pipe", stderr: "pipe",
  });
  expect(p.stderr.toString()).toBe("");
  expect(p.exitCode).toBe(0);
  return JSON.parse(p.stdout.toString());
}
const submit = (session: string, ...items: object[]) => run(["submit"], session, items);
const option = (label: string) => ({ label, does: label, gains: ["Preserve the work boundary"], costs: ["Requires a planning decision"] });
const question = (ref: string, extra: object = {}) => ({ ref, brief: decisionBrief("the work boundary"), title: "Which planning route?", description: "Choose the work boundary.", needs: [{ need: "Compare the independently deliverable work boundaries.", kind: "prose" }], options: [option("One ticket"), option("Two tickets")], ...extra });

test("a planning close preserves a resolved note as an interpretation, not a picked answer", () => {
  const opened = run(["open", "--skill", "grill-me", "--title", "Planning a small change"], "interview");
  const asked = submit("interview", { kind: "round", now: "Independent work boundaries are ready to compare.", questions: [question("scope")] });
  submit("interview", {
    kind: "answer", question: asked.refs.scope,
    response: { status: "answered", text: "Keep both independently demoable tickets." },
    reading: { outcome: "resolved", decision: "Use two independently demoable tickets.", basis: "The note explicitly retains both tickets.", maps_to: "B" },
  });
  submit("interview", { kind: "close", decisions: [{ question: asked.refs.scope, text: "Use two independently demoable tickets." }] }, { kind: "stage", state: "finished" });
  const view = run(["show", "--flow", opened.flow], "reader");
  expect(view.next).toEqual([]);
  const q = view.stages[0].questions[0];
  expect(q.answer.response.picks).toBeUndefined();
  expect(q.answer.response.text).toBe("Keep both independently demoable tickets.");
  expect(q.answer.reading).toMatchObject({ outcome: "resolved", maps_to: "B" });
  expect(view.stages[0].state).toBe("finished");
});

test("unbound triage discovery creates no administrative Flow and bound discovery survives later item work", () => {
  const files = (): string[] => {
    const dir = join(home, ".vstack");
    return readdirSync(home).includes(".vstack") ? readdirSync(dir, { recursive: true }).map(String) : [];
  };
  const before = files();
  expect(run(["bound"], "discovery").binding).toBeNull();
  expect(files()).toEqual(before);
  const opened = run(["open", "--skill", "grill-me", "--title", "Issue planning"], "owner");
  const discovery = run(["open", "--flow", opened.flow, "--skill", "triage"], "discovery");
  const found = submit("discovery",
    { kind: "result", ref: "buckets", shape: "table", title: "Needs attention", columns: ["Bucket", "Count", "Item"], rows: [{ ref: "bug", cells: ["Unlabeled", "1", "Missing history"] }, { ref: "empty", cells: ["Needs triage", "0", "None"] }] },
    { kind: "round", now: "Independent work boundaries are ready to compare.", questions: [question("item", { results: ["buckets/bug"] })] },
  );
  submit("discovery", { kind: "answer", question: found.refs.item, response: { status: "answered", picks: ["A"] } });
  run(["alias", "ticket:287"], "discovery");
  submit("discovery", { kind: "result", shape: "ledger", title: "Claim verification", entries: [{ claim: "Issue is ready for implementation", status: "unproven", evidence: "No reproduction was provided.", missing_proof: "Reporter steps", consequence: "Keep needs-info; do not mark ready." }] }, { kind: "stage", state: "finished" });
  const continued = run(["open", "--flow", "ticket:287", "--skill", "to-spec"], "later-session");
  expect(continued.flow).toBe(opened.flow);
  const view = run(["show", "--flow", opened.flow], "reader");
  const triage = view.stages.find((s: any) => s.id === discovery.stage);
  expect(triage.results).toHaveLength(2);
  expect(triage.questions[0].results).toHaveLength(1);
  expect(triage.results[1].entries[0].status).toBe("unproven");
  expect(view.stages.map((s: any) => s.skill)).toEqual(["grill-me", "triage", "to-spec"]);
});

test("parallel wayfinder ticket Results retain both resolutions and a separate blocking graph", async () => {
  const map = run(["open", "--skill", "wayfinder", "--title", "Resolve a planning map"], "chart");
  submit("chart", { kind: "result", shape: "table", title: "Ticket dependencies", columns: ["Ticket", "Blocked by"], rows: [{ cells: ["Research history", "None"] }, { cells: ["Choose retention", "Research history"] }] }, { kind: "stage", state: "finished" });
  const a = run(["open", "--flow", map.flow, "--skill", "wayfinder", "--ticket", "research"], "a");
  const b = run(["open", "--flow", map.flow, "--skill", "wayfinder", "--ticket", "retention"], "b");
  async function publish(session: string, stage: string, decision: string) {
    const p = Bun.spawn(["bun", SCRIPT, "submit", "--flow", map.flow, "--stage", stage, "--home", home, "--session", session], {
      cwd, env: { PATH: process.env.PATH!, HOME: join(root, "default-home"), VSTACK_FLOW_HOST: "off" },
      stdin: new TextEncoder().encode(JSON.stringify({ version: 1, items: [{ kind: "result", shape: "document", title: "Resolution", sections: [{ heading: "Decision", blocks: [{ prose: decision }] }] }, { kind: "stage", state: "finished" }] })),
      stdout: "pipe", stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    expect(err).toBe("");
    expect(code).toBe(0);
    return JSON.parse(out);
  }
  const receipts = await Promise.all([publish("a", a.stage, "Retain immutable decisions."), publish("b", b.stage, "Preserve open work.")]);
  expect(new Set(receipts.map(r => r.revision)).size).toBe(2);
  const view = run(["show", "--flow", map.flow], "reader");
  expect(view.stages.map((s: any) => s.state)).toEqual(["finished", "finished", "finished"]);
  expect(view.stages[0].results[0].entries.map((r: any) => r.cells[1])).toEqual(["None", "Research history"]);
  expect(view.stages[1].results).toHaveLength(1);
  expect(view.stages[2].results).toHaveLength(1);
  expect(view.stages[1].results[0].id).not.toBe(view.stages[2].results[0].id);
  expect(view.stages[1].results[0].changed).not.toBe(view.stages[2].results[0].changed);
  expect(view.stages[1].ticket).toBe("research");
  expect(view.stages[2].ticket).toBe("retention");
  expect(run(["find", "ticket:research"], "later").flow).toBe(map.flow);
  expect(run(["find", "ticket:retention"], "later").flow).toBe(map.flow);
});
