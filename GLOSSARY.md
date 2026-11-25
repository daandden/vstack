# vstack

vstack is a personal agent-skills pack for omp. It is built on Matt Pocock's skills and adds selected skills and guidance from other Upstreams.

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

**UI upstream**:
The Upstream that vstack selects UI and interaction guidance from: `emilkowalski/skills`.
_Avoid_: Design upstream, animation upstream, Emil upstream

**Upstream item**:
One skill, principle, or playbook published by an Upstream.
_Avoid_: upstream skill (when principles or playbooks are meant too)

**Playbook**:
A pstack recipe for one type of task, such as Shipping or Perf issue: an ordered list of steps that calls skills. Upstream, it lives under poteto-mode and runs only through poteto-mode's router. In vstack, a playbook that joins ships as its own skill.
_Avoid_: workflow (when a pstack playbook is meant), recipe

**Pin**:
The exact Upstream version vstack was last reconciled with: a release tag for the Base upstream, and a full commit SHA for the Enhancement upstream, CSS upstream, and UI upstream.
_Avoid_: lock, version (unqualified)

### Skills

**Matt skill**:
A vstack skill that has at least one Base upstream row in the Decision register, whether its Disposition is adopt, adapt, or merge, and that is not an Addon. Matt skills are the core of vstack, and the user starts all changes through them.
_Avoid_: core skill, base skill

**Matt flow**:
Every Matt skill that only the user can start, such as grill-with-docs, grill-me, teach, implement, and implement-spec. A change takes one path through it, with the grill first and a build skill last. grill-with-docs continues into to-spec on its own once the grill agrees. After to-spec, the user types implement for a change that fits one session, or to-tickets and then implement-spec for a bigger one. grill-me never continues on its own, so the user types the next skill.
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
A vstack skill that is not a Matt skill and that the user can use whatever the work is. unslop, technical-writing, good-css, the skills derived from the UI upstream, and skill-creator set how text, styles, interfaces, and skills are made. explain, how, why, and forensics answer questions about existing work. interrogate reports only adversarial findings that the coordinator reproduces, without fixes. in-your-own-words restates the user's goal so that the user and the agent agree. clean-wt removes omp checkouts that nothing uses anymore. clean-adr archives ADRs that no longer fully hold and restates what holds. The hidden helpers are vstack-tmp, vstack-fan-out, vstack-figures, flow-page, and vstack-worktree. Other skills name these helpers by `skill://`. Utility skills can start from their descriptions, from a rule, or by name, subject to each skill's invocation settings.
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

**ADR archive**:
The run-time folders at `archive/<date>T<HHMM>/` inside an ADR directory that hold ADRs that no longer hold or that a newer ADR replaced. Each run uses a new folder and refuses an existing destination. It is history that explains why, never a rule to respect.
_Avoid_: old ADRs, deprecated ADRs, ADR history

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

**Merger**:
The subagent that lands one patch on implement-spec's integration branch. It commits a ticket or stages a non-maintain review-fix wave for the later shared commit. It owns path scope, conflict resolution, and checks on unproven trees. Content review belongs to code-review.
_Avoid_: merge agent, lander, reviewer (for this)

**Headless run**:
A run of a skill under test, or of its blind judge, in its own omp process that sees only what the test gives it. It is not a subagent, so it is never Fan-out, but it uses the Session model.
_Avoid_: eval subagent, runner (unqualified)

**Update**:
The confirmed process of moving one or more Pins forward and adapting vstack to the Upstream changes.
_Avoid_: sync, upgrade

**Hand edit**:
A change to a vstack skill, agent, or rule made outside an Update: adding one, editing one, taking an Upstream item at its current Pin, or renaming or removing one.
_Avoid_: update (for this), manual edit, patch

**Change note**:
One small file that an Update or Hand edit adds to describe its own change and its version level, until a Plugin release folds it into the CHANGELOG.
_Avoid_: changeset, changelog fragment, Unreleased line

**Plugin release**:
The maintainer-run step that folds the Change notes pending when it is prepared into the CHANGELOG under a dated heading and raises the plugin version once. It is vstack's own release, not the deploys and releases of a user's project that the End state excludes.
_Avoid_: release (unqualified), version bump, cutting a version

**End state**:
How far a flow that produces a commit goes before it stops: commit, merge-ready, or shipped. Commit stays on the run's branch. Merge-ready opens a PR and drives it until it can merge. Shipped means every PR in the run is merged into the default branch; deploys and releases are not part of it. The flow settles it once, before it starts: from the user's words or the ticket, else from the project's default End state, which the user chose once for the project.
_Avoid_: goal, target, finish line

**Code host**:
The service that holds a repo's remote and its PRs, such as GitHub, GitLab, or Bitbucket. It is a separate choice from the issue tracker: a repo on Bitbucket can track its issues in Jira.
_Avoid_: git host, VCS host, forge

**MCP binding**:
Which tool of an MCP issue tracker to-tickets uses for each tracker action, what each call receives from the drafted tickets and project facts, and where a read finds each issue field. The agent drafts it from the server's live tool descriptions and publishes it beside the ticket breakdown without an approval question. The publisher checks it against the live server before it publishes or resumes.
_Avoid_: tool discovery, tool map, route (routes belong to CLI trackers)

**Landing method**:
How ship merges a PR into its target, named as the Code host names it, such as `rebase` or `squash` on GitHub and `ff` on GitLab. The user picks it once per project from the methods the Code host allows.
_Avoid_: merge method, merge strategy, ship method

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
A vstack output kept under `~/.vstack/tmp/`, grouped by project and by the omp session that wrote it, until vstack-clean deletes it after a retention period. Temporary files a script creates and deletes itself are not Scratch. A later Stage of the same flow can continue a Flow page.
_Avoid_: temp files, artifacts, tmp output

**Flow**:
Related vstack work on one change, tracker item, or topic across one or more skill runs. A standalone explanation can start a flow without a grill or a tracker item.
_Avoid_: session, Matt run

**Flow page**:
The document one Flow keeps across all its Stages, including questions, answers, Result blocks, shared explanations, and workflow progress. It is Scratch.
_Avoid_: Grilling page, Grilling HTML, question page, round page

**Flow panel**:
The omp panel above the composer that shows the live Flow page link while a question picker in a Flow is open. It goes away when the picker closes, and its text never reaches the model.
_Avoid_: Flow popup, Flow card, Flow link note, Flow notification

**Focused Stage**:
The Stage the Flow page shows. Its open questions are the ones the page's `n` key cycles. In Tern, the vstack-flow plugin sets the Focused Stage from the omp session most recently focused in the page's tab.
_Avoid_: current Stage, active Stage, followed Stage

**Picker presence**:
The Local Flow host's short-lived record that one omp session has a question picker open, with its Stage and asked questions. It is not Flow content and is gone when the picker closes, the host restarts, or it expires.
_Avoid_: open ask, asking state, active ask

**Map panel**:
The Flow page dialog that the `m` key opens. It lists Stages waiting for an answer first, then in-progress Stages without open questions, then finished Stages grouped by ticket. Its other tabs show the Matt flow path and the Wayfinder ticket graph when present.
_Avoid_: Stage tree, Stages popup, path banner

**Local Flow host**:
The detached local server for one operating-system user that serves live Flow pages, runs captured prototypes on a separate origin, and observes git, the Code host, and the CI service read-only. The normal host uses the user's home namespace, while an explicit isolated `--home` namespace has its own host identity.
_Avoid_: Flow server, page server, daemon

**Flow alias**:
A qualified name that finds one Flow: `spec:`, `ticket:`, `branch:`, `run:`, `folder:`, or `slug:` and a value. The Flow's id never changes, and an alias only finds it. A lookup that matches no Flow or several is refused. Historical Grilling folders kept these names in `flow.json`.
_Avoid_: flow key, flow.json

**Stage**:
One skill's part of a Flow, such as a research run, a to-spec run, or one wayfinder ticket. It has a state of not started, in progress, or finished and may belong to a parent Stage.
_Avoid_: step, phase, section

**Result block**:
A Stage's output on the Flow page, such as a research document, a prototype comparison, review findings, or run results. Result is its authoring short form.
_Avoid_: Report block, stage result, report section

**Reader comment**:
A note a reader attaches to text or a block of one Result revision on the Flow page, saved to the Flow. It is never an answer and never consent.
_Avoid_: feedback, annotation, Flow comment, review comment

**Correction**:
Content that a later Stage publishes to correct an earlier block of the same Flow, such as a Result, a Background, or an answer reading, linked to that block. The earlier block stays as published and shows where it was corrected.
_Avoid_: erratum, superseding block, retraction, amendment

**Architecture assessment**:
A grill's trace of the systems a change touches and the two shapes it sketches for the change, at the level of owners, modules, and contracts, before the user agrees one.
_Avoid_: architecture gate, complexity score

**Architecture brief**:
The agreed visual account of a change's architecture, including responsibilities, interactions, relevant guarantees, constraints, and trade-offs.
_Avoid_: code scaffold, implementation plan

**Design baseline**:
The OpenPencil .fig file that one change agreed on, identified by its recorded SHA-256. implement and Verify build and check against it, while the live design document can keep changing.
_Avoid_: design handoff, mockup, PNG export

**Blast radius**:
The review axis that lists what code outside a diff depends on and may break. code-review runs it through the blast-radius skill, and a PR body reports it under its Blast Radius heading. It is not a security review.
_Avoid_: Safety (for this axis), safety review

**Background**:
Shared context for a Stage's questions. It contains facts and explanations those questions build on, rather than one question's own rationale.
_Avoid_: intro, explain block, context section

**Decision brief**:
The labelled lines under a Flow page question's title that say where the work stands, why the question is asked or asked again, the agent's recommendation or why it has none, and what the answer unblocks and how it can be undone. It is the question's own decision context, while a Background is shared by a Stage's questions.
_Avoid_: question brief, decision context, why-now block

**Topic note**:
A shared explanation of one concept that questions in any Stage can reference. It differs from a Term note, which defines one name on one question.
_Avoid_: explain block, glossary entry

**Jump row**:
A list of links to content in a Flow page reading view, following that view's reading order, that the reader opens on demand.
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
What an element in a figure is or what happened to it, established by source kind, Mermaid role, or an explicit caller binding, such as `ok`, `store`, or `external`. Each Color role has one fixed Catppuccin accent, drawn as a tinted fill with an accent border in the reader's Latte or Mocha theme and in exported figures alike. Category colors encode identity instead of role and can reuse those accents.
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

**Costly seam**:
A test seam whose test reaches a real service beyond localhost, needs a real credential, account, or paid quota, or whose test command runs for more than 180 seconds. It is the only kind of test seam the agent asks the user about before it tests there.
_Avoid_: expensive test, heavy seam

**Bookkeeping list**:
The fixed kinds of decision that the agent settles without asking in a grill, on top of reversible decisions it can cite: behavior-preserving refactors and cleanup, recording a decision the user already made as an ADR, and carrying settled terms into the glossary. Each one is still listed as an Assumed pick.
_Avoid_: auto decisions, agent-owned list, trust list

**Settle-or-ask test**:
The shared rule every vstack skill applies before a question reaches the user. The agent settles the decision as an Assumed pick unless a reason to ask applies: it is a matter of taste, a later edit cannot undo it, no fact, ADR, convention, or cheap experiment decides it, it needs the user's consent or a fact only the user has, or the user or a decision record requires the question. The Bookkeeping list names kinds the agent always settles.
_Avoid_: ask gate, three-part test

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
