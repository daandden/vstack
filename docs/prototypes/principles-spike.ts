import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { appendFileSync } from "node:fs";

const QUESTIONS = {"fix-root-causes": {"type": "noul", "instructions": "The state is a user's request to a coding agent. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation below; if torn, answer no. Situation: Is this task debugging a failure, crash, or wrong behavior?", "criteria": {"true": "The task clearly is this situation.", "false": "The task is not this situation, or only loosely resembles it."}}, "attack-the-premise": {"type": "noul", "instructions": "The state is a user's request to a coding agent. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation below; if torn, answer no. Situation: Does this task describe earlier fixes that already failed the same check?", "criteria": {"true": "The task clearly is this situation.", "false": "The task is not this situation, or only loosely resembles it."}}, "build-the-lever": {"type": "noul", "instructions": "The state is a user's request to a coding agent. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation below; if torn, answer no. Situation: Does this task involve many repetitive edits or checks that a script or codemod could perform or prove?", "criteria": {"true": "The task clearly is this situation.", "false": "The task is not this situation, or only loosely resembles it."}}, "make-operations-idempotent": {"type": "noul", "instructions": "The state is a user's request to a coding agent. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation below; if torn, answer no. Situation: Does this task write a command, migration, or loop that may crash midway and be re-run?", "criteria": {"true": "The task clearly is this situation.", "false": "The task is not this situation, or only loosely resembles it."}}, "exhaust-the-design-space": {"type": "noul", "instructions": "The state is a user's request to a coding agent. Judge the inherent task, not its phrasing. Answer yes only if the task clearly falls into the situation below; if torn, answer no. Situation: Does this task need a novel UI interaction or architecture with no precedent in the codebase?", "criteria": {"true": "The task clearly is this situation.", "false": "The task is not this situation, or only loosely resembles it."}}};
const LOG = "/tmp/vstack-proto/spike.log";

export default function (pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event, ctx) => {
    try {
      const model = ctx.modelRegistry.find("typesafe", "jev-latest") ?? ctx.modelRegistry.getAll("all").find((m: any) => m.provider === "typesafe");
      if (!model) { appendFileSync(LOG, "no judge model\n"); return; }
      const key = await ctx.modelRegistry.getApiKey(model);
      if (!key) { appendFileSync(LOG, "no key\n"); return; }
      const base = (model.baseUrl || "https://api.typesafe.ai").replace(/\/+$/, "");
      const res = await fetch(`${base}/v1/systemone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: model.id, state: { request: event.prompt }, questions: QUESTIONS }),
        signal: AbortSignal.timeout(4000),
      });
      const body = await res.json();
      appendFileSync(LOG, `${model.provider}/${model.id} ${model.baseUrl} ${res.status} ${JSON.stringify(body.answers ?? body)}\n`);
      const picked = Object.entries(body.answers ?? {}).filter(([, a]: any) => a.noul >= 0.75).map(([k]) => k);
      if (picked.length === 0) return;
      return { message: { customType: "vstack-principles", display: false, attribution: "agent",
        content: `Principles selected for this task: ${picked.map(n => "skill://principle-" + n).join(", ")}` } };
    } catch (e) { appendFileSync(LOG, `error ${String(e)}\n`); }
  });
}
