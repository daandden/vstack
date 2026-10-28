---
name: wait-what
description: "Stop. That last message did not land: re-pitch it."
disable-model-invocation: true
---

Wait, I don't understand where you've got to here. Re-pitch that: give me a little bit of context, talk in ASD-STE100 Simplified Technical English, and use the ubiquitous language from `GLOSSARY.md` (follow `GLOSSARY-MAP.md` to the right one if the repo has more than one).

Read `skill://flow-page` and use `bound` with the extension's session and agent identity. Open a wait-what Stage on the bound Flow, or start one with `open --skill wait-what --title <topic>` for a standalone request. Publish the re-pitched explanation as a short Document Result with its context and sources, then finish the Stage. Keep the Flow open. Chat gives a brief orientation; the Flow page holds the explanation, not a separate report page. Loading this skill only as a wording reference creates no Stage.
