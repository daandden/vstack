---
name: vstack-update
description: Move vstack Upstream Pins through a reviewed Update PR.
argument-hint: "[<upstream>|<upstream>@<ref>]"
disable-model-invocation: true
---

# vstack Update

Run from the root of the vstack checkout. An Update moves Pins through confirmed row decisions. A Hold keeps one row's contribution at its older Upstream version, not the whole shared artifact.

Use `scripts/vstack-update.ts` in the full linked clone. Read the README's update-plan and vstack-update sections for the JSON contracts. Resolve the checkout and script paths once. Pass absolute paths to scripts and every brief. Read GLOSSARY.md, house-style.yaml, every docs/adr file, and plugin/rules/vstack-prose.md before writing proposals.

## 1. Preconditions and plan

Run `bun <clone>/scripts/vstack-update.ts plan --root <cwd> [<upstream>|<upstream>@<ref> ...]`. The script checks the checkout and manifest, existing update branches, and open Update PRs before planning. A failed remote query stops the run. It creates the update branch through omp wt add from main. It never edits the linked checkout.

If `moved` is false, stop at once. Do not run the judge, make a report, or call `ask` for confirmation. Otherwise keep the plan.json path. All later commands use `--plan <path>`. Work only in `worktree.path`. Resolve the vstack root there and obtain one Scratch entry through skill://vstack-tmp for the report. Do not commit any report or gate evidence.

## 2. Adapt and merge proposals

Run `merge`. The Bun script makes one proposal per changed contributing row and artifact, including every held row's catch-up. Its per-file three-way merge uses the vstack baseline, Upstream at effectiveOld, and Upstream at the new Pin. Both Upstream sides already contain the ordered House style replacements from update-plan. Never use the global old Pin instead of a row's effectiveOld.

Read plan.out/merge-steps.json. Each step has its own draft paths, effectiveOld, and conflict paths. Keep clean hunks. Resolve conflicts in that row's draft, not in a combined artifact. Show conflicting alternatives in the report and return unresolved choices through `ask`. A binary conflict needs a reviewed replacement file. Never hide conflict markers or accept an unresolved result.

For a single-file Playbook, the default destination is SKILL.md. If the contribution lives elsewhere, give `merge --decisions <file>` a `file_maps` entry keyed by row id, then by Upstream file path. Each value is a path within the artifact. Run this before editing drafts, because rerunning merge replaces its generated proposals.

Review one artifact group at a time. For each row's proposal, apply the House style rules to new text: Fan-out blocks, single-subagent forms, skill references, ask-tool, and prose. These require judgment, not blind replacements. Check the result against every contributing row's reason. Record reason_check, conflicts, draft paths, and open choices for each row separately. Never put another row's proposed changes into its draft.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per adapt or merge artifact group; size: changed file count and Upstream diff lines.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-worker"`. Each `task`: review every contributing row's merge step from its own effectiveOld, resolve conflicts in separate row drafts, apply House style rules to new text, check every row's reason, return reason_check and unresolved choices without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

Hold fields only set the starting version. They never skip a proposal. Accept applies that row's catch-up and clears held_at and held_path together. Hold omits its step and keeps or writes both fields. The script composes accepted steps from the original baseline, so one held row never blocks its Upstream or freezes other contributions.

## 3. Reject and new-item proposals

Read each changed reject's Upstream diff against its reason and revisit condition. Reconsider unchanged rejects with a reason starting `Deferred at `. Read every new Upstream item. Propose a Disposition, a one-line reason, and real drafted artifacts outside plugin. A new item has no older contribution to Hold. Defer means reject with `Deferred at <pin>: <gist>`.

Adopt drafts stay byte-identical at the new Pin, minus agents/openai.yaml. Check changed adopt copies and their hashes from the plan. If a required House style row or the Fan-out contract demands edits, propose adapt with a drafted artifact and a reason. Never patch an adopt copy while leaving it adopt.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per changed reject or new item; size: Upstream diff lines and item files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-worker"`. Each `task`: propose the row's Disposition and reason, check revisit conditions, write drafted artifacts under plan.out/drafts, return reason_check and open questions without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

Keep each proposal in the decisions JSON. Artifacts are repo-relative register units. Draft sources are absolute paths outside plugin. Record unchanged rows when a required rule, caller fix, or rename cascade changes them too.

Every shipped skill except a principle-* skill needs a `/skill:<name>` route in plugin/skills/ask-vstack, or check-register fails `unrouted-skill`. When a decision adds a skill or follows a rename, also record an accept decision for the matt row whose artifacts list plugin/skills/ask-vstack, with a draft of that artifact that has the route. The script rejects a decision for a row that is not in the plan. If the plan does not select matt, run `cancel`, then run `plan` again with `matt@<matt's pin in pins.yaml>` added. Matt stays at its Pin, and its rows join the plan. Do not edit the router in the worktree by hand: prepare and apply rebuild plugin/ from the baseline and drop the edit.

## 4. ADR check

Check every proposal, removal choice, rename choice, and caller fix against the row's ADR and every docs/adr file. Record which ADRs were read. Flag conflicts in adr_conflicts. An Upstream adding multi-model routing conflicts with ADR 0004.

For a real trade-off, read skill://domain-modeling and its ADR format. Draft an ADR only when the choice is hard to reverse, surprising without context, and the result of genuine alternatives. Keep its source outside the checkout. Return its proposed docs/adr path and absolute source path as draft_adr. Ordinary reversible edits need no ADR.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per proposed row; size: proposal lines and ADR files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: check the proposal and its row ADR against every ADR, return conflicts and any required draft ADR or open question without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## 5. Fan-out review gate

Review every changed Upstream item, adopt included, and every vstack caller. Follow calls across skills, including callers whose own Upstream text did not change. Look for subagents that overlap outside a Fan-out block, even across called skills. Also flag unnamed roles, non-vstack roles, and asking wording that the lint misses.

Try fixes in separate row drafts. An adopt fix changes its Disposition to adapt. Record reviewed items and caller paths, fixes, and remaining review_findings. Unfixed findings appear beside their row and default to Hold. Never treat a missing review as a clean result. Do not advance to confirmation until this review covers every changed item and caller.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per changed item and its callers; size: changed lines and caller files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: review the changed item and its callers for overlapping work outside a Fan-out block and violations of ask-tool, return reviewed paths, findings, proposed fixes, and open questions without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## 6. Candidate and gates

Save complete proposed decisions. Set unresolved findings to Hold, not Accept. Run `prepare --decisions <file>`. It builds the candidate in the Update worktree from accepted per-row steps, adopt copies, and register choices. It writes Holds and Pins together with a minor version bump and CHANGELOG entry. A removed or renamed shipped skill, agent, or command name gets a major bump. This is not confirmation, a commit, or a push.

Run `gates --phase preview`. The script runs check-register, links this worktree's plugin into a throwaway home for the load smoke, and POSTs every sample prompt directly to native jev. Use the native TypeSafe credential, never a chat judge or omp's cached judgments. Missing credentials, malformed results, or unavailable jev block confirmation. Scores flag an expected pick below 0.70 or a non-allowed pick above 0.80. Scores from 0.70 through 0.80 appear as borderline without failing. Read flags beside changed principles' questions. Fix red mechanical gates in affected drafts, rebuild, and run the preview gates again. Do not suppress a failure. Fan-out review is a separate required judgment gate, not proof from the syntax lint.

## 7. Report and confirmation

Run `report --report <Scratch>/update-report.html`. Copy the generated HTML through write to `local://update-report.html`, and open it in a browser tab. Each row shows its effectiveOld, Upstream and vstack diffs, individual proposal, reason check, merge conflicts, ADR conflicts and drafts, review findings, and held-back findings. The page also lists jev flags. Read skill://good-css before changing the template. Use skill://diagram-design for any figure.

Use batched `ask`, at most eight questions per call. One bulk question covers clean adopt copies and rejects whose reasons still hold. Exclude moved, removed, and flagged rows from that group. Its choices are Accept all clean rows, Hold all clean rows, and Choose rows. If Choose rows, expand only that group into per-row questions. Every other existing row gets Accept, Hold, and Change Disposition. New items use Accept, Defer, and Change Disposition. Include Cancel Update as a separate final question. Default unresolved review findings to Hold. Acceptance of flagged rows needs explicit_accept from the user's actual answer.

Removed and renamed questions have no recommended option, including when findings remain. For every removed item, show these choices through `ask`:

- Drop the row and delete only artifacts that no remaining row names.
- For a shared artifact, replace Drop with two choices: remove its contribution, or keep that contribution as vstack text.
- Keep orphaned artifacts as vstack originals. Offer this only for artifacts that no other row names.
- Hold.

Record action accept with removal drop, original, remove-contribution, or keep-contribution. For remove-contribution, show the reviewed per-row removal draft. Never delete a shared artifact that another row names.

For a renamed adopt item, use `ask` with Follow the new name, Keep the vstack name, and Hold. Follow keeps adopt and needs the rename cascade across callers. Keep turns the row adapt and records a rename substitution plus a reason. Record rename follow or keep. For other moved rows, confirm the move with no recommended option, then handle their content by Disposition.

Draft every removed-item and rename alternative before its question. Gate each candidate before offering it, preserving the other proposed decisions. Review cascade callers and change every touched adopt caller to adapt with a reason and draft. The script records the required rename replacement. Future Updates apply it to both sides.

If a Disposition changes, draft the replacement and re-gate it before asking for its decision through `ask`. Save actual decisions, not proposed defaults. If `timedOut: true`, repeat the same unanswered batch once. If it times out again, stop without applying or publishing. Never count auto-selected answers as confirmation.

On refusal, run `cancel`. It removes only this run's worktree and update branch. Do not delete the Upstream clones or the linked checkout.

## 8. Apply and publish

Run `apply --decisions <confirmed-file>`, then `gates --phase confirmed`. The script rebuilds from the original worktree and omits held steps. Held adopt copies keep their old bytes. Existing Holds keep their original baselines. Pins move even with Holds. The confirmed gate repeats check-register and the worktree load smoke, not Fan-out review or jev.

If a gate fails, fix the cause in affected drafts. Re-ask only rows that the fix touched, through `ask`. Reapply the full decision set with those answers, then re-gate. Preserve every untouched row's decision. A timeout follows step 7.

Run `finish` only after confirmation and the confirmed gates. The script checks that the receipt matches current files, commits managed changes and accepted ADRs, pushes the branch, and opens a PR against main. Its Markdown summary lists moved Pins, row outcomes, Holds, removals, renames, Disposition changes, and new ADRs. Never commit the HTML report. Return the PR URL and held rows. The user merges it. If push or PR creation fails, report the exact failure and surviving branch. Do not merge or reopen the Update automatically.
