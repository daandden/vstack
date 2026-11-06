import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [source, evidence, fixtures = source, expectation = "complete"] = process.argv.slice(2);
if (!source || !evidence || !["complete", "blocked"].includes(expectation)) throw new Error("Usage: ticket-publication.ts <source checkout> <new evidence dir> [fixture checkout] [complete|blocked]");
await mkdir(evidence, { recursive: false });
const load = (root: string, path: string) => import(pathToFileURL(resolve(root, path)).href);
const { publish, resume } = await load(source, "plugin/skills/to-tickets/scripts/publisher.ts");
const { jiraFixture } = await load(fixtures, "tests/support/mcp-publication.ts");
const f = jiraFixture();
const connection = { ...f.connection, async callTool(server: string, name: string, args: Record<string, unknown>) {
  const data = await f.connection.callTool(server, name, args);
  return { structuredContent: { result: JSON.stringify(data) }, content: [{ type: "text", text: JSON.stringify(data) }] };
} };
const documentation = await Bun.file(resolve(fixtures, "plugin/skills/to-tickets/references/publication.md")).text();
const example = documentation.split("#### mcp-atlassian example")[1].match(/```json\n([\s\S]*?)\n```/);
if (!example) throw new Error("MCP binding example missing");
const tracker = JSON.parse(example[1]);
const input = { version: 1, tracker, tickets: [
  { key: "foundation", title: "Foundation", body: "Build the **foundation**.", labels: ["task"] },
  { key: "dependent", title: "Dependent", body: "Use the foundation.", labels: ["task"], parent: { external: "DEMO-99" }, blockedBy: ["foundation"] },
] };
const record = resolve(evidence, "publication.json");
const receipt = await publish(input, record, connection);
await Bun.write(resolve(evidence, "receipt.json"), JSON.stringify(receipt, null, 2));
if (receipt.status !== expectation) throw new Error(`Expected ${expectation}, got ${JSON.stringify(receipt)}`);
if (expectation === "blocked") {
  if (f.writes.length || receipt.problem?.category !== "capability-gap") throw new Error("Baseline did not block before writes");
  console.log(JSON.stringify({ status: "blocked", problem: receipt.problem, writes: f.writes }));
} else {
  const readback = [];
  for (const [key, saved] of Object.entries(receipt.tickets) as [string, { id: string }][]) {
    const issue = await f.connection.callTool(tracker.server, "jira_get_issue", { issue_key: saved.id, fields: "*all" });
    if (JSON.stringify(issue.labels) !== '["task"]' || JSON.stringify(issue.customfield_10010.value) !== '["unrelated","available"]') throw new Error(`Labels or readiness differ for ${key}`);
    if (key === "dependent" && (issue.parent?.key !== "DEMO-99" || issue.issuelinks?.[0]?.inward_issue?.key !== receipt.tickets.foundation.id)) throw new Error("Approved parent or blocker not installed");
    readback.push(issue);
  }
  const resumed = await resume(record, connection);
  if (resumed.status !== "complete" || f.issues.size !== 2) throw new Error("Resume did not preserve the published batch");
  await Bun.write(resolve(evidence, "readback.json"), JSON.stringify(readback, null, 2));
  await Bun.write(resolve(evidence, "resume.json"), JSON.stringify(resumed, null, 2));
  console.log(JSON.stringify({ status: receipt.status, resumed: resumed.status, tickets: receipt.tickets, readback }));
}
