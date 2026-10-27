# A mid-session Matt run start sends a smol restatement to jev

> [ADR 0039](0039-main-agent-tools-pick-addons-from-gathered-intent.md) supersedes main-session smol restatements and automatic prompt selection. The agent gathers source intent and calls a tool after a displayed run-start instruction, including on a bare start. This accepts the dependence on the agent that this ADR rejected. Stored corpus restatements remain offline samples.

> [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) amends this decision. jev reads the restatement as `request`, beside the catalog's `preamble`. When every Addon was delivered earlier in the session, the extension calls no smol and sends no request.

> [ADR 0026](0026-every-matt-run-start-sends-a-smol-restatement-to-jev.md) amends this decision. Every Matt run start gets a restatement, also the first prompt of a session. One 25-second vstack cap covers smol and jev together on every restated start, in place of omp's 30-second cap. At the cap the start gets no picks and a `timed out` warning. When smol fails with an error on a fresh start whose cleaned words are not empty, jev reads those words instead.

> [ADR 0031](0031-a-closing-pick-gets-addon-picks-through-an-extension-tool.md) added an agent-called jev tool for a pick at a grill's closing ask. [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md) removed the closing ask and the tool, so the objection below to an agent-called tool stands again.

> [ADR 0036](0036-the-addon-judge-runs-through-omps-judge-role.md) amends this decision. The extension checks that omp's judge role starts with a native judge, not that TypeSafe credentials exist, before it calls smol. The judge call also goes through `@oh-my-pi/pi-coding-agent/judgment`.

A Matt run that starts mid-session gets its Addon picks from a restatement, not from the user's words after `User:`. A run starts mid-session when the active branch already holds user or assistant messages, a visible skill start, or a compaction before the prompt that starts the run. The common case is that the user talks with the agent first and types the Matt skill afterward. The words after `User:` then miss most of the goal. Before jev runs, the extension asks the `smol` role model to restate the user's goal. The instruction is the body of the in-your-own-words skill, and the extension adds a short frame. The model reads all user and assistant text since the last compaction, the compaction summary, and the new words. An earlier skill-start prompt gives only its user words. The model gets no tool calls, tool output, thinking, or hidden messages. jev reads the restatement as it is, cut to 10,000 characters. A fresh run start and every later prompt in a run still send the cleaned words of ADR 0018.

## Considered Options

- Restate every prompt in every Matt run, and delete the cleaner. This adds a smol call where there is no earlier talk to read.
- Restate the start prompt and every later prompt of a mid-session run. A smol call on every prompt costs more than it gains.
- Restate with the session model through `ctx.runEphemeralTurn`. This is a full turn on the strongest model over the whole history before each restated prompt.
- Let the main agent restate in its reply and call a vstack tool that asks jev. The picks then arrive after the agent starts, and only if the agent follows a hidden instruction.
- Copy the instruction into code, or adapt in-your-own-words to hold the frame. The first breaks the link to the skill. The second flips an adopt row to adapt for text that only the extension needs.
- Clean each message and cap the talk at 24,000 or 48,000 characters. The user chose raw talk with no cap. Measured smol calls took 7 to 17 seconds, and input size up to 72,000 tokens made little difference.
- Turn reasoning off for speed. `gpt-6.1-sol` rejects effort `none`, and the user chose the configured level.
- Stop at a vstack deadline under omp's cap. The user chose omp's own 30-second handler timeout and its extension error. Like a vstack warning, that error shows in the TUI only and is not stored in the session.

## Consequences

- This amends ADR 0018 for mid-session run starts. A bare `/skill:<matt skill>` with no user words still gets a restatement when there is earlier talk, because the talk carries the goal.
- A restated prompt has no vstack deadline under omp's 30-second `before_agent_start` cap. Other prompts keep the 4-second deadline. When omp's cap ends the hook, omp shows `handler timed out after 30000ms`, and vstack shows nothing more.
- The extension checks for native jev and its key before it calls smol, so a user without TypeSafe gets no smol call and no warning. When the restatement fails, that prompt gets no picks. The reasons are no `smol` model, no key, an error, or an empty reply. If a UI exists, the extension also shows `vstack: no Addon picks for this run start (<reason>)` through `ctx.ui.notify`. The warning is not a session entry, so the agent never reads it.
- smol runs at its configured effort. The extension passes `reasoning` only for an effort level, as omp's own role calls do.
- The extension now imports `completeSimple` from `@oh-my-pi/pi-ai` and `resolveModelRoleValue` from `@oh-my-pi/pi-coding-agent/config/model-resolver`. `ctx.models.resolve` drops the role's thinking level. Both packages export these names. They are not part of the extension API, so an omp release can move them. This amends ADR 0002, which allowed only the public extension API and TypeSafe's HTTP API.
- A visible skill start counts as earlier talk, so a run that follows another run is mid-session. A hidden skill message does not count, and its words stay out of the talk.
- `sample-prompts.json` holds `restated` samples. Each sample stores a restatement that smol wrote once from a synthetic talk. `scripts/addon-judge-check.ts` sends these samples as they are, cut to 10,000 characters.
- A restated prompt can run long enough for the user to cancel it. omp then drops the hook's message. The extension therefore takes the pointers it already sent only from the saved `vstack-addons` messages in the session, read through `ctx.sessionManager.getEntries()` across all branches. A dropped pick returns on the retry, and each pointer still appears at most once per session, as ADR 0002 requires. The restatement input stays limited to the active branch.
