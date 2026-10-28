---
name: in-your-own-words
description: Restate the user's goals and the problem they want to solve.
disable-model-invocation: true
---

Restate in your own words what you think the user's goals are and what problem they're trying to solve.

Read `skill://flow-page` and use `bound` with the extension's session and agent identity. Open an in-your-own-words Stage on that Flow, or start one with `open --skill in-your-own-words --title <topic>` for a standalone request. Publish the restatement as a short Document Result distinguishing the user's stated goals from your interpretation and any unresolved understanding. Finish the Stage and keep the Flow open. Chat summarizes it without writing a separate report page. Loading the skill only as a reference creates no Stage.
