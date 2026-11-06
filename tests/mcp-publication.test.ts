import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publish, resume } from "../plugin/skills/to-tickets/scripts/publisher.ts";
import { jiraFixture } from "./support/mcp-publication.ts";
import roundtrips from "./support/mcp-body-roundtrips.json";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
async function record() { const root = await mkdtemp(join(tmpdir(), "mcp-publication-")); roots.push(root); return join(root, "publication.json"); }
const tickets = [
  { key: "foundation", title: "Foundation", body: "Build the foundation.", labels: ["task"] },
  { key: "dependent", title: "Dependent", body: "Use the foundation.", labels: ["task"], parent: { external: "DEMO-99" }, blockedBy: ["foundation"] },
];

test("approved MCP binding publishes parent and blocking graph with readiness separate from system labels", async () => {
  const f = jiraFixture(), path = await record();
  const result = await publish({ version: 1, tracker: f.tracker, tickets }, path, f.connection);
  expect(result).toMatchObject({ status: "complete" });
  expect(f.issues.get("DEMO-1")).toMatchObject({ labels: ["task"], customfield_10010: { value: ["unrelated", "available"] } });
  expect(f.issues.get("DEMO-2")).toMatchObject({ parent: { key: "DEMO-99" }, labels: ["task"], customfield_10010: { value: ["unrelated", "available"] }, issuelinks: [{ type: { name: "Dependency" }, inward_issue: { key: "DEMO-1" } }] });
  expect(await resume(path, f.connection)).toMatchObject({ status: "complete" });
});

test("resume refuses to duplicate tickets created outside a discovery-blocked record", async () => {
  const f = jiraFixture(), path = await record();
  const read = f.tools.splice(f.tools.findIndex(tool => tool.name === "jira_get_issue"), 1)[0];
  expect(await publish({ version: 1, tracker: f.tracker, tickets }, path, f.connection)).toMatchObject({ status: "blocked", problem: { category: "capability-gap" } });
  f.tools.push(read);
  await f.connection.callTool("mcp-atlassian", "jira_create_issue", { project_key: "DEMO", issue_type: "Task", summary: tickets[0].title, description: tickets[0].body, additional_fields: JSON.stringify({ labels: ["task"] }) });
  f.writes.length = 0;
  expect(await resume(path, f.connection)).toMatchObject({ status: "blocked", problem: { category: "duplicate-risk" } });
  expect(f.writes).toEqual([]);
  expect([...f.issues.keys()]).toEqual(["DEMO-1"]);
});

for (const sample of roundtrips.samples.filter(sample => sample.name !== "nested")) {
  test(`MCP verifies the actual offline ${sample.name} converter round trip`, async () => {
    const f = jiraFixture();
    const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
      const result = await f.connection.callTool(server, name, args);
      if (name === "jira_create_issue") f.issues.get((result as { key: string }).key).description = sample.readback;
      return result;
    } };
    expect(await publish({ version: 1, tracker: f.tracker, tickets: [{ ...tickets[0], body: sample.approved }] }, await record(), connection)).toMatchObject({ status: "complete" });
  });
}

test("a converter that loses nested-list hierarchy blocks with a body diff", async () => {
  const f = jiraFixture(), sample = roundtrips.samples.find(sample => sample.name === "nested")!;
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const result = await f.connection.callTool(server, name, args);
    if (name === "jira_create_issue") f.issues.get((result as { key: string }).key).description = sample.readback;
    return result;
  } };
  const result = await publish({ version: 1, tracker: f.tracker, tickets: [{ ...tickets[0], body: sample.approved }] }, await record(), connection);
  expect(result).toMatchObject({ status: "blocked", problem: { category: "readback", detail: { bodyDiff: expect.stringContaining("--- approved") } } });
  expect(f.issues.get("DEMO-1").customfield_10010).toEqual({ value: ["unrelated"] });
});

test("create-time parent bindings resolve a batch parent listed after its child", async () => {
  const f = jiraFixture();
  const result = await publish({ version: 1, tracker: f.tracker, tickets: [
    { ...tickets[0], key: "child", title: "Child", parent: { local: "parent" } },
    { ...tickets[0], key: "parent", title: "Parent", body: "Parent body." },
  ] }, await record(), f.connection);
  expect(result).toMatchObject({ status: "complete" });
  expect(f.issues.get(result.tickets.child.id!)).toMatchObject({ summary: "Child", parent: { key: result.tickets.parent.id } });
});

for (const mutation of ["missing-tool", "required-parameter", "wrong-type", "enum", "literal-role", "unknown-placeholder", "missing-owner"] as const) {
  test(`MCP preflight rejects ${mutation} before any tool call`, async () => {
    const f = jiraFixture(), calls: string[] = [];
    const create = f.tools.find(tool => tool.name === "jira_create_issue")!;
    if (mutation === "missing-tool") f.tools.splice(f.tools.indexOf(create), 1);
    if (mutation === "required-parameter") create.inputSchema.required!.push("new_required");
    if (mutation === "wrong-type") create.inputSchema.properties!.summary = { type: "integer" };
    if (mutation === "enum") create.inputSchema.properties!.summary = { type: "string", enum: ["Other title"] };
    if (mutation === "literal-role") f.tracker.binding.actions.create.arguments.summary = tickets[0].title;
    if (mutation === "unknown-placeholder") f.tracker.binding.actions.create.arguments.description = "{unknown}";
    if (mutation === "missing-owner") f.tracker.facts.owner = "";
    const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
      calls.push(name); return f.connection.callTool(server, name, args);
    } };
    expect(await publish({ version: 1, tracker: f.tracker, tickets }, await record(), connection)).toMatchObject({ status: "blocked", problem: { category: "capability-gap", message: expect.stringContaining("mcp-atlassian") } });
    expect(calls).toEqual([]);
  });
}

test("resume validates the saved binding against changed live schemas without choosing a replacement", async () => {
  const f = jiraFixture(), path = await record();
  expect(await publish({ version: 1, tracker: f.tracker, tickets }, path, f.connection)).toMatchObject({ status: "complete" });
  f.tools.find(tool => tool.name === "jira_update_issue")!.inputSchema.required!.push("new_required");
  const calls: string[] = [];
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    calls.push(name); return f.connection.callTool(server, name, args);
  } };
  expect(await resume(path, connection)).toMatchObject({ status: "blocked", problem: { category: "capability-gap" } });
  expect(calls).toEqual([]);
});

for (const mutation of ["extra-label", "missing-label", "premature-readiness", "other-owner", "lost-readiness-value"] as const) {
  test(`readback blocks ${mutation} without claiming readiness`, async () => {
    const f = jiraFixture();
    const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
      const result = await f.connection.callTool(server, name, args);
      const issue = f.issues.get("DEMO-1");
      if (name === "jira_create_issue") {
        if (mutation === "extra-label") issue.labels.push("unapproved");
        if (mutation === "missing-label") issue.labels = [];
        if (mutation === "premature-readiness") issue.customfield_10010.value.push("available");
        if (mutation === "other-owner") issue.reporter.name = "another-account";
      }
      if (name === "jira_update_issue" && mutation === "lost-readiness-value") issue.customfield_10010.value = ["available"];
      return result;
    } };
    const category = mutation === "other-owner" ? "ownership" : mutation === "premature-readiness" ? "premature-readiness" : "readback";
    const result = await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), connection);
    expect(result).toMatchObject({ status: "blocked", problem: { category } });
    expect(result.tickets.foundation.ready).not.toBe(true);
  });
}

test("outward-side blocker bindings publish a directed dependency and the wrong side fails readback", async () => {
  for (const correct of [true, false]) {
    const f = jiraFixture();
    f.tracker.facts.blockingSide = "outwardIssue";
    if (correct) {
      f.tracker.binding.actions.block.arguments.inward_issue_key = "{dependent}";
      f.tracker.binding.actions.block.arguments.outward_issue_key = "{blocker}";
    }
    const result = await publish({ version: 1, tracker: f.tracker, tickets }, await record(), f.connection);
    expect(result.status).toBe(correct ? "complete" : "blocked");
    if (!correct) expect(result.problem).toMatchObject({ category: "readback" });
  }
});

for (const [approved, changed] of [
  ["Use `**literal**`.", "Use `__literal__`."],
  ["[guide](https://example.test/allowed)", "[guide](https://example.test/other)"],
  ["```python\nvalue = 1  \n```", "```python\nvalue = 1\n```"],
]) {
  test(`body comparison rejects changed content ${JSON.stringify(changed)}`, async () => {
    const f = jiraFixture();
    const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
      const result = await f.connection.callTool(server, name, args);
      if (name === "jira_create_issue") f.issues.get("DEMO-1").description = changed;
      return result;
    } };
    expect(await publish({ version: 1, tracker: f.tracker, tickets: [{ ...tickets[0], body: approved }] }, await record(), connection)).toMatchObject({ status: "blocked", problem: { category: "readback", detail: { bodyDiff: expect.stringContaining("--- approved") } } });
  });
}

test("resume reconciles a lost create after a meaning-preserving body conversion", async () => {
  const f = jiraFixture(), path = await record(), sample = roundtrips.samples.find(sample => sample.name === "emphasis")!;
  let loseResponse = true;
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const result = await f.connection.callTool(server, name, args);
    if (name === "jira_create_issue") {
      f.issues.get((result as { key: string }).key).description = sample.readback;
      if (loseResponse) { loseResponse = false; throw new Error("Create response lost"); }
    }
    return result;
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [{ ...tickets[0], body: sample.approved }] }, path, connection)).toMatchObject({ status: "blocked" });
  expect(await resume(path, connection)).toMatchObject({ status: "complete", tickets: { foundation: { id: "DEMO-1" } } });
  expect([...f.issues.keys()]).toEqual(["DEMO-1"]);
});

test("duplicate detection uses the same normalized body comparison as readback", async () => {
  const f = jiraFixture(), sample = roundtrips.samples.find(sample => sample.name === "emphasis")!;
  await f.connection.callTool("mcp-atlassian", "jira_create_issue", { project_key: "DEMO", issue_type: "Task", summary: tickets[0].title, description: sample.readback, additional_fields: JSON.stringify({ labels: ["other"] }) });
  f.writes.length = 0;
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [{ ...tickets[0], body: sample.approved }] }, await record(), f.connection)).toMatchObject({ status: "blocked", problem: { category: "duplicate-risk", detail: { candidates: [{ id: "DEMO-1" }] } } });
  expect(f.writes).toEqual([]);
});

test("resume cannot forget a readiness value lost by a failed activation", async () => {
  const f = jiraFixture(), path = await record();
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const result = await f.connection.callTool(server, name, args);
    if (name === "jira_update_issue") f.issues.get("DEMO-1").customfield_10010.value = ["available"];
    return result;
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, path, connection)).toMatchObject({ status: "blocked", problem: { category: "readback" } });
  expect(await resume(path, connection)).toMatchObject({ status: "blocked", problem: { category: "readback" } });
});

test("readiness in a different field does not excuse an extra system readiness label", async () => {
  const f = jiraFixture();
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const result = await f.connection.callTool(server, name, args);
    if (name === "jira_create_issue") f.issues.get("DEMO-1").labels.push("available");
    return result;
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), connection)).toMatchObject({ status: "blocked", problem: { category: "readback" } });
});

test("publication decodes FastMCP structured string-result envelopes from the captured server", async () => {
  const f = jiraFixture(), path = await record();
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const data = await f.connection.callTool(server, name, args);
    return { structuredContent: { result: JSON.stringify(data) }, content: [{ type: "text", text: JSON.stringify(data) }] };
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets }, path, connection)).toMatchObject({ status: "complete" });
  expect(await resume(path, connection)).toMatchObject({ status: "complete" });
  expect(f.issues.get("DEMO-2").issuelinks).toEqual([{ type: { name: "Dependency" }, inward_issue: { key: "DEMO-1" } }]);
});

test("duplicate detection includes a same-project match with a different issue type", async () => {
  const f = jiraFixture();
  await f.connection.callTool("mcp-atlassian", "jira_create_issue", { project_key: "DEMO", issue_type: "Bug", summary: tickets[0].title, description: tickets[0].body, additional_fields: JSON.stringify({ labels: ["task"] }) });
  f.writes.length = 0;
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), f.connection)).toMatchObject({ status: "blocked", problem: { category: "duplicate-risk", detail: { candidates: [{ id: "DEMO-1" }] } } });
  expect(f.writes).toEqual([]);
});

test("uncertain-create reconciliation never adopts a different issue type", async () => {
  const f = jiraFixture(), path = await record();
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    const data = await f.connection.callTool(server, name, args);
    if (name === "jira_create_issue") {
      f.issues.get("DEMO-1").issue_type.name = "Bug";
      throw new Error("Create response lost");
    }
    return data;
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, path, connection)).toMatchObject({ status: "blocked" });
  f.writes.length = 0;
  const result = await resume(path, connection);
  expect(result).toMatchObject({ status: "blocked", problem: { category: "reconciliation" } });
  expect(result.tickets.foundation.id).toBeUndefined();
  expect(f.writes).toEqual([]);
});

test("approved search pagination finds an existing match beyond the first page before creating", async () => {
  const f = jiraFixture(), offsets: number[] = [];
  Object.assign(f.tracker.binding.actions.search, { pagination: { offset: "start_at", limit: "limit", total: "total" } });
  Object.assign(f.tracker.binding.actions.search.arguments, { start_at: 0, limit: 10 });
  for (let index = 0; index < 11; index++) {
    await f.connection.callTool("mcp-atlassian", "jira_create_issue", { project_key: "DEMO", issue_type: "Task", summary: index === 10 ? tickets[0].title : `Foundation variant ${index}`, description: index === 10 ? tickets[0].body : `Other body ${index}`, additional_fields: JSON.stringify({ labels: ["task"] }) });
  }
  f.writes.length = 0;
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    if (name === "jira_search") {
      const all = [...f.issues.values()], offset = Number(args.start_at ?? 0), limit = Number(args.limit ?? 10);
      offsets.push(offset);
      return { structuredContent: { result: JSON.stringify({ issues: all.slice(offset, offset + limit), total: all.length, start_at: offset, max_results: limit }) } };
    }
    return f.connection.callTool(server, name, args);
  } };
  const result = await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), connection);
  expect(result).toMatchObject({ status: "blocked", problem: { category: "duplicate-risk", detail: { candidates: [{ id: "DEMO-11" }] } } });
  expect(offsets).toEqual([0, 10]);
  expect(f.writes).toEqual([]);
});

test("an undeclared partial search cannot authorize creation", async () => {
  const f = jiraFixture();
  Reflect.deleteProperty(f.tracker.binding.actions.search, "pagination");
  const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
    return name === "jira_search" ? { total: 11, start_at: 0, max_results: 10, issues: [] } : f.connection.callTool(server, name, args);
  } };
  expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), connection)).toMatchObject({ status: "blocked", problem: { category: "capability-gap" } });
  expect(f.writes).toEqual([]);
});

for (const defect of ["missing-total", "invalid-total", "changing-total", "empty-page", "repeated-page"]) {
  test(`incomplete search metadata ${defect} blocks before creating`, async () => {
    const f = jiraFixture();
    Object.assign(f.tracker.binding.actions.search.arguments, { start_at: 0, limit: 1 });
    for (let index = 0; index < 2; index++) await f.connection.callTool("mcp-atlassian", "jira_create_issue", { project_key: "DEMO", issue_type: "Task", summary: `Variant ${index}`, description: `Other body ${index}`, additional_fields: JSON.stringify({ labels: ["task"] }) });
    const rows = structuredClone([...f.issues.values()]);
    f.writes.length = 0;
    let searches = 0;
    const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
      if (name !== "jira_search") return f.connection.callTool(server, name, args);
      if (++searches > 4) throw new Error("Search did not make progress");
      const offset = Number(args.start_at ?? 0);
      const page: Record<string, unknown> = { total: 2, start_at: offset, max_results: 1, issues: [rows[defect === "repeated-page" ? 0 : Math.min(offset, 1)]] };
      if (defect === "missing-total") delete page.total;
      if (defect === "invalid-total") page.total = "2";
      if (defect === "changing-total" && offset > 0) page.total = 3;
      if (defect === "empty-page" && offset > 0) page.issues = [];
      return { structuredContent: { result: JSON.stringify(page) } };
    } };
    expect(await publish({ version: 1, tracker: f.tracker, tickets: [tickets[0]] }, await record(), connection)).toMatchObject({ status: "blocked", problem: { category: "capability-gap" } });
    expect(f.writes).toEqual([]);
  });
}
