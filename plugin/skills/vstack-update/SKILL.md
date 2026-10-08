---
name: vstack-update
description: Move vstack Upstream Pins through a reviewed Update PR.
argument-hint: "[<upstream>|<upstream>@<ref>]"
disable-model-invocation: true
---

# vstack Update

Run from the root of the vstack checkout. An Update moves Pins through confirmed row decisions. A Hold keeps a row's contribution at its older Upstream version.

Use `scripts/vstack-update.ts` in the full linked clone. Read the README's update-plan and vstack-update sections for the JSON contracts. Resolve the checkout and script paths once. Pass absolute paths to scripts and every brief. Read GLOSSARY.md, house-style.yaml, every docs/adr file, and plugin/rules/vstack-prose.md before writing proposals.

## 1. Preconditions and plan

Run `bun <clone>/scripts/vstack-update.ts plan --root <cwd> [<upstream>|<upstream>@<ref> ...]`. The script checks the checkout and manifest, existing update branches, and open Update PRs before planning. A failed remote query stops the run. It creates the update branch through omp wt add from main. It never edits the linked checkout.

If `moved` is false, stop at once. Do not run the judge, make a report, or call `ask` for confirmation. Otherwise keep the plan.json path. All later commands use `--plan <path>`. Work only in `worktree.path`. Resolve the vstack root there and obtain one Scratch entry through skill://vstack-tmp for the report. Do not commit any report or gate evidence.

## 2. Hold-only boundary

Until #99, do not merge or edit a changed adapt or merge row. Every moved or removed row, of any Disposition, also has only Hold. Include these rows in the report, but ask no removed-item or rename questions. Do not offer acceptance or a Disposition change for them. An unheld row blocks application before pins.yaml changes. Existing Hold fields stay unchanged. New Holds use effective_old.ref and effective_old.path. Current path and tree still move to the new Pin, or disappear on a removed held row.

An unchanged deferred reject needs a new proposal too. A new item has no older contribution to Hold. Deferring it means reject with `Deferred at <pin>: <gist>`.

## 3. Reject and new-item proposals

Read each changed reject's Upstream diff against its reason and revisit condition. Read every new Upstream item. Propose a Disposition, a one-line reason, and real drafted artifacts outside plugin. Adopt drafts stay byte-identical at the new Pin, minus agents/openai.yaml. Check changed adopt copies and their hashes from the plan. If a required House style row or the Fan-out contract demands edits, propose adapt with a drafted artifact and a reason. Never patch an adopt copy while leaving it adopt.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per changed reject or new item; size: Upstream diff lines and item files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-worker"`. Each `task`: propose the row's Disposition and reason, check revisit conditions, write drafted artifacts under plan.out/drafts, return reason_check and open questions without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

Keep each proposal in the decisions JSON. Artifacts are repo-relative register units. Draft sources are absolute paths outside plugin. Record unchanged adopt rows only when a required rule forces a Disposition change. Do not let a draft overwrite any held contribution in a shared artifact.

## 4. ADR check

Check every proposal against the row's ADR and every docs/adr file. Flag conflicts. For a real trade-off, use skill://domain-modeling's three-part test and draft the ADR outside the checkout. Return its proposed docs/adr path and absolute source path. Do not invent an ADR for an ordinary reversible edit.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per proposed row; size: proposal lines and ADR files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: check the proposal against every ADR, return conflicts and any required draft ADR or open question without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## 5. Fan-out review

Review every changed Upstream item, adopt included, and every vstack caller. Follow calls across skills. Look for overlapping work outside a Fan-out block, unnamed roles, non-vstack roles, and asking wording beyond the mechanical phrase list. Try fixes in drafted artifacts. An adopt fix changes its Disposition to adapt. Unfixed findings appear beside the row and default to Hold. Hold-only rows cannot be accepted despite findings.

Before this step, read skill://vstack-fan-out and run its gate on the block below.

Fan-out gate (skill://vstack-fan-out): parts: one per changed item and its callers; size: changed lines and caller files.
- fan-out → one `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: review the changed item and its callers for overlapping work outside a Fan-out block and violations of ask-tool, return findings, proposed fixes, and open questions without asking, the user's override words, the vstack root.
- inline → do every part yourself, in order, from the same brief.

## 6. Candidate and gates

Save complete proposed decisions, with Hold for every Hold-only row. Run `prepare --decisions <file>`. This builds the candidate only in the update worktree. It copies adopt artifacts, applies drafts and register choices, writes Holds and Pins, and drafts the minor version bump and CHANGELOG entry. This is not confirmation, a commit, or a push.

Run `gates --phase preview`. The script runs check-register, links this worktree's plugin into a throwaway home for the load smoke, and POSTs every sample prompt directly to native jev. Use the native TypeSafe credential, never a chat judge or omp's cached judgments. Missing credentials, malformed results, or unavailable jev block confirmation. Scores flag an expected pick below 0.70 or a non-allowed pick above 0.80. Scores from 0.70 through 0.80 appear as borderline without failing. Read flags beside changed principles' questions. Fix the reason for a red mechanical gate, rebuild the candidate, and run the preview gates again. Do not suppress a failure.

## 7. Report and confirmation

Run `report --report <Scratch>/update-report.html`. Copy the generated HTML through write to `local://update-report.html`, and open it in a browser tab. The report includes each row's change class, effectiveOld, Upstream and vstack diffs, reason check, ADR conflicts, draft ADR text, review findings, and jev flags. Read skill://good-css before changing the template. Use skill://diagram-design for any figure.

Use batched `ask`, at most eight questions per call. One bulk question covers clean adopt copies and rejects whose reasons still hold. Its choices are Accept all clean rows, Hold all clean rows, and Choose rows. If Choose rows, expand only that group into per-row questions. Each other supported row gets Accept, Hold, and Change Disposition. New items use Accept, Defer, and Change Disposition. A changed, moved, or removed adapt or merge row and every other moved or removed row get only Hold. Include a Cancel Update choice as a separate final question. Default unresolved review findings to Hold. Require explicit acceptance for flagged supported rows.

If a Disposition changes, draft the replacement and re-gate it before asking for its decision. Changing a new item to reject can use a normal reason, or Defer with a gist. Save the actual decisions, not the proposed defaults. If `timedOut: true`, repeat the same unanswered batch once. If it times out again, stop without applying or publishing. Do not count auto-selected answers as confirmation.

On refusal, run `cancel`. It removes only this run's worktree and update branch. Do not delete the Upstream clones or the linked checkout.

## 8. Apply and publish

Run `apply --decisions <confirmed-file>`, then `gates --phase confirmed`. The script rebuilds from the original worktree, so held adopt copies keep their old bytes. It preserves already-held baselines. Pins move even with Holds. The confirmed gate repeats check-register and the worktree load smoke, not Fan-out review or jev.

If a gate fails, fix the cause in the affected drafts. Re-ask only rows the fix touched. Reapply the full decision set with those answers, then re-gate. Preserve the decisions of every untouched row. A timeout follows step 7.

Run `finish` only after confirmation and the confirmed gates. The script checks that the gate receipt matches the current files, commits the minor bump, CHANGELOG, Pins, register, artifacts, and accepted ADRs, pushes the final branch tip, and opens a PR against main. Its Markdown summary lists moved Pins, every row's outcome, Holds, Disposition changes, and new ADRs. Never commit the HTML report. Return the PR URL and held rows. The user merges it. If push or PR creation fails, report the exact failure and the surviving branch. Do not merge or reopen the Update automatically.
