# Flow questions show their link in a Flow popup

The user chose this in the `flow-url-consistency-8fd65a` interview on 2026-11-05. It amends [ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md) in two places. A Flow popup replaces the assistant-chat link before questions, and questions open even when the Local Flow host is down. These are accepted design decisions, not a claim that the implementation is complete.

Before each question picker in a Flow opens, vstack opens a Flow popup. Its title is `Flow page`, and it holds the clickable live Flow page URL. The user closes it with Enter or Escape, and then the picker opens. Code opens the popup, so it never depends on the model writing chat text. For the ordinary `ask` tool, vstack's `tool_call` hook opens it. For Ratchet's native approval gate, a vstack wrapper around `ui.askDialog` opens it before calling the original method. The popup text never enters the agent's context, later requests, compaction, or branch summaries. Every `ask` call shows the popup, including a retry after a cancelled picker. Only a cancelled turn stops the picker. The popup appears only on an interactive omp screen. Print, RPC, and ACP runs have no popup, and subagents still never ask.

If the Local Flow host is not serving, the popup shows the host error and the picker still opens. This replaces ADR 0047's rule that questions wait for a working live URL. Skills drop the step that told the agent to print the link in chat before `ask`.

ADR 0047's scope stays the same. Only question handoffs get the link. Result-only replies, Stage opens, and completion summaries show no link. Ordinary `ask` keeps its retries, cancellation, and answer recording. Neither the popup nor the `ui.askDialog` wrapper is a picker, a delivery queue, or a retry gate. Each one runs before the existing picker and leaves it unchanged.

Proof for this change is a real omp session. In that session, the popup shows a visible, clickable URL and opens before the picker.

## Why

A transcript audit of vstack sessions from 2026-10-30 to 2026-11-05 found 61 Flow-bound `ask` calls. Only 31 of them showed the live URL in chat first. After [PR #350](https://github.com/daandden/vstack/pull/350), every audited 2026-11-05 ask had no chat text at all. Each of those turns held only a thinking block and the tool call. A skill instruction cannot make a model write text, so the link has to come from code.

Earlier fixes failed in other ways. ADR 0044's post-reply card appeared too often and duplicated on retries. PR #337's `flow_ask` showed the link in a notification that the user did not see. The PR #350 chat instruction relied on the model.

## Considered options

- Put the link inside the picker's question text. The user rejected this.
- Refuse `ask` until the assistant message holds the link. This is a retry gate, and each miss costs a model turn.
- Send a custom-message card through `pi.sendMessage`. omp queues that card while a turn runs, so it appears after the picker. The card also reaches compaction and branch summaries.
- Add a context-free, awaited transcript card to omp core. The user replaced the card requirement with a popup, which needs no omp change.
- Add an omp event before Ratchet's gate. The user chose the vstack wrapper. Two limits come with it. The wrapper runs in an order set by omp-tools' own `ui.askDialog` wrapper. It also misses Ratchet's `ui.select` fallback, which runs only when `ui.askDialog` is absent.

[ADR 0055](0055-flow-questions-show-their-link-in-a-flow-panel.md) replaces the Flow popup with a Flow panel above the composer, and the picker opens without an Enter or Escape step.
