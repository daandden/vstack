import { KnownFailure, type Connection, type Issue, type Tool, type Tracker } from "./trackers.ts";
import type { Ticket } from "./publisher.ts";
import { actions, argumentsFor, at, bindingFor, gap, placeholders, type Action, type ActionBinding } from "./mcp-binding.ts";

function decoded(value: unknown): unknown {
  if (typeof value !== "string" || !/^\s*[\[{\"]/.test(value)) return value;
  try { return JSON.parse(value); } catch { return value; }
}
function unpack(result: any, tool: Tool): unknown {
  if (result?.isError) throw new Error(`MCP tool returned an error: ${JSON.stringify(result.content)}`);
  if (result?.structuredContent !== undefined) {
    const structured = decoded(result.structuredContent);
    const resultSchema = tool.outputSchema?.properties?.result;
    if (tool.outputSchema?.["x-fastmcp-wrap-result"] === true && typeof resultSchema === "object" && resultSchema.type === "string") return decoded(at(structured, "result"));
    return structured;
  }
  if (Array.isArray(result?.content)) {
    const text = result.content.filter((entry: any) => entry.type === "text").map((entry: any) => entry.text).join("\n");
    return decoded(text);
  }
  return decoded(result);
}
const nonempty = (value: unknown): value is string => typeof value === "string" && !!value.trim();
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(nonempty);
const dynamicRoles = new Set(["issue", "parent", "blocker", "dependent", "title", "body", "labels", "idempotencyKey"]);
const requiredRoles: Record<Action, string[]> = { owner: [], search: ["title"], read: ["issue"], create: ["title", "body", "labels"], parent: ["issue", "parent"], block: ["blocker", "dependent"], activate: ["issue"] };
const availableRoles: Record<Action, string[]> = { owner: [], search: ["title", "body", "labels"], read: ["issue"], create: ["title", "body", "labels", "parent", "idempotencyKey"], parent: ["issue", "parent"], block: ["blocker", "dependent"], activate: ["issue", "readiness", "readinessValues"] };

export async function mcpTracker(config: Record<string, unknown>, connection?: Connection): Promise<Tracker> {
  const server = config.server;
  if (!nonempty(server) || !connection) throw new KnownFailure(`MCP server ${server ?? "(not configured)"}: live discovery connection unavailable`, "capability-gap");
  const binding = bindingFor(server, config.binding);
  const facts = config.facts;
  if (!facts || typeof facts !== "object" || Array.isArray(facts)) gap(server, "configured project facts unavailable");
  const configured = facts as Record<string, unknown>;
  const project = configured.project ?? configured.projectKey ?? configured.projectId;
  const issueType = configured.issueType ?? configured.issueTypeId;
  const linkType = configured.linkType ?? configured.blockingLinkType;
  if (!nonempty(project) || !nonempty(issueType) || !nonempty(linkType)) gap(server, "configured project, ticket issue type, or blocking link type unavailable");
  if (typeof binding.issue.blockedBy !== "string" && !["inwardIssue", "outwardIssue"].includes(String(configured.blockingSide))) gap(server, "configured blocking side unavailable");
  if (!binding.actions.owner && !nonempty(configured.owner)) gap(server, "ownership identity unavailable: bind owner or configure facts.owner");
  if (!nonempty(config.readiness)) gap(server, "configured readiness value unavailable");
  const tools = await connection.listTools(server);
  const labelsPath = typeof binding.issue.labels === "string" ? binding.issue.labels : binding.issue.labels.path;
  const readinessPath = typeof binding.issue.readiness === "string" ? binding.issue.readiness : binding.issue.readiness.path;
  const bound = new Map<Action, { binding: ActionBinding; tool: Tool; roles: Set<string> }>();
  const example = { issue: "TICKET-1", parent: "PARENT-1", blocker: "BLOCKER-1", dependent: "DEPENDENT-1", title: "Approved title", body: "Approved body", labels: ["label"], readiness: config.readiness, readinessValues: [config.readiness], idempotencyKey: "publication-key" };
  for (const action of actions) {
    const actionBinding = binding.actions[action];
    if (!actionBinding) continue;
    const matches = tools.filter(tool => tool.name === actionBinding.tool);
    if (matches.length !== 1) gap(server, `${action} bound tool ${actionBinding.tool} is missing or ambiguous`);
    const tool = matches[0], roles = placeholders(server, actionBinding.arguments);
    for (const role of roles) if (!role.startsWith("facts.") && !availableRoles[action].includes(role)) gap(server, `${action} cannot supply argument placeholder {${role}}`);
    for (const role of requiredRoles[action]) if (!roles.has(role)) gap(server, `${action} arguments cannot carry approved {${role}}`);
    if (action === "create") {
      for (const family of [["facts.project", "facts.projectKey", "facts.projectId"], ["facts.issueType", "facts.issueTypeId"]]) if (!family.some(role => roles.has(role))) gap(server, "create arguments cannot carry configured project or ticket issue type");
    }
    if (action === "block" && !["facts.linkType", "facts.blockingLinkType"].some(role => roles.has(role))) gap(server, "block arguments cannot carry configured blocking link type");
    if (action === "activate" && (actionBinding.replace ? !roles.has("readinessValues") : !roles.has("readiness") && !roles.has("readinessValues"))) gap(server, "activate arguments cannot carry approved readiness values");
    if (!tool.inputSchema || typeof tool.inputSchema !== "object") gap(server, `${action} live parameter schema unavailable`);
    if (actionBinding.pagination) {
      for (const parameter of [actionBinding.pagination.offset, actionBinding.pagination.limit]) {
        const schema = tool.inputSchema.properties?.[parameter];
        if (!schema || typeof schema !== "object" || schema.type !== "integer" && schema.type !== "number") gap(server, `search pagination parameter ${parameter} requires a numeric live schema`);
      }
    }
    argumentsFor(server, action, actionBinding.arguments, tool.inputSchema, example, configured, dynamicRoles);
    bound.set(action, { binding: actionBinding, tool, roles });
  }
  if (!bound.has("parent") && !bound.get("create")!.roles.has("parent")) gap(server, "parent capability requires a parent action or a create {parent} argument");
  const args = (action: Action, values: Record<string, unknown>, deferred = new Set<string>(), offset?: number) => {
    const selected = bound.get(action);
    if (!selected) return gap(server, `${action} action binding unavailable`);
    const pagination = selected.binding.pagination;
    const template = pagination && offset !== undefined ? { ...selected.binding.arguments, [pagination.offset]: offset } : selected.binding.arguments;
    return argumentsFor(server, action, template, selected.tool.inputSchema, values, configured, deferred);
  };
  const callRaw = async (action: Action, values: Record<string, unknown> = {}, offset?: number) => {
    const arguments_ = args(action, values, new Set(), offset);
    const selected = bound.get(action)!;
    return unpack(await connection.callTool(server, selected.tool.name, arguments_), selected.tool);
  };
  const select = (action: Action, raw: unknown) => {
    const selected = bound.get(action)!;
    if (selected.binding.result === undefined || selected.binding.result === "") return raw;
    const result = at(raw, selected.binding.result);
    if (result === undefined) {
      if (action === "create") throw new Error(`MCP server ${server}: create result path ${selected.binding.result} is unavailable; outcome uncertain`);
      return gap(server, `${action} result path ${selected.binding.result} is unavailable`);
    }
    return decoded(result);
  };
  const call = async (action: Action, values: Record<string, unknown> = {}) => select(action, await callRaw(action, values));
  const issue = (raw: unknown, strictProject = false): Issue => {
    const mapped = Object.fromEntries(Object.entries(binding.issue).filter(([name]) => name !== "blockedBy").map(([name, selector]) => {
      const path = typeof selector === "string" ? selector : selector.path;
      const value = at(raw, path);
      return [name, value == null && typeof selector !== "string" && selector.empty ? [] : value];
    }));
    for (const name of ["id", "title", "author", "createdAt", "project", "issueType"]) if (!nonempty(mapped[name])) gap(server, `issue.${name} readback unavailable at ${binding.issue[name as keyof typeof binding.issue]}`);
    if (typeof mapped.body !== "string" || !strings(mapped.labels) || !strings(mapped.readiness)) gap(server, "full issue body, labels, or readiness array readback unavailable");
    if (labelsPath === readinessPath) mapped.labels = mapped.labels.filter(label => label !== config.readiness);
    if (mapped.parent === null) mapped.parent = undefined;
    if (mapped.parent !== undefined && !nonempty(mapped.parent)) gap(server, "issue.parent identity readback is invalid");
    const projection = binding.issue.blockedBy;
    const path = typeof projection === "string" ? projection : projection.path;
    const value = at(raw, path);
    const links = value == null && typeof projection !== "string" && projection.empty ? [] : value;
    if (!Array.isArray(links)) gap(server, `blockedBy array readback unavailable at ${path}`);
    const blockedBy: string[] = [];
    if (typeof projection === "string") {
      if (!strings(links)) gap(server, `blockedBy identity array readback invalid at ${path}`);
      blockedBy.push(...links);
    } else {
      const side = configured.blockingSide as "inwardIssue" | "outwardIssue";
      for (const link of links) {
        const type = at(link, projection.type);
        if (!nonempty(type)) gap(server, `blockedBy link type readback unavailable at ${projection.type}`);
        if (type !== linkType) continue;
        const blocker = at(link, projection.sides[side]);
        if (blocker === undefined || blocker === null) continue;
        if (!nonempty(blocker)) gap(server, `blockedBy identity readback unavailable on ${side}`);
        blockedBy.push(blocker);
      }
    }
    if (strictProject && (mapped.project !== project || mapped.issueType !== issueType)) throw new KnownFailure(`MCP server ${server}: configured project or ticket issue type does not match readback`, "readback");
    return { ...mapped, blockedBy } as Issue;
  };
  const read = async (id: string) => {
    const result = issue(await call("read", { issue: id }), true);
    if (result.id !== id) throw new KnownFailure(`MCP server ${server}: read returned a different issue identity`, "readback");
    return result;
  };
  return {
    idempotentCreate: bound.get("create")!.roles.has("idempotencyKey"),
    async check(tickets: Ticket[] = []) {
      for (const ticket of tickets) {
        const values = { ...example, title: ticket.title, body: ticket.body, labels: ticket.labels, parent: ticket.parent && "external" in ticket.parent ? ticket.parent.external : ticket.parent ? example.parent : undefined };
        const deferred = new Set(["issue", "blocker", "dependent", "idempotencyKey", ...(ticket.parent && "local" in ticket.parent ? ["parent"] : [])]);
        args("search", values, deferred);
        args("create", values, deferred);
      }
    },
    async owner() {
      if (!binding.actions.owner) return configured.owner as string;
      const identity = await call("owner");
      if (!nonempty(identity)) return gap(server, "ownership result is not an identity string");
      return identity;
    },
    async search(ticket, scope) {
      const values = { title: ticket.title, body: ticket.body, labels: ticket.labels };
      const pagination = bound.get("search")!.binding.pagination;
      const candidates: Issue[] = [], seen = new Set<string>();
      let offset = 0, total: number | undefined;
      do {
        const response = await callRaw("search", values, pagination ? offset : undefined);
        const metadata = at(response, pagination?.total ?? "total");
        if (pagination || metadata !== undefined) {
          if (typeof metadata !== "number" || !Number.isSafeInteger(metadata) || metadata < 0) gap(server, "search pagination total is missing or invalid");
          if (total !== undefined && total !== metadata) gap(server, "search pagination total changed between pages");
          total = metadata;
        }
        const raw = select("search", response);
        if (!Array.isArray(raw)) return gap(server, "search result is not an issue array");
        if (!pagination && total !== undefined && total !== raw.length) gap(server, "search results are incomplete without an approved pagination declaration");
        if (pagination && (raw.length > Number(bound.get("search")!.binding.arguments[pagination.limit]) || offset + raw.length > total! || raw.length === 0 && offset < total!)) gap(server, "search pagination returned an empty or non-progressing page");
        for (const entry of raw) {
          const candidate = issue(entry);
          if (pagination && seen.has(candidate.id)) gap(server, "search pagination repeated an issue identity");
          seen.add(candidate.id);
          candidates.push(candidate);
        }
        offset += raw.length;
      } while (pagination && offset < total!);
      return candidates.filter(entry => (entry as Issue & { project: string }).project === project && (scope !== "reconciliation" || (entry as Issue & { issueType: string }).issueType === issueType));
    },
    async create(ticket, idempotencyKey, parent) {
      const id = await call("create", { title: ticket.title, body: ticket.body, labels: ticket.labels, idempotencyKey, parent });
      if (!nonempty(id)) throw new Error(`MCP server ${server}: create returned no identity string; outcome uncertain`);
      return { id };
    },
    read,
    async parent(id, parent) { return call("parent", { issue: id, parent }); },
    async block(id, blocker) { return call("block", { dependent: id, blocker }); },
    async activate(id, readiness) {
      const replace = binding.actions.activate!.replace;
      if (!replace) return call("activate", { issue: id, readiness, readinessValues: [readiness] });
      const before = await read(id);
      const readinessValues = [...new Set([...before.readiness, readiness])];
      await call("activate", { issue: id, readiness, readinessValues });
      const after = await read(id);
      if (readinessValues.some(value => !after.readiness.includes(value))) throw new KnownFailure(`MCP server ${server}: replace-style activation did not preserve readiness field values`, "readback");
      return after;
    },
  };
}
