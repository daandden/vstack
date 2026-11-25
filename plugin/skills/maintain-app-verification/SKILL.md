---
name: maintain-app-verification
description: "Keep a project's Verify skill and feature map accurate for implement's END-STATE checks in steps 4 and 6b. Private mode edits the shared copy in place."
disable-model-invocation: true
---

# Maintain app verification

Cover features from source and exercise them live. The feature is the unit of coverage, not every sentence.

Follow `skill://flow-page`'s "Stage entry/exit line". Follow skill://implement/END-STATE.md's "Publish delivery progress". Record scoped feature tasks and blockers. Preserve the caller's requested End state. A standalone uncommitted maintenance pass uses `none`.

## Entries and outcomes

A feature-scoped caller names one feature whose smoke check or final Verifier encountered Drift. Run step 0, step 2 for that feature file only, then steps 3–6 for that feature. Skip index hygiene and the source-wave Fan-out. If the caller names no feature, run the full pass over every feature.

Report one outcome:

- `clean` means every feature in the caller's scope got source and live coverage, with nothing to change.
- `changed` means proven corrections are committed in Standard mode, handed back to a caller that commits them, or in place in Private mode.
- `blocked` means coverage could not finish or a correction could not be made safely. State the exact blocker and incomplete coverage.

The introduction to skill://setup-app-verification defines a committing run and the `commit.ts` command. On a committing run, this skill runs the dirty check in step 0 and commits only a `changed` outcome in step 6.

## Edit scope

Edit only the Verify skill's directory: SKILL.md, features, and owned helpers. The Private-mode link and exclude repair in step 0 is the only edit outside it. Never edit product code. Wrong app behavior is a finding, never Drift. Do not rewrite the map to hide a product regression.

Drift is a failure in the Verify skill's instructions while its Doctor check passes. A missing command, route, selector, or fixture can be Drift. If Doctor's own instructions are wrong, correct those instructions within this scope, then require Doctor to pass before classifying the drive. A broken instance is not Drift merely because the run failed.

A server Launch without a named bash service is Drift, even if a manual launch works and Doctor passes. A missing `ready` check, a name not unique to the run, or Cleanup that does not stop that service through `proc://<name>/kill` is also Drift. Repair Launch and Cleanup to the server contract in skill://setup-app-verification step 2, using the run id of the run's Scratch entry. Re-drive the repaired instructions live.

For Python, compare Launch's named Restore and interpreter commands with the current package manager, lockfile, and environment settings. A stale command, missing pin, or external environment target is a Verify skill defect. Apply the existing Drift rule and repair the recipe to skill://setup-app-verification's Restore contract. Never run an unsafe restore to diagnose Drift. Prove a corrected Restore and prefix check before re-driving the affected features.

## 0. Locate the target

Find project skills named `verify-*` whose bodies have Launch and Drive sections and a feature map. In Private mode, also look under `<vstack root>/skills/verify-*/`. Use the root and mode from the Private-mode rule, or the parent's prompt. Treat a link and its target as one candidate.

If several targets remain, inspect their feature maps against the change. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before using `ask` for a remaining choice under `skill://flow-page`'s "Every ask in a Flow". If none exists, return to implement with the missing target and name `skill://setup-app-verification` for setup.

For a Private-mode target with no link, create an absolute `.omp/skills/verify-<app>` symlink in this checkout to the shared skill directory. Add `.omp/skills/verify-*` once to `git rev-parse --git-path info/exclude`, leaving shared ignores unchanged. Report any conflicting directory or link instead of overwriting it. Read SKILL.md by absolute path for the rest of the session. Discovery sees a new link next session.

Read the target skill and follow its helper paths relative to the directory its SKILL.md was read from. Open the marked `verify` session folder through `skill://vstack-tmp`. Keep run notes and proof in a distinct `<app>-<run-id>/` entry inside it, and throwaway app data in its `data/`. Never commit those paths.

On a committing run, run the dirty check now, before any edit, as skill://setup-app-verification step 2 says. Add `--target <dir>`, where `<dir>` is the directory the target's SKILL.md was read from. If `state` refuses because the target is not `.omp/skills/verify-<app>/`, the run is not a committing run. Tell the user in one line that vstack commits only `.omp/skills/verify-<app>/`. Then continue, and leave the corrections uncommitted.

## 1. Index hygiene

Read the feature map README and list its sibling files. Fix missing, extra, duplicate, or dead entries. Do not generate a separate inventory.

## 2. Source wave

For a feature-scoped entry, read source for that one feature yourself and return the same summary and recipe described below. This is one source read, not Fan-out.

For a full pass, use this Fan-out line.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per feature file. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: explain "how does this user-facing feature work?" from source, flag likely Drift with citations, return feature summary / source entry points / likely Drift or none / one recipe, never drive the app or edit files, the vstack root. Wait for every result. If they cannot start, stop: report the outcome as `blocked`, with no source coverage.

## 3. Reconcile

Require a summary for every feature in scope. Merge overlapping recipes into as few app states as practical. Spot-check cited Drift, without re-proving clean claims. For a full pass, sweep recent churn for missing user-facing features. Require a concrete source path before adding one to the map and live pass.

## 4. Live pass

Run the live pass even when source looks clean. The coordinator owns all driving, serially. Follow the Verify skill's Launch model. A long-lived server uses one named bash service for this run. Short-lived CLIs and TUIs use a fresh isolated PTY session per drive. Exercise every feature in this entry's scope at least once.

Keep these invariants throughout the pass:

1. Run Doctor before the first drive, on each fresh session, and again after a failed drive. If Doctor cannot see a wedged UI state, reset to a known state or relaunch before driving again.
2. Make sure that evidence captured so far survives every cleanup at its named location. Do not assume that it survived.
3. Clean residue after every failed iteration, even if its session is stuck, exited, or shared. For a shared instance, clean the run's residue, not the instance. Nothing the drive started outlives its use.

If Doctor fails because its instructions have Drift, fix them under edit scope and retry once. Restart only what the fix invalidated. If that retry fails, report `blocked`. A feature is `verified-unreachable` only with the exact prerequisite, such as auth, entitlement, OS, or external state, and the attempted route. An omitted prerequisite is Drift in the map, not proof of the feature.

Re-drive every harness correction live before it lands. Tear down after the last drive, including these re-proofs. Make sure that evidence and notes survive teardown.

## 5. Triage

Fix wrong or missing user-POV instructions and harness gaps that prevent driving working behavior. Keep helpers executable and show their invocation in SKILL.md, relative to its own directory. Record broken app behavior as product findings. Keep those findings out of the corrections and do not weaken expected results to pass.

Maintain the required proof IDs and passing observations under `skill://ship/references/verdict-record.md`. A correction keeps every required step, including one whose failure blocks acceptance.

## 6. Commit and report

For `changed`, re-read every changed file. Then, on a committing run, commit as skill://setup-app-verification step 5 says, with the same `--target`. If no title convention is visible, use `fix(verify-<app>): <feature>`, where `<feature>` names each fixed feature. If `commit.ts` refused in step 0 or refuses here, report the corrections as uncommitted.

Return the outcome, coverage, changed files, the commit or the caller that commits the output, evidence and run-note paths, and product findings. Private-mode output stays untracked. For `clean`, there is nothing to commit. For `blocked`, leave any edits uncommitted. Report the outcome and coverage honestly.

Publish a delivery table with each scoped feature's coverage, clean, changed, blocked, or verified-unreachable outcome, corrected files, commit ownership, and proof. Keep product findings separate in a Document or ledger. Append Doctor, drive, correction, retry, cleanup, and commit outcomes to a Timeline and attach the captured evidence. Incomplete coverage never becomes clean. For a standalone committing correction, record requested commit before committing and reached commit only after success.
