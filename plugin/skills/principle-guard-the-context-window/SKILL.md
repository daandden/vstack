---
name: principle-guard-the-context-window
description: "Apply when context is filling up: large outputs, long files, repeated reads, fan-out planning. Route bulk to subagents; keep summaries in the main thread, not raw payloads."
disable-model-invocation: true
---


# Guard the Context Window

The context window is finite within a session. Keep summaries in the main thread, not raw payloads. Large outputs cause compression and weaken reasoning.

## Route large payloads

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): read the verbose output or long documents and return a cited summary, the user's override words, the vstack root. Wait for its result. If it cannot be spawned, do the work yourself.

Keep templates and references used on every invocation inline in the skill. Split large work into phases with a clear file scope and account for the cost of each read.
