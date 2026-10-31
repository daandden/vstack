# vstack

vstack is a personal agent-skills pack for omp. It is built on Matt Pocock's skills and adds selected pstack skills, principles, and playbooks, and it can be updated from both sources.

## Language

### Sources

**Upstream**:
An external skills repository that vstack derives content from. Each one has its own kind, named below.
_Avoid_: source repo, origin, vendor

**Base upstream**:
The Upstream vstack is built on: `mattpocock/skills`.
_Avoid_: matt-install, core

**Enhancement upstream**:
The Upstream that vstack adds selectively from: poteto's pstack at `cursor/plugins`, directory `pstack/`.
_Avoid_: pstack fork, plugin

**CSS upstream**:
The Upstream that vstack takes its CSS rules from: `vojtaholik/good-css`.
_Avoid_: good-css upstream, style upstream

**Upstream item**:
One skill, principle, or playbook published by an Upstream.
_Avoid_: upstream skill (when principles or playbooks are meant too)

**Playbook**:
A pstack recipe for one type of task, such as Shipping or Perf issue: an ordered list of steps that calls skills. Upstream, it lives under poteto-mode and runs only through poteto-mode's router. In vstack, a playbook that joins ships as its own skill.
_Avoid_: workflow (when a pstack playbook is meant), recipe

**Pin**:
The exact Upstream version vstack was last reconciled with: a release tag for the Base upstream, and a full commit SHA for the Enhancement upstream and CSS upstream.
_Avoid_: lock, version (unqualified)

### Skills

**Matt skill**:
A vstack skill that has at least one Base upstream row in the Decision register, whether its Disposition is adopt, adapt, or merge, and that is not an Addon. Matt skills are the core of vstack, and the user starts all changes through them.
_Avoid_: core skill, base skill

**Matt flow**:
Every Matt skill that only the user can start, such as grill-with-docs, grill-me, teach, implement, and implement-spec. A change takes one path through it, with the grill first and a build skill last. After the grill, the user picks the path and types the next skill. A change that fits one session goes to implement. A bigger change goes through to-spec and to-tickets to implement-spec.
_Avoid_: main flow, pipeline, workflow (unqualified)

**Matt run**:
The part of the active conversation branch that follows the prompt where the user typed `/skill:<name>` for a Matt skill. A copy of a skill prompt pasted into a message does not start one.
_Avoid_: skill run, Matt session

**Addon**:
A hidden vstack skill that the Addon judge selects during a Matt run, or that a skill reads through a `skill://` pointer. It holds the knowledge that one or more Matt skills need for one kind of work, such as a vstack Update. It can carry text from any Upstream, the Base upstream included, and stays an Addon. Matt skills do the work, and an Addon has no flow of its own. The user never starts one by name.
_Avoid_: extension, plugin

**Addon judge**:
The native judge model that omp's judge role names, which selects Addons during a Matt run. Any native judge can be it, but vstack calibrates its selection against jev.
_Avoid_: jev judge, principle judge

**Utility skill**:
A vstack skill that is not a Matt skill and that the user can use whatever the work is. unslop, technical-writing, good-css, and skill-creator set how text, styles, and skills are made. explain, how, why, and forensics answer questions about existing work. in-your-own-words restates the user's goal so that the user and the agent agree. clean-wt removes omp checkouts that nothing uses anymore. The hidden helpers are vstack-tmp, vstack-fan-out, vstack-figures, flow-page, and vstack-worktree. Other skills name these helpers by `skill://`. Utility skills can start from their descriptions, from a rule, or by name, subject to each skill's invocation settings.
_Avoid_: standalone skill, helper skill

**Command**:
A slash command that the vstack extension adds, such as `/vstack-clean`. It runs a fixed job with no model and no judgment, and the user starts it by name. It is not a skill, so it is not a Matt skill, a Utility skill, or an Addon.
_Avoid_: extension command, Addon command

### Choices

**Disposition**:
What vstack did with an Upstream item: adopt, adapt, merge, or reject.
_Avoid_: verdict, status

**Adopt**:
Ship an Upstream item byte-for-byte as it is at the Pin, under its Upstream name. An item on Hold matches the version it is held at instead. The one exception is Codex's `agents/openai.yaml`, which vstack never ships.
_Avoid_: copy, vendor

**Adapt**:
Ship a changed copy of an Upstream item. Any change counts, including a rename, a swapped reference, an omp tool name, or a behavior change such as running a step's parts as Fan-out.
_Avoid_: port, fork

**Merge**:
Combine an item from each Upstream that covers the same ground into one vstack item.
_Avoid_: combine, fold (unqualified)

**Reject**:
Leave an Upstream item out of vstack.
_Avoid_: drop, skip

**Hold**:
Keep one Upstream item reconciled with an older Upstream version than its Pin, recorded on its Decision register row. The next Update diffs the item from that older version.
_Avoid_: skip, freeze, pin (for one item)

**Decision register**:
The table listing every Upstream item with its Disposition and a one-line reason, linking an ADR when the choice was a real trade-off.
_Avoid_: manifest (for this table), ADR list

**House style**:
The written rules that turn Upstream text into vstack text: exact replacement rows, plus the spawn, skill-reference, and asking rules. Applying any of it to an item makes that item adapt. An adopt item is touched only by a row or rule that every vstack artifact must follow, and that touch flips it to adapt.
_Avoid_: substitution list, style guide

### Behavior

**Session model**:
The model of the session that starts a subagent or a Headless run. For the user's own session, it is the model the user chose. A vstack subagent uses its caller's Session model unless the user has set a model for that agent in omp's settings. Either way, the model the subagent runs on is the Session model for everything it starts, so an override carries down to its own subagents and Headless runs.
_Avoid_: parent's model, run's model

**Fan-out**:
One skill step running two or more subagents at the same time. A step with two or more parts always fans out: no judgment of the job's size decides it, the agent at that step never does the parts itself, and the user's words, such as "sequential" or "no fan-out", do not turn it off. If the subagents cannot start, the step stops and says why. A step that draws figures gives each figure its own subagent. Every subagent uses the Session model of the step's session unless the user has set a model for its agent.
_Avoid_: swarm, parallelism (unqualified)

**Brief**:
The instruction that a parent writes for one subagent, sent as that subagent's first message. It names the subagent's part, its inputs, and how the part is accepted. The Addon judge reads only the brief.
_Avoid_: prompt (for this), assignment

**Shared context**:
The one block of background that a parent gives to every subagent it starts in one call, a single subagent included, placed in each subagent's system prompt. It holds only what every part needs. A subagent started from an eval cell gets none.
_Avoid_: brief (for this), shared brief

**Shared checkout**:
The checkout that a session and its non-isolated subagents use together. A subagent that moves HEAD or edits files there changes the user's own working tree, whether that checkout is the main one or a linked worktree.
_Avoid_: original branch, main checkout (for this), parent checkout

**Isolated clone**:
omp's private copy of a checkout for one subagent, with its own repository metadata, so moving HEAD there leaves the Shared checkout alone. Its changes come back only as a patch or branch that the parent chooses to apply.
_Avoid_: sandbox, worktree (for this), isolated checkout

**Headless run**:
A run of a skill under test, or of its blind judge, in its own omp process that sees only what the test gives it. It is not a subagent, so it is never Fan-out, but it uses the Session model.
_Avoid_: eval subagent, runner (unqualified)

**Update**:
The confirmed process of moving one or more Pins forward and adapting vstack to the Upstream changes.
_Avoid_: sync, upgrade

**Hand edit**:
A change to a vstack skill, agent, or rule made outside an Update: adding one, editing one, taking an Upstream item at its current Pin, or renaming or removing one.
_Avoid_: update (for this), manual edit, patch

**End state**:
How far a flow that produces a commit goes before it stops: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped means every PR in the run is merged into the default branch; deploys and releases are not part of it. The flow settles it once, before it starts: from the user's words or the ticket, else from the project's default End state, which the user chose once for the project.
_Avoid_: goal, target, finish line

**Code host**:
The service that holds a repo's remote and its PRs, such as GitHub, GitLab, or Bitbucket. It is a separate choice from the issue tracker: a repo on Bitbucket can track its issues in Jira.
_Avoid_: git host, VCS host, forge

**CI service**:
The service that runs a repo's builds and checks, such as GitHub Actions, GitLab CI, or Jenkins. It is a separate choice from the Code host.
_Avoid_: CI provider, CI server, build server, CI host

**Migration**:
Moving one project that is set up for the Base upstream onto vstack, before its vstack setup. It changes only that project and its shared private store. Machine state such as global skills, global rules, and diagram profiles is not part of it.
_Avoid_: conversion, reinstall, machine Migration

**Private mode**:
A project setup where vstack's project config and workflow artifacts are kept untracked under the git common directory and shared by all of the project's worktrees. The default, Standard mode, keeps them tracked in the repo.
_Avoid_: private storage, private setup

**vstack root**:
The absolute directory where a run writes the project's vstack config and workflow artifacts: `vstack/` under the git common directory in Private mode, or the main checkout's repo root in Standard mode. The top-level agent resolves it once and passes it to every subagent, which writes there instead of resolving it again.
_Avoid_: artifact dir, private root

**Scratch**:
A vstack output kept under `~/.vstack/tmp/`, grouped by project, until vstack-clean deletes it after a retention period. Temporary files a script creates and deletes itself are not Scratch. A later Stage of the same flow can continue a Flow page.
_Avoid_: temp files, artifacts, tmp output

**Flow**:
Related vstack work on one change, tracker item, or topic across one or more skill runs. A standalone explanation can start a flow without a grill or a tracker item.
_Avoid_: session, Matt run

**Flow page**:
The document one Flow keeps across all its Stages, including questions, answers, Result blocks, shared explanations, and workflow progress. It is Scratch.
_Avoid_: Grilling page, Grilling HTML, question page, round page

**Local Flow host**:
The detached local server for one operating-system user that serves live Flow pages, runs captured prototypes on a separate origin, and observes git, the Code host, and the CI service read-only. The normal host uses the user's home namespace, while an explicit isolated `--home` namespace has its own host identity.
_Avoid_: Flow server, page server, daemon

**Flow alias**:
A qualified name that finds one Flow: `spec:`, `ticket:`, `branch:`, `run:`, `folder:`, or `slug:` and a value. The Flow's id never changes, and an alias only finds it. A lookup that matches no Flow or several is refused. Historical Grilling folders kept these names in `flow.json`.
_Avoid_: flow key, flow.json

**Stage**:
One skill's part of a Flow on its Flow page, such as a research run, the to-spec part, or one wayfinder ticket. Each Stage has its own tab and a state: not started, in progress, or finished.
_Avoid_: step, phase, section

**Result block**:
A Stage's output on the Flow page, such as a research document, a prototype comparison, review findings, or run results. Result is its authoring short form.
_Avoid_: Report block, stage result, report section

**Blast radius**:
The review axis that lists what code outside a diff depends on and may break. code-review runs it through the blast-radius skill, and a PR body reports it under its Blast Radius heading. It is not a security review.
_Avoid_: Safety (for this axis), safety review

**Background**:
An explanation at the top of a Stage tab that gives the context that all of the Stage's questions share. A question's own rationale stays in its description.
_Avoid_: intro, explain block, context section

**Topic note**:
An explanation of one concept that the Flow page shows once in its Topics tab and that questions in any Stage link to. It differs from a Term note, which defines one name in one line on one question.
_Avoid_: explain block, glossary entry

**Jump row**:
The row of links under a Flow page's Stage tabs. It has one link for each part of the open tab, in page order: its Background, each Result block, each question, and the latest summary.
_Avoid_: Q row, question nav, navigation

**Term note**:
A one-line definition on one question of the Flow page, for a name that a newcomer may not know, such as a glossary term, a skill or file name, or an ADR number. A concept that several questions need is a Topic note instead.
_Avoid_: glossary note, definition block

**Visual kind**:
The job a visual does for the reader of a Flow page question, chosen from what the reader needs to answer it: a Source view, a source excerpt, a Context diagram, an Option diagram, an option preview, a Before and after, a comparison table, a Data chart, or a Scenario walkthrough.
_Avoid_: Diagram kind, diagram type (when the visual's job is meant)

**Context diagram**:
A Visual kind that shows how something works today: steps, branches, states, parts, or time.
_Avoid_: background figure

**Option diagram**:
A Visual kind that shows how a question's options differ in shape.
_Avoid_: comparison figure

**Color role**:
What an element in a figure is or what happened to it, established by source kind, Mermaid role, or an explicit caller binding, such as `ok`, `store`, or `external`. vstack-figures draws each Color role in one fixed Catppuccin Mocha accent. Category colors encode identity instead of role and can reuse those accents.
_Avoid_: color class, highlight color

**Source view**:
A Visual kind: a crop or screenshot of the real artifact a question is about, with its subject marked and enough surroundings to locate it.
_Avoid_: reference image, locator (when a crop of the source is meant)

**Before and after**:
A Visual kind that shows the current state beside the state one option would produce.
_Avoid_: diff view (when it is not a text diff)

**Data chart**:
A Visual kind that shows measured numbers a decision turns on, such as cost, time, or counts.
_Avoid_: graph (unqualified)

**Scenario walkthrough**:
A Visual kind that runs one concrete case through each option, step by step, to show where the options part.
_Avoid_: example (when a run through the options is meant)

**Verify skill**:
A project-local skill named `verify-<app>` that drives the project's app the way a user does and captures proof that a change works. setup-app-verification creates it, and maintain-app-verification keeps it accurate.
_Avoid_: control skill, verification skill

**Verifier**:
An independent agent that did not write a change and runs it the way a user would to judge its behavior. The author's own checks are not independent verification.
_Avoid_: checker, reviewer

**Verdict**:
A Verifier's judgment of one patch, with evidence: PASS, PASS+NOTES, FAIL, DRIFT, or REFUSED. REFUSED is unavailable proof. An optional `cleanup_error` preserves the judgment and evidence but makes the proof unavailable, even for PASS or PASS+NOTES.
_Avoid_: status, result

**Drift**:
A failure in a Verify skill's own instructions, such as a missing command, route, selector, or fixture, while the skill's Doctor check passes. Wrong app behavior is a finding, never drift.
_Avoid_: stale, rot

**Refused**:
A verifier outcome where nothing was checked, because the verifier could not prove it runs in an Isolated clone or could not set up a usable tree at the head commit. It is neither a finding nor Drift.
_Avoid_: blocked, skipped, unavailable (for this)
