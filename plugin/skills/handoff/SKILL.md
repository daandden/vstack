---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it under Scratch, not the current workspace: run `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" handoff` with the bash tool from inside the repo, and write `<ts>-<slug>.md` in the dir it prints, where `<ts>` is the current time as `YYYYMMDD-HHMMSS` and `<slug>` names the next session's focus in a few lowercase words joined by hyphens. Print the file's absolute path at the end of your reply.

Include a "suggested skills" section in the document, naming each skill the next agent should load as a `skill://<name>` reference.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Read `skill://flow-page` and run `bound` for the supplied session and agent identity. Put the durable Flow id and current Stage id in the handoff, with its live URL and static path. The next session uses `show` and `bind` to continue the correct Stage, or opens a new Stage to continue finished work. An unbound lookup creates no Flow.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.

## Publish the handoff

Add a handoff Stage to the existing Flow, or start a Flow when none is bound. Reopen a closed Flow explicitly. Use a caller's Stage when it owns this run. Submit a Document Result with the handoff's headed content and `canonical: { "file": "<absolute handoff path>" }`. Capture the redacted Markdown as a `file` attachment so the next agent can download the retained export. Keep references to existing artifacts instead of copying them. Finish the owned Stage after publication and present the receipt's live URL or static fallback alongside the canonical file path.
