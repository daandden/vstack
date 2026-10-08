// Fake omp extension host for tests of plugin/extensions/vstack.ts (Seam 2).
// It follows omp-tools' advisor-concern-wake harness: a partial ExtensionAPI that
// captures handlers and tools, a partial ctx, and emit() to fire events.
// Types are structural; the repo has no omp SDK dependency.
import { mock } from "bun:test";
mock.module("@oh-my-pi/pi-coding-agent", () => ({ settings: {} }));
mock.module("@oh-my-pi/pi-coding-agent/judgment", () => ({ hasNativeJudge: (_settings: unknown, registry: any) => registry.nativeJudge }));
const { default: vstack } = await import("../../plugin/extensions/vstack.ts");

/** ctx.agent as omp sets it: kind "main" for the top session, "sub" for subagents. */
export interface FakeAgent {
  kind: "main" | "sub";
  id: string;
  name: string;
  depth: number;
  parentId?: string;
}

export interface FakeModel {
  provider: string;
  id: string;
  api: string;
  baseUrl: string;
}

export interface FakeHostOptions {
  nativeJudge?: boolean;
  entries?: unknown[];
  agent?: FakeAgent;
  /** Models ctx.modelRegistry.find can return, keyed "provider/id". */
  models?: FakeModel[];
  /** API key per "provider/id"; undefined means no credentials. */
  apiKeys?: Record<string, string | undefined>;
  sessionId?: string;
}

export type SessionNameSource = "user" | "auto";

export interface FakeTool {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
  loadMode?: "essential" | "discoverable";
  execute(toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: unknown, ctx?: unknown): Promise<{
    content: { type: string; text?: string }[];
    details?: unknown;
    isError?: boolean;
  }>;
}

type Handler = (event: any, ctx: any) => unknown;

/** Minimal stand-in for pi.arktype: records the definition and description. */
function fakeArktype(def: unknown): { def: unknown; description?: string; describe(text: string): any } {
  return {
    def,
    describe(text: string) {
      return { ...this, description: text };
    },
  };
}

export interface FakeHost {
  pi: any;
  ctx: any;
  tools: Map<string, FakeTool>;
  handlers: Map<string, Handler[]>;
  /** Messages the extension sent with pi.sendMessage. */
  sent: unknown[];
  /** Session name and its source, as omp's session manager stores them. */
  session: { name?: string; source?: SessionNameSource; titles: { name: string; source: SessionNameSource }[] };
  /** Omp's auto title: refused once a user-sourced name is set (session-manager.ts). */
  autoTitle(name: string): boolean;
  /** Fires an event; returns each handler's awaited result. */
  emit(name: string, event?: Record<string, unknown>): Promise<unknown[]>;
  callTool(name: string, params: Record<string, unknown>): ReturnType<FakeTool["execute"]>;
}

export function fakeHost(options: FakeHostOptions = {}): FakeHost {
  const tools = new Map<string, FakeTool>();
  const handlers = new Map<string, Handler[]>();
  const sent: unknown[] = [];
  const session: FakeHost["session"] = { titles: [] };
  const setName = (name: string, source: SessionNameSource): boolean => {
    if (source === "auto" && session.source === "user") return false;
    session.name = name;
    session.source = source;
    session.titles.push({ name, source });
    return true;
  };
  const pi = {
    arktype: fakeArktype,
    on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    registerTool: (tool: FakeTool) => tools.set(tool.name, tool),
    sendMessage: (message: unknown) => sent.push(message),
    // Every omp mode wires this to sessionManager.setSessionName(name, "user").
    setSessionName: async (name: string) => {
      setName(name, "user");
    },
    getSessionName: () => session.name,
  };
  const models = options.models ?? [];
  const ctx = {
    mode: "rpc",
    hasUI: false,
    cwd: "/tmp",
    agent: options.agent ?? { kind: "main", id: "Main", name: "main", depth: 0 },
    modelRegistry: {
      getAll: () => models,
      nativeJudge: options.nativeJudge ?? true,
      find: (provider: string, id: string) => models.find((m) => m.provider === provider && m.id === id),
      getApiKey: async (model: FakeModel) => options.apiKeys?.[`${model.provider}/${model.id}`],
    },
    sessionManager: {
      getSessionId: () => options.sessionId ?? "session-1",
      getSessionName: () => session.name,
      getBranch: () => options.entries ?? [],
    },
  };
  vstack(pi as any);
  return {
    pi,
    ctx,
    tools,
    handlers,
    sent,
    session,
    autoTitle: (name) => setName(name, "auto"),
    async emit(name, event = {}) {
      const results: unknown[] = [];
      for (const handler of handlers.get(name) ?? []) results.push(await handler({ type: name, ...event }, ctx));
      return results;
    },
    callTool(name, params) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`${name} is not registered`);
      return tool.execute("call-1", params, undefined, undefined, ctx);
    },
  };
}
