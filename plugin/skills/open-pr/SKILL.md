---
name: open-pr
description: Ready PR creation, briefing, and proof.
disable-model-invocation: true
---

# Open a PR

Open the PR, then return to the caller. Never start babysit or ship.

Accept the chain facts and any closing references: the issues or tickets the PR resolves. Follow these rules in skill://implement/END-STATE.md:

- Step 0a: the chain facts, Code host routing, and the reuse of the vstack root and Scratch dir.
- Step 0b: the remote branch name, the remote tip, the push, and the rule that keeps pushed commits as they are.
- Step 4: Verify discovery and link repair.
- Step 5: the Blast radius hand-off.

Keep PR body files under `<Scratch dir>/verify/<app>-<run-id>/`, beside the proof they describe.

Follow `skill://flow-page`'s "Stage entry/exit line". Follow END-STATE.md's "Publish delivery progress". Publish tasks for the steps below and retain stopped or skipped work.

## 1. Check the branch

Read the default branch through `default-branch`. Fetch its tip and read the current branch. Stop on the default branch, detached HEAD, or no commits beyond the base. Leave unrelated working-tree changes untouched. Stop if they prevent cleanup or history edits.

Use the default branch as the base unless the user requested a stack. Pin the base SHA, diff command, and commit list. For a stack, use the parent's exact tip as the child's base.

## 2. Clean up the diff

If the caller says "prune-comments already run", skip cleanup and use its development checks, review, and accepted Verdict. Otherwise run skill://prune-comments over the diff against the default branch. Return accepted fixes to implement for the development check, review, and commit steps in END-STATE.md.

If prune-comments stops because its critic is unavailable or rejects the second report, return accepted fixes to implement and keep going. Record prune-comments as open in the todo list and reply. Its failure never blocks the chain.

Use the caller's development checks, review, and accepted Verdict. If cleanup changes the diff, return accepted edits to implement for development checks in END-STATE step 4, its one review, and its step 6 commit before continuing to step 3.

## 3. Order the unpushed commits

Read the remote tip as END-STATE step 0b says, and order only the unpushed commits that it leaves into small, ordered commits. Each commit has one separable change and tells the story in order. Amend when a fix belongs to a just-made unpushed commit. Use a new commit for a separable fix.

If ordering changes the diff rather than only history, return the changed diff to implement for updated development checks, review, and commit before step 4.

## 4. Push the final tip

Push the final tip to the remote branch with the push command in END-STATE step 0b. Stop on a failed push. Record the pushed head SHA. After this step, change neither the diff nor the branch history before PR creation. Steps 5–8 gather findings and write PR text only.

## 5. Gather Blast Radius

Reuse code-review's Blast radius findings under the hand-off in END-STATE step 5.

Otherwise read the Blast radius trigger list in skill://code-review. It owns the only trigger list. Apply the user's Blast radius override. If Blast radius is requested or triggered, run skill://blast-radius on the pinned final diff. Keep tracked files unchanged. If Blast radius does not run, record the reason for step 6. Never turn a source citation or an unavailable proof into an executed safety claim.

## 6. Write the title and body

Write the title, PR body, and commit bodies. Apply every technical-writing layer except Diátaxis, and the STE vocabulary rules: one word for each action, keep articles, and use a plain verb over an `-ing` form when one works.

Follow the title convention visible in recent `git log` on the default branch. If none is visible, use Conventional Commits `type(scope): subject`. Use a short imperative subject, a real symbol when useful, and no trailing period.

Write the body with skill://pr: its Summary, Evidence, and Merge Danger sections, in its order. The body is a one-minute briefing for a reviewer who has the diff, not a lab notebook. Write short, simple sentences with few identifiers. A squash landing turns the body into the commit body, so keep it to about 40 lines. Put this run's facts in pr's sections:

- Merge Danger: the door call (one-way or two-way) and the Blast Radius from step 5. Back the Blast Radius with the reused code-review Blast radius findings or the new blast-radius proof, and cite that report. State affected callers or data, the safety fact and its proof status, and confirmed risks. Name the continuing cost if the default branch stays red without the fix. If Blast radius did not run, the Blast Radius says so and gives the reason, with no safety claim.
- Evidence: the before and after of every real run path, with its command, observed outcome, and evidence path. Cite the accepted Verdict with its verdict, verifier identity, patch id, and evidence paths, plus the chosen Verify skill and absolute Scratch `verify/` paths. For performance, report one primary number with its unit in `before -> after` form, and link the rest of the evidence. State failures, skipped checks, and limits. If the accepted Verdict does not cover the final diff, or no Verdict exists, say so. Report only proof that ran on the final diff.
- Closing references: end the Summary with one `Closes <reference>` line per caller-supplied reference, in the form the issue tracker closes work through PRs. Add none the caller did not supply.

Attach videos or screenshots only when they prove a claim. Strip private information before publication. Local evidence paths identify local proof, not remotely accessible links. Use an existing approved artifact URL when available. Put long logs, commit details, metric tables, full SHAs, lane recitals, and "CLEAN" verdicts in linked evidence, not the body. A commit body does not restate its subject.

Save the body in this run's Scratch `verify/` entry and pass it to `create-pr` or `edit-pr` as a file. Do not interpolate prose into shell commands.

## 7. Create the ready PR

Create the PR through `create-pr`, as a ready PR, never a draft. Its head branch is the remote branch from END-STATE step 0b. Use `list-prs` to find an existing PR for this head and base before creating a duplicate. Update an existing PR through `edit-pr` with the same body-file contract. If `edit-pr` is unsupported, report that the existing PR keeps its old title and body.

Create a stack only on request, and only when `code-host.md` supports `retarget-pr`. The root targets the default branch. Each child targets its parent's branch and builds on its parent's exact tip under the history rule in END-STATE step 0b. As a parent merges, skill://ship moves its child onto the default branch. Keep independent work outside the chain. Bring each branch up to date with the default branch under the same rule before substantial stack work. Complete those history changes before each branch's final push in step 4. Retarget an existing child through `retarget-pr` to its parent's branch.

## 8. Read the PR before reporting status

Read the PR through `read-pr`: its URL, title, draft state, state, base branch, head branch, and head SHA. If it is a draft, run `mark-ready` and read it again. If `mark-ready` is unsupported, report the draft. Make sure that its head SHA is the final tip pushed in step 4. Report a mismatch or unavailable status instead of claiming that the final diff is published.

Publish the observed PR as a `pr` item only after this read, preserving a head mismatch or unavailable status in the Document and Timeline. Capture the body file and proof as attachments. Use a delivery table with PR, Status, Head, and Proof columns and a Timeline of push, create or edit, and read outcomes. An open or ready-for-review PR does not establish merge-ready. Leave the requested End state unchanged.

## Reply

Return each PR URL, its title, observed status, and whether Blast Radius reused code-review's Blast radius findings, ran blast-radius, or reports that Blast radius did not run. Include proof paths, limits, every stopped or skipped step, and any open prune-comments work. Pass the chain facts back to the caller with the new last pushed SHA. Stop here. The caller owns the next End-state link.
