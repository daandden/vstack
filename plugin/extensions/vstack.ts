// vstack's omp extension. Public extension API only; omp loads this file with its
// TS loader, so there is no build step. Type imports are erased at runtime.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { settings } from "@oh-my-pi/pi-coding-agent";
import { hasNativeJudge } from "@oh-my-pi/pi-coding-agent/judgment";
import questions from "../../principle-questions.json";
import { preprocessTinyMessage } from "./prompt-cleaner.ts";

export default function vstack(pi: ExtensionAPI): void {
  registerRenameSession(pi);
  registerPrincipleSelection(pi);
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

function registerPrincipleSelection(pi: ExtensionAPI): void {
  const injected = new Map<string, Set<string>>();
  pi.on("before_agent_start", async (event, ctx) => {
    if (ctx.agent.kind !== "main") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<undefined>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(undefined); }, 4000);
    });
    try {
      const selection = (async () => {
        if (!hasNativeJudge(settings, ctx.modelRegistry)) return;
        const model = ctx.modelRegistry.find("typesafe", "jev-latest");
        if (!model || model.api !== "typesafe") return;
        const key = await ctx.modelRegistry.getApiKey(model);
        if (!key || controller.signal.aborted) return;
        const sessionId = ctx.sessionManager.getSessionId();
        let seen = injected.get(sessionId);
        if (!seen) { seen = new Set<string>(); injected.set(sessionId, seen); }
        for (const entry of ctx.sessionManager.getBranch()) {
          if (entry.type !== "message" || entry.message.role !== "custom" || entry.message.customType !== "vstack-principles") continue;
          const content = typeof entry.message.content === "string" ? entry.message.content : JSON.stringify(entry.message.content);
          for (const match of content.matchAll(/skill:\/\/principle-([a-z-]+)/g)) seen.add(match[1]!);
        }
        const body = JSON.stringify({ model: model.id, state: { request: preprocessTinyMessage(event.prompt) }, questions });
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
            for (const name of picked) seen.add(name);
            return { message: { customType: "vstack-principles", display: false, attribution: "agent" as const,
              content: `Principles selected for this task: ${picked.map(name => `skill://principle-${name}`).join(", ")}. Ignore any that do not fit.` } };
          } catch { /* Retry once inside the same deadline. */ }
        }
      })();
      return await Promise.race([selection, deadline]);
    } catch { /* Missing registry/auth or non-native judge: skip silently. */ }
    finally { clearTimeout(timer!); controller.abort(); }
  });
}
