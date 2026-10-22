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

**Diagram upstream**:
The Upstream whose single skill draws every figure vstack shows a person: `cathrynlavery/diagram-design`.
_Avoid_: diagram dependency, diagram plugin

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
The exact Upstream version vstack was last reconciled with: a release tag for the Base upstream, a full commit SHA for the Enhancement upstream, the Diagram upstream, and the CSS upstream.
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
A hidden vstack skill that the jev judge selects during a Matt run, or that a skill reads through a `skill://` pointer. It holds the knowledge that one or more Matt skills need for one kind of work, such as a vstack Update. It can carry text from any Upstream, the Base upstream included, and stays an Addon. Matt skills do the work, and an Addon has no flow of its own. The user never starts one by name.
_Avoid_: extension, plugin

**Utility skill**:
A vstack skill that is not a Matt skill and that the user can use whatever the work is. unslop, technical-writing, diagram-design, good-css, and skill-creator set how text, figures, styles, and skills are made. explain, how, why, and forensics answer questions about existing work. in-your-own-words and ketchup check that the user and the agent agree. The first restates the user's goal, and the second catches the user up. clean-wt removes omp checkouts that nothing uses anymore. The hidden helpers are vstack-tmp, vstack-fan-out, vstack-figures, grilling-page, and vstack-worktree. Other skills name these helpers by `skill://`. Utility skills can start from their descriptions, from a rule, or by name, subject to each skill's invocation settings.
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
How far a flow that produces a commit goes before it stops: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped means every PR in the run is merged into the default branch; deploys and releases are not part of it. The flow settles it once, before it starts.
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
A vstack output that nothing reads after its run, such as an explanation page, proof evidence, an eval workspace, or a hillclimb attempt log. It is kept under `~/.vstack/tmp/`, grouped by project, until vstack-clean deletes it after a retention period. Temporary files a script creates and deletes itself are not Scratch. A later Stage of the same flow can continue a Grilling page.
_Avoid_: temp files, artifacts, tmp output

**Grilling page**:
The page that one flow keeps for the user across all its Stages. A flow is the run of skills on one change, such as grill-with-docs through implement-spec, or on one tracker item, such as the triage of one issue. The page shows every `ask` of the flow as a question in full, with its context, options, trade-offs, and the answer given, while the `ask` call carries only the question and its option labels. It is Scratch.
_Avoid_: Grilling HTML, question page, round page

**Stage**:
One skill's part of a flow on the flow's Grilling page, such as the to-spec part or one wayfinder ticket. Each Stage has its own tab and a state: not started, in progress, or finished.
_Avoid_: step, phase, section

**Report block**:
A report that a Stage shows on the Grilling page before the questions it leads to, such as code-review's findings or to-tickets' proposed breakdown. It has one of three shapes. Cards show one finding or candidate each, with its impact, evidence, and suggested action. A ledger lists claims, each confirmed, cleared, or unproven, with its evidence and the proof that is missing. A table lists rows under named columns, such as tickets or run results.
_Avoid_: result block, stage result, report section

**Background**:
An explanation at the top of a Stage tab that gives the context that all of the Stage's questions share. A question's own rationale stays in its description.
_Avoid_: intro, explain block, context section

**Topic note**:
An explanation of one concept that the Grilling page shows once, in a shared area, and that questions in any Stage link to. It differs from a Term note, which defines one name in one line on one question.
_Avoid_: explain block, glossary entry

**flow.json**:
The file beside a flow's Grilling page that names the flow's original topic slug, its spec issue, tickets, branch, and run ids. A later Stage, even one in another omp session, finds the flow's page by any of them.
_Avoid_: flow manifest, flow index

**Context diagram**:
A figure on a Grilling page question that shows the logic its description and Today facts explain: steps, branches, states, parts, or time.
_Avoid_: background figure

**Option diagram**:
A figure on a Grilling page question that shows how its options differ in shape.
_Avoid_: comparison figure

**Verify skill**:
A project-local skill named `verify-<app>` that drives the project's app the way a user does and captures proof that a change works. setup-app-verification creates it, and maintain-app-verification keeps it accurate.
_Avoid_: control skill, verification skill

**Drift**:
A failure in a Verify skill's own instructions, such as a missing command, route, selector, or fixture, while the skill's Doctor check passes. Wrong app behavior is a finding, never drift.
_Avoid_: stale, rot
