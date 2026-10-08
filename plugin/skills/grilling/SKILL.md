---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user through `ask` until you reach a shared understanding. Map a design tree: every decision branches into the decisions that depend on it. Work in rounds. The frontier contains every decision whose prerequisites are settled. A question that depends on an open decision waits for a later round.

## Start the page

Every grilling session keeps a Grilling HTML, whoever calls this skill. Read `skill://vstack-tmp` and run its path script with kind `grilling` from the repo being discussed. Use `<Scratch dir>/grilling/<project>-<issue>.html` for an issue, otherwise `<project>-<topic-slug>.html`. Resolve `<project>` as the main checkout's basename, not a worktree's; outside Git use the current directory's basename. Choose a 3–5 word kebab topic slug at the first round and keep it.

Read `templates/grilling-html.html` beside this skill. Write the HTML yourself from that template; there is no page-generation script. Read `skill://good-css` before changing its styles. For an existing page, read it and append a session heading and rounds before the `<!-- APPEND ROUNDS HERE -->` marker. Never replace earlier sessions, rounds, or answers. Continue page round numbers; question numbers start at Q1 for this session and increase across it. A repeated unanswered decision keeps its Q number.

## Find facts

Facts from files and tools are your job, not the user's. Resolve the vstack root using the project mode before assigning exploration. A running exploration is an unsettled prerequisite: only its downstream decisions wait; the rest of the frontier proceeds.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): find the environment fact needed by the frontier question and return evidence and open questions, the user's override words, the vstack root. Do not wait; keep working. If it cannot be spawned, do the work yourself.

For two or more independent explorations, use this block instead of repeated single calls:

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per independent fact question; size: number of files or sources to inspect per question.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: find the fact, return evidence and open questions without edits, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## Each round

1. Append the entire frontier to the page before asking. Each round has a map breadcrumb when present, the ticket title linked to its issue when present (otherwise the topic), the round number, and a timestamp. Each question has its Q number, full body, why it is open, relevant settled decisions and ADRs, and one card per option with its trade-off. Mark the recommended card in text. Preserve all earlier answers.
2. When options differ in shape or flow, read `skill://diagram-design` and draw under the same `grilling/` Scratch kind. Fix the figure's type, size, and content as the caller; this skips its confirm-before-drawing, not its first-use style gate. Read its `references/export.md`, run `scripts/export_svg.py` through Python eval, remove the XML declaration, and paste the exported `<svg>` into the page. Give each source figure a unique basename so SVG IDs stay unique. Never draw a substitute figure yourself or use Mermaid as a fallback.
3. Open the page once per session at the first round with `open <absolute file>` (quote the path). Print its `file://` URL before the first `ask` and before every later `ask`, including the closing gate and retries. Percent-encode path characters as needed. Do not reopen each round or tell the user to reload.
4. Put the whole frontier in one `ask` call, with one `questions[]` entry per decision. Each `question` is one line starting with its Q number, matching the page. Use a short `header`, short option labels, and one-line `description` values. Put full bodies, context, and trade-offs only on the page. Set `recommended` to the recommended option's index and `multi: true` only when choices combine. Never add Other; the UI supplies it. Wait for the result before advancing dependent decisions.
5. Add the returned answers to that round's question sections, including custom notes. A missing, cancelled, or `timedOut: true` answer is unanswered, not consent: record that status, ignore any auto-selection, keep the decision open with its Q number, and ask it in the next round. Settle only actual answers, then recompute the frontier.

Escape user text and URLs for HTML; keep figure markup from diagram-design intact. The page is a record, not an input form: answers come only through `ask`.

## Close

An empty frontier means every branch was visited and no decision remains silently assumed. Append a summary of every decision to the page. Print its URL, then make one `ask` with Shared understanding / Not yet. Only Shared understanding confirms the result and permits the caller to act. Not yet reopens the tree from the user's note. Record the closing answer on the page. A timeout at this gate is no answer: print the URL and retry once; a second timeout stops without acting and records why.

When `ask` is unavailable in a headless run, take and label the recommended answers in the page and output, then continue; label the closing summary as headless, not user-confirmed. A subagent never asks or claims user confirmation: return open decisions for the top-level agent to put through `ask`.
