---
name: wayfinder
description: Plan a huge chunk of work (more than one agent session can hold) as a shared map of decision tickets on your issue tracker, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

A loose idea has arrived, too big for one agent session, and wrapped in fog: the way from here to the destination isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a shared map on the repo's issue tracker, then works its decision tickets (questions whose resolution is a decision, not slices of a build to execute) one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting: it shapes every ticket. It might be a spec to hand off and iterate on, a decision to lock before planning starts, or a change made in place like a data-structure migration. The map is domain-agnostic: engineering work, course content, whatever fits the shape.

## Plan, don't do

Wayfinder is planning by default: each ticket resolves a decision, and the map is done when the way is clear, with nothing left to decide before someone goes and does the thing. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its Notes, carrying execution into the map itself, but absent that, produce decisions, not deliverables.

## Refer by name

Every map and ticket is an issue, so it has a name: its title. In everything the human reads (narration, the map's Decisions-so-far), refer to it by that name, never by a bare id, number, or slug. A wall of `#42, #43, #44` is illegible; names read at a glance. The id and URL don't vanish; a name wraps its link, but they ride _inside_ the name, never stand in for it.

## The Map

The map is a single issue on this repo's issue tracker, labelled `wayfinder:map`, the canonical artifact. Its tickets are child issues of the map.

The map is an index, not a store. It lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place, its ticket, so the map never restates it, only gists it and links.

Where the map, child tickets, blocking, and frontier queries live is tracker-specific. Read `issue-tracker.md` under `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. If no tracker is configured, tell the user to run `/skill:setup-vstack` and use the local-markdown tracker. Keep configured CLI workflows.

For an MCP tracker such as Jira, read the server's current tool list, descriptions, and parameter schemas. Select map and child-ticket creation, assignment, full reads, comments, blocking links, and close transition from their actual capabilities and recorded project, issue type, labels, link type, and direction. No per-operation rows or guessed names are required. If discovery or a required operation fails, report the missing capability and leave that operation undone.

Use the recorded blocking link type and direction to find blockers. The frontier contains only open, unclaimed children whose blockers are closed. Parent-child membership alone is not a blocker edge. Closing uses the recorded transition, not a guessed status.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are not listed: they are open child issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like: the spec, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- the index: one line per closed ticket, enough to judge relevance, then zoom the link for the detail the ticket holds -->

- [<closed ticket title>](link): <one-line gist of the answer>

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a child issue of the map; the tracker's issue id is its identity. Its body is the question, sized to one 100K token agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)). Maps and their tickets carry only `wayfinder:` labels, never implementation triage labels such as `ready-for-agent`.

A session claims a ticket by assigning it to the dev driving the map, first, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Blocking uses the tracker's native dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is unblocked when every ticket blocking it is closed; the frontier is the open, unblocked, unclaimed children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## The Flow page

A map keeps one Flow page across sessions. Follow `skill://flow-page`'s "Stage entry/exit line" for charting and each claimed ticket. Discover the map by `ticket:<original map id>` in a later session. After creating the canonical map, add that alias with the original key and underscores. Tracker lookup is case-insensitive without conflating underscores and hyphens. Identity and URLs stay stable without renaming a folder.

Each ticket run supplies its ticket id to the central Stage protocol and puts the ticket's name in its Background. Nested result-producing grilling, prototype, and domain-modeling runs follow the same protocol. Interviewing or reference helpers contribute to their producer without an independent run. Never rewrite shared Flow records.

Put every ordinary user question through `ask` on the owning Stage, following `skill://flow-page`'s "Every ask in a Flow", including Flow CLI publication and separate answer recording.

Publish the map's destination, notes, frontier, decisions, fog, and out-of-scope boundaries as Document and table Results, with named tracker links and observed canonical revisions. Preserve the dependency graph as separate Result content: a table lists every ticket and its blockers, and a captured dependency figure shows the graph when produced. The Stage tree describes continuation, never blocking order. Before finishing charting or a ticket Stage, publish its actual resolution, evidence, outstanding questions, and canonical tracker or findings links. Record raw ask responses and separate readings. A headless recommendation, timeout, or cancellation cannot resolve a HITL ticket or authorize tracker writes.

Publish structured graph data alongside those dependency Results with a `wayfinder` contribution. Read `skill://flow-page/references/contributions.md` for its fields. Include every charted ticket's tracker id, full title, tracker reference in `url`, blocker ids, and current map state. For a remote tracker, use its absolute HTTP or HTTPS link. For the Local Markdown tracker, use the ticket's `.md` file path, such as `.scratch/<effort>/issues/01-storage.md`, or its absolute path under the vstack root in Private mode. Local paths appear as selectable text in the Map panel, not links. Use `resolved`, `frontier`, `blocked`, `claimed`, or `out-of-scope`. Determine those states from the tracker and the map's scope decisions, not from a captured figure. Preserve blocker edges to resolved and out-of-scope tickets. A parent-child relationship alone is not a blocker.

Each contribution is a complete snapshot, including an empty ticket list when only fog remains. Publish after charting, after claiming a ticket, and after refreshing the map at the end of each ticket Stage, including research tickets. Read the tracker again before the final snapshot so another session's claims and resolutions appear. The Map panel uses the latest snapshot; earlier snapshots retain their Stage and revision. The dependency table and figure remain separate Results.

## Ticket Types

Every ticket is either HITL (human in the loop, worked _with_ a human who speaks for themselves) or AFK, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- Research (AFK): Reading documentation, third-party APIs, or local resources like knowledge bases to surface a fact a decision waits on. Resolved by a research runner (see Research runners). Use when knowledge outside the current working directory is required.
- Prototype (HITL): Raise the fidelity of the discussion by making a cheap, rough, concrete artifact to react to (an outline, a rough take, a stub, or UI/logic code) through skill://prototype. Links the prototype as an asset. Use when "how should it look" or "how should it behave" is the key question.
- Grilling (HITL): Conversation. The default case. Always use skill://grilling and skill://domain-modeling.
- Task (HITL or AFK): Manual work that must happen before a _decision_ can be made: nothing to decide, prototype, or research, but the discussion is blocked until it's done. Signing up for a service so its API can be judged, provisioning access, moving data so its shape can be seen. This is the one type that _does_ rather than decides, and it earns its place by unblocking a decision, not by delivering the destination. The agent drives it alone where it can (AFK); otherwise it hands the human a precise checklist (HITL). Resolved when the work is done; the answer records what was done and any resulting facts (credentials location, new URLs, row counts) later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the fog of war: the dim view of decisions and investigations you can tell are coming but can't yet pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets, one at a time, until the way to the destination is clear and no tickets remain.

The map's Not yet specified section is where that dim view is written down: the suspected question, the area to revisit later. It's the undiscovered frontier _toward_ the destination: everything here is in scope, just not sharp enough to ticket. Write as loosely or as fully as the view allows; it doubles as a signpost for collaborators reading where the effort is headed.

Fog or ticket? The test is whether you can state the question precisely now, _not_ whether you can answer it now.

- Ticket when the question is already sharp, even if it's blocked and you can't act on it yet.
- Not yet specified when you can't yet phrase it that sharply. Don't pre-slice the fog into ticket-sized pieces: it's coarser than a ticket, and one patch may graduate into several tickets, or none, once the frontier reaches it.

Not yet specified excludes what's already decided (Decisions so far), what's already a live ticket, and what's out of scope (the next section).

## Out of scope

Fog only ever gathers _toward_ the destination. The destination fixes the scope, so work beyond it is out of scope: it isn't fog, and it doesn't belong in Not yet specified. It gets its own Out of scope section on the map: work you've consciously ruled out of _this_ effort. Scope, not sharpness, lands it here.

Out-of-scope work never graduates (the frontier stops at the destination), so it returns only if the destination is redrawn, and then as a fresh effort, not a resumption.

Ruling something out of scope is a scoping act, not a step on the route. When a ticket that already exists turns out to sit past the destination (mis-scoped in while charting, or exposed by a resolution), close it (a closed ticket is unambiguously off the frontier) and leave one line in the Out of scope section: the gist plus why it's out of scope, linking the closed ticket. It stays out of Decisions so far, which records the route actually walked; a scope boundary isn't a step on it.

## Invocation

Two modes. Either way, never resolve more than one ticket per session, with the exception of research tickets.

### Before creating issues

Check each proposed creation batch before creating any of its issues. The initial map and its chartable child tickets are one proposal. Later batches include newly surfaced tickets in their current map context. Read [the Wayfinder drift check](references/drift-check.md) and skill://to-spec/DRIFT-CHECK.md for the inputs, coverage, map checks, and fix-and-show procedure.

Start a checker only when [the review history](references/drift-check.md#fix-recheck-and-record) calls for a new review attempt. Use the owning session's configured `task` tool for that attempt and any permitted infrastructure retry. If `task` is unavailable, do not launch another omp process, use another agent's binding, or review the batch yourself.

For an eligible new attempt:

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): independently review the proposed issues and blockers using both references' checker briefs, the applicable user decisions and visible assumptions with their provenance, source requirements when present, the current map and relevant ticket and resolution evidence, the vstack root. Wait for its result. If it cannot be spawned, stop: leave the affected issues uncreated and [record the pending creation batch](references/drift-check.md#record-a-pending-creation-batch).

The checker is read-only and returns findings and open questions. The parent owns tracker writes and user asks. Research runners do not substitute for this review. [Record the review and recheck corrections](references/drift-check.md#fix-recheck-and-record) with the same checker. If the review passes, [verify the batch immediately before the first create](references/drift-check.md#verify-immediately-before-the-first-create). If creation remains blocked, record the actual outcome on the owning Stage.

This gate does not trigger for edits of existing issues, resolution comments, closing, claims, or pure Flow snapshots. Include proposed existing-map updates as context when they are needed to evaluate new issues, not as a separate trigger.

### Chart the map

User invokes with a loose idea or resumes an earlier chart.

1. Before interviewing, [look for a saved chart](references/drift-check.md#match-a-chart). Resume a matching pending chart on its existing Stage and skip to step 4. A completed chart returns its saved outcome. A held or ambiguous chart stops here. For new charting, use skill://grilling and skill://domain-modeling to name the destination: the spec, decision, or change this map is for. The destination fixes the scope.
2. Map the frontier. Grill again, breadth-first this time: range across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. If this surfaces no fog (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map. Stop charting and use `ask` on the charting Stage to choose how to proceed.
3. Draft the map and every ticket you can specify now, including their intended blocking relationships. Fill Destination and Notes, leave Decisions-so-far empty, and sketch the remaining fog into Not yet specified.
4. Run [Before creating issues](#before-creating-issues) on the whole proposal, including on resumption. After the check passes, create the map with the `wayfinder:map` label. Add the map's alias and publish its Result as [The Flow page](#the-flow-page) says.
5. Create the checked tickets as child issues of the map, then wire blocking edges in a second pass. Write cross-references in that pass with the real issue ids. A placeholder such as `#<n>` can auto-link to an unrelated issue. Wiring sorts tickets into the frontier and the blocked; everything you cannot specify stays in Not yet specified.
6. Fire the research runners. Claim each research ticket and open its own Wayfinder ticket Stage before work. Use [Research runners](#research-runners) to resolve the claimed tickets.
7. Publish the charted map and dependency Results. [Record the batch outcome](references/drift-check.md#complete-a-saved-batch) when finishing the charting Stage. Charting hand-resolves no tickets.

### Work through the map

User invokes with a map (URL or number) and an optional ticket.

1. Load the map: the low-res view, not every ticket body.
2. Before selecting from the frontier, [look for a saved creation batch](references/drift-check.md#match-a-ticket-batch) on the map's Flow. Resume a matching pending batch on its existing Stage and go straight to [Finish the ticket](#finish-the-ticket). For an explicit resumption of a completed batch, return its saved outcome. A held or ambiguous batch stops here. For new work, use the named open ticket or take the first frontier ticket in order. Claim it by assigning it to the dev driving the map before any work. Open its ticket-specific Stage on the map's Flow page.
3. Read the ticket's `wayfinder:<type>` label and work it as that type. The body alone does not establish the type. For a research ticket, [Research runners](#research-runners) handles resolution and finishing in place of the remaining steps here. For other tickets, zoom as needed: fetch the full body of any related or closed ticket on demand; use the skills the `## Notes` block names, each as a `skill://<name>` reference. If in doubt, use skill://grilling and skill://domain-modeling.
4. A HITL ticket requires live answers to its questions. A headless or unanswered HITL grill writes nothing. Preserve unanswered questions with explicit retirement reasons rather than claiming a decision. If a ticket sits beyond the Destination, follow [Out of scope](#out-of-scope) instead of recording it as a decision. Otherwise, once the source ticket is resolved, post the answer as a resolution comment, close the issue, and append a context pointer to Decisions so far in the same run as the grill's close, without a next-prompt confirmation. Apply edits to existing issues that the decision requires outside the creation check. Publish the resolution or scope ruling and its evidence on the ticket's Stage with canonical links.
5. [Finish the ticket](#finish-the-ticket) on its Stage.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.

### Finish the ticket

1. After recording the source resolution or scope ruling, draft newly surfaced tickets, their blockers, and the changes to Not yet specified. On resumption, use the saved proposal and refreshed context instead. If there are new issues, run [Before creating issues](#before-creating-issues). Only after the check passes, create the checked tickets and then wire their blockers.
2. Clear each graduated patch from Not yet specified after its ticket exists. Preserve concurrent edits to the map. Publish the refreshed map and dependency Results and graph snapshot on this ticket Stage, preserving earlier snapshots. [Record the batch outcome](references/drift-check.md#complete-a-saved-batch) when finishing the Stage.

## Research runners

Only the parent writes to the tracker: it claims tickets, posts resolutions, closes tickets, and updates the map. Runners never write tracker issues or comments and never ask the user; they return open questions for the parent to put through `ask` on the ticket's Stage. An unanswered question that prevents a cited answer leaves the ticket open. The parent records each runner's result on that ticket's Stage, not the parent's last active Stage.

Resolve the mode and absolute vstack root once using the project's vstack config. Read its tracker and domain docs. Pass that root unchanged to every child; children never resolve the git common dir again. If a child writes Scratch, also resolve and pass the project's Scratch dir through skill://vstack-tmp. Use distinct names for each ticket's findings.

Before either path below, check `task.isolation.enabled`. If it is off, stop and point at `/skill:setup-vstack`.

Track every research runner through skill://vstack-fan-out/WORKER-LIFECYCLE.md. Retain it while a question, landing conflict, or follow-up needs its clone. After findings land in Standard mode, or their external Private-mode files are confirmed, preserve the cited answer, questions, patch, and evidence and release the unneeded settled runner. Reconcile all started runners before every return, including partial starts, missing notices, invalid patches, unanswered questions, and landing failures. Preserve useful unapplied findings before release. Record retention reasons or observed release outcomes. Temporary landing-worktree removal below is separate from runner release.

For two or more claimed research tickets:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per research ticket. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the runner brief below, the vstack root. Land each runner's findings from its `patchPath` as below, one ticket at a time. If they cannot start or isolation is off, stop: leave the tickets open and point at `/skill:setup-vstack` when isolation is off.

For one claimed research ticket:

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: the runner brief below, the vstack root. Wait for its result. If it cannot be spawned, stop: leave the ticket open and point at `/skill:setup-vstack` when isolation is off.

### Runner brief

Give the runner the ticket title, URL, Question, map Destination and relevant Notes, mode, findings name, and repo notes convention. It reads skill://research and does its research steps 1–3 itself: investigate primary sources, write one Markdown findings file with citations, and use the repo's existing notes location (or choose a sensible location if none exists). It does not start research's background agent.

Every runner starts with a fresh context window containing its brief and relevant context pointers.

In Standard mode, write the findings inside the runner's own isolated clone, not through the vstack root: this branch artifact must travel in the patch, leaving the user's checkout clean (ADR 0007). Commit nothing. In Private mode, write only `<vstack root>/artifacts/<map-slug>/research/<name>.md`; these writes are immediate and outside the patch. Make no application-code changes. Return the file path, a cited answer under 300 words, a one-line gist, and all open questions. Pass the vstack root to any nested child.

### Landing (parent, one ticket at a time)

Read `patchPath` from omp's completion notice, `Isolation: changes captured at … (apply=false). Not applied.`, not from the agent handle or a guessed id-based path. Read the patch before applying it. A completion without a recoverable notice is not an available Standard-mode candidate; leave the ticket open and report the missing patch. Confirm it contains only that runner's findings. No automatic application or merge is allowed.

In Standard mode, read skill://vstack-worktree. Require `research/<name>` not to exist in the Shared checkout; stop on a branch collision. Open a detached landing checkout at the default branch with `bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" open --repo <Shared-checkout> --purpose research-<name> --commit <default-branch> --record <absolute-Scratch-record.json>`. Use the returned `path`. Report any fallback and its reason. A plain-checkout fallback continues because landing needs only tracked files.

In that checkout, create `research/<name>` with `git checkout -b research/<name>`, apply the reviewed patch with `git apply <patchPath>`, and commit the findings. Export the branch and its objects to the Shared checkout with `git push <Shared-checkout> HEAD:refs/heads/research/<name>`. This updates only the branch, not the Shared checkout's working tree or index, and also works when the fallback already shares that branch. From the Shared checkout, push `research/<name>` to the configured remote if one exists. A failed export or push leaves the ticket open; do not choose another checkout backend.

Open no PR for a research branch. It records throwaway research and is never merged.

Once the checkout record exists, remove the landing checkout on every exit, including a patch conflict, commit failure, export failure, or push failure: `bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" remove --record <absolute-Scratch-record.json>`. Before removal, preserve any findings or commit that has not reached the Shared checkout outside the landing checkout. Report a removal failure and keep its record. This detached open created no source branch, so removal keeps `research/<name>` while its ticket cites it. Never switch or dirty the user's checkout.

In Private mode, drop the patch. Findings already live under the vstack root; there is no branch or push and the resolution comment carries no asset link.

Post the answer as the resolution comment, linking the findings on `research/<name>` in Standard mode. With no remote, cite the local branch and file path instead. Close the ticket only when its answer resolves the question. Re-read the current map body before appending the gist and ticket link to Decisions so far, preserving concurrent edits. Publish the resolution and evidence on that research ticket's Wayfinder Stage, then use [Finish the ticket](#finish-the-ticket) on the same Stage. If creation is blocked, preserve the pending batch there, not on the caller's Stage. A resumption starts at the shared finishing steps, not at research landing.
