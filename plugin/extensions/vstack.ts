// vstack's omp extension. It uses the extension API and omp's exported packages, not omp internals.
// omp loads this file with its TS loader, so there is no build step.
import { completeSimple } from "@oh-my-pi/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { getModelMatchPreferences, resolveModelRoleValue } from "@oh-my-pi/pi-coding-agent/config/model-resolver";
import { hasNativeJudge } from "@oh-my-pi/pi-coding-agent/judgment";
import questions from "../../addon-questions.json";
import { mattSkillNames, type MattSkillRow } from "./matt-skills.ts";
import { preprocessTinyMessage } from "./prompt-cleaner.ts";
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

function readMattSkills(): Set<string> {
  try {
    const register = Bun.YAML.parse(fs.readFileSync(new URL("../../decision-register.yaml", import.meta.url), "utf8")) as { items: MattSkillRow[] };
    const pins = Bun.YAML.parse(fs.readFileSync(new URL("../../pins.yaml", import.meta.url), "utf8")) as { upstreams: Record<string, { role: string }> };
    return mattSkillNames(register.items, upstream => pins.upstreams[upstream]?.role, Object.keys(questions));
  } catch { return new Set(); }
}

// omp stops a before_agent_start handler at 30 s and reports the timeout itself (ADR 0021).
const OMP_HANDLER_CAP_MS = 30_000;
const RESTATEMENT_LIMIT = 10_000;
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

function registerAddonSelection(pi: ExtensionAPI): void {
  const mattSkills = readMattSkills();
  const instruction = readRestateInstruction();
  pi.on("before_agent_start", async (event, ctx) => {
    if (ctx.agent.kind !== "main" || !mattSkills.size) return;
    const header = /^\[IMPORTANT: User invoked the "([^"]+)" skill/.exec(event.prompt);
    const startsRun = header && mattSkills.has(header[1]!);
    const branch = ctx.sessionManager.getBranch();
    if (!startsRun && !branch.some(entry => entry.type === "custom_message" && entry.customType === "skill-prompt" &&
      typeof entry.details === "object" && entry.details !== null && "name" in entry.details &&
      typeof entry.details.name === "string" && mattSkills.has(entry.details.name))) return;
    const userWords = startsRun ? skillUserWords(event.prompt) : event.prompt;
    // A Matt run that starts mid-session gets a restatement of the earlier talk (ADR 0021).
    const midSession = startsRun && startsMidSession(branch);
    const talk = midSession ? earlierTalk(branch) : "";
    let request = preprocessTinyMessage(userWords);
    if (startsRun && !request && !talk) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<undefined>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(undefined); }, midSession ? OMP_HANDLER_CAP_MS : 4000);
    });
    try {
      const selection = (async () => {
        if (!hasNativeJudge(settings, ctx.modelRegistry)) return;
        const model = ctx.modelRegistry.find("typesafe", "jev-latest");
        if (!model || model.api !== "typesafe") return;
        const key = await ctx.modelRegistry.getApiKey(model);
        if (!key || controller.signal.aborted) return;
        if (midSession) {
          const restated = await restate(ctx, instruction, talk, userWords, controller.signal);
          if (!restated || controller.signal.aborted) return;
          if ("warning" in restated) {
            if (ctx.hasUI) ctx.ui.notify(`vstack: no Addon picks for this run start (${restated.warning})`, "warning");
            return;
          }
          request = restated.text.slice(0, RESTATEMENT_LIMIT);
        }
        // omp saves a hook message only when it accepts the prompt. The saved messages on every branch
        // of the session are the record of delivered pointers, so each pointer appears once per session.
        const seen = new Set<string>();
        for (const entry of ctx.sessionManager.getEntries()) {
          if (entry.type !== "custom_message" || entry.customType !== "vstack-addons") continue;
          const content = typeof entry.content === "string" ? entry.content : JSON.stringify(entry.content);
          for (const match of content.matchAll(/skill:\/\/([a-z0-9-]+)/g)) seen.add(match[1]!);
        }
        const body = JSON.stringify({ model: model.id, state: { request }, questions });
        for (let attempt = 0; attempt < 2 && !controller.signal.aborted; attempt++) {
          try {
            const response = await fetch(`${model.baseUrl.replace(/\/+$/, "")}/v1/systemone`, {
              method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body, signal: controller.signal,
            });
            if (!response.ok) throw new Error("Judge request failed");
            const result = await response.json();
            if (controller.signal.aborted) return;
            const picked = Object.keys(questions).filter(name => {
              const answer = result.answers?.[name];
              return answer?.type === "noul" && typeof answer.noul === "number" && answer.noul >= .75 && !seen.has(name);
            });
            if (!picked.length) return;
            return { message: { customType: "vstack-addons", display: false, attribution: "agent" as const,
              content: `Addons selected for this task: ${picked.map(name => `skill://${name}`).join(", ")}. Ignore any that do not fit. When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.` } };
          } catch { /* Retry once inside the same deadline. */ }
        }
      })();
      return await Promise.race([selection, deadline]);
    } catch { }
    finally { clearTimeout(timer!); controller.abort(); }
  });
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
    description: "Delete expired Scratch entries: /vstack-clean [age] (default 14d).",
    async handler(age, ctx) {
      if (!ctx.hasUI) {
        pi.sendMessage({
          customType: "vstack-clean",
          content: "/vstack-clean requires an interactive UI to confirm deletion. Nothing deleted.",
          display: true,
        }, { triggerTurn: false });
        return;
      }
      const args = [script, "--home", homedir(), "--older-than", age.trim() || "14d"];
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
