---
name: maintain-app-verification
description: "Keep a project's Verify skill and feature map accurate. Use /skill:maintain-app-verification for a full source and live pass, or for one feature with Drift. Standard mode commits proven corrections; Private mode edits the shared copy in place."
disable-model-invocation: true
---

# Maintain app verification

Cover features from source and exercise them live. The feature is the unit of coverage, not every sentence.

## Entries and outcomes

A feature-scoped caller names one feature whose live proof encountered Drift. Run step 0, step 2 inline for that feature file only, then steps 3–6 for that feature. Skip index hygiene and the source-wave gate. Standalone invocation runs the full pass over every feature.

Report one outcome:

- `clean` means every feature in the entry's scope got source and live coverage, with nothing to change. Create no branch or PR.
- `changed` means proven corrections landed as one commit in Standard mode or in place in Private mode.
- `blocked` means coverage could not finish or a proven correction could not land safely. State the exact blocker and incomplete coverage.

## Edit scope

Edit only the Verify skill's directory: SKILL.md, features, and owned helpers. The Private-mode link and exclude repair in step 0 is the only edit outside it. Never edit product code. Wrong app behavior is a finding, never Drift. Do not rewrite the map to hide a product regression.

Drift is a failure in the Verify skill's instructions while its Doctor check passes. A missing command, route, selector, or fixture can be Drift. If Doctor's own instructions are wrong, correct those instructions within this scope, then require Doctor to pass before classifying the drive. A broken instance is not Drift merely because the run failed.

## 0. Locate the target

Find project skills named `verify-*` whose bodies have Launch and Drive sections and a feature map. In Private mode, also look under `<vstack root>/skills/verify-*/`. Use the root and mode from the Private-mode rule, or the parent's prompt. Treat a link and its target as one candidate.

If several targets remain, choose through `ask`. If none exists, stop and point to `/skill:setup-app-verification`.

For a Private-mode target with no link, create an absolute `.omp/skills/verify-<app>` symlink in this checkout to the shared skill directory. Add `.omp/skills/verify-*` once to `git rev-parse --git-path info/exclude`, leaving shared ignores unchanged. Report any conflicting directory or link instead of overwriting it. Read SKILL.md by absolute path for the rest of the session. Discovery sees a new link next session.

Read the target skill and follow its helper paths relative to the directory its SKILL.md was read from. Resolve Scratch through `skill://vstack-tmp` at the top level, or use the parent's Scratch dir. Keep run notes and proof at `<Scratch dir>/verify/<app>-<run-id>/`, and throwaway app data in its `data/`. Never commit those paths.

## 1. Index hygiene

Read the feature map README and list its sibling files. Fix missing, extra, duplicate, or dead entries. Do not generate a separate inventory.

## 2. Source wave

For a feature-scoped entry, read source for that one feature yourself and return the same summary and recipe described below. This is one source read, not Fan-out.

For a standalone entry, find the source entry points for each feature file and count them for the gate.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per feature file; size: source entry points per feature.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: explain "how does this user-facing feature work?" from source, flag likely Drift with citations, return feature summary / source entry points / likely Drift or none / one recipe, never drive the app or edit files, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## 3. Reconcile

Require a summary for every feature in scope. Merge overlapping recipes into as few app states as practical. Spot-check cited Drift, without re-proving clean claims. For standalone entries, sweep recent churn for missing user-facing features. Require a concrete source path before adding one to the map and live pass.

## 4. Live pass

Run the live pass even when source looks clean. The coordinator owns all driving, serially. Follow the Verify skill's Launch model. Servers and UIs use one long-lived instance. Short-lived CLIs use a fresh isolated session per drive. Exercise every feature in this entry's scope at least once.

Keep these invariants throughout the pass:

1. Run Doctor before the first drive, on each fresh session, and again after a failed drive. If Doctor cannot see a wedged UI state, reset to a known state or relaunch before driving again.
2. Make sure that evidence captured so far survives every cleanup at its named location. Do not assume that it survived.
3. Clean residue after every failed iteration, even if its session is stuck, exited, or shared. For a shared instance, clean the run's residue, not the instance. Nothing the drive started outlives its use.

If Doctor fails because its instructions have Drift, fix them under edit scope and retry once. Restart only what the fix invalidated. If that retry fails, report `blocked`. A feature is `verified-unreachable` only with the exact prerequisite, such as auth, entitlement, OS, or external state, and the attempted route. An omitted prerequisite is Drift in the map, not proof of the feature.

Re-drive every harness correction live before it lands. Tear down after the last drive, including these re-proofs. Make sure that evidence and notes survive teardown.

## 5. Triage

Fix wrong or missing user-POV instructions and harness gaps that prevent driving working behavior. Keep helpers executable and show their invocation in SKILL.md, relative to its own directory. Record broken app behavior as product findings. Keep those findings out of the correction commit and do not weaken expected results to pass.

## 6. Commit or stop

For `changed`, re-read every changed file. In Standard mode, make one commit of the Verify skill directory on the current branch. Stage only own paths, never `-A`. Commit with `--only -- <skill directory>` to leave unrelated staged work untouched. Follow the repo's title convention from recent `git log` on the default branch, or Conventional Commits if no convention is visible. In Private mode, edit the single shared copy in place and commit nothing.

For `clean` or `blocked`, make no commit or PR. Report the outcome and coverage honestly. Every entry returns the outcome, changed files, commit SHA or no commit, evidence and run-note paths, and product findings. Do not suggest open-pr.
