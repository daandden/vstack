// vstack's omp extension. It uses the extension API and omp's exported packages, not omp internals.
// omp loads this file with its TS loader, so there is no build step.
import { completeSimple } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { getModelMatchPreferences, resolveModelRoleValue } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { hasNativeJudge } from "@oh-my-pi/pi-coding-agent/judgment";
import catalogFile from "../../addon-questions.json";
import { addonJudgeState, briefJudgeState, briefQuestions, parseAddonCatalog, type AddonCatalog, type AddonQuestion } from "./addon-catalog.ts";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { cleanBrief, preprocessTinyMessage } from "./prompt-cleaner.ts";
import * as fs from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

export default function vstack(pi: ExtensionAPI): void {
  registerRenameSession(pi);
  registerAddonSelection(pi);
  registerCleanCommand(pi);
}

/** vstack_rename_session(name): a user-sourced session name, so omp's auto title never replaces it. */
function registerRenameSession(pi: ExtensionAPI): void {
  const type = pi.arktype;
  pi.registerTool({
    name: "vstack_rename_session",
    label: "Rename session",
    description:
      "Set this session's name, as shown in the session list. omp's automatic title never replaces a name set here.",
    // Skill text calls this tool by name, so it stays a top-level tool, not an xd:// device.
    loadMode: "essential",
    approval: "read",
    parameters: type({ name: type("string").describe("New session name, e.g. the ticket this session works.") }),
    async execute(_toolCallId, params) {
      const name = String(params.name ?? "").trim();
      if (!name) return { content: [{ type: "text", text: "The session name is empty; nothing changed." }], isError: true };
      await pi.setSessionName(name);
      return { content: [{ type: "text", text: `Session renamed to "${name}".` }] };
    },
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

// One cap covers smol and jev together on a restated run start, under omp's 30-second hook cap (ADR 0026).
const RESTATED_START_CAP_MS = 25_000;
const JEV_DEADLINE_MS = 4000;
const RESTATEMENT_LIMIT = 10_000;
const PRECEDENCE = " When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.";
// The subagents whose first prompt, the brief, gets principle picks during a Matt run (ADR 0025).
const JUDGED_AGENTS = new Set(["vstack-explorer", "vstack-worker", "vstack-verifier"]);
const RESTATE_FRAME = "The input is the conversation so far, then the user's new words that start a task, if any. Reply with plain text only.";
const EFFORTS = new Set(["minimal", "low", "medium", "high", "xhigh", "max"]);

function readRestateInstruction(): string | undefined {
  try {
    const skill = fs.readFileSync(new URL("../skills/in-your-own-words/SKILL.md", import.meta.url), "utf8");
    return skill.replace(/^---\n[\s\S]*?\n---\n/, "").trim() || undefined;
  } catch { return undefined; }
}

/** The user's words after `User:` on a skill-start prompt, never the skill text. */
function skillUserWords(prompt: string): string {
  const skillDirectory = prompt.lastIndexOf("\n[Skill directory: ");
  return skillDirectory < 0 ? "" : /^User:[ \t]*([\s\S]*)$/m.exec(prompt.slice(skillDirectory))?.[1] ?? "";
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter(part => part?.type === "text" && typeof part.text === "string").map(part => part.text).join("\n");
}

function isVisibleSkillStart(entry: any): boolean {
  return entry.type === "custom_message" && entry.customType === "skill-prompt" && entry.display !== false;
}

/** A start is mid-session when the branch already holds user or assistant messages, a visible skill start, or a compaction. */
function startsMidSession(branch: readonly any[]): boolean {
  return branch.some(entry => entry.type === "compaction" || isVisibleSkillStart(entry) ||
    (entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant")));
}

function talkLine(entry: any): string | undefined {
  if (entry.type === "message" && (entry.message?.role === "user" || entry.message?.role === "assistant")) {
    const text = textOf(entry.message.content).trim();
    return text ? `${entry.message.role === "user" ? "User" : "Assistant"}: ${text}` : undefined;
  }
  if (isVisibleSkillStart(entry)) {
    const words = skillUserWords(textOf(entry.content)).trim();
    return words ? `User: ${words}` : undefined;
  }
}

/** User and assistant text since the last compaction, plus its summary. Tool, thinking, and hidden entries stay out. */
function earlierTalk(branch: readonly any[]): string {
  const compaction = branch.findLastIndex(entry => entry.type === "compaction");
  const parts: string[] = [];
  let from = 0;
  if (compaction >= 0) {
    parts.push(`Summary of the earlier conversation: ${branch[compaction].summary}`);
    const kept = branch.findIndex(entry => entry.id === branch[compaction].firstKeptEntryId);
    from = kept >= 0 && kept < compaction ? kept : compaction + 1;
  }
  for (let index = from; index < branch.length; index++) {
    const line = index === compaction ? undefined : talkLine(branch[index]);
    if (line) parts.push(line);
  }
  return parts.join("\n\n");
}

/** Asks the smol role to restate the user's goal. Returns the text, a warning reason, or undefined when the deadline aborted it. */
async function restate(ctx: ExtensionContext, instruction: string | undefined, talk: string, words: string, signal: AbortSignal): Promise<{ text: string } | { warning: string } | undefined> {
  if (!instruction) return { warning: "in-your-own-words is unreadable" };
  try {
    const role = resolveModelRoleValue("@smol", ctx.modelRegistry.getAvailable(), { settings, matchPreferences: getModelMatchPreferences(settings) });
    if (!role.model) return { warning: "no smol model" };
    const apiKey = await ctx.modelRegistry.getApiKey(role.model, undefined, { signal });
    if (signal.aborted) return undefined;
    if (!apiKey) return { warning: "no key for the smol model" };
    // As omp's own role calls do, pass a configured effort and leave auto, inherit, and off to the provider default.
    const reasoning = role.thinkingLevel && EFFORTS.has(role.thinkingLevel) ? role.thinkingLevel : undefined;
    const content = [talk, words.trim() && `New words: ${words.trim()}`].filter(Boolean).join("\n\n");
    const reply = await completeSimple(role.model, {
      systemPrompt: [instruction, RESTATE_FRAME],
      messages: [{ role: "user", content, timestamp: Date.now() }],
    }, { apiKey, signal, reasoning: reasoning as any });
    if (signal.aborted) return undefined;
    if (reply.stopReason === "error" || reply.stopReason === "aborted") return { warning: `smol failed${reply.errorMessage ? `: ${reply.errorMessage}` : ""}` };
    const text = textOf(reply.content).trim();
    return text ? { text } : { warning: "smol returned no text" };
  } catch (error) {
    return signal.aborted ? undefined : { warning: `smol failed: ${error instanceof Error ? error.message : String(error)}` };
  }
}

interface Jev {
  model: { id: string; baseUrl: string };
  key: string;
}

/** Native TypeSafe jev and its key, or undefined when the judge is not native jev or has no credentials. */
async function jevAccess(ctx: ExtensionContext): Promise<Jev | undefined> {
  if (!hasNativeJudge(settings, ctx.modelRegistry)) return;
  const model = ctx.modelRegistry.find("typesafe", "jev-latest");
  if (!model || model.api !== "typesafe") return;
  const key = await ctx.modelRegistry.getApiKey(model);
  return key ? { model, key } : undefined;
}

/** Asks jev every question about one state and retries once inside the same signal. Returns each Addon that scores 0.70 or more. */
async function pickAddons(jev: Jev, state: object, questions: Record<string, AddonQuestion>, signal: AbortSignal): Promise<string[]> {
  const body = JSON.stringify({ model: jev.model.id, state, questions });
  for (let attempt = 0; attempt < 2 && !signal.aborted; attempt++) {
    try {
      const response = await fetch(`${jev.model.baseUrl.replace(/\/+$/, "")}/v1/systemone`, {
        method: "POST", headers: { Authorization: `Bearer ${jev.key}`, "Content-Type": "application/json" }, body, signal,
      });
      if (!response.ok) throw new Error("Judge request failed");
      const result = await response.json();
      if (signal.aborted) return [];
      return Object.keys(questions).filter(name => {
        const answer = result.answers?.[name];
        return answer?.type === "noul" && typeof answer.noul === "number" && answer.noul >= .7;
      });
    } catch { /* Retry once inside the same deadline. */ }
  }
  return [];
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

/**
 * Runs a selection under a deadline that aborts it, and calls `onTimeout` when the deadline ends it.
 * The deadline holds even when fetch ignores the abort.
 */
async function withDeadline<T>(ms: number, select: (signal: AbortSignal) => Promise<T | undefined>, onTimeout?: () => void): Promise<T | undefined> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<undefined>(resolve => {
    timer = setTimeout(() => { controller.abort(); onTimeout?.(); resolve(undefined); }, ms);
  });
  try { return await Promise.race([select(controller.signal), deadline]); }
  catch { return undefined; }
  finally { clearTimeout(timer!); controller.abort(); }
}

/** True when the branch holds the saved `skill-prompt` entry of a Matt skill, so it is in a Matt run. */
function holdsMattRun(branch: readonly any[], mattSkills: ReadonlySet<string>): boolean {
  return branch.some(entry => entry.type === "custom_message" && entry.customType === "skill-prompt" &&
    typeof entry.details === "object" && entry.details !== null && "name" in entry.details &&
    typeof entry.details.name === "string" && mattSkills.has(entry.details.name));
}

/**
 * A session that this module served. A top-level session reads its active branch. A subagent links to the record of
 * the session that started it, so a later session with the same agent id does not take over its descendants.
 * Only a top-level session reads `ended`. An ended top-level session serves no branch.
 */
type SessionRecord = { manager: object; ended: boolean } & ({ branch: () => readonly any[] } | { parent: SessionRecord | undefined });

/**
 * The live sessions, keyed by agent id. omp imports the extension once and rebinds it to every subagent session,
 * so a subagent finds the record of the session that started it here, through its `parentId`.
 */
const sessions = new Map<string, SessionRecord>();

/** The active branch of the top-level session above a record, or undefined when that session ended or is unknown. */
function topBranch(record: SessionRecord | undefined): readonly any[] | undefined {
  while (record && "parent" in record) record = record.parent;
  return record && !record.ended ? record.branch() : undefined;
}

/** Returns the session's record, and makes one on its first prompt. A new session with the same agent id ends the old record. */
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

/** Ends the session's record when omp shuts the session down or replaces it with another session file. */
function unregister(ctx: ExtensionContext): void {
  const record = sessions.get(ctx.agent.id);
  if (!record || record.manager !== ctx.sessionManager) return;
  record.ended = true;
  sessions.delete(ctx.agent.id);
}

function registerAddonSelection(pi: ExtensionAPI): void {
  const catalog = readAddonCatalog();
  const mattSkills = catalog ? readMattSkills(Object.keys(catalog.questions)) : new Set<string>();
  const instruction = readRestateInstruction();
  pi.on("before_agent_start", async (event, ctx) => {
    const session = register(ctx);
    const manager = ctx.sessionManager;
    if (!catalog || !mattSkills.size) return;
    if (ctx.agent.kind !== "main") {
      if (!JUDGED_AGENTS.has(ctx.agent.name)) return;
      // Only the brief is judged. A later prompt, or a revived subagent, finds earlier talk on its own branch.
      if (startsMidSession(manager.getBranch())) return;
      const top = topBranch(session);
      if (!top || !holdsMattRun(top, mattSkills)) return;
      const request = cleanBrief(event.prompt);
      if (!request) return;
      return withDeadline(JEV_DEADLINE_MS, async signal => {
        const jev = await jevAccess(ctx);
        if (!jev || signal.aborted) return;
        return picksMessage(await pickAddons(jev, briefJudgeState(catalog, request), briefQuestions(catalog), signal));
      });
    }
    const header = /^\[IMPORTANT: User invoked the "([^"]+)" skill/.exec(event.prompt);
    const startsRun = header && mattSkills.has(header[1]!);
    const branch = manager.getBranch();
    if (!startsRun && !holdsMattRun(branch, mattSkills)) return;
    const userWords = startsRun ? skillUserWords(event.prompt) : event.prompt;
    // Every Matt run start gets a smol restatement (ADR 0026). A mid-session start adds the earlier talk (ADR 0021).
    const midSession = startsRun && startsMidSession(branch);
    const talk = midSession ? earlierTalk(branch) : "";
    let request = preprocessTinyMessage(userWords);
    // smol reads the raw words, so words that clean to nothing still start a restatement.
    if (startsRun && !userWords.trim() && !talk) return;
    const timedOut = () => { if (ctx.hasUI) ctx.ui.notify("vstack: no Addon picks for this run start (timed out)", "warning"); };
    return withDeadline(startsRun ? RESTATED_START_CAP_MS : JEV_DEADLINE_MS, async signal => {
      const jev = await jevAccess(ctx);
      if (!jev || signal.aborted) return;
      const questions = undeliveredQuestions(catalog, ctx.sessionManager.getEntries());
      if (!Object.keys(questions).length) return;
      if (startsRun) {
        const restated = await restate(ctx, instruction, talk, userWords, signal);
        if (!restated || signal.aborted) return;
        if ("warning" in restated) {
          // A fresh start's cleaned words are its whole goal, so jev reads them when smol fails. A mid-session start's words can miss it.
          const fallback = !midSession && request;
          const warning = fallback ? `Addon picks from your words, restatement failed (${restated.warning})` : `no Addon picks for this run start (${restated.warning})`;
          if (ctx.hasUI) ctx.ui.notify(`vstack: ${warning}`, "warning");
          if (!fallback) return;
        } else request = restated.text.slice(0, RESTATEMENT_LIMIT);
      }
      return picksMessage(await pickAddons(jev, addonJudgeState(catalog, request), questions, signal), PRECEDENCE);
    }, startsRun ? timedOut : undefined);
  });
  pi.on("session_shutdown", (_event, ctx) => unregister(ctx));
  pi.on("session_switch", (_event, ctx) => unregister(ctx));
  registerClosingPicks(pi, catalog, mattSkills);
}

function registerClosingPicks(pi: ExtensionAPI, catalog: AddonCatalog | undefined, mattSkills: ReadonlySet<string>): void {
  const type = pi.arktype;
  const reply = (text: string) => ({ content: [{ type: "text" as const, text }] });
  const noPicks = (reason: string) => reply(`No Addon picks (${reason}).`);
  // Calls run one at a time, so a call reads the session entries only after the call before it recorded its picks.
  let previous: Promise<unknown> = Promise.resolve();
  pi.registerTool({
    name: "vstack_pick_addons",
    label: "Pick Addons",
    description:
      "Ask the jev judge which Addons fit the next skill after the user picks it at a grill's closing ask. Returns skill:// pointers to read before that skill.",
    loadMode: "essential",
    approval: "read",
    parameters: type({ request: type("string").describe("The grill's closing summary, as written on the Grilling page.") }),
    execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const call = previous.then(() => pick(String(params.request ?? ""), ctx));
      previous = call.catch(() => undefined);
      return call;
    },
  });
  async function pick(rawRequest: string, ctx: ExtensionContext) {
    if (ctx.agent.kind !== "main") return noPicks("only the main agent gets closing picks");
    if (!catalog || !mattSkills.size) return noPicks("the Addon catalog or the Matt skill set is unreadable");
    if (!holdsMattRun(ctx.sessionManager.getBranch(), mattSkills)) return noPicks("this branch holds no Matt run");
    const request = rawRequest.trim().slice(0, RESTATEMENT_LIMIT);
    if (!request) return { ...noPicks("the request is empty"), isError: true };
    const questions = undeliveredQuestions(catalog, ctx.sessionManager.getEntries());
    if (!Object.keys(questions).length) return noPicks("every Addon was delivered earlier in this session");
    const picked = await withDeadline(JEV_DEADLINE_MS, async signal => {
      const jev = await jevAccess(ctx).catch(() => undefined);
      return jev ? pickAddons(jev, addonJudgeState(catalog, request), questions, signal) : "no native jev judge or no key for it";
    });
    if (picked === undefined) return noPicks("timed out");
    if (typeof picked === "string") return noPicks(picked);
    const picks = picksMessage(picked, PRECEDENCE);
    if (!picks) return noPicks("jev picked none");
    pi.appendEntry("vstack-addons", picks.message.content);
    return reply(picks.message.content);
  }
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
