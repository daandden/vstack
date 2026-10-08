---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
argument-hint: "What will the next session be used for?"
disable-model-invocation: true
---

Write a handoff document summarising the current conversation so a fresh agent can continue the work. Save it under Scratch, not the current workspace: run `bun "$(realpath skill://vstack-tmp/scripts/path.ts)" handoff` with the bash tool from inside the repo, and write `<ts>-<slug>.md` in the dir it prints, where `<ts>` is the current time as `YYYYMMDD-HHMMSS` and `<slug>` names the next session's focus in a few lowercase words joined by hyphens. Print the file's absolute path at the end of your reply.

Include a "suggested skills" section in the document, which suggests skills that the agent should invoke.

Do not duplicate content already captured in other artifacts (specs, plans, ADRs, issues, commits, diffs). Reference them by path or URL instead.

Redact any sensitive information, such as API keys, passwords, or personally identifiable information.

If the user passed arguments, treat them as a description of what the next session will focus on and tailor the doc accordingly.
