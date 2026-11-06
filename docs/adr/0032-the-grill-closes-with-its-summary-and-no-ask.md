# The grill closes with its summary and no ask

> [ADR 0039](0039-main-agent-tools-pick-addons-from-gathered-intent.md) replaces automatic run-start Addon selection with `inject_addons` and `inject_principles` over gathered source intent. The extension displays the call instruction at each Matt run start. This ADR's summary-only close remains unchanged, and the tools do not run from a closing ask.

> This supersedes [ADR 0031](0031-a-closing-pick-gets-addon-picks-through-an-extension-tool.md).

> [ADR 0060](0060-triage-acts-without-confirmation-gates.md) amends this for triage: triage writes to the tracker in the same turn as the grill's close. wayfinder and other callers still wait for the next prompt.

When the frontier is empty, grilling writes the closing summary on the Grilling page, marks its Stage finished, and ends the turn. It makes no closing `ask`. The user's next prompt either confirms the summary or pushes back, and a pushback reopens the tree. A caller that acts after the grill, such as triage or wayfinder with their tracker writes, acts only after that prompt. grill-with-docs offers no next-step options. After the summary, it names in one line the skill to type next: to-spec for a change that needs more than one session, or implement for one that fits one session. The user wants the grill to state its understanding and stop, and to object in a normal prompt instead of answering a gate.

## Considered Options

- Keep the closing ask with its next-step options (ADR 0031). The user answers a gate at the end of every grill, even when the summary is what they expected.
- The caller acts in the same turn as the summary. triage and wayfinder would then write to the tracker before the user reads the summary, and a pushback would mean editing or reopening the issue.

## Consequences

- Every Matt run start is typed again, so the `before_agent_start` hook picks the Addons for the next skill. The `vstack_pick_addons` tool has no caller, and the extension no longer registers it.
- The Grilling page's close record has no `gate`, `answer`, or `note`, and the summary has no Closing gate row. Older state files with those fields still render, without the row.
- A headless close marks its summary as headless, not user-confirmed, in an `extra` bullet, and stops there. No prompt follows, so its caller takes no action that waits for the user's confirmation, such as triage's or wayfinder's tracker writes. It reports the summary and the actions it did not take.
- Matt's upstream grilling says not to act until the user confirms a shared understanding. The user's next prompt is that confirmation.
