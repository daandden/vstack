import type { TSchema } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "@oh-my-pi/pi-coding-agent/judgment";
import catalogFile from "../../addon-questions.json";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog, type AddonCatalog, type AddonQuestion } from "./addon-catalog.ts";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { cleanBrief, preprocessTinyMessage } from "./prompt-cleaner.ts";
import * as fs from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

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

async function flowPage<T>(pi: ExtensionAPI, ctx: ExtensionContext, args: string[]): Promise<T> {
  const result = await pi.exec("bun", [flowScript, ...args, ...flowIdentity(ctx)], { cwd: ctx.cwd });
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

function registerFlowQuestions(pi: ExtensionAPI): void {
  type Bound = { binding: object | null; live?: { state: string; url?: string; error?: string } };
  const interactive = (ctx: ExtensionContext) => ctx.mode === "tui" && ctx.hasUI && ctx.agent.kind === "main";
  const panelKey = "vstack-flow-panel";
  const pickers = new Set<symbol>();
  let shownIn: ExtensionContext | undefined;
  const showPanel = async (ctx: ExtensionContext, picker: symbol) => {
    pickers.add(picker);
    let text: string;
    try {
      const current = await flowPage<Bound>(pi, ctx, ["bound"]);
      if (!current.binding) return;
      text = current.live?.state === "serving" && current.live.url
        ? `<${current.live.url}>`
        : `Unavailable: ${current.live?.error ?? `Local Flow host is ${current.live?.state ?? "unavailable"}`}`;
    } catch (error) {
      text = `Flow binding lookup failed: ${error instanceof Error ? error.message : String(error)}`;
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
    if (picker === undefined) pickers.clear();
    else if (!pickers.delete(picker) || pickers.size) return;
    shownIn?.ui.setWidget(panelKey, undefined);
    shownIn = undefined;
  };
  const ordinary = new Map<string, symbol>();
  pi.on("tool_execution_start", (event, ctx) => {
    if (event.toolName !== "ask" || !interactive(ctx)) return;
    const picker = Symbol(event.toolCallId);
    ordinary.set(event.toolCallId, picker);
    void showPanel(ctx, picker);
  });
  pi.on("tool_execution_end", event => {
    const picker = ordinary.get(event.toolCallId);
    ordinary.delete(event.toolCallId);
    if (picker) hidePanel(picker);
  });
  pi.on("agent_end", () => { ordinary.clear(); hidePanel(); });
  type Dialog = NonNullable<ExtensionContext["ui"]["askDialog"]>;
  type Route = { ctx: ExtensionContext; depth: number; enabled: boolean; wrappers: Set<Dialog> };
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
    const original = own("askDialog") as Dialog | undefined;
    if (typeof original !== "function" || route.wrappers.has(original)) return;
    const state = route;
    const wrapped: Dialog = async (questions, options) => {
      if (!state.enabled || state.depth || ordinary.size || !interactive(state.ctx)) return original.call(ctx.ui, questions, options);
      const picker = Symbol("askDialog");
      state.depth++;
      void showPanel(state.ctx, picker);
      try {
        return await original.call(ctx.ui, questions, options);
      } finally {
        state.depth--;
        hidePanel(picker);
      }
    };
    state.wrappers.add(wrapped);
    ctx.ui.askDialog = wrapped;
  };
  const stop = () => {
    ordinary.clear();
    hidePanel();
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

async function pickAddons(ctx: ExtensionContext, state: object, questions: Record<string, AddonQuestion>, signal: AbortSignal): Promise<string[]> {
  try {
    const judge = resolveJudge({
      settings, registry: ctx.modelRegistry, sessionId: ctx.sessionManager.getSessionId(), purpose: "vstack-addons",
      onUsage: journalJudgmentUsage(ctx.sessionManager), cache: sharedJudgmentCache(),
    });
    const result = await judge.withCandidate((candidate, kind) =>
      kind === "native" ? candidate.judge({ state, questions }, { signal }) : undefined, { signal });
    if (!result || signal.aborted) return [];
    return Object.keys(questions).filter(name => {
      const answer: any = result.answers?.[name];
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
        const selected = request && catalog && ctx.agent.kind === "main"
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
    const active = pi.getActiveTools().filter(name => name !== "inject_principles" && name !== "inject_addons");
    if (startsRun || holdsMattRun(manager.getBranch(), mattSkills)) active.push("inject_principles", "inject_addons");
    await pi.setActiveTools(active);
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

interface ScratchEntry {
  path: string;
  repo_key: string;
  kind: string;
  entry: string;
  newest_mtime: string;
  age_days: number;
  size: number;
}

function registerCleanCommand(pi: ExtensionAPI): void {
  const script = fileURLToPath(new URL("../skills/vstack-tmp/scripts/clean.ts", import.meta.url));
  async function publish(ctx: ExtensionContext, outcome: string, diagnostics: { heading: string; blocks: { code: string }[] }[]) {
    const run = (args: string[]) => flowPage<any>(pi, ctx, args);
    const current = await run(["bound"]);
    if (!current.binding) return;
    const caller = await run(["show", "--flow", current.binding.flow]);
    const resumeCaller = caller.stages.some((stage: { id: string; state: string }) => stage.id === current.binding.stage && stage.state === "in-progress");
    const folder = fs.mkdtempSync(`${tmpdir()}/vstack-clean-`);
    try {
      const stage = await run(["open", "--flow", current.binding.flow, "--skill", "vstack-clean", "--parent", current.binding.stage]);
      try {
        const file = `${folder}/contribution.json`;
        fs.writeFileSync(file, JSON.stringify({ version: 1, items: [
          { kind: "result", shape: "document", title: "Scratch cleanup", sections: [
            { heading: "Outcome", blocks: [{ prose: outcome }] }, ...diagnostics,
          ] },
          { kind: "stage", state: "finished" },
        ] }));
        await run(["submit", "--flow", stage.flow, "--stage", stage.stage, file]);
      } finally {
        if (resumeCaller) await run(["bind", "--flow", current.binding.flow, "--stage", current.binding.stage]);
      }
    } finally {
      fs.rmSync(folder, { recursive: true, force: true });
    }
  }
  pi.registerCommand("vstack-clean", {
    description: "Delete expired Scratch entries: /vstack-clean [age] (default 90d).",
    async handler(age, ctx) {
      let outcome = "/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.";
      const diagnostics: { heading: string; blocks: { code: string }[] }[] = [];
      const record = (heading: string, result: { stdout: string; stderr: string; code: number }) => {
        diagnostics.push({ heading, blocks: [
          { code: `Exit code: ${result.code}` },
          ...(result.stdout ? [{ code: result.stdout }] : []),
          ...(result.stderr ? [{ code: result.stderr }] : []),
        ] });
      };
      let deleteStarted = false;
      try {
        if (!ctx.hasUI) {
          pi.sendMessage({
            customType: "vstack-clean",
            content: outcome,
            display: true,
          }, { triggerTurn: false });
          return;
        }
        const olderThan = age.trim() || "90d";
        const args = [script, "--home", homedir(), "--older-than", olderThan];
        ctx.ui.notify(`Scanning Scratch for entries older than ${olderThan}…`, "info");
        const preview = await pi.exec("bun", args);
        record("Dry run diagnostics", preview);
        if (preview.code !== 0) throw new Error(preview.stderr.trim() || `clean.ts exited with code ${preview.code}`);
        const listing = JSON.parse(preview.stdout) as { root: string; older_than: string; entries: ScratchEntry[]; kept: number };
        if (!listing.entries.length) {
          outcome = `No expired Scratch entries. Kept ${listing.kept} entries. Nothing deleted.`;
          ctx.ui.notify(`No expired Scratch entries. Kept ${listing.kept} entries. Nothing deleted.`, "info");
          return;
        }
        const rows = listing.entries.map(entry => `${entry.repo_key} | ${entry.kind} | ${entry.entry} | ${entry.age_days} | ${entry.size}`);
        const total = listing.entries.reduce((size, entry) => size + entry.size, 0);
        ctx.ui.notify(`Scratch dry run (${listing.root}, older than ${listing.older_than})\nRepo key | Kind | Entry | Age (days) | Size (bytes)\n${rows.join("\n")}\nTotal: ${listing.entries.length} entries, ${total} bytes. Kept ${listing.kept} entries.`, "info");
        const action = await ctx.ui.select("Delete expired Scratch entries?", ["Apply all", "Choose items", "Cancel"]);
        let picked: ScratchEntry[] = [];
        if (action === "Apply all") picked = listing.entries;
        else if (action === "Choose items") {
          const labels = listing.entries.map(entry => `${entry.repo_key} / ${entry.kind} / ${entry.entry} — ${entry.age_days} days, ${entry.size} bytes`);
          const checked = new Set<number>();
          while (true) {
            const choice = await ctx.ui.select("Choose Scratch entries to delete", [...labels, "Done", "Cancel"], {
              selectionMarker: "checkbox", checkedIndices: [...checked], markableCount: labels.length,
            });
            if (choice === "Done") { picked = listing.entries.filter((_entry, index) => checked.has(index)); break; }
            if (!choice || choice === "Cancel") break;
            const index = labels.indexOf(choice);
            if (index < 0) break;
            if (checked.has(index)) checked.delete(index); else checked.add(index);
          }
        }
        if (!picked.length) { outcome = "Deletion was not confirmed for any entry. Nothing deleted."; ctx.ui.notify("Nothing deleted.", "info"); return; }
        deleteStarted = true;
        const deletion = await pi.exec("bun", [...args, "--delete", ...picked.map(entry => entry.path)]);
        record("Deletion diagnostics", deletion);
        if (deletion.code !== 0) throw new Error(deletion.stderr.trim() || `clean.ts exited with code ${deletion.code}`);
        const result = JSON.parse(deletion.stdout) as { deleted: string[]; skipped: { path: string; reason: string }[] };
        const deleted = new Set(result.deleted);
        const freed = picked.reduce((size, entry) => size + (deleted.has(entry.path) ? entry.size : 0), 0);
        const skipped = result.skipped.map(entry => `${entry.path}: ${entry.reason}`).join("\n");
        outcome = `Deleted ${result.deleted.length} ${result.deleted.length === 1 ? "entry" : "entries"}; freed ${freed} bytes. Skipped ${result.skipped.length} entries.${skipped ? `\n${skipped}` : ""}`;
        ctx.ui.notify(outcome, "info");
      } catch (error) {
        const effect = deleteStarted ? "Some entries may already be deleted." : "Nothing deleted.";
        outcome = `/vstack-clean failed: ${error instanceof Error ? error.message : String(error)}. ${effect}`;
        ctx.ui.notify(outcome, "error");
      } finally {
        try { await publish(ctx, outcome, diagnostics); }
        catch (error) {
          pi.sendMessage({ customType: "vstack-clean", content: `Cleanup outcome could not be attached to the Flow: ${error instanceof Error ? error.message : String(error)}\n${outcome}`, display: true }, { triggerTurn: false });
        }
      }
    },
  });
}
