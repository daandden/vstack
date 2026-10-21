---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Add a grill-with-docs Stage to the flow's Grilling page, as `skill://grilling-page` says. Then load `skill://grilling` and `skill://domain-modeling`. Both write each `ask` as a question in that Stage, including the glossary and ADR challenges. grilling's closing `ask` gets two next-step options, to-spec and implement. Its options, in this order, are `Shared understanding, then to-spec`, `Shared understanding, then implement`, `Shared understanding`, and `Not yet`. Recommend the to-spec option. After grilling's closing gate gets Shared understanding or a next-step pick, mark the Stage finished.
