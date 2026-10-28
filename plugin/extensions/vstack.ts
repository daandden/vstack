import type { TSchema } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge, journalJudgmentUsage, resolveJudge, sharedJudgmentCache } from "@oh-my-pi/pi-coding-agent/judgment";
import catalogFile from "../../addon-questions.json";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog, type AddonCatalog, type AddonQuestion } from "./addon-catalog.ts";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { cleanBrief, preprocessTinyMessage } from "./prompt-cleaner.ts";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export default function vstack(pi: ExtensionAPI): void {
  registerAddonSelection(pi);
  registerCleanCommand(pi);
  registerFlowPresentation(pi);
}

function registerFlowPresentation(pi: ExtensionAPI): void {
  const script = fileURLToPath(new URL("../skills/flow-page/scripts/flow-page.ts", import.meta.url));
  type Bound = {
    binding: { flow: string; stage: string } | null;
    page?: string;
    live?: { state: "serving"; url: string } | { state: "unavailable"; error: string } | { state: "off" };
    presentation?: { state: "current" | "stale"; error?: string };
  };
  const identity = (ctx: ExtensionContext) => [
    "--session", ctx.sessionManager.getSessionId(),
    "--agent", ctx.agent.kind === "main" ? "main" : ctx.agent.id,
  ];
  async function bound(ctx: ExtensionContext): Promise<Bound> {
    const result = await pi.exec("bun", [script, "bound", ...identity(ctx)], { cwd: ctx.cwd });
    if (result.code !== 0) throw new Error(result.stderr.trim() || `Flow lookup exited ${result.code}`);
    return JSON.parse(result.stdout);
  }
  pi.on("before_agent_start", async (_event, ctx) => {
    const args = identity(ctx).map(value => JSON.stringify(value)).join(" ");
    let target = "";
    try {
      const current = await bound(ctx);
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
    let content: string;
    try {
      const current = await bound(ctx);
      if (!current.binding) return;
      content = current.live?.state === "serving"
        ? `Flow page: ${current.live.url}`
        : `Flow page (static): ${current.page}\nLive serving ${current.live?.state === "unavailable" ? `failed: ${current.live.error}` : "is disabled"}.`;
      if (current.presentation?.state === "stale") content += `\nStatic projection is stale${current.presentation.error ? `: ${current.presentation.error}` : "."}`;
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
    const choice = header[1] === "implement" || header[1] === "implement-spec"
      ? "If the source has non-principle Addon pointers, call inject_principles. Otherwise call inject_addons."
      : "Call inject_addons.";
    return { message: {
      customType: "vstack-addon-instruction", display: true, attribution: "agent" as const,
      content: `Before starting the work, gather the intent from the real context, such as the issue title and body, map Notes, selected ticket, and prior conversation. Read relevant skill:// pointers from the source. ${choice} Pass the gathered intent as intent. Call again if the work changes kind.`,
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
  pi.registerCommand("vstack-clean", {
    description: "Delete expired Scratch entries: /vstack-clean [age] (default 90d).",
    async handler(age, ctx) {
      if (!ctx.hasUI) {
        pi.sendMessage({
          customType: "vstack-clean",
          content: "/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.",
          display: true,
        }, { triggerTurn: false });
        return;
      }
      const args = [script, "--home", homedir(), "--older-than", age.trim() || "90d"];
      let deleteStarted = false;
      try {
        const preview = await pi.exec("bun", args);
        if (preview.code !== 0) throw new Error(preview.stderr.trim() || `clean.ts exited with code ${preview.code}`);
        const listing = JSON.parse(preview.stdout) as { root: string; older_than: string; entries: ScratchEntry[]; kept: number };
        if (!listing.entries.length) {
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
        if (!picked.length) { ctx.ui.notify("Nothing deleted.", "info"); return; }
        deleteStarted = true;
        const deletion = await pi.exec("bun", [...args, "--delete", ...picked.map(entry => entry.path)]);
        if (deletion.code !== 0) throw new Error(deletion.stderr.trim() || `clean.ts exited with code ${deletion.code}`);
        const result = JSON.parse(deletion.stdout) as { deleted: string[]; skipped: { path: string; reason: string }[] };
        const deleted = new Set(result.deleted);
        const freed = picked.reduce((size, entry) => size + (deleted.has(entry.path) ? entry.size : 0), 0);
        const skipped = result.skipped.map(entry => `${entry.path}: ${entry.reason}`).join("\n");
        ctx.ui.notify(`Deleted ${result.deleted.length} ${result.deleted.length === 1 ? "entry" : "entries"}; freed ${freed} bytes. Skipped ${result.skipped.length} entries.${skipped ? `\n${skipped}` : ""}`, "info");
      } catch (error) {
        const outcome = deleteStarted ? "Some entries may already be deleted." : "Nothing deleted.";
        ctx.ui.notify(`/vstack-clean failed: ${error instanceof Error ? error.message : String(error)}. ${outcome}`, "error");
      }
    },
  });
}
