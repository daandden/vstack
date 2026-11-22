import type { JudgmentState, TSchema } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext, ToolCallEvent } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "@oh-my-pi/pi-coding-agent/judgment";
import { toolApprovalScopeToken } from "@oh-my-pi/pi-coding-agent/tools/approval-scope";
import { parseHtmlForm } from "@oh-my-pi/pi-tui/html-form/parse";
import { parseHTML } from "@oh-my-pi/pi-utils/dom";
import catalogFile from "../../addon-questions.json";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog, type AddonCatalog, type AddonQuestion } from "./addon-catalog.ts";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { cleanBrief, preprocessTinyMessage } from "./prompt-cleaner.ts";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export default function vstack(pi: ExtensionAPI): void {
  registerAddonSelection(pi);
  registerCleanCommand(pi);
  registerFlowContext(pi);
  registerFlowQuestions(pi);
}

const flowScript = fileURLToPath(new URL("../skills/flow-page/scripts/flow-page.ts", import.meta.url));
const flowIdentity = (ctx: ExtensionContext) => [
  "--session", ctx.sessionManager.getSessionId(),
  "--agent", ctx.agent.kind === "main" ? "main" : ctx.agent.id,
];

async function flowPage<T>(pi: ExtensionAPI, ctx: ExtensionContext, args: string[], identity = flowIdentity(ctx), positionals: readonly string[] = []): Promise<T> {
  const result = await pi.exec("bun", [flowScript, ...args, ...identity, "--", ...positionals], { cwd: ctx.cwd });
  if (result.code !== 0) throw new Error(result.stderr.trim() || `Flow command exited ${result.code}`);
  return JSON.parse(result.stdout);
}

function registerFlowContext(pi: ExtensionAPI): void {
  type Bound = { binding: { flow: string; stage: string } | null };
  pi.on("context", event => ({
    messages: event.messages.filter(message => message.role !== "custom" || message.customType !== "vstack-flow"),
  }));
  pi.on("before_agent_start", async (_event, ctx) => {
    const args = flowIdentity(ctx).map(value => JSON.stringify(value)).join(" ");
    let target = "";
    try {
      const current = await flowPage<Bound>(pi, ctx, ["bound"]);
      if (current.binding) target = ` Your bound Flow is ${current.binding.flow}, Stage ${current.binding.stage}.`;
    } catch (error) {
      target = ` Flow binding lookup failed: ${error instanceof Error ? error.message : String(error)}.`;
    }
    return { message: {
      customType: "vstack-flow-context", display: false, attribution: "agent" as const,
      content: `For flow-page authoring commands, pass ${args}. Bash supplies PI_SESSION_ID but no agent id. Never use another agent's binding.${target}`,
    } };
  });
}

function askControlNames(html: unknown): { names: string[]; duplicates: Set<string>; hidden: Set<string> } {
  const names = new Set<string>();
  const duplicates = new Set<string>();
  const hidden = new Set<string>();
  if (typeof html !== "string") return { names: [], duplicates, hidden };
  const { fields } = parseHtmlForm(html);
  for (const { name } of fields) {
    if (names.has(name)) duplicates.add(name);
    else names.add(name);
  }
  // Inspect the picker's form root with its DOM parser because parseHtmlForm drops nameless hidden inputs.
  const { document } = parseHTML(html);
  const form = document.querySelector("form") ?? document;
  for (const input of form.querySelectorAll("input")) {
    if (input.getAttribute("type")?.toLowerCase() === "hidden") hidden.add(input.getAttribute("name") ?? "");
  }
  return { names: [...names], duplicates, hidden };
}

function registerFlowQuestions(pi: ExtensionAPI): void {
  type Bound = { binding: { flow: string; stage: string } | null; live?: { state: string; url?: string; error?: string } };
  const interactive = (ctx: ExtensionContext) => ctx.mode === "tui" && ctx.hasUI && ctx.agent.kind === "main";
  const panelKey = "vstack-flow-panel";
  const pickers = new Set<symbol>();
  const presence = new Map<symbol, () => void>();
  let presenceWrites: Promise<unknown> = Promise.resolve();
  const writePresence = (write: () => Promise<unknown>) => {
    presenceWrites = presenceWrites.then(write).catch(() => {});
    return presenceWrites;
  };
  const startPresence = (ctx: ExtensionContext, picker: symbol, ids: readonly string[]) => {
    const identity = flowIdentity(ctx);
    const token = randomUUID();
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending: Promise<unknown>;
    const write = () => {
      pending = writePresence(async () => {
        if (!closed) await flowPage(pi, ctx, ["picker", "open", "--picker", token], identity, ids);
      });
      void pending.then(() => {
        if (!closed) { timer = setTimeout(write, 10_000); timer.unref(); }
      });
    };
    presence.set(picker, () => {
      closed = true;
      clearTimeout(timer);
      void writePresence(() => flowPage(pi, ctx, ["picker", "clear", "--picker", token], identity));
    });
    write();
  };
  let shownIn: ExtensionContext | undefined;
  const showPanel = async (ctx: ExtensionContext, picker: symbol, ids: readonly string[] = [], readError?: string) => {
    pickers.add(picker);
    startPresence(ctx, picker, ids);
    let text: string;
    if (readError !== undefined) {
      text = `Flow question lookup failed: ${readError}`;
    } else {
      try {
        const current = await flowPage<Bound>(pi, ctx, ["bound"]);
        if (!current.binding) return;
        if (current.live?.state === "serving" && current.live.url) {
          let target = current.binding.stage;
          if (ids.length) {
            const response = await fetch(new URL("content", current.live.url));
            if (!response.ok) throw new Error(`Flow content lookup failed: HTTP ${response.status}`);
            const content = await response.json() as { questions: { id: string }[] };
            target = ids.find(id => content.questions.some(saved => saved.id === id)) ?? target;
          }
          text = `<${current.live.url}#${target}>`;
        } else {
          text = `Unavailable: ${current.live?.error ?? `Local Flow host is ${current.live?.state ?? "unavailable"}`}`;
        }
      } catch (error) {
        text = `Flow binding lookup failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    const { Markdown } = await import("@oh-my-pi/pi-tui");
    const { OverlayPanel } = await import("@oh-my-pi/pi-tui/chrome");
    const { getMarkdownTheme } = await import("@oh-my-pi/pi-tui/theme");
    if (!pickers.has(picker)) return;
    shownIn = ctx;
    ctx.ui.setWidget(panelKey, () => {
      const panel = new OverlayPanel("Flow page", "vstack.flow-panel");
      panel.addChild(new Markdown(text, 0, 0, getMarkdownTheme()));
      return panel;
    }, { placement: "aboveEditor" });
  };
  const hidePanel = (picker?: symbol) => {
    const tokens = picker === undefined ? [...pickers] : [picker];
    for (const token of tokens) {
      presence.get(token)?.();
      presence.delete(token);
      pickers.delete(token);
    }
    if (pickers.size) return;
    shownIn?.ui.setWidget(panelKey, undefined);
    shownIn = undefined;
  };
  type ReadyAsk = { state: "ready"; names: string[]; scope?: object; readError?: string };
  type OpenAsk = { state: "open"; picker: symbol };
  type AskCall = { state: "checking" } | { state: "denied" } | ReadyAsk | OpenAsk;
  const calls = new Map<string, AskCall>();
  const closeAsk = (id: string) => {
    const call = calls.get(id);
    calls.delete(id);
    if (call?.state === "open") hidePanel(call.picker);
  };
  const openAsk = (id: string, ctx: ExtensionContext, names: string[], readError?: string) => {
    const call: OpenAsk = { state: "open", picker: Symbol(id) };
    calls.set(id, call);
    void showPanel(ctx, call.picker, names, readError);
    return call;
  };
  pi.on("tool_call", async (event: ToolCallEvent, ctx: ExtensionContext) => {
    if (event.toolName !== "ask" || !interactive(ctx)) return;
    const { toolCallId } = event;
    closeAsk(toolCallId);
    const checking: AskCall = { state: "checking" };
    calls.set(toolCallId, checking);
    const scope = toolApprovalScopeToken();
    const { names, duplicates, hidden } = askControlNames(event.input.html);
    const ready: ReadyAsk = { state: "ready", names, scope };
    let current: { binding: null } | { binding: { stage: string }; refusals: string[] };
    try {
      current = await flowPage(pi, ctx, ["ask-status"], flowIdentity(ctx), names);
    } catch (error) {
      ready.readError = error instanceof Error ? error.message : String(error);
      if (calls.get(toolCallId) === checking) calls.set(toolCallId, ready);
      return;
    }
    if (!current.binding) {
      if (calls.get(toolCallId) === checking) calls.delete(toolCallId);
      return;
    }
    const reasons = current.refusals;
    for (const name of duplicates) reasons.push(`${JSON.stringify(name)}: more than one field uses this name`);
    for (const name of hidden) reasons.push(`${name ? JSON.stringify(name) : "unnamed input"}: hidden controls are not permitted`);
    if (!names.length && !hidden.size) reasons.push("the form has no controls");
    if (calls.get(toolCallId) === checking) {
      if (!reasons.length) calls.set(toolCallId, ready);
      // The loop emits a synthetic start for a denial. The wrapper rejects without one.
      else if (!scope) calls.set(toolCallId, { state: "denied" });
      else calls.delete(toolCallId);
    }
    if (!reasons.length) return;
    return {
      block: true,
      reason: `Flow ask refused for ${current.binding.stage}: ${reasons.join("; ")}. Publish the round and pass the receipt's ask.html unchanged to ask. For a re-ask, publish with again.`,
    };
  });
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName !== "ask" || !interactive(ctx)) return;
    const call = calls.get(event.toolCallId);
    if (call?.state === "denied") {
      calls.delete(event.toolCallId);
      return;
    }
    if (call?.state === "open") return;
    if (call?.state === "ready") openAsk(event.toolCallId, ctx, call.names, call.readError);
    else openAsk(event.toolCallId, ctx, askControlNames((event.args as { html?: unknown } | undefined)?.html).names);
  });
  const finishAsk = (event: { toolName: string; toolCallId: string }) => {
    if (event.toolName === "ask") closeAsk(event.toolCallId);
  };
  pi.on("tool_execution_end", finishAsk);
  pi.on("tool_result", finishAsk);
  const resetPickers = () => {
    calls.clear();
    hidePanel();
  };
  pi.on("agent_end", resetPickers);
  type Dialog = NonNullable<ExtensionContext["ui"]["askDialog"]>;
  type Custom = ExtensionContext["ui"]["custom"];
  type FormDialog = NonNullable<ExtensionContext["ui"]["formDialog"]>;
  type Route = { ctx: ExtensionContext; depth: number; enabled: boolean; wrappers: Set<Dialog | Custom | FormDialog> };
  const duringScopedAsk = <T>(route: Route, dialog: () => Promise<T>): Promise<T> => {
    const scope = toolApprovalScopeToken();
    if (scope && route.enabled && interactive(route.ctx)) {
      // Eval skips the loop start. The wrapper's scope ties this post-approval dialog to its guard result.
      for (const [id, pending] of calls) {
        if (pending.state !== "ready" || pending.scope !== scope) continue;
        const open = openAsk(id, route.ctx, pending.names, pending.readError);
        return (async () => {
          try {
            return await dialog();
          } finally {
            if (calls.get(id) === open) closeAsk(id);
          }
        })();
      }
    }
    return dialog();
  };
  const routeKey = Symbol("vstack.flow-questions");
  let active: Route | undefined;
  const install = (_event: unknown, ctx: ExtensionContext) => {
    const own = (key: PropertyKey) => Object.getOwnPropertyDescriptor(ctx.ui, key)?.value;
    let route = own(routeKey) as Route | undefined;
    if (!route) {
      route = { ctx, depth: 0, enabled: true, wrappers: new Set() };
      Object.defineProperty(ctx.ui, routeKey, { value: route, configurable: true });
    }
    route.ctx = ctx;
    route.enabled = true;
    active = route;
    const state = route;
    const custom = own("custom") as Custom | undefined;
    if (typeof custom === "function" && !state.wrappers.has(custom)) {
      const wrapped: Custom = <T>(...args: Parameters<Custom>) =>
        duringScopedAsk(state, () => custom.apply(ctx.ui, args) as Promise<T>);
      state.wrappers.add(wrapped);
      ctx.ui.custom = wrapped;
    }
    const form = own("formDialog") as FormDialog | undefined;
    if (typeof form === "function" && !state.wrappers.has(form)) {
      const wrapped: FormDialog = (...args: Parameters<FormDialog>) =>
        duringScopedAsk(state, () => form.apply(ctx.ui, args));
      state.wrappers.add(wrapped);
      ctx.ui.formDialog = wrapped;
    }
    const original = own("askDialog") as Dialog | undefined;
    if (typeof original !== "function" || route.wrappers.has(original)) return;
    const wrapped: Dialog = async (questions, options) => {
      if (!state.enabled || state.depth || !interactive(state.ctx)) return original.call(ctx.ui, questions, options);
      const owned: symbol[] = [];
      for (const call of calls.values()) if (call.state === "open") owned.push(call.picker);
      const picker = owned.length ? undefined : Symbol("askDialog");
      if (picker) owned.push(picker);
      state.depth++;
      if (picker) void showPanel(state.ctx, picker);
      try {
        return await original.call(ctx.ui, questions, options);
      } finally {
        state.depth--;
        for (const token of owned) hidePanel(token);
      }
    };
    state.wrappers.add(wrapped);
    ctx.ui.askDialog = wrapped;
  };
  const stop = () => {
    resetPickers();
    if (active) active.enabled = false;
  };
  pi.on("session_start", install);
  pi.on("before_agent_start", install);
  pi.on("session_switch", (event, ctx) => { stop(); install(event, ctx); });
  pi.on("session_shutdown", stop);
}

function readAddonCatalog(): AddonCatalog | undefined {
  try { return parseAddonCatalog(catalogFile); } catch { return undefined; }
}

function readMattSkills(addons: Iterable<string>): Set<string> {
  try {
    const register = Bun.YAML.parse(fs.readFileSync(new URL("../../decision-register.yaml", import.meta.url), "utf8")) as { items: MattSkillRow[] };
    const pins = Bun.YAML.parse(fs.readFileSync(new URL("../../pins.yaml", import.meta.url), "utf8")) as { upstreams: Record<string, { role: string }> };
    return mattSkillNames(register.items, upstream => pins.upstreams[upstream]?.role, addons);
  } catch { return new Set(); }
}

const JUDGE_DEADLINE_MS = 4000;
const INTENT_LIMIT = 10_000;
const PRECEDENCE = " When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.";
const JUDGED_AGENTS = new Set(["vstack-explorer", "vstack-worker", "vstack-verifier"]);

function isVisibleSkillStart(entry: any): boolean {
  return entry.type === "custom_message" && entry.customType === "skill-prompt" && entry.display !== false;
}

function startsMidSession(branch: readonly any[]): boolean {
  return branch.some(entry => entry.type === "compaction" || isVisibleSkillStart(entry) ||
    (entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant")));
}

async function pickAddons(ctx: ExtensionContext, state: JudgmentState, questions: Record<string, AddonQuestion>, signal: AbortSignal): Promise<string[]> {
  try {
    const judge = resolveJudge({
      settings, registry: ctx.modelRegistry, sessionId: ctx.sessionManager.getSessionId(), purpose: "vstack-addons",
      onUsage: journalJudgmentUsage(ctx.sessionManager), cache: sharedJudgmentCache(),
    });
    const result = await judge.withCandidate((candidate, kind) =>
      kind === "native" ? candidate.judge({ state, questions }, { signal }) : Promise.resolve(undefined), { signal });
    if (!result || signal.aborted) return [];
    return Object.keys(questions).filter(name => {
      const answer = result.answers?.[name];
      return answer?.type === "noul" && typeof answer.noul === "number" && answer.noul >= .7;
    });
  } catch {
    return [];
  }
}

function picksMessage(picked: string[], precedence = "") {
  if (!picked.length) return;
  return { message: { customType: "vstack-addons", display: false, attribution: "agent" as const,
    content: `Addons selected for this task: ${picked.map(name => `skill://${name}`).join(", ")}. Ignore any that do not fit.${precedence}` } };
}

function undeliveredQuestions(catalog: AddonCatalog, entries: readonly any[]): Record<string, AddonQuestion> {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.customType !== "vstack-addons" || (entry.type !== "custom_message" && entry.type !== "custom")) continue;
    const saved = entry.type === "custom" ? entry.data : entry.content;
    const content = typeof saved === "string" ? saved : JSON.stringify(saved ?? "");
    for (const match of content.matchAll(/skill:\/\/([a-z0-9-]+)/g)) seen.add(match[1]!);
  }
  return Object.fromEntries(Object.entries(catalog.questions).filter(([name]) => !seen.has(name)));
}

async function unlessAborted<T>(signal: AbortSignal | undefined, run: () => Promise<T>): Promise<T | undefined> {
  if (signal?.aborted) return;
  if (!signal) return run();
  let abort!: () => void;
  const cancelled = new Promise<undefined>(resolve => {
    abort = () => resolve(undefined);
    signal.addEventListener("abort", abort, { once: true });
  });
  try { return await Promise.race([run(), cancelled]); }
  finally { signal.removeEventListener("abort", abort); }
}

async function withDeadline<T>(ms: number, select: (signal: AbortSignal) => Promise<T | undefined>, parent?: AbortSignal): Promise<T | undefined> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await unlessAborted(signal, () => select(signal)); }
  catch { return undefined; }
  finally { clearTimeout(timer); controller.abort(); }
}

function holdsMattRun(branch: readonly any[], mattSkills: ReadonlySet<string>): boolean {
  return branch.some(entry => entry.type === "custom_message" && entry.customType === "skill-prompt" &&
    typeof entry.details === "object" && entry.details !== null && "name" in entry.details &&
    typeof entry.details.name === "string" && mattSkills.has(entry.details.name));
}

type SessionRecord = { manager: object; ended: boolean } & ({ branch: () => readonly any[] } | { parent: SessionRecord | undefined });

const sessions = new Map<string, SessionRecord>();

function topBranch(record: SessionRecord | undefined): readonly any[] | undefined {
  while (record && "parent" in record) record = record.parent;
  return record && !record.ended ? record.branch() : undefined;
}

function register(ctx: ExtensionContext): SessionRecord {
  const manager = ctx.sessionManager;
  const known = sessions.get(ctx.agent.id);
  if (known) {
    if (known.manager === manager) return known;
    known.ended = true;
  }
  const parentId = ctx.agent.parentId;
  const record: SessionRecord = ctx.agent.kind === "main" ? { manager, ended: false, branch: () => manager.getBranch() }
    : { manager, ended: false, parent: parentId === undefined ? undefined : sessions.get(parentId) };
  sessions.set(ctx.agent.id, record);
  return record;
}

function unregister(ctx: ExtensionContext): void {
  const record = sessions.get(ctx.agent.id);
  if (!record || record.manager !== ctx.sessionManager) return;
  record.ended = true;
  sessions.delete(ctx.agent.id);
}

function registerAddonSelection(pi: ExtensionAPI): void {
  const catalog = readAddonCatalog();
  const mattSkills = catalog ? readMattSkills(Object.keys(catalog.questions)) : new Set<string>();
  let selectionQueue: Promise<unknown> = Promise.resolve();
  for (const name of ["inject_principles", "inject_addons"] as const) pi.registerTool({
    name,
    label: name === "inject_principles" ? "Inject principles" : "Inject Addons",
    description: `Select ${name === "inject_principles" ? "principle Addons" : "Addons, including principles"} from intent you have gathered from the task's real context.`,
    defaultInactive: true,
    loadMode: "essential",
    parameters: { type: "object", properties: { intent: { type: "string" } }, required: ["intent"] } as TSchema,
    async execute(_id, { intent }: { intent: string }, signal, _onUpdate, ctx) {
      const selection = selectionQueue.then(async () => {
        if (signal?.aborted) return;
        const request = preprocessTinyMessage(intent, INTENT_LIMIT);
        const selected = request && catalog && ctx.agent.kind === "main" && holdsMattRun(ctx.sessionManager.getBranch(), mattSkills)
          ? await withDeadline(JUDGE_DEADLINE_MS, async judgeSignal => {
            if (!hasNativeJudge(settings, ctx.modelRegistry)) return;
            const questions = undeliveredQuestions(catalog, ctx.sessionManager.getEntries());
            const scoped = name === "inject_principles"
              ? Object.fromEntries(Object.entries(questions).filter(([key]) => key.startsWith("principle-"))) : questions;
            if (!Object.keys(scoped).length) return;
            return picksMessage(await pickAddons(ctx, addonJudgeState(catalog, request), scoped, judgeSignal), PRECEDENCE);
          }, signal) : undefined;
        if (signal?.aborted) return;
        const text = selected?.message.content ?? "No Addons selected.";
        if (selected) pi.appendEntry("vstack-addons", text);
        return { content: [{ type: "text" as const, text }], details: {} };
      });
      selectionQueue = selection.catch(() => {});
      return await unlessAborted(signal, () => selection) ?? {
        content: [{ type: "text" as const, text: "No Addons selected." }], details: {},
      };
    },
  });
  const activateTools = async (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.agent.kind !== "main") return;
    const active = pi.getActiveTools();
    for (const name of ["inject_principles", "inject_addons"]) {
      if (!active.includes(name)) active.push(name);
    }
    await pi.setActiveTools(active);
  };
  pi.on("session_start", activateTools);
  pi.on("session_switch", activateTools);
  pi.on("before_agent_start", async (event, ctx) => {
    const session = register(ctx);
    const manager = ctx.sessionManager;
    if (!catalog || !mattSkills.size) return;
    if (ctx.agent.kind !== "main") {
      if (!JUDGED_AGENTS.has(ctx.agent.name)) return;
      if (startsMidSession(manager.getBranch())) return;
      const top = topBranch(session);
      if (!top || !holdsMattRun(top, mattSkills)) return;
      const request = cleanBrief(event.prompt);
      if (!request) return;
      return withDeadline(JUDGE_DEADLINE_MS, async signal => {
        if (!hasNativeJudge(settings, ctx.modelRegistry)) return;
        return picksMessage(await pickAddons(ctx, briefJudgeState(catalog, request), briefQuestions(catalog), signal));
      });
    }
    const header = /^\[IMPORTANT: User invoked the "([^"]+)" skill/.exec(event.prompt);
    const startsRun = header && mattSkills.has(header[1]!);
    if (!startsRun) return;
    const build = header[1] === "implement" || header[1] === "implement-spec";
    return { message: {
      customType: "vstack-addon-instruction", display: true, attribution: "agent" as const,
      content: build
        ? "Gather intent from the issue, spec, ticket, and conversation, then call inject_principles with it. Call again if the work changes."
        : "Gather intent from the issue, ticket, map Notes, and conversation, then call inject_addons with it. Call again if the work changes.",
    } };
  });
  pi.on("session_shutdown", (_event, ctx) => unregister(ctx));
  pi.on("session_switch", (_event, ctx) => unregister(ctx));
}

interface TernPlugins {
  plugins: { id: string; status: string; window: boolean; blocks: { id: string }[] }[];
}

const AGE = /^\d+[hdw]?$/;

/**
 * Opens the vstack-clean Tern plugin's popup over the calling pane, or says why it cannot. The plugin claims the
 * trigger path `<home>/.vstack/clean-popup/<pane>/<age>`; the path never exists. `tern open` reports a handled open as
 * exit 1 with "cannot open in a file block" and an unclaimed one as exit 0, so readiness comes from the plugin list
 * first and only that exact exit 1 counts as opened.
 */
async function openCleanPopup(pi: ExtensionAPI, age: string): Promise<string | undefined> {
  if (!AGE.test(age)) return `age must look like 15d, 15, 36h, or 2w, got "${age}"`;
  const pane = process.env.TERN_PANE;
  if (!pane || !/^\d+$/.test(pane)) return "it needs Tern with the vstack-clean plugin; run it in a Tern pane";
  // A Tern update can remove the binary an older daemon put in TERN_EXE; the PATH `tern` still reaches the daemon.
  const exe = process.env.TERN_EXE;
  const tern = exe && fs.existsSync(exe) ? exe : "tern";
  const list = await pi.exec(tern, ["plugin", "list", "--json"]);
  if (list.code !== 0) return `tern plugin list failed: ${list.stderr.trim() || `exit ${list.code}`}`;
  const ready = (JSON.parse(list.stdout) as TernPlugins).plugins.some(plugin =>
    plugin.id === "vstack-clean" && plugin.status === "ready" && plugin.window && plugin.blocks.some(block => block.id === "popup"));
  if (!ready) return "the vstack-clean Tern plugin is not ready in this Tern; run /skill:setup-vstack to link it";
  const trigger = `${process.env.HOME || homedir()}/.vstack/clean-popup/${pane}/${age}`;
  const open = await pi.exec(tern, ["open", trigger]);
  if (open.code === 1 && open.stderr.trim() === `tern open: ${trigger} cannot open in a file block`) return undefined;
  const why = open.code === 0 ? "no Tern plugin claimed the open" : open.stderr.trim() || `tern open exited ${open.code}`;
  return `could not open the Scratch cleanup popup: ${why}`;
}

function registerCleanCommand(pi: ExtensionAPI): void {
  pi.registerCommand("vstack-clean", {
    description: "Open the Scratch cleanup popup in Tern: /vstack-clean [age] (default 15d).",
    async handler(age, ctx) {
      if (!ctx.hasUI) {
        pi.sendMessage({
          customType: "vstack-clean",
          content: "/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.",
          display: true,
        }, { triggerTurn: false });
        return;
      }
      let refusal: string | undefined;
      try {
        refusal = await openCleanPopup(pi, age.trim() || "15d");
      } catch (error) {
        refusal = error instanceof Error ? error.message : String(error);
      }
      if (refusal) ctx.ui.notify(`/vstack-clean: ${refusal}. Nothing deleted.`, "error");
    },
  });
}
