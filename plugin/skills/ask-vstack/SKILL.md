---
name: ask-vstack
description: Ask which skill or flow fits your situation. A router over the vstack skills.
disable-model-invocation: true
---

# Ask vstack

You do not need to remember every skill. Ask which route fits your situation.

A flow is a path through the skills. Most paths follow the main flow or enter it through an on-ramp. Other skills are standalone or supply vocabulary underneath.

## The main flow: idea → ship

You have an idea and want it built.

1. Use `/skill:grill-with-docs` to sharpen the idea by interview when you work in a working directory. It keeps the domain language in `GLOSSARY.md` and records decisions in ADRs. With no working directory, use `/skill:grill-me` (see Standalone). Both use `/skill:grilling`, but grill-with-docs leaves a paper trail.
2. Can you settle every question in conversation? If a question needs runnable code, detour through a prototype. This includes state, business logic, and a UI that you need to see. A prototype lives in its own directory, so use `/skill:handoff` in both directions (see Phase boundaries):
   - Write `/skill:handoff` out, then open a fresh session against that file.
   - Use `/skill:prototype` to answer the question with throwaway code.
   - Write `/skill:handoff` back with what you learned, and reference it from the original idea thread.

2b. Needs a module design first? Use `/skill:architect` for its sketch, checkpoint, and implement stops.

3. Is this a multi-session build?
   - If yes, use `/skill:to-spec` to turn the thread into a spec. Then use `/skill:to-tickets` to split it into tracer-bullet tickets with blocking edges. A local tracker keeps one file per ticket under `.scratch/<feature>/issues/`, worked blockers-first by hand. A real tracker keeps native blocking links, so take any ticket whose blockers are done. Run `/skill:implement` per ticket, and use `/new` between tickets. Each ticket is self-contained, so the last ticket's context is disposable.
   - If no, run `/skill:implement` here, in the same context window.

Either way, implement asks for the End state (commit, PR opened, merge-ready, or shipped). It drives `/skill:tdd` through one red-green slice at a time. Before committing, it runs `/skill:code-review` for Standards + Spec, plus Safety when the diff touches what outside code depends on (runs blast-radius). Past commit, it chains `/skill:open-pr` → `/skill:babysit` → `/skill:ship` as the End state requires.

Use `/skill:tdd` alone to build a concrete behavior test-first without a full spec. Use `/skill:code-review` alone to review a branch or PR against a fixed point.

### Context hygiene

Keep steps 1–3 in one unbroken context window. Do not compact or start a new session until after `/skill:to-tickets`. The grilling, spec, and tickets need the same thinking. Each implement run then starts fresh from its ticket.

The [smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone) is the window where the model still reasons sharply, about 150k tokens on state-of-the-art models. If you approach it before to-tickets, use `/compact` at the nearest phase boundary and continue (see Phase boundaries).

## On-ramps

Each starting situation generates work that enters the main flow.

- For bugs and requests piling up, use `/skill:triage`. It moves incoming issues through triage roles and produces agent-ready issues for implement. Use it only for issues that you did not create, such as raw bug reports and feature requests. Tickets from to-tickets are already agent-ready. Do not triage them.
- For something broken, use `/skill:diagnosing-bugs`. It handles hard bugs, intermittent flakes, and regressions between two known-good states. It first requires a tight feedback loop (one command that goes red on this bug), then fixes it with a regression test. Its post-mortem points to improve-codebase-architecture when the bug exposes a missing seam.
- For a huge, foggy effort, use `/skill:wayfinder`. It charts a shared map of decision tickets and resolves them one at a time. It produces decisions, not deliverables. Use it for a greenfield project or feature too large to hold in one session, not a well-scoped feature. When the map clears, it hands off at to-spec, which turns the linked decisions into a buildable plan. Then run to-tickets and implement. Go directly to implement only when the effort turns out small.
- For slow behavior, use `/skill:perf-issue`. Measure the slowdown and compare changes against the same workload.
- For a crash dump, trace, profile, or live process to read, use `/skill:forensics`. It reads the evidence and returns a cited diagnosis.

## Understand code

- `/skill:how` explains how X works, including walkthroughs and placement or layering questions.
- `/skill:why` traces rationale and history, with citations and confidence tiers.
- `/skill:explain` gives a walk-through with diagrams.

## Codebase health

These skills maintain the codebase rather than add a feature.

- `/skill:improve-codebase-architecture` finds deepening opportunities that make the codebase easier for agents to operate in. Take a chosen candidate into the main flow at grill-with-docs. It surveys the candidates, while codebase-design supplies the vocabulary for the chosen design.
- `/skill:refactor` carries out architecture findings or code-review findings while preserving behavior.
- `/skill:prune-comments` removes comments that repeat the code and keeps comments that explain why.
- `/skill:hillclimb` pushes a metric through measured attempts against a frozen workload.

## Ship

- `/skill:open-pr` opens the PR with a summary and proof.
- `/skill:babysit` takes an open PR to merge-ready.
- `/skill:ship` merges the PRs into the default branch. It does not deploy or release.
- `/skill:decision-trail` records the decisions and proof. It starts by itself at merge-ready or shipped.
- `/skill:blast-radius` checks what outside code depends on before a change lands.

## App verification

- `/skill:setup-app-verification` creates a project Verify skill once per project.
- `/skill:maintain-app-verification` repairs that skill when a verification step drifts.

## Vocabulary underneath

These two model-invoked references supply vocabulary beneath the other skills. Reach for them directly when words, not the process, are the problem.

- `/skill:domain-modeling` sharpens the project's domain language. It challenges fuzzy terms, resolves overloaded words such as an "account" with three meanings, and records hard-to-reverse decisions as ADRs. Grill-with-docs uses it to keep `GLOSSARY.md` clear.
- `/skill:codebase-design` supplies the deep-module vocabulary (module, interface, depth, seam, adapter, leverage, locality). It designs a module with much behavior behind a small interface at a clean seam. Tdd and improve-codebase-architecture use that vocabulary. Architect is where a chosen design gets built.

## Phase boundaries

A phase is a chunk of work inside a session, such as grilling, implementation, or QA. At the boundary between phases, you have five options:

1. Continue in this session. It costs nothing and loses nothing.
2. Use `/new` when this context no longer matters. It starts a new session. The old session stays resumable through `/resume`.
3. Use `/skill:handoff` to write a portable Markdown file. It is for a new harness, a new directory, a colleague, or a side task forked mid-phase. omp's built-in `/handoff` is not this skill. It summarizes and compacts in place, so it is a variant of option 5, not option 3.
4. Send a tightly scoped task to a subagent's context window and receive its report.
5. Use `/compact` to compress this context in place. It is the default at the bottom of the tree, not the first choice.

Read [PHASE-BOUNDARIES.md](PHASE-BOUNDARIES.md) for the five questions in order and the cost of losing the original session as a source. Decide at a boundary. Mid-phase, continue or split the rest into subagents.

## Standalone

These skills sit outside the main flow.

- `/skill:grill-me` runs the same interview as grill-with-docs, but saves nothing locally and creates no `GLOSSARY.md`. Use it for a plan, design, or piece of writing with no working directory. With a working directory, use grill-with-docs for the same interview and its paper trail.
- `/skill:grilling` is the interview primitive. It runs rounds and tracks the frontier. Facts are the agent's job, and decisions are yours. Grill-me and grill-with-docs are the named ways in. Triage, wayfinder, and improve-codebase-architecture use it internally. Use it directly only for an interview with no wrapper.
- `/skill:resolving-merge-conflicts` works an in-progress merge or rebase hunk by hunk. It traces intent to each side's primary source rather than picking lines, then finishes the operation. It never runs `--abort`.
- `/skill:prototype` builds a small throwaway program to answer a design question about a state model, behavior, or UI. Throwaway constrains how the code is written. It does not promise to destroy it. The answer enters the real code, and the prototype stays as a primary source on a `prototype/<name>` branch from main. The implementation issue points to it. This is the detour in main-flow step 2, but use it whenever a design question needs runnable evidence.
- `/skill:research` delegates reading to a background agent. It reads primary sources and leaves a cited Markdown file. Keep working while it reads. Bring that file into grill-with-docs. Research feeds the thinking rather than replaces it.
- `/skill:to-questionnaire` writes a questionnaire for someone who holds the missing knowledge. It interviews you about the recipient, the gap, and what you need back, then aims the questions at that gap. The answers feed grill-with-docs or to-spec.
- `/skill:wizard` handles steps only a human can take. These include infrastructure provisioning, credentials, CI secrets, unfamiliar dashboards, migrations, and cutovers. It writes an interactive bash script that opens URLs, captures values, and writes `.env` and GitHub secrets. The model invokes it when it reaches a human-only step. If the agent can do the step itself, it must do so.
- `/skill:wait-what` re-pitches a message that did not land, with the missing context in plain English and the `GLOSSARY.md` vocabulary. Use it mid-conversation inside any other skill. Grill-with-docs prevents that gap by agreeing on language early.
- `/skill:teach` teaches a concept across sessions, with the current directory as a stateful workspace.
- `/skill:writing-for-agents` is the reference for documents that agents consume, including skills, AGENTS.md, and documents reached by pointers.
- `/skill:compare-attempts` compares independent attempts at the same task in isolated clones.
- `/skill:session-lessons` reviews this session and proposes lessons to keep.
- `/skill:skill-creator`: create or update a skill, test whether it works, tune its description.
- `/skill:unslop` cuts AI writing patterns.
- `/skill:technical-writing` shapes technical prose for its reader.
- `/skill:vstack-clean` deletes Scratch older than 14 days after a dry-run table and an `ask`.

## Drawing and pages

Use `/skill:diagram-design` for every figure shown to a person, and `/skill:good-css` for the page around it. `/skill:simple-english` writes plain English.

## Fan-out override

Skills that can run subagents in parallel decide at each step. Say *fan out* or *in parallel* to force it; say *no fan-out* or *sequential* to prevent it.

## Precondition

Run `/skill:setup-vstack` before your first engineering flow. It configures the issue tracker, triage labels, and document layout. Custom issue trackers also work. It also points to setup-app-verification.

Skills use `/skill:vstack-fan-out` for the parallel-work decision, `/skill:vstack-worktree` for worktrees, and `/skill:vstack-tmp` to resolve Scratch paths.
