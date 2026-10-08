// vstack's omp extension. Public extension API only; omp loads this file with its
// TS loader, so there is no build step. Type imports are erased at runtime.
import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";

export default function vstack(pi: ExtensionAPI): void {
  registerRenameSession(pi);
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
