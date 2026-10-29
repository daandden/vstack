# A flow keeps one Grilling page, tabbed by Stage

> [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md) records the Flow page redesign, including Result blocks, server rendering and observation, protected open Flows, and a common authoring contract. It amends the Scratch retention and result-duplication decisions below, and a Flow alias replaces the folder rename. vstack 8.0.0 ships it. The Grilling page folders described here are historical and migrate into Flows.

ADR 0013 gave each grilling session its own Grilling page, named after an issue or a topic slug, and only grilling wrote one. Every other skill asked through a plain `ask`, so the decisions of one flow were spread over the page, the chat, tracker comments, and code-review's chat report. A later Stage often runs days later in a new omp session, and nothing carried the page's path to it. Now one flow keeps one Grilling page across all its Stages, and every `ask` in the flow is a question on that page.

The page, its state file, its `figures/` dir, and `flow.json` sit in one Scratch folder per flow, `<Scratch dir>/grilling/<project>-<key>/`. The key is the issue number, or the topic slug when the flow has no issue yet. When to-spec publishes the spec, it renames the folder after the spec issue with the page script's `rename` command, and `flow.json` keeps the original slug. to-tickets, implement, and implement-spec find the folder from the spec issue, and a ticket finds it through its parent spec. With no spec, implement continues the page only in the same omp session. triage keeps one page per issue or PR. The page opens on an Overview tab and then has one tab per Stage. A Stage tab shows its Background, then its Report blocks, then its rounds of questions. The `ask` call carries only the option labels, because the page carries the descriptions.

We chose the rename because it reuses the issue key that pages already had and keeps local paths off the tracker. We kept the page in Scratch because it stays a record for the user and is not an input to the work. Scratch retention goes from 14 to 90 days, so a flow that pauses for weeks keeps its page. We chose tabs because one long page does not scale to a flow with many Stages.

## Considered Options

- Only grilling writes to the page, and the other asks stay plain `ask`. Approvals, picks, and review findings then stay in the chat.
- Every ask goes on the page, plus a separate stage-result record. Each Stage then writes its result twice: to the chat or the tracker, and to the page. Report blocks show the results that lead to questions instead.
- to-spec writes the page path into the spec body. A local path then lands in a published issue where nobody else can use it, and a flow with no spec has no body to carry it.
- The page path lives only in the chat. The flow then splits whenever Stages run in different sessions, which is common for implement-spec.
- The page lives in the vstack root as an artifact. In Standard mode it lands in the checkout and needs ignoring, and one page type gets a second location rule.
- The page lives beside the feature, in `.scratch/<feature-slug>/` or `<vstack root>/artifacts/<feature-slug>/`. `/vstack-clean` never removes it, but a project tracked in GitHub gets a `.scratch/` folder it does not have today, and someone must delete old folders by hand.
- A durable flow store at `~/.vstack/flows/<repo-key>/<flow-id>/`, with a stable id and an archive step. It needs no rename, but it is a new storage class with its own lookup and archive rules.
- With no spec, implement lists the open flows' `flow.json` files and asks which one to continue, or grilling files a tracker issue to rename the folder to. The first adds an ask at the start of implement when the user names no flow, and the second makes a tracker issue for every small change.
- One page with a section per Stage, Stage tabs with no Overview, or Stage tabs with a side rail of open questions. A section per Stage still makes one long page, tabs alone give no view of the whole flow, and the rail takes width and is empty most of the time.

## Consequences

- This amends the page identity of [ADR 0013](0013-a-script-renders-the-grilling-page-from-a-jsonl-state-file.md): one page per flow in one Scratch folder, renamed at to-spec and tabbed by Stage, in place of one page per grilling session. ADR 0013's other decisions still stand. The script is the only writer of the page, the state file is JSONL, a later line with the same `id` replaces an earlier one, and the script checks every record. A state file with no Stage records renders as one Stage, so older pages stay readable.
- The page script reads every SVG visual again on each render, so figures sit in the folder's `figures/` dir, and a visual stores its path relative to the folder. `rename` refuses, and writes nothing, when another folder already has the target name or when a visual does not resolve after the move. A `rename` to the flow's current key changes nothing and prints the page path (#193).
- `/vstack-clean` removes a flow's folder as one entry.
- grilling's rule that every `ask` option carries a one-line description no longer holds.
- improve-codebase-architecture shows its candidates as a Report block on the flow's page, and its separate HTML report goes away.
- The triage pick of which item to work on stays a plain `ask` and is on no page. Subagents still never ask. They return their questions, and the top-level agent puts them on the page.
- A flow with no spec splits into two pages when implement runs in a new session.
- implement reads one thing from the page: a seam that the user picked through `ask` counts as an agreed test seam, so a grill that settled the seams does not ask them again. A headless answer, an unanswered or timed-out question, a no-test pick, and an expired page leave the seam open, and implement asks again (#183).
