---
name: vstack-edit
description: Make a Hand edit to an existing vstack skill, agent, or rule, from one End-state question to a commit, PR, or merge.
argument-hint: "[<what to change>]"
disable-model-invocation: true
---

# vstack-edit

A Hand edit changes a vstack skill, agent, or rule outside an Update. This flow edits an existing original, adapt, or merge item. It also edits an adopt item after the user confirms the flip to adapt (ADR 0014). It does not add, take, rename, or remove an item. The script refuses those cases.

Run from the root of the vstack checkout. `scripts/vstack-edit.ts` in that checkout owns every deterministic step. Each command prints JSON and exits 0 on success. A refusal or failure exits 2 and prints `{"ok": false, "reason"}`. The README's vstack-edit section documents the commands and the decisions file. The script never makes a judgment. It acts only on the decisions file, and you write that file from the user's answers.

Read GLOSSARY.md, every docs/adr file, and plugin/rules/vstack-prose.md before you draft. Read Upstream data only at the current Pin (ADR 0014). An Upstream version newer than the Pin belongs to skill://vstack-update.

## 1. End state

Settle the End state once, before any other step. If the user named it, use it. Otherwise use one `ask` with Commit (recommended), PR opened, Merge-ready, and Shipped. A timed-out answer is no answer: use `ask` once more, and if that times out too, stop before preflight.

## 2. Preflight

Pick a short kebab-case `<name>` for the change. Run `bun scripts/vstack-edit.ts preflight --root <cwd> --name <name>`. It refuses while an Update branch or an open Update PR exists. Otherwise it makes a new omp worktree from main on the branch `edit/<name>` and prints the run file path in `run`. Every later command takes `--run <run file>`. Do all later work in `worktree.path`. If preflight refuses, report its reason and stop.

## 3. Check

Run `check --run <run file> <artifact> ...` with one artifact per target, such as `plugin/skills/<name>`, `plugin/agents/<name>.md`, or `plugin/rules/<name>.md`. It prints each target's register rows at the current Pins, its Disposition, and its callers from `skill://` and `/skill:` references. If it refuses, report the reason, run `cancel`, and stop. Read every caller before you draft.

An edit makes an adopt target stop matching its Upstream item byte for byte, so its register rows flip to adapt. Before the draft, use one `ask` with one question per target whose Dispositions include adopt. Each question names the target and its current reason, and has two options: `A. Flip to adapt`, with the new one-line reason that the user writes, and `B. Drop this target`. Give no recommended option. A timed-out answer is no answer: use `ask` once more. If that times out too, treat the target as dropped. Keep each confirmed flip and its reason for the decisions file. Remove a dropped target from the run. If no target remains, run `cancel` and stop.

## 4. Draft

Read skill://skill-creator and write the draft with it in the run's worktree. This is an active vstack-edit run, so skill-creator writes only the draft. Change only the targets. A change to any other plugin artifact makes prepare refuse. A flipped adopt target is adapt text after prepare, so its draft must follow every House style rule for adapt text, such as `skill://<name>` for a skill reference. check-register in the gates fails a draft that keeps an Upstream form, such as a bare `/<skill name>`.

## 5. Prepare

Write the decisions file in the run's `out` directory:

```json
{
  "targets": [
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/<name>" },
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/<adopt name>", "flip": { "confirmed": true, "reason": "<the user's new reason>" } }
  ],
  "changelog": ["One line per change, without the leading dash."],
  "commit": "fix(<name>): <what changed>"
}
```

`kind` is `skill`, `agent`, or `rule`. Write `flip` only on an adopt target that the user confirmed in step 3, with the reason that the user gave. Write the CHANGELOG lines and the commit message in the repo's style. Run `prepare --run <run file> --decisions <file>`. It flips the register rows of each confirmed adopt target to adapt with the new reason. It refuses an adopt target with no confirmed flip and a flip on any other target. It raises the patch version from main and adds the lines under Unreleased in CHANGELOG.md. Then it moves every Unreleased line under the new version heading. Run prepare again after every draft change.

## 6. Gates

Run `gates --run <run file>`. It runs quick_validate on each target skill, check-register, the test suite, and the load smoke. Agents and rules get no quick_validate. If gates refuses, read every failure in `reason`, fix the draft in step 4, run prepare, and run gates again. Repeat until gates pass. Never suppress a failure.

## 7. Grilling page

Read skill://grilling-page and keep a Grilling page for this run, with the topic slug `edit-<name>`. Add one round with one question per target. The question asks whether to ship the change as described. Its description says what the target does before the change, what it does after, and who sees the difference: the user, the agent that loads the target, or a caller. Describe behavior and show no diffs. Give two options: `A. Ship as described` (recommended) and `B. Change the draft`. Print the page path, then put every question in one `ask`. After Change the draft, go back to step 4 with the user's note, then run steps 5 to 7 again.

When every target is Ship as described, add the close record, print the page path, and use one `ask` with `Shared understanding` and `Not yet` as the closing gate. Record the answer on the page. Only Shared understanding permits finish. Not yet goes back to step 4 with the user's note. A timed-out answer is no answer: print the path and use `ask` once more. If that times out too, stop without finish and record why in the close note.

## 8. Finish and chain

Run `finish --run <run file> --grilling <state.jsonl>`. It refuses unless the gates passed on the current files and the latest close answer is Shared understanding. It makes one local commit in the worktree and never pushes.

With End state commit, stop and report the commit SHA, the branch, and the worktree path. For a later End state, run skill://open-pr from the worktree with the End state, the branch that this run created, and the vstack root. open-pr is the only step that pushes and opens the PR. For Merge-ready, then run skill://babysit in drive mode. For Shipped, run skill://ship after Merge-ready is observed. Report the End state that the chain reached.

## Cancel

When the user drops the edit, run `cancel --run <run file>`. It removes only this run's worktree and branch.
