---
name: how
description: Explain how existing code works, where it lives, and which layer owns it. Use why for motivation.
disable-model-invocation: true
---

# How

Trace the mechanism for a senior engineer new to the subsystem. If the scope is ambiguous, state your interpretation and proceed. The user can redirect.

Resolve the vstack root once per the Private-mode rule, or use the caller's supplied root. Follow `skill://flow-page`'s "Stage entry/exit line". An investigator returns its explanation to the producer.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): investigate the user's question in one read-only pass and explain it for a senior engineer who needs to start working in the area; cite files and symbols beside each claim, trace triggers, decisions, and data flow, name the owning layers and relevant gotchas, and return figure points where a diagram would clarify the mechanism, the vstack root. Wait for its result. If it cannot be spawned, stop: report that the explanation was not written and give the observed refusal. Name `task.maxRecursionDepth` when the depth limit blocked the call.

Keep the investigator's explanation and citations. Edit lightly for clarity or context. Under a calling producer, return the explanation with its figure points. For a direct run in a Flow, publish a cited Document Result. If the explanation needs figures, use the supplied Scratch dir or resolve it through `skill://vstack-tmp`. Write the Mermaid sources in a distinct `how/<run-id>/` entry and attach them through `skill://vstack-figures` in reading order. Outside a Flow, give the full answer in chat.
