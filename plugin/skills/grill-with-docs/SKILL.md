---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Add a grill-with-docs Stage to the flow's Grilling page, as `skill://grilling-page` says. Then load `skill://grilling` and `skill://domain-modeling`. Both write each `ask` as a question in that Stage, including the glossary and ADR challenges. When grilling closes with its summary, mark the Stage finished. Then end the reply with one line that names the skill to type next: `/skill:to-spec` for a change that needs more than one session, or `/skill:implement` for one that fits one session. The line asks nothing.
