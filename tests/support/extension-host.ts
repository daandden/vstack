import vstack from "../../plugin/extensions/vstack.ts";

/** ctx.agent as omp sets it: kind "main" for the top session, "sub" for subagents. */
export interface FakeAgent {
  kind: "main" | "sub";
  id: string;
  name: string;
  depth: number;
  parentId?: string;
}

export interface FakeHostOptions {
  nativeJudge?: boolean;
  /** The active branch, as ctx.sessionManager.getBranch returns it. */
  entries?: unknown[];
  /** Every entry in the session across branches, as getEntries returns it; defaults to the active branch. */
  sessionEntries?: unknown[];
  agent?: FakeAgent;
  sessionId?: string;
  hasUI?: boolean;
  selections?: (string | undefined)[];
  exec?: (command: string, args: string[]) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;
}

type Handler = (event: any, ctx: any) => unknown;

export interface FakeHost {
  pi: any;
  ctx: any;
  handlers: Map<string, Handler[]>;
  commands: Map<string, { description?: string; handler: (args: string, ctx: any) => Promise<void> }>;
  uiCalls: { method: string; args: any[] }[];
  tools: Map<string, any>;
  saved: { type: "custom"; customType: string; data: unknown }[];
  callTool(name: string, args: { intent: string }, signal?: AbortSignal): Promise<any>;
  execCalls: { command: string; args: string[] }[];
  callCommand(name: string, args?: string): Promise<void>;
  /** Messages the extension sent with pi.sendMessage. */
  sent: unknown[];
  /** Fires an event; returns each handler's awaited result. */
  emit(name: string, event?: Record<string, unknown>): Promise<unknown[]>;
}

export function fakeHost(options: FakeHostOptions = {}): FakeHost {
  const handlers = new Map<string, Handler[]>();
  const commands: FakeHost["commands"] = new Map();
  const uiCalls: FakeHost["uiCalls"] = [];
  const execCalls: FakeHost["execCalls"] = [];
  const selections = [...(options.selections ?? [])];
  const sent: unknown[] = [];
  const tools = new Map<string, any>();
  const saved: FakeHost["saved"] = [];
  let activeTools = ["read", "write"];
  const pi = {
    on: (name: string, handler: Handler) => handlers.set(name, [...(handlers.get(name) ?? []), handler]),
    registerCommand: (name: string, command: any) => commands.set(name, command),
    registerTool: (tool: any) => tools.set(tool.name, tool),
    getActiveTools: () => [...activeTools],
    setActiveTools: async (names: string[]) => { activeTools = [...names]; },
    appendEntry: (customType: string, data: unknown) => saved.push({ type: "custom", customType, data }),
    exec: async (command: string, args: string[]) => {
      execCalls.push({ command, args });
      if (!options.exec) throw new Error("No fake exec response");
      return options.exec(command, args);
    },
    sendMessage: (message: unknown) => sent.push(message),
  };
  const ctx = {
    mode: "rpc",
    hasUI: options.hasUI ?? false,
    ui: {
      notify: (...args: any[]) => {
        if (ctx.hasUI) uiCalls.push({ method: "notify", args });
      },
      select: async (...args: any[]) => {
        uiCalls.push({ method: "select", args });
        return selections.shift();
      },
    },
    cwd: "/tmp",
    agent: options.agent ?? { kind: "main", id: "Main", name: "main", depth: 0 },
    modelRegistry: {
      nativeJudge: options.nativeJudge ?? true,
    },
    sessionManager: {
      getSessionId: () => options.sessionId ?? "session-1",
      getBranch: () => options.entries ?? [],
      getEntries: () => [...(options.sessionEntries ?? options.entries ?? []), ...saved],
    },
  };
  vstack(pi as any);
  return {
    pi,
    ctx,
    handlers,
    commands,
    tools,
    saved,
    async callTool(name, args, signal) {
      const tool = tools.get(name);
      if (!tool) throw new Error(`${name} is not registered`);
      return tool.execute("test-call", args, signal, undefined, ctx);
    },
    uiCalls,
    execCalls,
    sent,
    async callCommand(name, args = "") {
      const command = commands.get(name);
      if (!command) throw new Error(`${name} is not registered`);
      await command.handler(args, ctx);
    },
    async emit(name, event = {}) {
      const results: unknown[] = [];
      for (const handler of handlers.get(name) ?? []) results.push(await handler({ type: name, ...event }, ctx));
      return results;
    },
  };
}
