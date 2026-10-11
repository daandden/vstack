---
name: vstack-edit
description: Make a Hand edit to vstack, adding a new skill, agent, or rule or editing an existing one, from one End-state question to a commit, PR, or merge.
argument-hint: "[<what to change>]"
disable-model-invocation: true
---

# vstack-edit

A Hand edit changes a vstack skill, agent, or rule outside an Update. This flow adds a new original skill, agent, or rule, or edits an existing original, adapt, or merge item. It also edits an adopt item after the user confirms the flip to adapt (ADR 0014). It does not take, rename, or remove an item. The script refuses those cases.

Run from the root of the vstack checkout. `scripts/vstack-edit.ts` in that checkout owns every deterministic step. Each command prints JSON and exits 0 on success. A refusal or failure exits 2 and prints `{"ok": false, "reason"}`. The README's vstack-edit section documents the commands and the decisions file. The script never makes a judgment. It acts only on the decisions file, and you write that file from the user's answers.

Read GLOSSARY.md, every docs/adr file, and plugin/rules/vstack-prose.md before you draft. Read Upstream data only at the current Pin (ADR 0014). An Upstream version newer than the Pin belongs to skill://vstack-update.

## 1. End state

Settle the End state once, before any other step. If the user named it, use it. Otherwise use one `ask` with Commit (recommended), PR opened, Merge-ready, and Shipped. A timed-out answer is no answer: use `ask` once more, and if that times out too, stop before preflight.

## 2. Preflight

Pick a short kebab-case `<name>` for the change. Run `bun scripts/vstack-edit.ts preflight --root <cwd> --name <name>`. It refuses while an Update branch or an open Update PR exists. Otherwise it makes a new omp worktree from main on the branch `edit/<name>` and prints the run file path in `run`. Every later command takes `--run <run file>`. Do all later work in `worktree.path`. If preflight refuses, report its reason and stop.

## 3. Check

Run `check --run <run file> <artifact> ...` with one artifact per target, such as `plugin/skills/<name>`, `plugin/agents/<name>.md`, or `plugin/rules/<name>.md`. Name a new item by the path it will have. check prints each target's `action`: `edit` for an item that main registers, `add` for a name that main does not have. For an edit, it prints the register rows at the current Pins, the Disposition, and the callers from `skill://` and `/skill:` references. Read every caller before you draft.

For an add, check compares the new name with the Upstream items at the current Pins and never fetches a newer ref. A clash refuses with exit code 2 before anything is written. Report the clash, ask the user for another name with `ask`, and run check again with that name. For any other refusal, report the reason, run `cancel`, and stop.

An edit makes an adopt target stop matching its Upstream item byte for byte, so its register rows flip to adapt. Before the draft, use one `ask` with one question per target whose Dispositions include adopt. Each question names the target and its current reason, and has two options: `A. Flip to adapt`, with the new one-line reason that the user writes, and `B. Drop this target`. Give no recommended option. A timed-out answer is no answer: use `ask` once more. If that times out too, treat the target as dropped. Keep each confirmed flip and its reason for the decisions file. Remove a dropped target from the run. If no target remains, run `cancel` and stop.

## 4. Draft

Read skill://skill-creator and write the draft with it in the run's worktree. This is an active vstack-edit run, so skill-creator writes only the draft. Change only the targets. For a new skill, also write its route in `plugin/skills/ask-vstack/SKILL.md`: one `/skill:<name>` line in the section that fits, in the style of its neighbors. check-register fails a shipped skill with no route. A change to any other plugin artifact makes prepare refuse. A flipped adopt target is adapt text after prepare, so its draft must follow every House style rule for adapt text, such as `skill://<name>` for a skill reference. check-register in the gates fails a draft that keeps an Upstream form, such as a bare `/<skill name>`.

## 5. Prepare

Write the decisions file in the run's `out` directory:

```json
{
  "targets": [
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/<name>" },
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/<adopt name>", "flip": { "confirmed": true, "reason": "<the user's new reason>" } },
    { "action": "add", "kind": "agent", "artifact": "plugin/agents/<new name>.md" }
  ],
  "changelog": ["One line per change, without the leading dash."],
  "commit": "fix(<name>): <what changed>"
}
```

`action` is `add` or `edit`, as check printed it. `kind` is `skill`, `agent`, or `rule`. Write `flip` only on an adopt target that the user confirmed in step 3, with the reason that the user gave. Write the CHANGELOG lines and the commit message in the repo's style. Run `prepare --run <run file> --decisions <file>`. It flips the register rows of each confirmed adopt target to adapt with the new reason, and it lists each new item under `originals:` in decision-register.yaml. It refuses an adopt target with no confirmed flip and a flip on any other target. It raises the patch version from main and adds the lines under Unreleased in CHANGELOG.md. Then it moves every Unreleased line under the new version heading. Run prepare again after every draft change.

## 6. Gates

Run `gates --run <run file>`. It runs quick_validate on each skill directory the run added or changed, check-register, the test suite, and the load smoke. Agents and rules get no quick_validate. If gates refuses, read every failure in `reason`, fix the draft in step 4, run prepare, and run gates again. Repeat until gates pass. Never suppress a failure.

## 7. Review

Three reviewers read the final files: every target and every caller that check listed. Each one returns its reviewed paths, its findings, and its open questions without asking. A finding names the file and line, the evidence, and a proposed fix. Give each reviewer the findings that the user accepted in earlier rounds. A reviewer reports an accepted finding again only when the text it names changed.

- Trigger reviewer: compare each changed skill description with the descriptions of its neighbor skills, the skills that ask-vstack routes to for nearby requests. Report an overlap when one request can select either skill. Only for an overlap, run the selection-only trigger evals from skill://skill-creator/references/trigger-evals.md on the target and that neighbor, without the `ask` review of the query set. Return the query set, the scores, and the evidence paths. A skill with `disable-model-invocation: true` gets no trigger evals, because its description never selects it.
- Domain reviewer: check each change against every ADR in docs/adr and every term in GLOSSARY.md. Report a change that contradicts an ADR, a term used with another meaning, and a word that the glossary lists under avoid. Name the ADR or the term.
- Subagent reviewer: look for subagents that run at the same time outside a Fan-out block, including subagents in the skills that a target calls. Also look for asking wording that the ask-tool lint misses: a question for the user that does not go through `ask`.

Resolve the vstack root and the Scratch dir once, as skill://vstack-fan-out describes. Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per reviewer (trigger, domain, subagent); size: target and caller files and their lines.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: that reviewer's brief above with the target and caller paths and the accepted findings, return reviewed paths, findings, and open questions without asking, the user's override words, the vstack root, the Scratch dir.
- inline → do every part yourself, in order, from the same brief.

Finish each inline review before you start the next. When all three reviews are done, run `reviewed --run <run file>`. It refuses unless the files are as the last prepare left them and the last gates pass covers the current text. It records the skill, agent, and rule text that the reviewers read.

After any later change to skill, agent, or rule text, run steps 5, 6, and 7 again, with all three reviewers. A change to only the CHANGELOG lines, the commit message, or a flip reason in the decisions file needs step 5 only: run prepare again. The last gates pass and the last review still cover the text. finish refuses text that changed after the last gates pass or the last `reviewed`, and files that changed after the last prepare.

## 8. Grilling page

Read skill://grilling-page and keep a Grilling page for this run, with the topic slug `edit-<name>`. Add one round with one question per target and one question per finding.

A target question asks whether to ship the change as described. Its description says what the target does before the change, what it does after, and who sees the difference: the user, the agent that loads the target, or a caller. For a new item, before means that the item does not exist. For a new skill, also say where its route sits in ask-vstack. Describe behavior and show no diffs. Give two options: `A. Ship as described` (recommended) and `B. Change the draft`. When the change adds, removes, reorders, or reroutes a step or a branch of an existing item, the question's `visual` is a before-and-after flow figure. Draw it with skill://diagram-design as grilling-page describes. Skip grilling-page's visual judge in this flow: only these figures go on the page.

A finding question asks whether to fix the finding. Its description names the reviewer, the file and line, the evidence, and the proposed fix. Give two options: `A. Fix`, which applies the proposed fix or the user's note, and `B. Accept`, which ships the text as it is. Recommend the option that the evidence supports.

Print the page path, then put every question in one `ask`. After any Change the draft or Fix, go back to step 4 with the user's notes and the fixes, then run steps 5 to 8 again. Keep each accepted finding for the next review.

When every target is Ship as described and every finding is Accept, add the close record, print the page path, and use one `ask` with `Shared understanding` and `Not yet` as the closing gate. Record the answer on the page. Only Shared understanding permits finish. Not yet goes back to step 4 with the user's note. A timed-out answer is no answer: print the path and use `ask` once more. If that times out too, stop without finish and record why in the close note.

## 9. Finish and chain

Run `finish --run <run file> --grilling <state.jsonl>`. It refuses unless the files are as the last prepare left them, the last gates pass and the last `reviewed` cover the current text, and the latest close answer is Shared understanding. It makes one local commit in the worktree and never pushes.

With End state commit, stop and report the commit SHA, the branch, and the worktree path. For a later End state, run skill://open-pr from the worktree with the End state, the branch that this run created, and the vstack root. open-pr is the only step that pushes and opens the PR. For Merge-ready, then run skill://babysit in drive mode. For Shipped, run skill://ship after Merge-ready is observed. Report the End state that the chain reached.

## Cancel

When the user drops the edit, run `cancel --run <run file>`. It removes only this run's worktree and branch.
