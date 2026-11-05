# Flow questions show their link in a Flow panel

The user chose this in the `flow-popup-composer-cba8be` interview on 2026-11-06. It amends [ADR 0054](0054-flow-questions-show-their-link-in-a-flow-popup.md). A Flow panel above the composer replaces the Flow popup, and the question picker opens without an Enter or Escape step.

While a question picker in a Flow is open, vstack shows a Flow panel above the composer, where omp shows its `/btw` answer panel. The panel's title is `Flow page`, and its body is the clickable live Flow page URL. The panel goes away when the picker closes, whether the user answered, cancelled, or timed out, or the call failed. The ordinary `ask` tool and Ratchet's native approval gate both get the panel. For `ask`, vstack's `tool_execution_start` hook shows the panel; ADR 0054's `tool_call` hook fired before omp scheduled the tool, so it could show the panel while the picker still waited. When `ask` opens its picker through `ui.askDialog`, as omp's built-in `ask` does, the panel goes away when that dialog settles, because the tool keeps running afterward to process answer images. Otherwise `tool_execution_end` removes it. Ratchet keeps the `ui.askDialog` wrapper that ADR 0054 chose. If the Local Flow host is not serving, the panel shows the host error and the picker opens as usual. The panel text never enters the agent's context, later requests, compaction, or branch summaries. Only an interactive omp screen shows it.

Proof for this change is a real omp session. In that session, the panel shows a clickable URL above an open picker and goes away when the picker closes.

## Why

The popup cost one keypress before every question round, and it covered the screen until the user dismissed it. The panel keeps the link on screen while the user answers. ADR 0054's reason for code-owned presentation still holds: a skill instruction cannot make a model write the link. Only the presentation changes.

## Considered options

- Keep the blocking popup and draw it as a `/btw`-style panel. The user rejected the extra keypress.
- Add a `/btw`-style input to the popup for side questions. `/btw` already does this from the composer.
- Keep the panel until the user's next prompt, or for as long as the session is bound to a Flow. Both widen ADR 0047's rule that only question handoffs show the link.
