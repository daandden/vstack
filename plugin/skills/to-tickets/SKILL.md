---
name: to-tickets
description: Break a plan, spec, or the current conversation into a set of tracer-bullet tickets, each declaring its blocking edges, published to the configured tracker (edges as text in one file per ticket locally, or native blocking links on a real tracker).
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

Read the project's `issue-tracker.md` and `triage-labels.md` under `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. If they have not been provided and are missing, tell the user to run `/skill:setup-vstack`.

The ticket publisher owns tracker discovery, writes, readback, and readiness. Read [the publication Interface](references/publication.md) before preparing or resuming a batch. Use the configured CLI command rows or the named MCP server and project facts. A missing capability or no-tool configuration leaves a durable blocked publication, not a manual publication path.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

Follow `skill://flow-page`'s "Stage entry/exit line". Discover the source Flow by its `spec:<number-or-feature-slug>` alias.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

Write no `skill://<addon>` pointers in tickets, and drop any inherited from the spec. Build sessions pick Addons fresh.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. When even the batches can't stay green alone, keep the sequence but let them share an integration branch that all block a final integrate-and-verify ticket; green is promised only there.

Before you show the breakdown, check the draft against what the user decided, as skill://to-spec/DRIFT-CHECK.md says. Its source is the spec that this run breaks down, with its comments. Covered in names a ticket, and the table Result goes on the to-tickets Stage. Fix a miss by changing a ticket or adding one.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the close decisions and Assumed picks, the spec, the draft tickets with their blocking edges, and the Checker brief from DRIFT-CHECK.md, the vstack root. Wait for its result. If it cannot be spawned, stop: report the tickets as not published.

Fix the draft and show the coverage table as DRIFT-CHECK.md's "Fix and show" says.

### 4. Quiz the user

Submit the proposed breakdown on the to-tickets Stage as a table Result. Its columns are Ticket, Blocked by, and Size, with one row per ticket:

- Ticket: the ticket's number and short title, then one sentence on the end-to-end behavior that it delivers.
- Blocked by: the numbers of the tickets that must complete first, or "None".
- Size: small, medium, or large.

After the table Result, deliver one complete approval question through flow-page's "Every ask in a Flow" contract with `ask`. Use the options Approve and Change something, with `results` naming every row. Code links the question and rows both ways. Record the raw response with a separate reading where needed. Its description asks these questions:

- Does the granularity feel right? (too coarse / too fine)
- Are the blocking edges correct: does each ticket only depend on tickets that genuinely gate it?
- Should any tickets be merged or split further?

Iterate until the user approves the breakdown with an explicit pick or resolved reading. For each revision, check the revised draft as step 3 says, publish the Result's next revision with `revises`, and ask the approval with `again` naming the earlier question. Keep prior answers and revisions. Timeouts, cancellations, and headless recommendations do not approve publication.

### 5. Publish the tickets to the configured tracker

Save the approved structured description and publish it through `scripts/publish.ts`, as [the publication Interface](references/publication.md) describes. Keep stable local keys, approved bodies and labels, parent membership, directed `blockedBy` edges, tracker facts, and the configured readiness value in that description. Use numbered local keys such as `01-foundation` for local files. In Private mode, save the input, durable record, and local tickets under `<vstack root>/artifacts/<feature-slug>/`. In Standard mode, use `.scratch/<feature-slug>/`.

The publisher creates tickets without readiness, installs the approved graph, reads back fields and relationships, then activates verified tickets. The readiness value comes from the configured canonical-role mapping. Remote trackers use a label. Local tickets use `Status:`. A parent relationship is separate from a blocking edge. Body references explain the work. Only `blockedBy` declares an edge.

Use the receipt's saved identities to link tracker tickets or `<directory>/<key>.md` files. If publication is blocked or interrupted, use `resume` with the same durable record. Report its category and candidate state when reconciliation is ambiguous. Keep approved content unchanged during recovery. The publisher owns activation. Do not create tickets, add relationships, or apply readiness separately.

Work the **frontier**: any ready ticket whose blockers are all done. Verified tickets may be ready while a blocker remains open. The existing frontier still excludes them.

Parent membership is the only authorized parent effect. Keep the parent's content, labels, and open state unchanged.

After publishing, add each `ticket:<id>` alias to the Flow without resending existing aliases. Publish the full ticket bodies as Document Results with their canonical tracker revisions or local file links, and update the breakdown to use named published links. Preserve the blocking graph as Result content: attach a dependency figure when produced, and keep every blocking edge in the table regardless. The Stage tree is navigation, not a dependency graph.

The publisher writes local `Status:` and `Blocked by:` headers before the approved body. It changes `Status: draft` to the configured readiness value after graph readback. Keep these generated fields out of the body template.

<local-ticket-template>

# <NN>: <Ticket title>

**What to build:** the end-to-end behaviour this ticket makes work, from the user's perspective, not a layer-by-layer implementation list.

- [ ] Acceptance criterion 1
- [ ] Acceptance criterion 2

</local-ticket-template>

<issue-template>

## Parent

A reference to the parent issue on the tracker (if the source was an existing issue, otherwise omit this section).

## What to build

The end-to-end behaviour this ticket makes work, from the user's perspective, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- A reference to each blocking ticket, or "None (can start immediately)".

</issue-template>

In either form, avoid specific file paths or code snippets: they go stale fast. Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.
