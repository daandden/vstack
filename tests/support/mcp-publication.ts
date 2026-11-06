import capture from "./mcp-atlassian-tools.json";
import sample from "./mcp-issue-readback.json";
import type { Connection, Tool } from "../../plugin/skills/to-tickets/scripts/trackers.ts";

export function jiraFixture() {
  const tools: Tool[] = JSON.parse(JSON.stringify(capture.tools));
  const issues = new Map<string, any>();
  const writes: string[] = [];
  const tracker = {
    mode: "mcp", server: "mcp-atlassian", readiness: "available",
    facts: { projectKey: "DEMO", issueType: "Task", linkType: "Dependency", blockingSide: "inwardIssue", owner: "publisher" },
    binding: {
      actions: {
        search: { tool: "jira_search", arguments: { jql: "project = {facts.projectKey} AND summary ~ {title}", fields: "*all", start_at: 0, limit: 10 }, result: "issues", pagination: { offset: "start_at", limit: "limit", total: "total" } },
        read: { tool: "jira_get_issue", arguments: { issue_key: "{issue}", fields: "*all" } },
        create: { tool: "jira_create_issue", arguments: { project_key: "{facts.projectKey}", summary: "{title}", description: "{body}", issue_type: "{facts.issueType}", additional_fields: { labels: "{labels}", parent: "{parent}" } }, result: "key" },
        block: { tool: "jira_create_issue_link", arguments: { link_type: "{facts.linkType}", inward_issue_key: "{blocker}", outward_issue_key: "{dependent}" } },
        activate: { tool: "jira_update_issue", replace: true, arguments: { issue_key: "{issue}", fields: {}, additional_fields: { customfield_10010: "{readinessValues}" } } },
      },
      issue: {
        id: "key", title: "summary", body: "description", labels: { path: "labels", empty: true }, readiness: { path: "customfield_10010.value", empty: true }, author: "reporter.name", createdAt: "created", parent: "parent.key", project: "project.key", issueType: "issue_type.name",
        blockedBy: { path: "issuelinks", empty: true, type: "type.name", sides: { inwardIssue: "inward_issue.key", outwardIssue: "outward_issue.key" } },
      },
    },
  };
  const connection: Connection = {
    async listTools() { return tools; },
    async callTool(_server, name, args) {
      if (name === "jira_search") {
        const all = [...issues.values()], offset = Number(args.start_at ?? 0), limit = Number(args.limit ?? 10);
        return { issues: structuredClone(all.slice(offset, offset + limit)), total: all.length, start_at: offset, max_results: limit };
      }
      if (name === "jira_get_issue") return structuredClone(issues.get(String(args.issue_key)));
      writes.push(name);
      if (name === "jira_create_issue") {
        const extra = JSON.parse(String(args.additional_fields));
        const key = `DEMO-${issues.size + 1}`;
        issues.set(key, { ...structuredClone(sample.readback), key, summary: args.summary, description: args.description, labels: extra.labels, created: new Date().toISOString(), project: { key: args.project_key }, issue_type: { name: args.issue_type }, ...(extra.parent ? { parent: { key: extra.parent } } : {}) });
        return { key };
      }
      if (name === "jira_create_issue_link") {
        const inward = issues.get(String(args.inward_issue_key));
        const outward = issues.get(String(args.outward_issue_key));
        (inward.issuelinks ??= []).push({ type: { name: args.link_type }, outward_issue: { key: outward.key } });
        (outward.issuelinks ??= []).push({ type: { name: args.link_type }, inward_issue: { key: inward.key } });
        return { success: true };
      }
      if (name === "jira_update_issue") {
        const issue = issues.get(String(args.issue_key));
        Object.assign(issue, JSON.parse(String(args.fields)));
        for (const [field, value] of Object.entries(JSON.parse(String(args.additional_fields)))) {
          issue[field] = field.startsWith("customfield_") ? { value } : value;
        }
        return structuredClone(issue);
      }
      throw new Error(`Unexpected tool ${name}`);
    },
  };
  return { tracker, tools, issues, writes, connection };
}
