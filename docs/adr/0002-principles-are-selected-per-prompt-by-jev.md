# Principles are hidden skills selected per prompt by jev

> [ADR 0039](0039-main-agent-tools-pick-addons-from-gathered-intent.md) supersedes automatic main-session prompt selection and smol restatements. The agent gathers source intent and calls `inject_addons` or `inject_principles` after a displayed run-start instruction. Session-wide dedup remains, and ADR 0025's subagent Brief picks are unchanged.

> The scope is superseded by [ADR 0018](0018-principles-are-addons-and-the-running-skill-wins.md): the judge picks principles only while a Matt skill runs, it reads only the user's words on a skill-start prompt, and the running skill wins over a principle. The rest of this ADR, the judge design, still stands.

> [ADR 0017](0017-an-agent-merges-update-text-and-vstack-maintain-keeps-the-books.md) removed the Update sample rerun. The corpus check now runs by hand through `scripts/addon-judge-check.ts`.

> ADR 0021 amends this decision. The extension also uses `completeSimple` from `@oh-my-pi/pi-ai` and the role resolver from `@oh-my-pi/pi-coding-agent/config/model-resolver`, outside the public extension API, to restate a mid-session Matt run start.

> [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) amends this decision. The shared judging text sits once in the jev state as `preamble`, not in each question, and the request leaves out every Addon already delivered in the session. The selection threshold is 0.70, not 0.75.

> [ADR 0025](0025-subagents-get-principle-picks-from-their-own-brief.md) amends this decision. During a Matt run, the subagent sessions of `vstack-explorer`, `vstack-worker`, and `vstack-verifier` get principle picks from their own brief. A skill no longer has to name the principles for each brief.

> [ADR 0036](0036-the-addon-judge-runs-through-omps-judge-role.md) amends this decision. The extension calls omp's judge chain for the `judge` role instead of `POST /v1/systemone` to `jev-latest`, and any native judge model in that role picks Addons. A judge role whose first candidate is not native still gets no picks.

Each adopted pstack principle stays a hidden skill (`disable-model-invocation: true`) that maps 1:1 to its Upstream item, and no principle text sits in the system prompt. An omp extension that ships in the vstack plugin handles `before_agent_start` in the main session. It sends the user's prompt to TypeSafe jev (`jev-latest`) through `POST /v1/systemone`, with one `noul` question per principle, written in auto-thinking's style: "judge the inherent task, not its phrasing; if torn, answer no", with true/false criteria. Every principle scoring 0.75 or higher that hasn't already been injected this session is added as one hidden message pointing at `skill://principle-<name>`, which tells the agent to ignore it if it doesn't fit. Skill steps still cite principles as `skill://principle-<name>`. We chose this design because a principle list the agent sees on every turn, or re-reads whenever a trigger fires, pulls the agent off course over a session. We also chose it because many pstack triggers are broad or already covered by omp's harness prompt, so no hand-curated list stayed both small and useful.

## Considered Options

- **Visible principle skills**: omp's smol model rewrites each description to 12 words or fewer. That dropped the action from several triggers, and when compression failed, the description was cut off.
- **Always-on index rule**, either full or limited by two gates (a specific trigger, and not already covered by the harness): the gates needed curating at every Update, and even a small index sits in the prompt on every turn. This was recorded first and then superseded in the same ticket.
- **Judged TTSR rules** (`question` rules): they judge every output and re-inject reminders all session, which is exactly the drift we're avoiding. They also need `ttsr.enabled` turned on.
- **A selection skill behind a one-line pointer rule**: it depends on the agent following the pointer. The extension fires before the first output.
- **Citations only**, as pstack does outside poteto-mode: plain sessions would never see any principle.

## Consequences

- vstack ships TypeScript. The extension uses only the public extension API (`ctx.modelRegistry.find("typesafe", "jev-latest")`, `getApiKey`) and TypeSafe's public HTTP API, not omp internals.
- When the judge isn't native jev (no TypeSafe credentials, or a failure or timeout), selection is skipped and the turn goes on without it: chat-model judges answer only 0 or 1, so the threshold means nothing there.
- The judge sees only the current prompt, cleaned the same way as auto-thinking. A bare follow-up such as "still failing" can miss principles that the conversation would have revealed.
- Subagent sessions are skipped. A vstack skill that writes a subagent brief names the principles that govern that role, the way pstack's architect runner prompt does.
- The judge runs on its own classifier model, not the Session model. It is a classifier call, not a subagent, so ADR 0004's Session model rule does not cover it.
- `jev-latest` moves with new releases, and scores can shift with it. `vstack update` re-runs a stored set of sample prompts to check which principles get selected.
