# pstack workflows vs the Matt-based flow

Research for the ticket [Survey pstack workflows that could extend the Matt-based flow](https://github.com/daandden/vstack/issues/28), part of the map [vstack: Matt Pocock skills plus pstack enhancements for omp, with confirmed Updates](https://github.com/daandden/vstack/issues/26). Observed 2026-09-24, read-only. This file records facts and labeled observations. It makes no Disposition; those belong to later grilling tickets.

**Pins read.**

- Enhancement upstream: `cursor/plugins` at `12d587dfb20741cafc376c42c696c5f6e2a64487`, directory `pstack/`. All pstack links below use that SHA.
- Base upstream: `mattpocock/skills` tag `v1.2.3` = `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`. All Matt links below use that SHA.
- The upstream inventory ([upstream-inventory.md](https://github.com/daandden/vstack/blob/research/upstream-inventory/docs/research/upstream-inventory.md)) is taken as given; this file does not repeat it.

Line anchors use GitHub's `?plain=1#L<n>` form, so each link opens the exact source line.

## Fan-out scale used below

"Fan-out" follows `CONTEXT.md`: several subagents running at once. A single delegated subagent is **not** Fan-out, but it is recorded because pstack often pairs it with a different model, which vstack's same-model rule removes.

| Level | Meaning |
|---|---|
| F0 | No subagents needed. |
| F1 | One delegate at a time (implementation delegate, context guard, single reviewer). Not Fan-out. |
| F2 | Fan-out only on a conditional branch (complex question, wide change, several live hypotheses). |
| F3 | Fan-out on the default path, directly or through a called skill. |
| F4 | Program scale: fleets of owners, cloud agents, swarm verification per round. |

## Transitive Fan-out of the called skills

Playbooks mostly reach Fan-out through a small set of skills. Their Fan-out, from source:

| Skill | Fan-out on its default path | Model diversity is part of the contract? |
|---|---|---|
| `how` | Simple question: one explainer, no explorers; complex: 2–4 explorers "in a single message" plus a synthesizer. "When in doubt, take the simple path." ([L17-L24](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/how/SKILL.md?plain=1#L17-L24)) | No. Explorers and explainer are role-model defaults only ([L27](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/how/SKILL.md?plain=1#L27), [L37](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/how/SKILL.md?plain=1#L37)). |
| `why` | "Default to the full parallel investigation": one investigator per evidence category with a matching MCP, then a synthesizer ([L58-L60](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L58-L60), [L80](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L80), [L96](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L96)). Inline answer only after confirming the searches would be redundant ([L121](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L121)). | No. |
| `arena` | N runners "in one message", default one each on three model families, then one cross-judge ([L28](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/arena/SKILL.md?plain=1#L28), [L33](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/arena/SKILL.md?plain=1#L33), [L41](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/arena/SKILL.md?plain=1#L41)). | Yes: the judge should be "a different model family from the parent's" ([L41](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/arena/SKILL.md?plain=1#L41)). |
| `swarm` | N workers "in one message", `environment: "cloud"` ([L30](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/swarm/SKILL.md?plain=1#L30)). | No; `auto`/`inherit-parent` runs workers on the parent model ([L25](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/swarm/SKILL.md?plain=1#L25)). |
| `interrogate` | One reviewer per configured model, default three ([L36-L42](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/interrogate/SKILL.md?plain=1#L36-L42)). | Yes: "The adversarial signal comes from model diversity, not assigned personas." ([L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/interrogate/SKILL.md?plain=1#L9)) |
| `architect` | Runs `how` (+`why` when ownership/layering changes), then `arena` with "at least two structurally distinct candidates", optional `interrogate` ([L23-L35](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L23-L35), [L49](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L49)). | Inherited from `arena`; runner defaults are three families ([L33](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L33)). |
| `show-me-your-work` | F1: one reviewer "on a different model family from the one that did the work. Self-review is not a substitute." ([L67](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L67)) | Yes. |
| `no-comments` | F1: spawns `Comment Sicko`; if a fix "needs a shape", runs `/architect` once (so F3 transitively) ([L19-L21](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/no-comments/SKILL.md?plain=1#L19-L21)). | Via `architect`. |

pstack already supports running every role on the parent model: in the `pstack-models.mdc` rule, "`inherit-parent` or `auto` as a value: the role runs on the parent chat model", and "Alias entries in a panel list still count toward its fan-out" ([setup-pstack L47](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/setup-pstack/SKILL.md?plain=1#L47)). So a same-model pstack is a configuration pstack anticipates. Fan-out count stays unchanged unless the skill text changes.

For comparison, the Base upstream also uses subagents: `code-review` runs Standards and Spec as "parallel sub-agents" ([L11](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/code-review/SKILL.md?plain=1#L11)). `research` spins up a background agent ([L6](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/research/SKILL.md?plain=1#L6)). `grilling` dispatches fact-finding subagents ([L20](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/grilling/SKILL.md?plain=1#L20)). `wayfinder` fires research subagents "in parallel" while charting ([L115](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md?plain=1#L115)).

## The Matt flow at v1.2.3, in one paragraph

Matt's own router, `ask-matt`, names the main flow: grilling (`grill-with-docs`) → optional `prototype` detour bridged by `handoff` → `to-spec` → `to-tickets` → `implement` per ticket, which drives `tdd` and ends with `code-review`. `triage` and `diagnosing-bugs` are on-ramps, and `wayfinder` is the on-ramp for foggy, multi-session efforts ([ask-matt L13-L46](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L13-L46)). `implement` itself is 5 lines: TDD at pre-agreed seams, typecheck and tests, `/code-review`, commit to the current branch ([L7-L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L7-L15)). The flow stops at a commit. It has no PR-opening, CI-driving, merging, or stack-landing step, and no benchmarked-metric loop. **[INFERENCE]** This follows from reading all twelve named SKILL.md files and `ask-matt`: none of them mentions opening a PR, a merge, or CI.

## poteto-mode routing

**What it does.** Poteto Mode is a sticky mode skill (`mode: true`, `disable-model-invocation: true`, with a reminder line) ([L4-L8](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L4-L8)). It has three layers:

- Non-negotiable triggers: `how` for nontrivial change, `architect` for code crossing a function boundary, `swarm`/`arena` for parallel work, `interrogate` for contested design, and `show-me-your-work` for long or unattended work ([L13-L35](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L13-L35)).
- A principle index with "when it applies" lines ([L37-L77](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L37-L77)).
- A playbook router: the agent copies the matched playbook's steps "in verbatim" into a todolist, and each skipped step stays with `skip: <reason>` ([L115-L117](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L115-L117)). Large or cross-cutting work routes to `figure-it-out`, and standing programs route to Orchestrate ([L119](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L119)).

It also fixes an autonomy policy: proceed on reversible work, pause on irreversible writes ([L79-L87](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L79-L87)). It fixes a reply style too ([L97-L109](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L97-L109)). A notable trigger: before asking a "which approach" question whose answer is observable, sketch it through the Prototype playbook instead of asking the human ([L20](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L20)).

**Matt relation: replaces or sits beside `ask-matt`.** `ask-matt` is also "A router over the skills in this repo" ([L3](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L3)). It is advisory: the user asks which flow fits. Poteto Mode is sticky and prescriptive: it forces triggers and verbatim playbook todos.

**Adds.** Per-task-type playbooks with fixed reply contracts, a principle index, an explicit autonomy policy, and "ask vs. observe" routing. **[INFERENCE]** Matt has no always-on mode layer; `ask-matt` is `disable-model-invocation: true` and runs only when called ([L4](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L4)).

**Fan-out.** Routing itself is F0. The defaults make every `Task` call background, with an explicit model per role: `grok-4.7-xhigh-fast` for code and `claude-opus-5-5-max` for prose and judgment ([L93](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L93)). "A second opinion is the same prompt against a different model" ([L95](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L95)). Its triggers pull in `architect`, `swarm`, and `interrogate`, which makes the mode F3 in practice.

**Same-model, no-Fan-out loss.** The router and principle index survive intact. Lost: the default code/judgment model split, the "second opinion = different model" rule, and every trigger that names `swarm`, `arena`, or `interrogate`. Those triggers would need rewriting, as the upstream inventory already notes.

## Playbooks

All 23 files under `pstack/skills/poteto-mode/playbooks/` are listed below, in the router's order ([L121-L143](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L121-L143)).

### 1. Investigation

- **Does.** Read-only question → `how` (+`why` for motivation) → how-shaped output or a tradeoffs table. No PR, no `architect` ([L5-L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/investigation.md?plain=1#L5-L12)).
- **Matt.** Sits beside `research`. Matt's `research` investigates "primary sources — official docs, source code, specs, first-party APIs" into a cited Markdown file ([L10-L12](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/research/SKILL.md?plain=1#L10-L12)). Investigation explains *this* codebase's runtime behavior and history. It also overlaps grilling's fact-finding ([grilling L20](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/grilling/SKILL.md?plain=1#L20)).
- **Adds.** A fixed explanation schema (Overview / Key Concepts / How It Works / Where Things Live / Gotchas) ([L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/investigation.md?plain=1#L9)). It also adds history-and-rationale mining across source control, trackers, chat, and observability through `why` ([why L3](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L3)).
- **Fan-out.** F2–F3: `how` fans out only for complex questions, and `why` fans out by default.
- **Loss without Fan-out.** One agent walks the angles and sources in turn. The synthesis is the same, but slower, and the context fills with raw findings, which the `how` split kept apart. No model-diversity loss: neither skill requires it.

### 2. Bug fix

- **Does.** Reproduce it yourself on the real surface → binary-search the cause, seeded by `how` and `why` → `architect` if the fix crosses a function boundary → delegate the fix → verify on the same surface → stage the failing repro before the fix in history → Opening a PR ([L7-L13](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/bug-fix.md?plain=1#L7-L13)). "Every shipped line traces to runtime evidence", and refuted hypotheses get reverted ([L5](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/bug-fix.md?plain=1#L5)).
- **Matt.** Extends `diagnosing-bugs` and `tdd`. `diagnosing-bugs` already mandates a red-capable feedback loop, 3–5 falsifiable hypotheses, tagged instrumentation, and a regression test at a correct seam ([L57-L66](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L57-L66), [L88-L98](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L88-L98), [L114-L128](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L114-L128)).
- **Adds.** Regression history via `why`, and a design pass (`architect`) before cross-boundary fixes. It requires commit ordering that puts the failing repro before the fix, and it hands off into PR opening. Matt's diagnosis loop is the stronger feedback-loop discipline; pstack adds the steps after the diagnosis.
- **Fan-out.** F2–F3 through `why` (default parallel) and `architect` → `arena`.
- **Loss without Fan-out.** Candidate designs become sequential sketches by one model. The playbook itself only requires `architect` when the fix crosses a function boundary.

### 3. Perf issue

- **Does.** Baseline trace via a control skill → `how` → eight strategy families as hypothesis generators (elimination, divide and conquer, caching, indirection, batching, redundancy, lazy evaluation, scheduling) → `architect` if needed → delegate → post-fix trace → compare artifacts (JSON→sqlite) ([L5-L20](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/perf-issue.md?plain=1#L5-L20)).
- **Matt.** Extends `diagnosing-bugs`' "Perf branch": baseline measurement, then bisect ([L112](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L112)).
- **Adds.** The strategy-family catalogue, "Inconclusive or wrong-surface is not a pass" ([L18](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/perf-issue.md?plain=1#L18)), and a measured number in the PR.
- **Fan-out.** F2 (`how` complex path; `architect` when crossing a function boundary).
- **Loss without Fan-out.** Same as Bug fix; measurement discipline is unaffected.

### 4. Hillclimb

- **Does.** Sustained metric loop. Ground the workload, then build a harness, prove it can tell workloads apart, and freeze it. Log `decision.tsv`. Run one hypothesis per iteration, keep or revert, and make one commit per accepted win. Push past plateaus, and stop on a predicate with an attempt floor ([L7-L19](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/hillclimb.md?plain=1#L7-L19)).
- **Matt.** Sits beside the flow. Nothing in the named Matt skills runs an iterative metric loop; the nearest is the perf branch of `diagnosing-bugs` ([L112](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L112)).
- **Adds.** A frozen, sensitivity-proven harness; the keep/revert discipline; a stop predicate that "pairs a target with a floor on attempts" ([L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/hillclimb.md?plain=1#L7)).
- **Fan-out.** F2: "When several independent hypotheses are live, fan them to parallel subagents, each in its own worktree" ([L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/hillclimb.md?plain=1#L12)). F1 cross-model trail review through `show-me-your-work`.
- **Loss without Fan-out.** Only throughput: hypotheses run serially. The measurement integrity rules do not depend on Fan-out. The cross-model trail review becomes a same-model review, which `show-me-your-work` says is "not a substitute" ([L67](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L67)).

### 5. Runtime forensics

- **Does.** Capture a live signal (CPU profile, heap snapshot, CDP trace) → reduce to the smoking gun → prove the mechanism by live instrumentation → map it to source. The deliverable is a diagnosis, not a fix ([L3-L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/runtime-forensics.md?plain=1#L3-L11)).
- **Matt.** Extends `diagnosing-bugs` Phases 1 and 4 (build a loop, then instrument), but stops at diagnosis ([L18-L22](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L18-L22), [L100-L112](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L100-L112)).
- **Adds.** Leak, spin, and glitch recipes on a live process: the retainer chain to a GC root, and CDP eval hot-patching.
- **Fan-out.** F1: parse large artifacts in a subagent as a context guard ([L6](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/runtime-forensics.md?plain=1#L6)).
- **Loss without Fan-out.** None structural. Without the one delegate, the main context absorbs the raw artifact.

### 6. Trace forensics

- **Does.** Takes a captured artifact (cpuprofile, trace, spindump, heap snapshot). It loads it, turns it into sqlite, narrows to the cause, attributes it to source, and confirms against a paired capture if one exists ([L5-L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/trace-forensics.md?plain=1#L5-L12)).
- **Matt.** Extends `diagnosing-bugs`, which lists "Replay a captured trace" as a loop and asks the user for captured artifacts when no loop exists ([L30](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L30), [L55](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L55)).
- **Adds.** The "queryable shape before you read" step, and the rule that a frame without a source mapping is not a diagnosis ([L8-L10](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/trace-forensics.md?plain=1#L8-L10)).
- **Fan-out.** F1 (parser subagent, [L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/trace-forensics.md?plain=1#L7)).
- **Loss without Fan-out.** Context only.

### 7. Feature

- **Does.** `how` → `architect` → a four-part "throughput checkpoint" → delegate the code with a named data shape, or run `arena` when several shapes are valid → verify on the real surface → small ordered commits → `interrogate` if contested → Opening a PR ([L5-L18](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/feature.md?plain=1#L5-L18)).
- **Matt.** Replaces or extends `implement` ([L7-L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L7-L15)), and brings a design phase Matt splits across `to-spec` seams ([L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-spec/SKILL.md?plain=1#L15)) and `codebase-design`. `tdd` requires seams confirmed with the user first ([L22](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L22)). Feature has no such confirmation step.
- **Adds.** Caller-first design sketches with alternatives, a red-flag screen, a data-shape-first delegation brief, a parallelism plan (the throughput checkpoint), live verification, and PR opening.
- **Fan-out.** F3, the heaviest single-task playbook. `architect` always runs `arena` with at least two candidates. When shapes vary, `arena` delegation is "Mandatory: no skip-with-reason escape" ([L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/feature.md?plain=1#L12)).
- **Loss without Fan-out.** pstack names its own fallback: "A subagent forbidden to spawn satisfies this by owning the diff directly with the same review separation" ([L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/feature.md?plain=1#L12)). Without Fan-out, "design it twice" ([architect L35](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L35)) becomes one agent producing two whole-shape sketches in sequence. Lost: independent candidates written without seeing each other, model diversity, and the cross-judge. **[INFERENCE]** Sequential same-model sketches are likely to converge more than independent ones.

### 8. Refactoring

- **Does.** Pin the behavior contract first with a characterization test or equivalence harness ("Type check and lint are not a pin"). Then name the missing structure and the target shape (`architect` if it crosses a function boundary), and subtract before adding. Move in green steps, migrating callers and deleting the old API in one wave. Prove equivalence, and revert if reader load did not drop ([L7-L14](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/refactoring.md?plain=1#L7-L14)).
- **Matt.** Sits beside. `tdd` says "Refactoring is not part of the loop. It belongs to the review stage" ([L38](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L38)). `code-review` flags smells but does not refactor ([L38-L56](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/code-review/SKILL.md?plain=1#L38-L56)). `to-tickets` sequences wide refactors as expand–contract ([L40](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L40)).
- **Adds.** A dedicated behavior-preserving execution recipe: pin first, subtract first, reader-load as the keep/revert test.
- **Fan-out.** F2: `how` (complex path) and `architect` when crossing a function boundary. Mechanical edits go to one delegate (F1) ([L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/refactoring.md?plain=1#L11)).
- **Loss without Fan-out.** Only in the conditional `architect` step; the pin/subtract/equivalence discipline is single-agent.

### 9. Prototype

- **Does.** A throwaway to settle a design or empirical fork. Scope the decision, gather references when the design space is open, build in an isolated scratch dir, put variants behind one switcher, observe on the matching surface, and hand the chosen direction to Feature ([L7-L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/prototype.md?plain=1#L7-L12)).
- **Matt.** Overlaps Matt `prototype`. Differences: Matt picks a Logic (single HTML) or UI (URL-param variants) branch ([L14-L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype/SKILL.md?plain=1#L14-L15)). It locates code "close to where it will actually be used" and captures it on a throwaway branch linked from the issue ([L21](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype/SKILL.md?plain=1#L21), [L26](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype/SKILL.md?plain=1#L26)). pstack uses a separate scratch dir ([L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/prototype.md?plain=1#L9)).
- **Adds.** Behavioral and timing prototypes (logging timing or output as the observation), a reference-gathering moodboard step, and the poteto-mode rule to prototype an observable fork instead of asking the human ([poteto-mode L20](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L20)).
- **Fan-out.** F0.
- **Loss without Fan-out.** None.

### 10. Visual parity

- **Does.** Build a screenshot baseline harness first. State anti-shortcut clauses: no harness or baseline edits, no restructuring to pass a diff. Migrate one component at a time, one owner per component across worktrees. A nonzero image diff is a fail ([L5-L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/visual-parity.md?plain=1#L5-L9)).
- **Matt.** Sits beside; no Matt equivalent in the named flow.
- **Adds.** Pixel-exact equivalence as the gate, and the anti-tampering rules.
- **Fan-out.** F3 for multi-component work: "Parallelize across worktrees, one owner per component" ([L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/visual-parity.md?plain=1#L7)).
- **Loss without Fan-out.** Serial components; the baseline-and-diff gate is unaffected.

### 11. Authoring or modifying a skill

- **Does.** Use Cursor's built-in `create-skill`, validate frontmatter and links, test if structural, then open a PR ([L5-L8](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md?plain=1#L5-L8)).
- **Matt.** Sits beside Matt's `writing-for-agents` reference ([ask-matt L86](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L86)), which is outside the named flow.
- **Adds.** A validation checklist, and the "When in doubt, delete" guidance ([L10](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md?plain=1#L10)). It depends on Cursor's `create-skill`, which pstack does not ship (see the inventory's "not shipped here").
- **Fan-out.** F0.
- **Loss without Fan-out.** None.

### 12. Eval

- **Does.** A blinded experiment on a skill or prompt variant. It keeps a hidden rubric, sanitized environments, and one organic prompt. It spawns N parallel candidates "on different models per the arena skill's Phase B" and one blinded judge "on a different model family". It verifies chain-following from transcripts, not self-report ([L5-L23](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/eval.md?plain=1#L5-L23)).
- **Matt.** Sits beside; no Matt equivalent.
- **Adds.** A method to test whether a vstack skill change actually changes agent behavior.
- **Fan-out.** F3 direct, and model diversity is written into the steps ([L20-L21](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/eval.md?plain=1#L20-L21)).
- **Loss without Fan-out.** Large. Candidates become sequential same-model runs, and the judge is no longer a different family. **[INFERENCE]** Sequential runs by the parent also break blinding, because the parent knows the variant under test. Blinding is the playbook's first non-negotiable ([L5-L13](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/eval.md?plain=1#L5-L13)). Transcript paths are Cursor-specific (`agent-transcripts/`, [L22](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/eval.md?plain=1#L22)); omp stores sessions at `~/.omp/agent/sessions/<encoded-cwd>/…jsonl` ([omp session L40](omp://session.md)).

### 13. Babysit

- **Does.** Drive a PR or stack to merge-ready. Declare a mode (`drive`, `background`, `threads-only`, `check`). Work only the lowest unmerged PR, and never mutate stack topology. Work conflicts first, then review threads, then CI. Classify CI failures before any retry, and triage Bugbot skeptically. Stop at the human's merge line ([L7-L23](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/babysit.md?plain=1#L7-L23)).
- **Matt.** Sits after `implement` → `code-review`. Matt's flow ends at "Commit your work to the current branch" ([implement L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L15)).
- **Adds.** The whole PR-to-merge-ready loop, a GitHub watcher script (`scripts/watch-pr`), and the CI-flake classification rules.
- **Fan-out.** F0. Tied to Cursor Bugbot and optional Origin; `gh` is the default ([L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/babysit.md?plain=1#L7)).
- **Loss without Fan-out.** None.

### 14. Shipping

- **Does.** Verify each PR independently ("Safe means a verdict from an agent that did not write the code"). Land only the contiguous verified run from the bottom. Re-check verdicts by `git patch-id` after rebases. Land one PR at a time and recompute after each merge ([L7-L15](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/shipping.md?plain=1#L7-L15)).
- **Matt.** Sits beside; no Matt equivalent.
- **Adds.** Stack-landing safety: the verified-run ceiling, and patch-id invalidation of stale verdicts.
- **Fan-out.** F3: "One subagent per PR, not batched, each a Cursor cloud agent" ([L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/shipping.md?plain=1#L7)).
- **Loss without Fan-out.** Serial verifiers. The independence rule (not the author) still holds with fresh same-model subagents, though the verifier no longer differs in model. Cloud agents and `control-ui`/`control-cli` from `cursor-team-kit` are external dependencies.

### 15. Autonomous run

- **Does.** State a checkable exit predicate, then pick a wake mechanism: Cursor `/loop`, or a watcher subagent plus heartbeat. Each iteration makes the smallest evidence-justified change and discards what did not help. Fix discoveries yourself, and log each iteration with `show-me-your-work`. A plateau is not a stop ([L5-L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autonomous-run.md?plain=1#L5-L11)).
- **Matt.** Sits beside. Matt's flow is human-paced; its only loop skill (`loop-me`) is in-progress and designs workflow specs rather than running work ([loop-me L8](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/in-progress/loop-me/SKILL.md?plain=1#L8)).
- **Adds.** Predicate-driven unattended execution with an audit trail.
- **Fan-out.** F1 (watcher subagent; cross-model trail reviewer).
- **Loss without Fan-out.** The cross-model review only. The wake mechanism is Cursor's `/loop` ([L6](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autonomous-run.md?plain=1#L6)); an omp equivalent was not checked in this ticket.

### 16. Orchestrate

- **Does.** Runs a standing multi-day program under one coordinator chat that never edits code. It keeps a store with a single writer per file (`preferences.md`, `units.tsv`, `ledger.tsv`, `frontier.json`, `inbox/`) through the `scripts/orch/orch.ts` CLI, and uses a ten-field brief template. It pilots one unit first, then scales in a rolling window of about ten per drain. It stacks with `gt` and keeps a per-head-SHA verification ledger ([L3-L111](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L3-L111)).
- **Matt.** Sits after `wayfinder` → `to-spec` → `to-tickets`, and replaces running `implement` per ticket by hand. Matt says to kick off `/implement` per ticket, clearing context between them ([ask-matt L23](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L23)). `wayfinder` "hands off, it doesn't build" ([ask-matt L46](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L46)).
- **Adds.** A brief template ("The brief is the product"), queue/drain discipline, liveness and retry-by-mode rules, and a verification ledger keyed by head SHA ([L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L11), [L68-L101](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L68-L101)).
- **Fan-out.** F4: "dozens to hundreds of subagents", cloud workers by default, and verifiers "on a different model family from its worker" ([L3](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L3), [L17](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L17)).
- **Loss without Fan-out.** Nearly all of it. pstack's own collapse rule applies: "If one agent could finish inside that budget, stop here and run Autonomous run instead… none of the store, register, or pilot machinery" ([L60](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L60)). The brief template and ledger are separable. Stacking assumes Graphite `gt` ([L79-L81](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L79-L81)).

### 17. Autopilot-full

- **Does.** Takes a queue of independent PRs. One cloud-agent owner per PR runs build → PR → self-proof → Bugbot triage → `/deslop` → `/no-comments` → babysit → merge. The root swarm-verifies each round (gates, live, regression-vs-trunk, and two or more audit lanes). It runs 30-minute audit ticks, and stands down on the operator's stop ([L5-L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-full.md?plain=1#L5-L11)).
- **Matt.** Sits beside; replaces `implement` + manual merge for a queue. No Matt equivalent.
- **Adds.** Per-round verification tied to the head SHA, countersign rules for raised gates, and stuck-lane detection ([L8-L10](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-full.md?plain=1#L8-L10)).
- **Fan-out.** F4: owners "in true parallel" plus a swarm per round ([L7-L8](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-full.md?plain=1#L7-L8)).
- **Loss without Fan-out.** The playbook's premise. Without Fan-out it reduces to serial Feature → Babysit → Shipping per PR.

### 18. Autopilot-stack

- **Does.** Same owner loop as Autopilot-full, but no owner merges. Verified PRs are appended by the root, the single topology writer, to one linear base-branch stack that the operator lands ([L5-L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-stack.md?plain=1#L5-L12)). The file also sets the rule for choosing between the two autopilots ([L14](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-stack.md?plain=1#L14)).
- **Matt / Adds / Fan-out / Loss.** As Autopilot-full: F4, no Matt equivalent. Keeping the human as the lander makes it the more conservative autopilot.

### 19. Session pickup

- **Does.** Locate the prior trail (transcript, cloud-agent URL, or pushed branch). Reconstruct operational state, and diff done against pending without redoing work. Route to the matching playbook, then verify inherited claims on the real artifact ([L5-L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/session-pickup.md?plain=1#L5-L9)).
- **Matt.** Receiving side of `handoff`. Matt's `handoff` writes a document to the OS temp dir with suggested skills, referencing artifacts rather than duplicating them ([L8-L12](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/handoff/SKILL.md?plain=1#L8-L12)). Matt has no "pick up" skill; the next session just reads the file.
- **Adds.** Recovery without a handoff document (from transcripts or branches), and the stance that "The prior trail is authoritative input" ([L6](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/session-pickup.md?plain=1#L6)).
- **Fan-out.** F1 (long transcript parsed in a subagent, [L5](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/session-pickup.md?plain=1#L5)).
- **Loss without Fan-out.** Context only. Transcript paths are Cursor-specific; the omp session store is at `~/.omp/agent/sessions/` ([omp session L40](omp://session.md)).

### 20. Pause safely

- **Does.** Stop at a safe boundary and cancel nested subagents. Make a `wip:` commit, and write a resume note (intent, progress, verified state, next steps, key files, gotchas) to a file such as `/tmp/<slug>-resume.md`. Point at the `show-me-your-work` trail instead of duplicating it ([L5-L8](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/pause-safely.md?plain=1#L5-L8)).
- **Matt.** Strong overlap with `handoff`: both write to temp and both reference existing artifacts ([handoff L8-L12](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/handoff/SKILL.md?plain=1#L8-L12)).
- **Adds.** Durability steps Matt's `handoff` lacks: the `wip:` commit, stopping at an atomic boundary, and cancelling children.
- **Fan-out.** F0.
- **Loss without Fan-out.** None.

### 21. Multi-phase or multi-PR plan

- **Does.** Writes a plan file, not code. It settles open questions by prototype first and explores in subagents. Its skeleton has one section per PR, each with Files / Build / You see / Verify unit / Verify live (**ten swarm lanes**, one a regression lane against trunk) / Verify perf / Review gate / Merge. It then lints the plan with `check-plan.mjs` and hands back ([L5-L11](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L5-L11), [L13](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L13), [L97-L112](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L97-L112)).
- **Matt.** Overlaps `to-spec` + `to-tickets` (and `wayfinder`'s hand-off destination). `to-tickets` produces tracer-bullet vertical slices with blocking edges and acceptance criteria, quizzes the user, and avoids file paths ([L27-L38](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L27-L38), [L42-L56](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L42-L56), [L105](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L105)). The pstack plan names files per PR ([L83-L87](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L83-L87)), the opposite convention.
- **Adds.** Per-PR verification written into the plan (unit, live, and perf, with a trunk regression lane and a dual-sided perf gate), a mechanical plan linter, and prototype evidence as an appendix ([L139-L141](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L139-L141)).
- **Fan-out.** Authoring is F1–F2 (exploration subagents, [L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L7)). The plan it emits mandates F4 execution: ten live lanes per PR via `swarm`, under an Autopilot or Orchestrate playbook ([L8](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L8), [L101](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L101)).
- **Loss without Fan-out.** The verification-block idea survives. The "ten lanes" live block and the swarm-per-round verdict do not; they would become a serial checklist.

### 22. Worktree and simulator cleanup

- **Does.** Audit worktrees with `scripts/worktree-audit.sh`, cross-check against pinned and active chats, pause on uncommitted work, then prune. It also covers iOS simulators, Xcode, and Cursor caches ([L5-L10](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md?plain=1#L5-L10)).
- **Matt.** Unrelated to the flow.
- **Adds.** Safe disk reclamation. Heavily Cursor- and macOS-specific: the Cursor sidebar pins, `~/Library/Application Support/Cursor`, and `xcrun simctl` ([L6](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md?plain=1#L6), [L10](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md?plain=1#L10)).
- **Fan-out.** F2: "fan subagents out to read the transcripts" for doubtful rows ([L7](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md?plain=1#L7)).
- **Loss without Fan-out.** Serial transcript reads.

### 23. Opening a PR

- **Does.** Runs at the end of every other playbook. It covers a worktree off main, commits rebased into small ordered units, `/deslop`, `/no-comments`, and `/technical-writing` + `/unslop`. PR titles use Conventional Commits. The body has Why / Scope / Tradeoffs / Blast Radius / Verification. It resolves the forge, opens the PR ready (never draft), and uses base-branch stacks. Opening a PR does not start a babysit ([L3-L31](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/opening-a-pr.md?plain=1#L3-L31)).
- **Matt.** Extends the end of `implement` ("Commit your work to the current branch", [L15](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L15)), after `code-review`.
- **Adds.** A PR body contract including a `## Blast Radius` section ([L20](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/opening-a-pr.md?plain=1#L20)), stack mechanics, and forge resolution.
- **Fan-out.** F1 by default (`/no-comments` spawns one Comment Sicko). A subagent that opens a PR also "runs `interrogate`" ([L33](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/opening-a-pr.md?plain=1#L33)), which is F3 with model diversity. `/no-comments` → `/architect` is conditional F3. `/deslop` comes from `cursor-team-kit` and is not shipped in pstack.
- **Loss without Fan-out.** The `interrogate` pass for subagent-opened PRs. Matt's `code-review` already runs before commit in `implement`, so a review step still exists.

## Skill chains

### how → architect

- **Does.** `architect` grounds the change with `how` (and `why` if ownership or layering changes) and sketches types and signatures via `arena`. It requires at least two structurally distinct candidates, screens them against design red flags, and prefers the deeper interface. It then implements against the sketch, and scraps the sketch on repeated friction ([architect L21-L79](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L21-L79)). The caller's usage is written first ([L83](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L83)).
- **Matt.** Sits between `to-spec`/`to-tickets` and `implement`, beside `codebase-design`. Matt's `tdd` sends interface-shape questions to `/codebase-design` "for the vocabulary… a reference to consult, not a session to run" ([tdd L26](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L26)). `architect` is the session Matt does not run.
- **Adds.** An executable design phase (usage-first sketch, compare alternatives, red-flag screen, scrap rule). Phase C's human checkpoint is opt-in; the default is no checkpoint ([L43-L47](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L43-L47)). That contrasts with Matt's user-confirmed seams ([to-spec L15-L17](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-spec/SKILL.md?plain=1#L15-L17), [tdd L22](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L22)).
- **Fan-out.** F3 (`arena` runners plus a judge; `how` explorers when complex; `why` investigators when triggered).
- **Loss without Fan-out.** Independence and diversity of candidates, and the cross-judge. The Ground, Screen, Implement, and Scrap phases are single-agent and survive.

### blast-radius

- **Does.** Finds breakage beyond the diff, and proves "the one fact it's safe because of" by running real code. Evidence runs on a 5-rung scale from "You said so" to "reproduced in the running app". The hand-back contract has What it does / One fact / Risks / Cleared / Before you merge ([L13-L46](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/blast-radius/SKILL.md?plain=1#L13-L46)).
- **Matt.** Extends `code-review`, which reviews Standards and Spec *within* the diff ([L6-L9](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/code-review/SKILL.md?plain=1#L6-L9)). `to-tickets` uses "blast radius" only to size wide-refactor batches ([L40](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L40)).
- **Adds.** A third review axis, outside the diff, with an executed proof. The PR template's `## Blast Radius` section reads as its product ([opening-a-pr L20](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/opening-a-pr.md?plain=1#L20)).
- **Fan-out.** F0 by default. It reuses `why` step 2, which is the code-anchor step, not the investigators ([blast-radius L33](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/blast-radius/SKILL.md?plain=1#L33); [why L25](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/why/SKILL.md?plain=1#L25)). F2 "for a big or wide change, run it as an `arena`… Different models catch different real bugs" ([L38](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/blast-radius/SKILL.md?plain=1#L38)).
- **Loss without Fan-out.** Only the optional multi-model pass on big changes.

### create-verification-skill → maintain-verification-skill

- **Does.** `create-verification-skill` interviews the repo, not the user, about Surface, Run, Drive, Observe, and Isolate. It generates a project-local `verify-<app>` skill (Launch / Doctor / Drive / Evidence / Cleanup / Helpers) plus a feature map, then proves it end to end once ([create L11-L40](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/create-verification-skill/SKILL.md?plain=1#L11-L40)). `maintain-verification-skill` fixes index hygiene, runs a source wave, reconciles, runs a required live pass, triages drift into doc, harness, or product gaps, and ships at most one PR ([maintain L13-L37](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/maintain-verification-skill/SKILL.md?plain=1#L13-L37)).
- **Matt.** Sits beside `diagnosing-bugs` Phase 1 (a feedback loop per bug, [L18-L37](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L18-L37)) and `tdd` (tests at seams). Matt has no standing, per-project "drive the real app" artifact.
- **Adds.** A reusable live-verification harness that other workflows can call as their "control skill" (Bug fix step 1, Feature step 5, Shipping lanes), plus a maintenance loop against drift.
- **Fan-out.** Create: F0. Maintain: F3, "One read-only subagent per feature file, launched concurrently"; the live pass stays single-session ([maintain L29](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/maintain-verification-skill/SKILL.md?plain=1#L29), [L33](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/maintain-verification-skill/SKILL.md?plain=1#L33)).
- **Loss without Fan-out.** The Maintain source wave becomes serial per-feature reads. No model-diversity loss.
- **omp note.** The generated path is `.cursor/skills/verify-<app>/` ([create L9](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/create-verification-skill/SKILL.md?plain=1#L9), [L25](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/create-verification-skill/SKILL.md?plain=1#L25)). omp's registered skill providers are native `.omp`, omp-plugins, claude, claude-plugins, agents, codex, opencode, github, and omp-managed. No Cursor provider is listed ([omp skills, "Built-in skill providers and precedence"](omp://skills.md)). An omp version would need a different output path.

### figure-it-out

- **Does.** When no playbook fits, it designs one. Frame (falsifiable done predicate, quantified scope, rigor level) → design the workflow (riskiest-first units, harness before work, `architect` for one-way doors, fan out only across seams) → hypothesis loop with VERIFIED / NOT VERIFIED / INCONCLUSIVE verdicts → `show-me-your-work` trail → verify and encode lessons ([L15-L53](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/figure-it-out/SKILL.md?plain=1#L15-L53)).
- **Matt.** Overlaps `wayfinder` in purpose (big, foggy work) but not in output. `wayfinder` is "planning by default" and produces decisions, not deliverables ([wayfinder L11-L13](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md?plain=1#L11-L13)). figure-it-out designs *and executes* one bespoke run. It sits on the execution side, where `to-tickets` + `implement` would be.
- **Adds.** Rigor scaled to risk, a harness-first baseline, "Pair delegated work with a judge" ([L42](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/figure-it-out/SKILL.md?plain=1#L42)), and an auditable trail for work reviewed after stepping away.
- **Fan-out.** F2–F3 transitively. `architect` → `arena` for one-way doors, parallel workers across seams ("Don't over-fan"), and a judge per delegate ([L30-L31](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/figure-it-out/SKILL.md?plain=1#L30-L31), [L42](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/figure-it-out/SKILL.md?plain=1#L42)). F1 cross-model trail review.
- **Loss without Fan-out.** Parallel seams become serial, and the one-way-door `arena` becomes sequential sketches. The judge becomes a same-model fresh-context reviewer. The framing, loop, and trail survive.

### show-me-your-work

- **Does.** An append-only TSV decision log (`ts, phase, decision, why, evidence, result`) with a `log.sh` helper and a multi-run `start`-row convention. At the end it audits the log against the transcript, then runs a cross-model review whose output is an "Attention" section naming the reviewer model ([L13-L74](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L13-L74)).
- **Matt.** Sits beside `wayfinder`, whose map is also an index of decisions with pointers ([wayfinder L23](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md?plain=1#L23), [L40-L44](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md?plain=1#L40-L44)). That index works at the decision-ticket level across sessions. show-me-your-work logs within one run, at the level of individual actions.
- **Adds.** Evidence-pointer discipline per decision, and a truthfulness audit of the log against the transcript. It is the shared audit format for Hillclimb, Autonomous run, figure-it-out, Orchestrate, and the Autopilots ([L80-L82](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L80-L82)).
- **Fan-out.** F1, but the one reviewer must be a different model family ([L67](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L67)).
- **Loss without Fan-out.** The log and self-audit survive fully. The cross-model review cannot be met under the same-model rule. It becomes a same-model fresh-context review, which the skill says is not a substitute. The transcript audit reads Cursor's `agent-transcripts/` ([L57](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L57)); omp uses its session JSONL store ([omp session L40](omp://session.md)).

### reflect

- **Does.** Finds the active transcript and spawns three reviewers in parallel (Judgment, Tooling, Divergent). A synthesizer produces Accepted / Rejected / Backlog. Items better enforced structurally move to Backlog. The user approves before any skill edit ([L17-L73](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/reflect/SKILL.md?plain=1#L17-L73)).
- **Matt.** Sits beside the flow. The inventory maps it to Matt's in-progress `retro`. Nothing in the twelve named skills turns a session into skill edits.
- **Adds.** A route from session lessons to edits of existing skills, gated by the user and biased toward structural enforcement.
- **Fan-out.** F3 direct (3 reviewers + synthesizer). The Tooling lens defaults to a different family (`gpt-5.6-sol-max`) from the other two ([L35-L39](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/reflect/SKILL.md?plain=1#L35-L39)).
- **Loss without Fan-out.** The three lenses become three sequential passes by one agent, which then synthesizes its own output. The lenses stop being independent.
- **omp note.** omp has a built-in `reflect` *tool* that synthesizes over the long-term memory backend ([omp tools/reflect](omp://tools/reflect.md)). It is a different thing with the same name.

### recall

- **Does.** Loads working context before starting or resuming. It locks the scope (window, topic, workspace) and mines chat history in parallel slices on a cheap model. It sweeps the shared record through `why` investigators in parallel, verifies against live `git`/`gh`, and writes a capsule / threads / problems / next-move brief ([L17-L35](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/recall/SKILL.md?plain=1#L17-L35)).
- **Matt.** Beside `handoff`, and before the flow's first step. `handoff` needs the prior session to have written a doc. `recall` reconstructs without one.
- **Adds.** Cross-session recovery with status-tagged threads (`[merged #N]`, `[open PR #N]`, …) ([L29](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/recall/SKILL.md?plain=1#L29)).
- **Fan-out.** F3 (slice miners + `why` investigators, in parallel). "For one or two chats, skip the fan-out and search directly" ([L19](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/recall/SKILL.md?plain=1#L19)).
- **Loss without Fan-out.** A slower serial read over transcripts, with more context pressure. Cursor transcript layout is hard-coded ([L15](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/recall/SKILL.md?plain=1#L15)).
- **omp note.** omp has a built-in memory `recall` *tool* when a memory backend is enabled ([omp tools/recall](omp://tools/recall.md)). Different scope, same name.

### automate-me

- **Does.** Turns the user's working conventions into a personal `-mode` skill. It mines history in parallel slices (roughly three, over 2–4 weeks) and keeps signals seen in two or more slices. It asks structured questions, clusters findings, drafts via Cursor `create-skill` + `unslop`, and lands the result through a PR ([L15-L83](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/automate-me/SKILL.md?plain=1#L15-L83)).
- **Matt.** Sits beside; no equivalent in the named flow. `setup-matt-pocock-skills` configures repo conventions, not personal style (inventory §3).
- **Adds.** A mode skill that reflects the user's own habits, which is Poteto Mode's shape made personal ([L63](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/automate-me/SKILL.md?plain=1#L63)).
- **Fan-out.** F3 direct (slice miners, [L31](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/automate-me/SKILL.md?plain=1#L31)).
- **Loss without Fan-out.** The cross-slice agreement check still works when one agent reads the slices serially, but the slices are no longer independent readers. More context pressure.

## Comparison table

| Workflow | Matt step, relation | What it adds | Fan-out | Same-model, no-Fan-out loses | Sources |
|---|---|---|---|---|---|
| poteto-mode routing | `ask-matt`: replaces/beside | Sticky mode, verbatim playbook todos, principle index, autonomy policy, observe-don't-ask | F0 itself, F3 via triggers | Model split and every swarm/arena/interrogate trigger | [pm](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/SKILL.md?plain=1#L13-L143), [ask-matt](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/ask-matt/SKILL.md?plain=1#L3) |
| Investigation | `research`: beside | Codebase how/why explanation schema | F2–F3 | Speed and context separation only | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/investigation.md?plain=1#L5-L12), [research](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/research/SKILL.md?plain=1#L10-L12) |
| Bug fix | `diagnosing-bugs` + `tdd`: extends | Regression history, design before cross-boundary fix, repro-first commits, PR | F2–F3 | Independent design candidates | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/bug-fix.md?plain=1#L5-L13), [diag](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L57-L128) |
| Perf issue | `diagnosing-bugs` perf branch: extends | Eight strategy families, artifact diffing | F2 | Little | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/perf-issue.md?plain=1#L5-L20), [diag](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/diagnosing-bugs/SKILL.md?plain=1#L112) |
| Hillclimb | none: beside | Frozen harness, keep/revert loop, predicate with floor | F2 + F1 xmodel | Throughput; cross-model trail review | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/hillclimb.md?plain=1#L5-L19) |
| Runtime forensics | `diagnosing-bugs` Ph 1/4: extends | Live-process leak/spin recipes, diagnosis-only | F1 | Context only | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/runtime-forensics.md?plain=1#L3-L11) |
| Trace forensics | `diagnosing-bugs` trace replay: extends | Artifact→sqlite, source attribution rule | F1 | Context only | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/trace-forensics.md?plain=1#L5-L12) |
| Feature | `implement`: replaces/extends | how→architect, throughput checkpoint, live verify, PR | F3 (mandatory arena) | Independent/diverse candidates, cross-judge | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/feature.md?plain=1#L5-L19), [impl](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L7-L15) |
| Refactoring | `tdd` L38 / `code-review` smells: beside | Pin-first, subtract-first, reader-load test | F2 | Only conditional architect | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/refactoring.md?plain=1#L7-L14), [tdd](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L38) |
| Prototype | `prototype`: overlaps | Behavioral/timing prototypes, prototype-instead-of-ask | F0 | Nothing | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/prototype.md?plain=1#L7-L12), [proto](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/prototype/SKILL.md?plain=1#L14-L26) |
| Visual parity | none: beside | Pixel-diff baseline gate, anti-tamper | F3 (per component) | Throughput | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/visual-parity.md?plain=1#L5-L9) |
| Authoring a skill | `writing-for-agents` (off-flow): beside | Validation checklist; needs Cursor `create-skill` | F0 | Nothing | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/authoring-a-skill.md?plain=1#L5-L10) |
| Eval | none: beside | Blinded skill-variant experiments | F3, diversity required | Blinding and model diversity | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/eval.md?plain=1#L5-L23) |
| Babysit | after `implement`: beside | PR to merge-ready loop, CI classification | F0 | Nothing | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/babysit.md?plain=1#L7-L23) |
| Shipping | none: beside | Verified-run landing, patch-id re-check | F3 (one verifier per PR) | Throughput; verifier model difference | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/shipping.md?plain=1#L7-L15) |
| Autonomous run | none: beside | Predicate-driven unattended loop | F1 | Cross-model trail review | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autonomous-run.md?plain=1#L5-L11) |
| Orchestrate | after `to-tickets`, replaces manual `implement` per ticket | Program store, brief template, ledger, drains | F4 | Nearly all; collapses to Autonomous run | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L3-L111) |
| Autopilot-full | none: beside | Owner-per-PR to merge with swarm verdicts | F4 | Premise | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-full.md?plain=1#L5-L11) |
| Autopilot-stack | none: beside | Same, operator lands a linear stack | F4 | Premise | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/autopilot-stack.md?plain=1#L5-L14) |
| Session pickup | `handoff` (receiving): beside | Resume from transcript/branch without a doc | F1 | Context only | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/session-pickup.md?plain=1#L5-L9), [handoff](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/productivity/handoff/SKILL.md?plain=1#L8-L12) |
| Pause safely | `handoff`: overlaps | `wip:` commit, safe boundary, cancel children | F0 | Nothing | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/pause-safely.md?plain=1#L5-L8) |
| Multi-phase plan | `to-spec` + `to-tickets`: overlaps | Per-PR unit/live/perf verification blocks, plan linter | F1–F2 authoring, F4 execution | Ten-lane live verification | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md?plain=1#L5-L13), [to-tickets](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/to-tickets/SKILL.md?plain=1#L27-L56) |
| Worktree cleanup | none: unrelated | Safe disk reclaim (Cursor/macOS) | F2 | Throughput | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/worktree-cleanup.md?plain=1#L5-L10) |
| Opening a PR | end of `implement`: extends | PR contract incl. Blast Radius, stacks, forge | F1; F3 for subagent-opened PRs | `interrogate` pass | [pb](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/opening-a-pr.md?plain=1#L3-L33), [impl](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/implement/SKILL.md?plain=1#L15) |
| how → architect | between `to-tickets` and `implement`, beside `codebase-design` | Executable design session, usage-first, scrap rule | F3 | Independent/diverse candidates, cross-judge | [architect](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/architect/SKILL.md?plain=1#L21-L83), [tdd](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/tdd/SKILL.md?plain=1#L26) |
| blast-radius | `code-review`: extends | Out-of-diff breakage + executed safety proof | F0; F2 on big changes | Only optional multi-model pass | [br](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/blast-radius/SKILL.md?plain=1#L13-L46), [cr](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/code-review/SKILL.md?plain=1#L6-L9) |
| create/maintain-verification-skill | beside `diagnosing-bugs` Ph 1 and `tdd` | Standing per-project live-verification skill + drift loop | F0 / F3 | Maintain source wave throughput | [create](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/create-verification-skill/SKILL.md?plain=1#L11-L44), [maintain](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/maintain-verification-skill/SKILL.md?plain=1#L13-L37) |
| figure-it-out | `wayfinder` purpose, execution side | Bespoke rigorous run, harness-first, judge per delegate | F2–F3 + F1 xmodel | Parallel seams, arena, judge diversity | [fio](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/figure-it-out/SKILL.md?plain=1#L15-L53), [wayfinder](https://github.com/mattpocock/skills/blob/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e/skills/engineering/wayfinder/SKILL.md?plain=1#L11-L13) |
| show-me-your-work | beside `wayfinder` decision index | Per-run TSV trail, transcript audit | F1 (xmodel required) | Cross-model review | [smyw](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/show-me-your-work/SKILL.md?plain=1#L13-L74) |
| reflect | none in flow (in-progress `retro`) | Session → approved skill edits | F3 | Independent lenses | [reflect](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/reflect/SKILL.md?plain=1#L17-L73) |
| recall | beside `handoff` | Cross-session context reconstruction | F3 (skip for 1–2 chats) | Throughput, context | [recall](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/recall/SKILL.md?plain=1#L17-L35) |
| automate-me | none | Personal `-mode` skill from mined habits | F3 | Independent slice readers | [automate-me](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/automate-me/SKILL.md?plain=1#L15-L83) |

## Observations (not decisions)

These are observations for the grilling tickets. None is a Disposition.

1. **Fill gaps Matt leaves, with little Fan-out.** Four workflows cover steps the Matt flow does not have, and lose little or nothing without Fan-out:
   - `blast-radius` (F0 default) adds a third review axis beside `code-review`'s Standards and Spec.
   - Opening a PR → Babysit → Shipping (F0–F1, plus serial verifiers) cover what happens after `implement` commits.
   - Pause safely extends `handoff`.
   - `create-verification-skill` (F0) supplies the "control skill" that many playbooks assume.

   **[INFERENCE]** These fit the Fan-out-is-opt-in rule without rewriting their core.
2. **Extend existing Matt steps; the core is single-agent.** Their Fan-out is conditional:
   - Bug fix, Perf issue, and both forensics playbooks extend `diagnosing-bugs`.
   - Refactoring fills the space `tdd` L38 leaves to the review stage.
   - Hillclimb adds a metric loop.

   Matt's `diagnosing-bugs` already has the stronger feedback-loop discipline, so these read more like extra phases than replacements.
3. **Most value, most Fan-out-dependent: `architect` and Feature.** Their value depends on independent candidates and a cross-judge. pstack's own fallback, for a subagent that may not spawn, keeps the review separation but not the independence ([feature L12](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/feature.md?plain=1#L12)). Under the same-model rule, the diversity part is gone even with Fan-out opted in.
4. **Model diversity, not concurrency, is the hard conflict.** vstack's same-model rule cannot meet these requirements even with Fan-out opted in:
   - `interrogate` (L9)
   - `show-me-your-work`'s cross-model review (L67)
   - `arena`'s cross-judge (L41)
   - Eval's blinded judge (L21)
   - Orchestrate's verifier family (L17)

   Every workflow that ends in a `show-me-your-work` trail inherits the problem: Hillclimb, Autonomous run, figure-it-out, Orchestrate, and the Autopilots.
5. **Program-scale playbooks depend on Fan-out and on Cursor.** Orchestrate, Autopilot-full, Autopilot-stack, the execution half of Multi-phase plan, and Eval need Fan-out to exist. Several also rely on Cursor-only infrastructure: cloud agents, `/loop`, `/goal`, Bugbot, `cursor-team-kit`, and `agent-transcripts/`. Orchestrate states its own collapse to Autonomous run ([L60](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/skills/poteto-mode/playbooks/orchestrate.md?plain=1#L60)). Separable single-agent pieces: the brief template, the per-head-SHA verification ledger, and the patch-id rule.
6. **Separable pieces of the overlapping planning workflows.** Multi-phase plan overlaps `to-spec`/`to-tickets` but takes the opposite position on file paths. Its per-PR verification blocks and `check-plan.mjs` linter can be separated from the swarm execution. figure-it-out overlaps `wayfinder` in purpose, but it executes where `wayfinder` only plans.
7. **omp porting facts that cut across rows:**
   - omp has no Cursor skill provider, so `.cursor/skills/verify-*` would not be discovered.
   - omp session transcripts live at `~/.omp/agent/sessions/`.
   - omp's `task` tool already offers isolated worktree workspaces and a `task.maxConcurrency` bound ([omp task, `isolated` and Limits](omp://tools/task.md)). That matches pstack's "own worktree per worker" rule.
   - omp's built-in memory tools named `recall` and `reflect` share names with the pstack skills.
