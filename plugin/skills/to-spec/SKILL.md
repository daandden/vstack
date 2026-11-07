---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

Read the project's `issue-tracker.md` and `triage-labels.md` under `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. If either is missing, tell the user to run `/skill:setup-vstack`.

For an MCP tracker such as Jira, read the named server's current tool list, descriptions, and parameter schemas. Select search, full issue and comment reads, creation, and label operations by what they do, using the recorded project, issue type, and mapped label facts. Do not require operation rows or guess tool names or parameters. If discovery or a required operation is unavailable, report that gap and leave publication undone. Keep configured CLI and local-markdown workflows.

## Process

Follow `skill://flow-page`'s "Stage entry/exit line". Discover the source Flow by `ticket:<source issue>` when known.

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

Read the source Flow's Results and decision provenance, including any Architecture brief, alongside the conversation, source issue and comments, and applicable canonical glossary terms and ADRs. Use the existing agreement rather than starting another architecture interview. A source that already settles the design needs no new Architecture brief, assessment document, or compulsory diagram.

Before dependent synthesis, investigate missing repository facts and distinguish them from an unsettled choice. If proceeding would commit to a new consequential structure, shared contract, or quality trade-off, follow "Consequential gaps" below. Arranging agreed material is not a new fork.

2. Pick and record test seams by skill://tdd's "Seams: where tests go" rule. Carry those records into the spec's Testing decisions.

When the change spans more than one module, draft a capability map before writing the spec, so that you weigh the module split before the spec fixes it. Use skill://codebase-design's vocabulary. Publish the map as a table Result with the columns Module, Responsibility, Depends on, and Build order, one row per module. Depends on gives the dependency direction: the modules that this module uses. A change inside one module gets no map.

Combine any question required by tdd's seam rule with any real map fork: two module splits that differ in a way the user would care about. Put those questions together in one round through `ask` under skill://flow-page's "Every ask in a Flow" contract, or plain `ask` outside a Flow. Name each map fork's rows in the question's `results`; code makes the reciprocal links. A map with no fork adds no question. Carry tdd's resulting seam record into Testing decisions.

Keep map confirmations within the agreed architecture. If a map fork would change an agreed responsibility or guarantee, treat it as a consequential gap rather than using this round to choose a new architecture.

3. Write the spec draft using the template below.

Write no `skill://<addon>` pointers in the spec, and drop any inherited from source context. Build sessions pick Addons fresh.

Make the canonical spec self-contained. In Implementation Decisions, synthesize the agreed responsibilities, interactions, observable guarantees, constraints, accepted trade-offs, rationale, and important rejected alternatives. Include the necessary architecture visuals in the canonical tracker body or local spec, using its supported format and `skill://vstack-figures` for rendering. A link to a Scratch Flow Result or captured source alone is not the handoff. Keep source links for provenance, not as a substitute for the agreement.

Link the applicable canonical glossary terms and qualifying ADRs without duplicating their explanations or requiring another canonical design document. Keep signatures, local types, private decomposition, ordinary algorithms, and file layout implementation-owned within the agreed semantics.

Before you publish, check the draft against what the user decided, as skill://to-spec/DRIFT-CHECK.md says. Its source is the issue that this run starts from, with its comments, or none. Include the agreed architecture and necessary visuals from the source Results and applicable domain records in the checker's inputs. Preserve each decision's provenance, explicit assumptions, and unresolved or non-confirmed answers. Covered in names a spec section, and the table Result goes on the to-spec Stage.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the close decisions and Assumed picks with their provenance, the source issue, the agreed architecture Results and applicable domain records, the spec draft, and the Checker brief from DRIFT-CHECK.md, the vstack root. Wait for its result. If it cannot be spawned, stop: report the spec draft as not published.

Fix the draft and show the coverage table as DRIFT-CHECK.md's "Fix and show" says.

Recheck any discovered consequential gap before publication. A drift-check conflict that requires changing the architecture follows "Consequential gaps" rather than becoming a new design interview here.

Then publish the spec to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

Publish the full spec as a Document Result, with `canonical: { tracker, revision }` naming the published issue and its observed revision, or `{ file }` for a local-markdown spec. If publication fails, put the full draft and observed failure on the Stage as a Document Result, explicitly not published. After successful publication, add `alias spec:<original-number-or-tracker-key>` to the existing Flow, or the feature slug for a local spec. Keep the original tracker spelling and underscores. Also add `ticket:<source issue>` when applicable. Identity and the live URL stay unchanged, so no folder rename is required. The tracker or local file remains canonical.

## Consequential gaps

Expose the evidence, the missing choice, why dependent work needs it, and which synthesis is affected on the current to-spec Stage. Keep settled decisions intact and distinguish them from the gap. Preserve a useful partial draft as explicitly not published, with the affected decision open rather than a recommended design presented as agreement.

Pause affected synthesis and publish no canonical spec that commits to the unresolved choice. A recommendation, Assumed pick, timeout, cancellation, headless selection, or close cannot supply missing architecture consent. Return the missing choice for user-invoked `/skill:grill-with-docs`, then stop. Do not invoke that skill or another Matt skill automatically. Resume synthesis from the resulting agreement when the user invokes `/skill:to-spec` again.

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
