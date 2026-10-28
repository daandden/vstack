---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Read `skill://flow-page`, use `bound` to continue the session and agent's Flow, or `open --skill grill-with-docs --title <topic>` if none exists. Open a grill-with-docs Stage on a continued Flow before its first contribution. Then load `skill://grilling` and `skill://domain-modeling`. Both ask inside that Stage through flow-page, including glossary and ADR challenges. Keep the canonical glossary and ADR files. Before finishing the Stage, ensure domain-modeling's Document Results capture every resulting term and decision with its canonical file link, without publishing the same explanation twice. Then end the reply with one line naming the next skill: `/skill:to-spec` for a change that needs more than one session, or `/skill:implement` for one that fits one session. The line asks nothing.
