# Prototype: how pstack principles reach the agent

Throwaway asset for "Decide how pstack principles are delivered" (#33). Both options below are rendered from the 23 principles at the Enhancement upstream Pin `12d587df`.

## Option A: hidden principle skills + one index rule

Every `principle-<name>` skill keeps `disable-model-invocation: true`, so omp drops it from the system prompt's skill list. The only thing in the prompt is this always-apply rule, written by vstack. The trigger wording below is a draft to react to: tightening triggers, such as build-the-lever's "any non-trivial work", is the kind of tuning this option allows.

About 3454 characters, roughly 863 tokens.

```markdown
---
name: vstack-principles
alwaysApply: true
---
# Principles

When a trigger below matches the work in front of you, read the linked principle before acting.

- Two fixes sharing one premise failed the same gate → question the premise before a third fix. `skill://principle-attack-the-premise`
- Wiring validation, error handling, or adapters → guard at system boundaries; trust internal types. `skill://principle-boundary-discipline`
- Repetitive or hard-to-verify work → build a rerunnable script, codemod, or check instead of hand edits. `skill://principle-build-the-lever`
- Writing the same instruction twice or seeing a recurring correction → encode it as a check, lint, or script. `skill://principle-encode-lessons-in-structure`
- Novel interaction or architecture with no precedent → compare 2–3 competing prototypes first. `skill://principle-exhaust-the-design-space`
- Product, UX, or scope trade-off → choose user delight over implementation convenience. `skill://principle-experience-first`
- Debugging → reproduce, trace to the root cause, fix there; no symptom guards. `skill://principle-fix-root-causes`
- Before writing logic → pick core types, data structures, and ownership first; scaffold before features. `skill://principle-foundational-thinking`
- Large outputs, long files, repeated reads → route bulk to subagents; keep summaries here. `skill://principle-guard-the-context-window`
- Sizing a diff or tempted to add a layer, abstraction, or threaded signal → delete first; ship the smallest change that works. `skill://principle-laziness-protocol`
- Command, lifecycle step, or loop that can crash or retry → converge to the same end state. `skill://principle-make-operations-idempotent`
- Replacing an internal API → migrate every caller and delete the old API in one wave. `skill://principle-migrate-callers-then-delete-legacy-apis`
- Code is hard to trace → count layers and hidden state; collapse one-caller wrappers. `skill://principle-minimize-reader-load`
- Stateful logic, heavy branching, or a shape assumption repeated across files → encode it in one structure. `skill://principle-model-the-domain`
- Tempted to ask "should I?" on reversible work → proceed and report; confirm only irreversible actions. `skill://principle-never-block-on-the-human`
- Planned rewrite or phased migration → converge on the target; no throwaway compatibility states. `skill://principle-outcome-oriented-execution`
- About to declare done → exercise the real artifact; compiling or self-report is not proof. `skill://principle-prove-it-works`
- Fitting a new requirement into an existing design → redesign as if it were a day-one assumption. `skill://principle-redesign-from-first-principles`
- Concurrent actors may write the same file, branch, key, or object → remove the sharing before adding locks. `skill://principle-separate-before-serializing-shared-state`
- Multi-step work or stacking commits/PRs → small units, each verified before the next. `skill://principle-sequence-verifiable-units`
- Sequencing an addition, refactor, or rewrite → remove dead code and redundant structure first. `skill://principle-subtract-before-you-add`
- Writing, changing, or keeping a test → call it like a user; assert literal observable results. `skill://principle-test-behavior-not-implementation`
- Designing types or signatures → make illegal states unrepresentable; parse external data at the boundary. `skill://principle-type-system-discipline`
```

## Option B: visible principle skills

The same skills without `disable-model-invocation`. The descriptions below are **real omp 18.3.1 output**, read from `~/.omp/agent/skill-descriptions.db` after omp started in a project containing the 23 skills. omp's smol model rewrites each description to at most 12 words and 160 characters. `principle-separate-before-serializing-shared-state` failed compression on every run, so omp fell back to cutting its description at about 100 characters, and that cut version is what it shows.

About 2829 characters, roughly 707 tokens.

```text
- principle-attack-the-premise: When multiple fixes sharing one premise fail the same gate.
- principle-boundary-discipline: When wiring validation, error handling, framework adapters, or system boundary guards.
- principle-build-the-lever: For non-trivial edits, migrations, analyses, or checks; build rerunnable tools.
- principle-encode-lessons-in-structure: When repeating instructions or noticing recurring corrections, encode rules structurally.
- principle-exhaust-the-design-space: Use for novel UI interactions or architectural decisions without codebase precedent.
- principle-experience-first: Use for product, UX, or feature-scope tradeoffs: prioritize delight and polish.
- principle-fix-root-causes: When debugging, reproduce symptoms and fix root causes, not nil-check guards.
- principle-foundational-thinking: Before writing logic: core types, data structures, scaffold-vs-feature sequencing, concurrent actors’ sharing.
- principle-guard-the-context-window: Use when context fills: large outputs, long files, repeated reads, fan-out planning.
- principle-laziness-protocol: When refactoring, evaluating diff size, or adding abstractions, layers, or signal threading.
- principle-make-operations-idempotent: When designing commands, lifecycle steps, or loops facing crashes, restarts, retries.
- principle-migrate-callers-then-delete-legacy-apis: When introducing new internal APIs: migrate callers, delete old APIs together.
- principle-minimize-reader-load: When reviewing hard-to-trace code, excessive layers, one-caller wrappers, or hidden state.
- principle-model-the-domain: When writing stateful logic, branch-heavy code, or repeated cross-file shape assumptions.
- principle-never-block-on-the-human: When tempted to ask “should I?” on reversible work; confirm irreversible actions.
- principle-outcome-oriented-execution: Use for planned rewrites and migrations with explicit phase boundaries.
- principle-prove-it-works: After completing tasks, before declaring done, verify real artifacts—not proxies.
- principle-redesign-from-first-principles: When integrating new requirements into existing designs; rethink foundations, not bolt-ons.
- principle-separate-before-serializing-shared-state: Apply when concurrent actors might write to the same file, branch, key, or state object.
- principle-sequence-verifiable-units: Use for multi-step sweeps, migrations, similar edits, and sequencing commits/PRs.
- principle-subtract-before-you-add: Before additions, refactors, rewrites: remove dead code, redundant validators, stub references.
- principle-test-behavior-not-implementation: When writing, changing, or keeping tests, assert user-observable results, not implementation.
- principle-type-system-discipline: Use when designing types, reviewing function signatures, or writing statically-typed code.
```

## What differs

- Size: about 156 tokens apart, held once in the system prompt.
- Wording: in A, vstack owns each trigger and its one-line action. In B, several compressed lines keep only the trigger and drop the action (type-system-discipline, outcome-oriented-execution), and one line is a cut-off fallback.
- Placement: in A, principles sit in their own labelled block. In B, they are mixed into the general skill list among Matt and pstack skills.
- Install: A needs a rules path (`~/.agents/rules` or `~/.omp/agent/rules`) as well as skills. B needs only skills.
