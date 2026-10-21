---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user through `ask` until you reach a shared understanding. Map a design tree: every decision branches into the decisions that depend on it. Work in rounds. The frontier contains every decision whose prerequisites are settled. A question that depends on an open decision waits for a later round.

Every grilling session writes into the Grilling page of the flow it belongs to, as a Stage. Read `skill://grilling-page` before the first round. It says how to find or start the page, add a Stage, add rounds, print its path, record answers, and close it. If the calling skill added no Stage, add one before the first round: its `skill` is the calling skill's name, or `grilling` when the user started grilling directly.

## Find facts

Facts from files and tools are your job, not the user's. Resolve the vstack root using the project mode before assigning exploration. A running exploration is an unsettled prerequisite: only its downstream decisions wait; the rest of the frontier proceeds.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): find the environment fact needed by the frontier question and return evidence and open questions, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: the decisions that depend on the fact stay open on the page.

For two or more independent explorations, use this Fan-out line instead of repeated single calls:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per independent fact question. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: find the fact, return evidence and open questions without edits, the vstack root. Do not wait; keep working. If they cannot start, stop: the decisions that depend on those facts stay open on the page.

## Each round

1. Add the entire frontier to the page before asking.
2. Print the page path before the first `ask` and before every later `ask`.
3. Put the whole frontier in one `ask` call, with one `questions[]` entry per decision. Each `question` is one line starting with its Q number, matching the page. Use a short `header` and short option labels that start with the option's letter. Give each option only its label. The page question carries its description, trade-offs, and context. Set `recommended` to the recommended option's index and `multi: true` only when choices combine. Never add Other; the UI supplies it. Wait for the result before advancing dependent decisions.
4. Read each returned answer and record it on the page with its notes and Other text:
   - A cancelled or `timedOut: true` answer, or one with no pick, no Other text, and no note, is unanswered, not consent. Ignore any auto-selection. Keep the decision open with its Q number. Ask it in the next round.
   - An option that the user picked settles its decision. Notes and Other text beside a pick never reopen it, even a note on an option that was not picked. Decide whether a note needs a reply on the page or a new frontier question.
   - Text with no pick reopens the decision unless it plainly names a choice. This covers Other text and notes on options that were not picked. The Flexible Ask picker returns a note-only answer as `Unanswered` followed by `Note (<option>, not picked)`. Read it as text with no pick, not as a missing answer. Reply to the text on the page. Ask the decision again next round with its Q number. If the reply calls for revised options, revise the options of the decision.

   Settle only picks and text that names a choice. Then recompute the frontier.

## Close

An empty frontier means every branch was visited and no decision remains silently assumed. Add the closing summary to the page as a `close` record. Print the page path. Mark the Stage finished if grilling added it. The close asks nothing, so the turn ends after the calling skill's own close steps.

The user's next prompt confirms the summary or pushes back. A pushback reopens the decisions it names, as a note does, and the next round starts from that prompt. A calling skill that acts after the grill, such as triage's or wayfinder's tracker writes, acts only after a next prompt confirms the summary. That prompt is the user's confirmation of the shared understanding.

When `ask` is unavailable in a headless run, take the recommended answer of each round, record it on the page as headless, then continue. At the close, add the `extra` bullet "Headless, not user-confirmed" to the close record and stop. No prompt follows, so the calling skill takes no action that needs the user's confirmation, such as a tracker write. It reports the summary and each action it did not take. A subagent never asks or claims user confirmation. It returns its open decisions, and the top-level agent puts them on the page and asks them.
