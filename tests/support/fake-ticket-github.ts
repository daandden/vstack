import { readFile } from "node:fs/promises";

type Stored = { number: number; id: number; title: string; body: string; labels: { name: string }[]; user: { login: string }; created_at: string; state: string; parent?: number; blockers: number[] };
export function fakeTicketGitHub(record: string) {
  const issues = new Map<number, Stored>();
  issues.set(100, { number: 100, id: 9100, title: "The unchanged parent", body: "Parent body", labels: [{ name: "spec" }], user: { login: "human" }, created_at: "2025-01-01T00:00:00Z", state: "open", blockers: [] });
  let next = 101;
  let fault: { phase: string; kind: "before" | "after" | "duplicate" } | undefined;
  let paused: { phase: string; entered(): void; released: Promise<void> } | undefined;
  const snapshots: Stored[][] = [];
  const snapshot = () => snapshots.push(structuredClone([...issues.values()]));
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch(req) {
    const url = new URL(req.url), path = url.pathname;
    const input = req.method === "GET" ? {} : await req.json() as any;
    const match = path.match(/^\/repos\/fixture\/tickets\/issues(?:\/(\d+))?(.*)$/);
    if (path === "/user") return Response.json({ login: "publisher" });
    if (!match) return Response.json({ message: "Not found" }, { status: 404 });
    const number = match[1] ? Number(match[1]) : undefined, suffix = match[2];
    const issue = number ? issues.get(number) : undefined;
    const phase = !number ? req.method === "POST" ? "create" : "search" : suffix === "/sub_issues" ? "parent" : suffix === "/dependencies/blocked_by" ? req.method === "POST" ? "relationships" : "read-relationships" : suffix === "/labels" ? "activate" : "read";
    const activeFault = fault?.phase === phase ? fault : undefined;
    if (activeFault?.kind === "before") { fault = undefined; return Response.json({ message: "Controlled known refusal" }, { status: 422 }); }
    let result: unknown;
    if (!number && req.method === "GET") result = [...issues.values()];
    else if (!number && req.method === "POST") {
      const saved = JSON.parse(await readFile(record, "utf8"));
      if (!saved.intent || !saved.operations.some((op: any) => op.kind === "create" && op.state === "pending")) return Response.json({ message: "Intent was not durable before creation" }, { status: 422 });
      const created: Stored = { number: next++, id: 9000 + next, title: input.title, body: input.body, labels: input.labels.map((name: string) => ({ name })), user: { login: "publisher" }, created_at: new Date().toISOString(), state: "open", blockers: [] };
      issues.set(created.number, created); result = created;
      if (activeFault?.kind === "duplicate") { const duplicate = structuredClone(created); duplicate.number = next++; duplicate.id += 500; issues.set(duplicate.number, duplicate); }
    } else if (!issue) return Response.json({ message: "Not found" }, { status: 404 });
    else if (!suffix) result = issue;
    else if (suffix === "/parent") {
      if (!issue.parent) return Response.json({ message: "No parent" }, { status: 404 });
      result = issues.get(issue.parent);
    } else if (suffix === "/sub_issues" && req.method === "POST") {
      const child = [...issues.values()].find(i => i.id === input.sub_issue_id)!;
      child.parent = number; result = child;
    } else if (suffix === "/dependencies/blocked_by") {
      if (req.method === "POST") { const blocker = [...issues.values()].find(i => i.id === input.issue_id)!; issue.blockers.push(blocker.number); result = blocker; }
      else result = issue.blockers.map(n => issues.get(n));
    } else if (suffix === "/labels" && req.method === "POST") { issue.labels.push(...input.labels.filter((name: string) => !issue.labels.some(l => l.name === name)).map((name: string) => ({ name }))); result = issue.labels; }
    else return Response.json({ message: "Unsupported" }, { status: 404 });
    snapshot();
    if (paused?.phase === phase) { const pause = paused; paused = undefined; pause.entered(); await pause.released; }
    if (activeFault) { fault = undefined; return Response.json({ message: "Response lost after write", upstream_reference: "422" }, { status: 503 }); }
    return Response.json(result);
  } });
  return {
    server, issues, snapshots,
    fail(phase: string, kind: "before" | "after" | "duplicate") { fault = { phase, kind }; },
    pause(phase: string) {
      let entered!: () => void, release!: () => void;
      const reached = new Promise<void>(r => { entered = r; }), released = new Promise<void>(r => { release = r; });
      paused = { phase, entered, released };
      return { reached, release };
    },
  };
}

export const fakeGhProgram = `
const args = process.argv.slice(2);
if (args.shift() !== "api") process.exit(2);
const endpoint = args.shift();
const method = args.includes("--method") ? args[args.indexOf("--method") + 1] : "GET";
const body = args.includes("--input") ? await new Response(Bun.stdin.stream()).text() : undefined;
const response = await fetch(process.env.FAKE_GITHUB + "/" + endpoint, { method, ...(body ? { body, headers: { "content-type": "application/json" } } : {}) });
const text = await response.text();
if (!response.ok) { console.error("HTTP " + response.status + " " + text); process.exit(1); }
console.log(text);
`;
