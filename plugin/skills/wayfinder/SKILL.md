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

Where the map, its child tickets, blocking, and frontier queries physically live is tracker-specific. The issue tracker should have been provided to you. If not, tell the user to run `/skill:setup-vstack`. Consult the tracker doc's "Wayfinding operations" section for how _this_ repo expresses them. If no tracker has been provided, default to the local-markdown tracker.

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

Each ticket carries a `wayfinder:<type>` label, one of `research`, `prototype`, `grilling`, `task` (see [Ticket Types](#ticket-types)).

A session claims a ticket by assigning it to the dev driving the map, first, before any work, so concurrent sessions skip it. That assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Blocking uses the tracker's native dependency relationship: essential because it renders the frontier _visually_ in the tracker's own UI, so the human sees what's takeable without opening the map. Only a tracker that lacks native blocking falls back to a body convention. A ticket is unblocked when every ticket blocking it is closed; the frontier is the open, unblocked, unclaimed children, the edge of the known.

The answer isn't part of the body; it's recorded on resolution (see [Work through the map](#work-through-the-map)). Assets created while resolving a ticket are linked from the issue, not pasted in.

## The Grilling page

A map keeps one Grilling page for all its sessions, and every `ask` of a wayfinder session goes on it. Read skill://grilling-page before the first `ask`. Charting adds one charting Stage and marks it finished when charting stops. Once the map exists, rename the page's flow folder after the map with the page script's `rename` command. The new key is the map's issue number, or its effort name on the local-markdown tracker. If the flow's key is already that key, skip the rename. A later session finds the page in the flow folder whose `flow.json` names the map.

Each ticket is one Stage. A session adds the ticket's Stage when it claims the ticket. The Stage's `title` is the ticket's name, and the ticket's id joins the `flow` record's `tickets`. The skills that resolve the ticket, such as grilling, prototype, or domain-modeling, ask inside that Stage. When the session closes the ticket, mark its Stage finished. Parallel sessions append to the same page, so read the latest `flow` record just before you append it again.

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

### Chart the map

User invokes with a loose idea.

1. Name the destination. Use skill://grilling and skill://domain-modeling to pin down what this map is finding its way to: the spec, decision, or change. The destination fixes the scope, so it's settled first.
2. Map the frontier. Grill again, breadth-first this time: range across the whole space rather than deep on any one thread, surfacing the open decisions and the first steps takeable now. If this surfaces no fog (the way to the destination is already clear, the whole journey small enough for one session), you don't need a map. Stop and use `ask` to choose how to proceed.
3. Create the map (label `wayfinder:map`): Destination and Notes filled in, Decisions-so-far empty, the fog sketched into Not yet specified. Rename the page's flow folder after the map, as [The Grilling page](#the-grilling-page) says.
4. Create the tickets you can specify now as child issues of the map, then wire blocking edges in a second pass (issues need ids before they can reference each other). Wiring sorts them into the frontier and the blocked; everything you can't yet specify stays in the fog: the Not yet specified section.
5. Fire the research runners. Claim each research ticket before work, then use Research runners below to resolve the claimed tickets.
6. Stop: charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (URL or number). A ticket is optional: without one, you pick the next decision, not the user.

1. Load the map: the low-res view, not every ticket body.
2. Choose the ticket. If the user named one, use it. Otherwise take the first frontier ticket in order. Claim it: assign it to the dev driving the map before any work. Add the ticket's Stage to the map's Grilling page.
3. Resolve it. For a research ticket, use Research runners below instead of invoking research's background agent. For other tickets, zoom as needed: fetch the full body of any related or closed ticket on demand; use the skills the `## Notes` block names, each as a `skill://<name>` reference. If in doubt, use skill://grilling and skill://domain-modeling.
4. Record the resolution: post the answer as a resolution comment, close the issue, append a context pointer to the map's Decisions-so-far, and mark the ticket's Stage finished.
5. Add newly-surfaced tickets (create-then-wire); graduate any fog the answer has made specifiable, clearing each graduated patch from Not yet specified so it lives only as its new ticket. If the answer reveals that a ticket (this one or another) sits beyond the destination, rule it out of scope rather than resolving it on the route. If the decision invalidates other parts of the map, update or delete those tickets.

The user may run unblocked tickets in parallel, so expect other sessions to be editing the tracker concurrently.


## Research runners

Only the parent writes to the tracker: it claims tickets, posts resolutions, closes tickets, and updates the map. Runners never write tracker issues or comments and never ask the user; they return open questions for the parent to put on the map's Grilling page and ask. An unanswered question that prevents a cited answer leaves the ticket open.

Resolve the mode and absolute vstack root once using the project's vstack config. Read its tracker and domain docs. Pass that root unchanged to every child; children never resolve the git common dir again. If a child writes Scratch, also resolve and pass the project's Scratch dir through skill://vstack-tmp. Use distinct names for each ticket's findings.

Before either path below, check `task.isolation.enabled`. If it is off, stop and point at `/skill:setup-vstack`.

For two or more claimed research tickets:

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per research ticket. One eval cell: per part, `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`; `wait()` on all handles. Each prompt: the runner brief below, the vstack root. Land each runner's findings from its `patchPath` as below, one ticket at a time. If they cannot start or isolation is off, stop: leave the tickets open and point at `/skill:setup-vstack` when isolation is off.

For one claimed research ticket:

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: the runner brief below, the vstack root. Wait for its result. If it cannot be spawned, stop: leave the ticket open and point at `/skill:setup-vstack` when isolation is off.

### Runner brief

Give the runner the ticket title, URL, Question, map Destination and relevant Notes, mode, findings name, and repo notes convention. It reads skill://research and does its research steps 1–3 itself: investigate primary sources, write one Markdown findings file with citations, and use the repo's existing notes location (or choose a sensible location if none exists). It does not start research's background agent.

In Standard mode, write the findings inside the runner's own isolated clone, not through the vstack root: this branch artifact must travel in the patch, leaving the user's checkout clean (ADR 0007). Commit nothing. In Private mode, write only `<vstack root>/artifacts/<map-slug>/research/<name>.md`; these writes are immediate and outside the patch. Make no application-code changes. Return the file path, a cited answer under 300 words, a one-line gist, and all open questions. Pass the vstack root to any nested child.

### Landing (parent, one ticket at a time)

Read `patchPath` from omp's completion notice, `Isolation: changes captured at … (apply=false). Not applied.`, not from the agent handle or a guessed id-based path. Read the patch before applying it. A completion without a recoverable notice is not an available Standard-mode candidate; leave the ticket open and report the missing patch. Confirm it contains only that runner's findings. No automatic application or merge is allowed.

In Standard mode, read skill://vstack-worktree and create a temporary landing worktree off the default branch: `omp wt add -b research/<name> <base>/vstack-<repo>-research-<name> <default-branch>`. A plain-checkout fallback continues because landing needs only tracked files. In that worktree, apply the reviewed patch with `git apply <patchPath>`, commit the findings, and push the research branch if a remote exists. Remove the worktree with `git worktree remove --force <path>` after landing; keep the research branch while its ticket cites it. Never switch or dirty the user's checkout.

In Private mode, drop the patch. Findings already live under the vstack root; there is no branch or push and the resolution comment carries no asset link.

Post the answer as the resolution comment, linking the findings on `research/<name>` in Standard mode. With no remote, cite the local branch and file path instead. Close the ticket only when its answer resolves the question. Re-read the current map body before appending the gist and ticket link to Decisions so far, preserving concurrent edits. Then graduate newly specifiable fog through the normal create-then-wire steps.
