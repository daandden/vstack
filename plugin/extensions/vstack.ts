import type { ImageContent, TSchema } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionAskDialogResult, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "@oh-my-pi/pi-coding-agent/judgment";
import { askTimeoutMs } from "@oh-my-pi/pi-coding-agent/modes/settings";
import catalogFile from "../../addon-questions.json";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog, type AddonCatalog, type AddonQuestion } from "./addon-catalog.ts";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { cleanBrief, preprocessTinyMessage } from "./prompt-cleaner.ts";
import type { Receipt } from "../skills/flow-page/scripts/model.ts";
import * as fs from "node:fs";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

export default function vstack(pi: ExtensionAPI): void {
  registerAddonSelection(pi);
  registerCleanCommand(pi);
  registerFlowQuestions(pi);
  registerFlowPresentation(pi);
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

type FlowLive = { state: "serving"; url: string } | { state: "unavailable"; error: string } | { state: "off" };

/** The reader URL, or why the Local Flow host cannot present it. A stored Flow file is not a working reader. */
function flowPresentation(live: FlowLive | undefined, stored: string): string {
  if (live?.state === "serving") return `Flow page: ${live.url}`;
  const why = live?.state === "unavailable" ? `is not serving (${live.error})` : "is turned off (VSTACK_FLOW_HOST=off)";
  return `Flow page unavailable: the Flow reader needs the Local Flow host, which ${why}. ${stored}`;
}

type FlowQuestionReceipt = Receipt & {
  flow: string;
  stage: string;
  revision: number;
  repeated?: boolean;
  live?: FlowLive;
};

type FlowQuestionOutcome = {
  status: "submitted" | "cancelled" | "chat" | "unavailable" | "failed" | "repeated";
  receipt?: FlowQuestionReceipt;
  response?: ExtensionAskDialogResult;
  error?: string;
};

function flowQuestionResult(details: FlowQuestionOutcome) {
  const text = JSON.stringify(details, (key, value) =>
    key === "customInputImages" || key === "noteImages" ? value.map((image: ImageContent, i: number) => ({ image: i + 1, mimeType: image.mimeType })) : value);
  const content: ({ type: "text"; text: string } | ImageContent)[] = [{ type: "text", text }];
  if (details.response?.kind === "submit") for (const answer of details.response.results) {
    for (const field of ["customInputImages", "noteImages"] as const) {
      for (const [i, image] of (answer[field] ?? []).entries()) {
        content.push({ type: "text", text: `${answer.id} ${field}, image ${i + 1}:` }, image);
      }
    }
  }
  return { content, details };
}

function hasFlowPicker(ctx: ExtensionContext): boolean {
  const route = Object.getOwnPropertyDescriptor(ctx.ui, Symbol.for("omp-tools.host-ask-dialog"))?.value;
  return ctx.mode === "tui" && ctx.hasUI && typeof ctx.ui.askDialog === "function" && Array.isArray(route?.opens) && route.opens.length > 0;
}

function registerFlowQuestions(pi: ExtensionAPI): void {
  pi.registerTool(Object.assign({
    name: "flow_ask",
    label: "Ask on Flow",
    description: "Publish one complete Flow question round, show its page link, and collect raw answers through the omp-tools picker. Use the current Stage binding; include Results and question visuals in the same contribution.",
    loadMode: "essential" as const,
    approval: "read" as const,
    parameters: {
      type: "object",
      properties: { contribution: { type: "object", properties: { version: { const: 1 }, items: { type: "array", items: { type: "object", additionalProperties: true }, minItems: 1 } }, required: ["version", "items"] } },
      required: ["contribution"],
    } as TSchema,
    async execute(_id: string, { contribution }: { contribution: unknown }, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionContext) {
      if (signal?.aborted) return flowQuestionResult({ status: "cancelled" });
      if (ctx.agent.kind !== "main" || !hasFlowPicker(ctx)) {
        return flowQuestionResult({ status: "unavailable", error: "flow_ask requires the active omp-tools picker in the main agent's interactive TUI. No question was committed or asked." });
      }
      const items = (contribution as { items?: { kind?: string }[] } | null)?.items;
      if (!Array.isArray(items) || items.filter(item => item?.kind === "round").length !== 1) {
        return flowQuestionResult({ status: "failed", error: "flow_ask requires exactly one round in the contribution. No content was committed." });
      }
      const folder = fs.mkdtempSync(`${tmpdir()}/vstack-flow-ask-`);
      let receipt: FlowQuestionReceipt;
      try {
        const file = `${folder}/contribution.json`;
        fs.writeFileSync(file, JSON.stringify(contribution));
        receipt = await flowPage<FlowQuestionReceipt>(pi, ctx, ["submit", file]);
      } catch (error) {
        return flowQuestionResult({ status: "failed", error: error instanceof Error ? error.message : String(error) });
      } finally {
        fs.rmSync(folder, { recursive: true, force: true });
      }
      if (receipt.repeated) return flowQuestionResult({ receipt, status: "repeated" });
      if (receipt.live?.state !== "serving") {
        const error = `Question committed, but its reader is unavailable. Recover the owned Local Flow host, then use bound or show to retrieve the reader URL; do not resubmit the committed contribution.`;
        ctx.ui.notify(flowPresentation(receipt.live, error), "warning");
        return flowQuestionResult({ receipt, status: "unavailable", error: flowPresentation(receipt.live, error) });
      }
      ctx.ui.notify(flowPresentation(receipt.live, ""), "info");
      if (!hasFlowPicker(ctx)) return flowQuestionResult({ receipt, status: "unavailable", error: "Question committed, but the omp-tools picker route is no longer active. No native fallback was opened." });
      if (signal?.aborted) return flowQuestionResult({ receipt, status: "cancelled" });
      try {
        const response: ExtensionAskDialogResult | undefined = await ctx.ui.askDialog!(receipt.ask!.questions, { signal, timeout: askTimeoutMs(settings) });
        return flowQuestionResult({ receipt, status: response?.kind === "submit" ? "submitted" : response?.kind === "chat" ? "chat" : "cancelled", response });
      } catch (error) {
        return flowQuestionResult({ receipt, status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    },
  }, { concurrency: "exclusive" as const }));
}

function registerFlowPresentation(pi: ExtensionAPI): void {
  type Bound = { binding: { flow: string; stage: string } | null; live?: FlowLive };
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
  pi.on("agent_end", async (event, ctx) => {
    if (ctx.agent.kind !== "main" || event.isTerminal === false) return;
    const reply = event.messages.findLast(message => message.role === "assistant");
    if (!reply || reply.stopReason !== "stop" || !reply.content.some(block => block.type === "text" && block.text.trim())) return;
    let content: string;
    try {
      const current = await flowPage<Bound>(pi, ctx, ["bound"]);
      if (!current.binding) return;
      content = flowPresentation(current.live, "The Flow content is stored; the link returns after the host serves again.");
    } catch (error) {
      content = `Flow page unavailable: ${error instanceof Error ? error.message : String(error)}`;
    }
    pi.sendMessage({ customType: "vstack-flow", content, display: true }, { triggerTurn: false });
  });
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
        const receipt = await run(["submit", "--flow", stage.flow, "--stage", stage.stage, file]);
        pi.sendMessage({ customType: "vstack-flow", content: flowPresentation(receipt.live, "The cleanup outcome is committed."), display: true }, { triggerTurn: false });
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
        const args = [script, "--home", homedir(), "--older-than", age.trim() || "90d"];
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
