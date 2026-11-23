---
name: why
description: Investigate why existing code has its shape. Start with commits and PRs, and widen the search only if the record is thin.
disable-model-invocation: true
---

# Why

Investigate motivation and intent. For runtime behavior, read `skill://how`.

Identify the target and the decision the question asks about. If the target is ambiguous, state your interpretation and proceed. Follow `skill://flow-page`'s "Stage entry/exit line". Use the supplied vstack root under a caller. Otherwise resolve it once per the Private-mode rule. Read applicable active ADRs as current rules before tracing the history.

1. Trace the introducing commits and each material later change. Use blame, path history, and diffs to connect the commits to the target. Read their PR descriptions, review threads, and comments through the configured Code host. Read `code-host.md` under the vstack root's `docs/vstack/` in Standard mode or `config/` in Private mode. For a CLI, use its `read-pr` and `review-threads` command rows. For an MCP, select read tools from the named server's current descriptions and schemas using the recorded project facts. If Git history or the Code host is unavailable, state which evidence you could not read.
2. If the record does not explain the decision, follow relevant leads through the configured issue tracker, other configured MCP sources, or further Code host searches. Read the ADR archive for historical rationale, not as a source of active rules.
3. Answer with links or precise citations to what authors wrote. Label your inferences and state what the record cannot answer, including unavailable sources that matter to the question. Code shows what happens, not why someone chose it.

Under a producer, return the answer and citations to that producer. For a direct run in a Flow, publish a cited Document Result. Outside a Flow, give the full answer in chat.
