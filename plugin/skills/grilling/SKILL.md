---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user through `ask` until you reach a shared understanding. Map a design tree: every decision branches into the decisions that depend on it. Work in rounds. The frontier contains every decision whose prerequisites are settled. A question that depends on an open decision waits for a later round.

Every grilling session keeps a Grilling page, whoever calls this skill. Read `skill://grilling-page` before the first round. It says how to start the page, add rounds, print its path, record answers, and close it.

## Find facts

Facts from files and tools are your job, not the user's. Resolve the vstack root using the project mode before assigning exploration. A running exploration is an unsettled prerequisite: only its downstream decisions wait; the rest of the frontier proceeds.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): find the environment fact needed by the frontier question and return evidence and open questions, the vstack root. Do not wait; keep working. If it cannot be spawned, stop: the decisions that depend on the fact stay open on the page.

For two or more independent explorations, use this Fan-out line instead of repeated single calls:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per independent fact question. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: find the fact, return evidence and open questions without edits, the vstack root. Do not wait; keep working. If they cannot start, stop: the decisions that depend on those facts stay open on the page.

## Each round

1. Add the entire frontier to the page before asking.
2. Print the page path before the first `ask` and before every later `ask`, including the closing gate and retries.
3. Put the whole frontier in one `ask` call, with one `questions[]` entry per decision. Each `question` is one line starting with its Q number, matching the page. Use a short `header`, short option labels that start with the option's letter, and one-line `description` values. Put full bodies, context, and trade-offs only on the page. Set `recommended` to the recommended option's index and `multi: true` only when choices combine. Never add Other; the UI supplies it. Wait for the result before advancing dependent decisions.
4. Record the returned answers on the page, including custom notes and Other answers. A missing, cancelled, or `timedOut: true` answer is unanswered, not consent: record it as unanswered, ignore any auto-selection, keep the decision open with its Q number, and ask it in the next round. Settle only actual answers, then recompute the frontier.

The page is a record, not an input form: answers come only through `ask`.

## Close

An empty frontier means every branch was visited and no decision remains silently assumed. Add the closing summary to the page. Print the page path, then make one `ask` with Shared understanding / Not yet. Only Shared understanding confirms the result and permits the caller to act. Not yet reopens the tree from the user's note. Record the closing answer on the page. A timeout at this gate is no answer: print the path and retry once; a second timeout stops without acting and records why on the page.

When `ask` is unavailable in a headless run, take the recommended answer, record it on the page as headless, then continue. Mark the closing summary as headless, not user-confirmed. A subagent never asks or claims user confirmation: return open decisions for the top-level agent to put through `ask`.

## Next step

Run this step only when the session is the user's own grill: the user started it with `/skill:grill-me` or `/skill:grill-with-docs`. Skip it when another skill, such as wayfinder or improve-codebase-architecture, runs grilling as one of its steps. That skill decides what comes next.

After the user confirms Shared understanding, print the page path, then make one `ask` that recommends the next step. It has two options:

- Implement: build the change now. Recommend it for a change that fits one session.
- Spec first: write a spec with to-spec, split it with to-tickets, then build it with implement-spec. Recommend it for a bigger change.

Set `recommended` to the option that fits the size of the settled change. After the user picks, tell the user what to type: `/skill:implement` for Implement, or `/skill:to-spec` for Spec first, as the first of its three skills. Start none of these skills yourself, because a user-invoked skill never invokes another user-invoked skill. A timed-out answer picks nothing: start nothing and name both commands.
