---
name: to-spec
description: "Turn the current conversation into a spec and publish it to the project issue tracker: no interview, just synthesis of what you've already discussed."
disable-model-invocation: true
---

This skill takes the current conversation context and codebase understanding and produces a spec. Do NOT interview the user; just synthesize what you already know.

The issue tracker and triage label vocabulary should have been provided to you. If not, tell the user to run `/skill:setup-vstack`.

## Process

1. Explore the repo to understand the current state of the codebase, if you haven't already. Use the project's domain glossary vocabulary throughout the spec, and respect any ADRs in the area you're touching.

2. Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.

Confirm with one `ask` that these seams match the user's expectations. This `ask` is a question on the flow's Grilling page, as `skill://grilling-page` says. Before it, find the page as grilling-page's "Find or start the page" says. The issue that this run starts from counts as this skill's issue. So if an earlier Stage, such as triage, keyed the page by that issue, continue that page. Then add a to-spec Stage.

When the change spans more than one module, draft a capability map before that `ask`, so that you weigh the module split before the spec fixes it. Use `skill://codebase-design`'s vocabulary. Append the map to the to-spec Stage as a table Report block, as grilling-page says, with the columns Module, Responsibility, Depends on, and Build order, one row per module. Depends on gives the dependency direction: the modules that this module uses. A change inside one module gets no map.

Ask about the map only at a real fork: two module splits that differ in a way the user would care about. Add each fork as a question in the same `ask` as the seams, and link it with its map rows both ways, so that to-spec still asks one round. A map with no fork adds no question.

3. Write the spec using the template below, then publish it to the project issue tracker. Apply the `ready-for-agent` triage label - no need for additional triage.

Write a `skill://<addon>` pointer in the spec for each Addon that the session loaded, from the hidden Addon message or a `skill://` read by a running skill.

After you publish, key the flow's page by the spec. Append the page's `flow` record again with `spec` set to the spec issue number, or to the feature slug of a local-markdown spec. Then run the page script's `rename` with that value as the new key, and print the page path that it prints. Later Stages find the page from the spec issue. End the to-spec Stage as grilling-page's "Add a Stage" says.

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
- Prior art for the tests (i.e. similar types of tests in the codebase)

## Out of Scope

A description of the things that are out of scope for this spec.

## Further Notes

Any further notes about the feature.

</spec-template>
