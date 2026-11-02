---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repo. Use when the user wants a topic researched, docs or API facts gathered, or reading legwork delegated to a background agent.
---

Check enrollment through `skill://flow-page`'s "Stage entry/exit line" before any Flow discovery or creation. Resolve the vstack root and project Scratch dir once, or use the caller's supplied paths.

Spawn one `vstack-worker` via `task` (`agent: "vstack-worker"`): research the question through the job below and save the canonical file in the named checkout, the vstack root, the Scratch dir. Return its path, cited findings, and limitations to this caller for delivery. Do not wait; keep working. If it cannot be spawned, stop: report the research as not started.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it where the repo already keeps such notes; match the existing convention, and if there is none, put it somewhere sensible and say where.

Collect the worker's result before closing this run. In a Flow, publish the findings as a Document Result with headed prose, citations, and limitations. Set `canonical: { "file": "<notes path>" }` and capture the notes as a `file` attachment. The notes remain the canonical research record, and the Result captures that revision. Submit a later revision explicitly if the notes change. Ad-hoc research answers in a Flow go on the same page. Outside a Flow, deliver the full cited findings and limitations in chat, not just the file path. Return the canonical notes path in either case.

If this run created the Flow and the requested research is complete with no further Stage planned, finish the Stage, then close the Flow through `skill://flow-page`'s "Close or reopen the Flow". In a Flow that a caller owns or that continues, finish only this Stage and restore the caller's binding.
