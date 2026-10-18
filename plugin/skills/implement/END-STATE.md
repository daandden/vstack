# Shared End state block

implement, implement-spec, and hillclimb read this file before work. Reuse these steps by reference. Do not maintain a second copy in a caller. The caller inserts its work steps between 0c and 3b. Before task-specific todo items, copy the steps below verbatim, including their paragraphs, into its todo list in execution order. Keep an unfinished step as `skip: <reason>`.

## 0a. Settle the End state

Resolve the vstack root once through the Private-mode rule, and reuse a supplied root. Resolve the absolute project Scratch dir once through skill://vstack-tmp with its path script and no kind argument, and reuse a supplied Scratch dir. Run every Code host operation through the project's `code-host.md`: `<vstack root>/docs/vstack/code-host.md` in Standard mode, `<vstack root>/config/code-host.md` in Private mode. Look up each operation by its id there. Use git for local history and pushes. Chained skills use the paths that the run passes them and never resolve them again.

Keep one run record across every ticket. It holds the requested End state, stopped slices, and the chain facts. The chain facts are what step 7 passes to each chained skill: the effective End state, the `code-host.md` path, the vstack root, the Scratch dir, the current branch, the remote branch name and whether the branch is an Owned branch (step 0b), the base SHA and whole-diff command, the last SHA this run pushed, the prune-comments outcome with its open work, the final-diff Safety findings (step 5), the Verify evidence paths, and any open decision-trail log path. Retain each chained skill's hand-back in the record.

Settle the End state once, before any work: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped merges it into the default branch. If the user's words or the ticket name an End state, use that. Words that only ask to open a PR settle merge-ready. Say so before work. Otherwise use `ask` with the End states on offer and commit recommended. Reuse an already settled caller End state rather than asking again.

Offer only the End states whose needed operations `code-host.md` supports:

- merge-ready needs `default-branch`, `list-prs`, `create-pr`, `read-pr`, `required-checks`, `ci-logs`, `review-threads`, and `reply-thread`.
- shipped needs the merge-ready operations plus `merge-methods`, `merge-pr`, and `comment-pr`.
- A stack of PRs also needs `retarget-pr`.

Every other operation is optional. A step whose optional operation is unsupported skips that action and reports the gap. If `code-host.md` is missing, offer only commit and tell the user to run `/skill:setup-vstack` to add the Code host. If the user's words or the ticket name an End state that the file does not support, cap it at the furthest End state on offer and name the missing operations.

An interactive timeout does not settle the End state. Re-ask the unanswered gate once. If it times out again, stop before work, branching, or committing. Only in a Headless run with no `ask` tool, take the recommended End state (commit) and say so. Tool absence is not a timed-out answer.

The End state authorizes every step up to it: merge-ready authorizes babysit in drive mode; shipped authorizes ship to merge the verified run into the default branch. Deploys and releases are outside this flow. A stopped tdd slice caps the effective End state at commit even if a further state was requested.

## 0b. Branch

With End state commit, stay on the current branch. Otherwise read the default branch through the `default-branch` operation and the current branch through git. If HEAD is on the default branch, create and switch to `<type>/<slug>` from HEAD, with a type and slug that describe the work. Otherwise stay on the current branch, an omp worktree's `wt/<time>` branch included. Use no worktree. Detached HEAD cannot start a PR chain.

Record the remote branch name. If the local branch is `wt/*`, the remote branch name is a new `<type>/<slug>` that describes the work. Otherwise it is the local branch's name. Never rename the local branch.

The first push decides whether the branch is Owned. Before it, read the remote ref with `git ls-remote --exit-code <remote> refs/heads/<remote branch>`. Exit code 2 means that the ref is absent. Then push by the state of the ref:

- Absent ref: create it with `git push --force-with-lease=<remote branch>: -u <remote> <local branch>:<remote branch>`. The empty lease value requires the ref to be absent. Record the branch as Owned only after this push succeeds. If the lease fails because the ref appeared, stop and report it.
- Existing ref: push with `git push -u <remote> <local branch>:<remote branch>`, a fast-forward push. The branch stays unowned.

Push every later fast-forward with `git push <remote> <local branch>:<remote branch>`. After every push, record its SHA as the last SHA this run pushed, and return it to the caller.

A rewrite of pushed commits (a rebase or a force-push) needs an Owned branch and a fresh read of the remote tip that still equals the last SHA this run pushed. Push each rewrite with `git push --force-with-lease=<remote branch>:<last pushed SHA> <remote> <local branch>:<remote branch>`, and record the new pushed SHA. Never adopt another pusher's remote tip as this run's last push. If the branch is not Owned, the tip moved, or the lease fails, stop and report which branch needs the rebase. Ordering commits that were never pushed needs no ownership.

## 0c. Decision trail

Start skill://decision-trail when the End state is merge-ready or shipped, or when the user says they will not watch the run ("going to bed", "I'll check later", "run until done", "don't stop", "be autonomous"). Otherwise start it only when the user asks. hillclimb always starts decision-trail. Reuse an already-open log instead of starting another one.

Fix its absolute `<Scratch dir>/decision-trail/<task-slug>-<session-uuid8>.tsv` path through decision-trail's current-session rules. Pass that path to chained skills and children. They append through its log helper, never start a log. Complete decision-trail's final review and Attention hand-back when the run ends.

## 3b. Prune comments

If the effective End state is merge-ready or shipped, run skill://prune-comments over the whole diff before live proof and review. Make direct fixes only. Report any fix that needs a new shape as open. Keep accepted fixes for step 6, without staging unrelated or stopped-slice changes. If the critic is unavailable or its second report is rejected, keep accepted fixes, list prune-comments as open, and continue. Its failure never blocks the chain.

Record "prune-comments already run" for open-pr even when the pass stopped, together with its open work; open-pr must not repeat this pass. At End state commit, keep this step as `skip: End state commit`.

## 4. Live proof

List the project's Verify skills: skills named `verify-*`, plus, in Private mode, directories `<vstack root>/skills/verify-*/`. Deduplicate links and targets. For a Private copy missing its checkout link, create an absolute symlink at `.omp/skills/verify-<app>` and ensure `.omp/skills/verify-*` is in the resolved git common dir's `info/exclude`, following skill://setup-app-verification. Leave shared ignores unchanged; preserve unrelated exclude lines and existing destinations. Read its SKILL.md by absolute path for the rest of this session; helpers stay relative to that directory.

If there is one Verify skill, use it. If several exist, use the one whose description names the changed surface. Otherwise choose through `ask`. If none exists, run skill://setup-app-verification in the same run to create one, and state that implement commits its output in step 6. Then use it. Drive the real surface through the chosen Verify skill. Save proof, notes, and disposable `data/` under `<Scratch dir>/verify/<app>-<run-id>/`. Preserve unavailable or failed proof as such, never as a passing result.

Drift is a failure in the Verify skill's own instructions (missing command, route, selector, or fixture) while its Doctor check passes. Wrong app behavior is a finding, never Drift. On Drift, run skill://maintain-app-verification for that one named feature, with no source-wave Fan-out, and state that implement commits its output in step 6. In Standard mode, maintenance edits only the Verify skill's directory. In Private mode, edit the single copy under the vstack root in place and commit nothing. Retain its clean, changed, or blocked outcome, changed files, and product gaps. Treat the gaps as findings. Then retry live proof once. Step 5 covers maintenance edits too.

Run-only consumers (ship's verifier and forensics) may reuse this live-proof procedure but never maintain. They report the drifted step and evidence to their caller. ship treats DRIFT as a ceiling; forensics captures with the surface's own profiler, debugger, or CDP instead.

## 5. Review the whole diff

Run skill://code-review once over the whole completed diff at every End state, including commit. Pin the base SHA, diff command, and commit list. Include accepted cleanup and Standard-mode Verify edits, plus the proven uncommitted work that implement will commit. Exclude stopped slices from what can be committed or published and identify them in the review brief.

implement reviews before its step 6 commit (Matt's order). implement-spec's merger commits each ticket as it lands, implement-spec reviews once after its last merge, and step 6 commits the accepted review fixes. hillclimb commits each accepted win, reviews once after its last accepted win, and fixes accepted findings in new commits. Resolve accepted findings and update affected proof before advancing. Keep Standards, Spec, and Safety findings separate. code-review owns the Safety trigger list.

Carry the Safety findings and the final-diff proof to open-pr: the proven or unproven safety fact, confirmed risks, cleared items, proof paths, and the base and diff that they cover. open-pr reuses the Safety findings only when they cover its final diff and base.

## 6. Commit

Commit the accepted, proven work to the current branch. For implement, this follows review. implement-spec keeps its per-ticket merger commits and commits the accepted review fixes here, after review. hillclimb uses its accepted-win commits and new commits for accepted review fixes. Include the Standard-mode setup-app-verification and maintain-app-verification output that step 4 kept uncommitted in this commit. Stage only this run's accepted paths or hunks. Leave stopped slices and unrelated changes uncommitted. Keep Private config, artifacts, Verify maintenance, and Scratch out of git. Use the repo's commit convention. Write commit bodies.

The approved environment fixes from skill://session get one commit per approved mistake class. Each of these commits carries proof that its new check fails on a real past mistake.

## 7. Chain to the End state

Run the chain once, after all the work of the invocation, not once per ticket. At commit, stop. If a tdd slice stopped, keep its changes uncommitted, commit the independent proven work, report the cap at commit, and skip the whole chain.

For merge-ready or shipped, run skill://open-pr with the chain facts from step 0a. Retain the PR URL, observed status and head SHA, and last pushed SHA. Stop on an unavailable or mismatched published head rather than advancing on an assumed PR.

Then run skill://babysit in drive mode with the chain facts and PR frontier. For shipped, after merge-ready is observed, run skill://ship with those facts. open-pr and babysit return to this caller; neither starts the next link. Stop at the effective End state or a reported blocker and report what was actually reached.

Conflict owner: if babysit reports a conflict, rebase only under the step 0b rewrite rule. Fetch the default branch, reconcile the reported caller drift, and run `git rebase --onto <remote>/<default branch> <base SHA>`. Push the rebase with the step 0b lease, and record the new pushed SHA and the new base SHA. Then run babysit again. Re-establish affected proof and Safety findings if the diff changed.
