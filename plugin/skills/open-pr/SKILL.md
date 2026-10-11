---
name: open-pr
description: Ready PR creation, briefing, and proof.
disable-model-invocation: true
---

# Open a PR

Use `gh` for every GitHub read and write. Git commands handle local history and pushes. Open the PR, then return to the caller. Never start babysit or ship.

Accept the caller's End state, whether this run created the branch, "prune-comments already run", Safety findings, and verification evidence. Keep an unknown branch-ownership flag false. If a decision-trail log is open, append decisions through skill://decision-trail to that exact path. Never start a log here.


Resolve the absolute project Scratch dir once through skill://vstack-tmp with its path script and no kind argument. Reuse the caller's supplied Scratch dir. Keep PR body files under `<Scratch dir>/verify/<app>-<run-id>/`, beside the proof they describe.

## 1. Check the branch

Read the default branch with `gh repo view --json defaultBranchRef`. Fetch its tip and read the current branch. Stop on the default branch, detached HEAD, or no commits beyond the base. Leave unrelated working-tree changes untouched. Stop if they prevent cleanup or history edits.

Use the default branch as the base unless the user requested a stack. Pin the base SHA, diff command, and commit list. For a stack, use the parent's exact tip as the child's base. Record the branch-ownership flag and any last pushed SHA from the caller.

## 2. Clean up the diff

If the caller says "prune-comments already run", skip cleanup and use its final-diff proof and review. Otherwise run skill://prune-comments over the diff against the default branch. Return accepted fixes to implement for the proof, review, and commit steps in END-STATE.md.

If prune-comments stops because its critic is unavailable or rejects the second report, return accepted fixes to implement and keep going. Record prune-comments as open in the todo list and reply. Its failure never blocks the chain.

Use the caller's final-diff proof and review. If cleanup changes the diff, return accepted edits to implement for live proof, its one review, and its step 6 commit before continuing to step 3.

List the project's Verify skills named `verify-*`. In Private mode, also list `<vstack root>/skills/verify-*/` using the root from the Private-mode rule. Deduplicate links and targets. Repair missing absolute `.omp/skills/verify-<app>` links through skill://setup-app-verification. Leave shared ignores unchanged. Read a newly linked SKILL.md by absolute path for this session.

Use the only Verify skill, or the one whose description names the changed surface. If several match without a clear choice, use one `ask`. If none exists, prove the change with tests and scripts. State that live proof is absent and recommend skill://setup-app-verification to the caller.

Save proof under `<Scratch dir>/verify/<app>-<run-id>/`. A stale Verify instruction while Doctor passes is drift. Run skill://maintain-app-verification for that named feature, then retry once. Return Standard-mode setup and maintenance output to implement for its step 5 review and step 6 commit. Do not commit that output or run a separate review here. Resume with implement's updated final-diff proof and review. Private-mode maintenance edits the single copy in place with no commit. Treat product gaps as findings. Wrong app behavior is a finding, never drift. Preserve failed or unavailable proof as such.

## 3. Order the unpushed commits

Compare local history with the fetched remote branch. Rebase only unpushed commits into small, ordered commits. Each commit has one separable change and tells the story in order. Amend when a fix belongs to a just-made unpushed commit. Use a new commit for a separable fix.

Never rewrite commits already pushed to a branch this run did not create. This step orders only the unpushed suffix, even on a branch this run created. Do not force-push here. If ordering changes the diff rather than only history, return the changed diff to implement for updated live proof, review, and commit before step 4.

## 4. Push the final tip

Run `git push -u <remote> <branch>` after every cleanup commit and rebase. Stop on a failed push. Record the pushed head SHA. After this step, change neither the diff nor the branch history before PR creation. Steps 5–8 gather findings and write PR text only.

## 5. Gather Blast Radius

Reuse code-review's Safety findings only when they cover the final diff and base. Preserve its proven or unproven safety fact, confirmed risks, cleared items, and proof paths.

Otherwise read the Safety trigger list in skill://code-review. It owns the only trigger list. Apply the user's Safety override. If Safety is requested or triggered, run skill://blast-radius on the pinned final diff. Keep tracked files unchanged. If Safety does not run, record the reason and omit the Blast Radius section. Never turn a source citation or an unavailable proof into an executed safety claim.

## 6. Write the title and body

Write the title, PR body, and commit bodies. Apply every technical-writing layer except Diátaxis. Keep articles and use a plain verb when it works.

Follow the title convention visible in recent `git log` on the default branch. If none is visible, use Conventional Commits `type(scope): subject`. Use a short imperative subject, a real symbol when useful, and no trailing period.

The body is a briefing, not a lab notebook. Keep it to about 40 lines. Use these headings in order, dropping a section only when it has nothing to say:

- `## Why`. State intent and approach in one or two short paragraphs. Omit SHAs, rebase history, and a "based on main" preamble.
- `## Scope`. Name real symbols and paths, both sides of renames, and meaningful boundaries. Avoid a file-by-file essay.
- `## Tradeoffs`. Name only rejected alternatives that a reviewer needs to understand.
- `## Blast Radius`. In one to three sentences, state affected callers or data, the safety fact and its proof status, and confirmed risks. Name the continuing cost if the default branch stays red without the fix. Cite the reused Safety report or new blast-radius proof.
- `## Verification`. Name every real run path and observed outcome, with its command and evidence path. Cite the chosen Verify skill and absolute Scratch `verify/` paths. For performance, report the primary number with its unit in `before → after` form. State failures, skipped checks, missing live proof, and limits. Report only proof that ran on the final diff.

Attach videos or screenshots only when they prove a claim. Strip private information before publication. Local evidence paths identify local proof, not remotely accessible links. Use an existing approved artifact URL when available. Put long logs and commit details in linked evidence. Omit metric tables, full SHAs, lane recitals, and "CLEAN" verdicts. Use neither `## Summary` nor `## Test plan` boilerplate. A commit body does not restate its subject.

Save the body in this run's Scratch `verify/` entry and pass it through `--body-file`. Do not interpolate prose into shell commands.

## 7. Create the ready PR

Use `gh pr create --base <base-branch> --head <branch> --title <title> --body-file <absolute-body-path>` without `--draft`. Use `gh pr list` to find an existing PR for this head and base before creating a duplicate. Update an existing PR through `gh pr edit` with the same body-file contract.

Create a stack only on request. The root targets the default branch. Each child rebases onto its parent's exact tip and targets that parent's branch. Keep independent work outside the chain. Rebase on the default branch before substantial stack work. Complete those history changes before each branch's final push in step 4. Retarget an existing child through `gh pr edit <pr> --base <parent-branch>`.

## 8. Read the PR before reporting status

Run `gh pr view <pr> --json url,title,isDraft,state,baseRefName,headRefName,headRefOid`. If it is a draft, run `gh pr ready <pr>` and read it again. Make sure that its head SHA is the final tip pushed in step 4. Report a mismatch or unavailable status instead of claiming that the final diff is published.

## Reply

Return each PR URL, its title, observed status, and whether Blast Radius reused Safety findings, ran blast-radius, or was omitted. Include proof paths, limits, every stopped or skipped step, and any open prune-comments work. Pass the End state, branch-ownership flag, and last pushed SHA back to the caller. Stop here. The caller owns the next End-state link.
