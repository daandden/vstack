# Flow questions show their link in a Flow panel

The user chose this in the `flow-popup-composer-cba8be` interview on 2026-11-06. It amends [ADR 0054](0054-flow-questions-show-their-link-in-a-flow-popup.md). A Flow panel above the composer replaces the Flow popup, and the question picker opens without an Enter or Escape step.

While a native question dialog is open in a Flow, vstack shows a panel titled `Flow page` above the composer. Its body is the clickable live Flow page URL, or the actual host error when the Local Flow host is unavailable. Stock omp `ask` presents its receipt form through `ui.formDialog`. That dialog owns the panel's lifetime, not `tool_execution_start` or the tool's later answer processing. Ratchet keeps `ui.askDialog` and uses the same panel for its native approval dialog. The panel goes away on settlement, abort, or session switch. Only an interactive omp screen shows it. The panel text never enters the agent's context, later requests, compaction, or branch summaries.

The extension tracks `ui.formDialog` and `ui.askDialog` in one first-in, first-out order. Only the first unsettled dialog can show the Flow panel or write Picker presence. omp still queues and presents the dialogs. A native approval, select, confirm, or input outside those wrappers can still leave the panel pointing at a queued form because omp 19.1.1 exposes no presentation signal.

Proof for this change is a real omp session. In that session, the panel shows a clickable URL above an open picker and goes away when the picker closes.

## Why

The popup cost one keypress before every question round, and it covered the screen until the user dismissed it. The panel keeps the link on screen while the user answers. ADR 0054's reason for code-owned presentation still holds: a skill instruction cannot make a model write the link. Only the presentation changes.

## Considered options

- Keep the blocking popup and draw it as a `/btw`-style panel. The user rejected the extra keypress.
- Add a `/btw`-style input to the popup for side questions. `/btw` already does this from the composer.
- Keep the panel until the user's next prompt, or for as long as the session is bound to a Flow. Both widen ADR 0047's rule that only question handoffs show the link.

[ADR 0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session](0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session.md) points the panel link at the first asked question and adds a Picker presence on the Local Flow host while the picker is open.
