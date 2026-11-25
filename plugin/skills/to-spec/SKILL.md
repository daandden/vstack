---
name: to-spec
description: "Synthesize the current conversation into a published spec, asking only about consequential gaps."
disable-model-invocation: true
---

Synthesize the current conversation and codebase understanding into a spec. Reuse the existing agreement without an interview, except for new consequential gaps handled below.

Read the project's `issue-tracker.md` and `triage-labels.md` under `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. If either is missing, tell the user to run `/skill:setup-vstack`.

For an MCP tracker such as Jira, read the named server's current tool list, descriptions, and parameter schemas. Select search, full issue and comment reads, creation, and label operations by what they do, using the recorded project, issue type, and mapped label facts. Do not require operation rows or guess tool names or parameters. If discovery or a required operation is unavailable, report that gap and leave publication undone. Keep configured CLI and local-markdown workflows.

## Process

Follow `skill://flow-page`'s "Stage entry/exit line". Discover the source Flow by `ticket:<source issue>` when known.

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

Read the source Flow's Results and decision provenance, including any Architecture brief, alongside the conversation, source issue and comments, and applicable canonical glossary terms and ADRs. Use the existing agreement rather than starting another architecture interview. A source that already settles the design needs no new Architecture brief, assessment document, or compulsory diagram.

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before treating a gap as a question. Recover missing facts and omitted decisions from the sources. Arranging agreed material is not a new choice. Use "Consequential gaps" only if dependent synthesis would commit to an unresolved consequential structure, shared contract, or quality trade-off.

2. Pick and record test seams by skill://tdd's "Seams: where tests go" rule. Carry those records into the spec's Testing decisions.

When the change spans more than one module, draft a capability map before writing the spec, so that you weigh the module split before the spec fixes it. Use skill://codebase-design's vocabulary. Publish the map as a table Result with the columns Module, Responsibility, Depends on, and Build order, one row per module. Depends on gives the dependency direction: the modules that this module uses. A change inside one module gets no map.

Apply the shared test to any real capability-map fork. Combine only the choices that still need an answer with any approval required by tdd's seam rule. Deliver that round through `ask` under skill://flow-page's "Every ask in a Flow" contract, or plain `ask` outside a Flow. Name each fork's rows in the question's `results`; code makes the reciprocal links. Carry tdd's resulting seam record into Testing decisions.

Keep map confirmations within the agreed architecture. If a map fork would change an agreed responsibility or guarantee, treat it as a consequential gap rather than using this round to choose a new architecture.

3. Write the spec draft using the template below.

Write no `skill://<addon>` pointers in the spec, and drop any inherited from source context. Build sessions pick Addons fresh.

Make the canonical spec self-contained. In Implementation Decisions, synthesize the agreed responsibilities, interactions, observable guarantees, constraints, accepted trade-offs, rationale, and important rejected alternatives. Include the necessary architecture visuals in the canonical tracker body or local spec, using its supported format and `skill://vstack-figures` for rendering. A link to a Scratch Flow Result or captured source alone is not the handoff. Keep source links for provenance, not as a substitute for the agreement.

Link the applicable canonical glossary terms and qualifying ADRs without duplicating their explanations or requiring another canonical design document. Keep signatures, local types, private decomposition, ordinary algorithms, and file layout implementation-owned within the agreed semantics.

Before you publish, check the draft against what the user decided, as skill://to-spec/DRIFT-CHECK.md says. Its source is the issue that this run starts from, with its comments, or none. Include the agreed architecture and necessary visuals from the source Results and applicable domain records in the checker's inputs. Preserve each decision's provenance, explicit assumptions, and unresolved or non-confirmed answers. Covered in names a spec section, and the table Result goes on the to-spec Stage.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the close decisions and Assumed picks with their provenance, the source issue, the agreed architecture Results and applicable domain records, the spec draft, and the Checker brief from DRIFT-CHECK.md, the vstack root. Wait for its result. If it cannot be spawned, stop: report the spec draft as not published.

Fix the draft and show the coverage table as DRIFT-CHECK.md's "Fix and show" says.

Recheck the corrected draft before publication. Route only a consequential architecture gap that survives the drift check to "Consequential gaps".

Then publish the spec to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

Publish the full spec as a Document Result, with `canonical: { tracker, revision }` naming the published issue and its observed revision, or `{ file }` for a local-markdown spec. If publication fails, put the full draft and observed failure on the Stage as a Document Result, explicitly not published. After successful publication, add `alias spec:<original-number-or-tracker-key>` to the existing Flow, or the feature slug for a local spec. Keep the original tracker spelling and underscores. Also add `ticket:<source issue>` when applicable. Identity and the live URL stay unchanged, so no folder rename is required. The tracker or local file remains canonical.

After successful publication, finish the to-spec Stage and end the run. Reply with the published spec and a brief outcome. Name no next Matt skill and start none.

## Consequential gaps

For a consequential architecture gap that survives the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md), show the evidence, the missing choice, why dependent work needs it, and which synthesis is affected. In a Flow, publish this context on the current to-spec Stage. Keep settled decisions intact. Preserve a useful partial draft as explicitly not published, with the affected decision open rather than a recommendation presented as agreement.

Pause affected synthesis and publish no canonical spec that commits to the unresolved choice. A recommendation, Assumed pick, timeout, cancellation, empty response, headless selection, or close cannot supply missing architecture consent.

1. In a Flow, save the running to-spec Stage and its binding. Open `--skill grill-with-docs --flow <flow> --parent <to-spec-stage>` on the same Flow. This is the nested grill's Stage entry, not an extra Stage before its run. Use the receipt's Flow and Stage ids for its contributions and asks. Outside a Flow, keep the nested grill in chat.
2. Read `skill://grill-with-docs` and run it inline for the gap. Carry the settled agreement, decision provenance, vstack root, and Scratch dir. Present the gap's evidence and affected synthesis. Keep the grill's required architecture agreement even when one shape is viable. Deliver questions through flow-page's "Every ask in a Flow" contract when enrolled, or plain `ask` in chat. Preserve raw answers and separate readings. Wait while an answer is pending.
3. Once explicit answers settle the architecture gap, record the nested grill's agreement and summary close. In a Flow, finish its Stage and restore the saved binding with `bind --flow <flow> --stage <to-spec-stage>`. Resume this to-spec run from those answers. Keep the drift check before publication.

If evidence or an answer remains unavailable, keep the affected draft explicitly not published and report the actual blocker. In a Flow, leave recoverable Stages in progress and restore the to-spec binding on return. Resume the existing runs when the blocker clears.

## Spec template

<spec-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

Exception: if a prototype produced a snippet that encodes a decision more precisely than prose can (state machine, reducer, schema, type shape), inline it within the relevant decision and note briefly that it came from a prototype. Trim to the decision-rich parts, not a working demo, just the important bits.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Seam picks and proof gaps recorded under skill://tdd's seam rule
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
