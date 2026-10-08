# Shared End state block

implement, perf-issue, refactor, and hillclimb read this file before work. Reuse these steps by reference; do not maintain a second copy in a caller. The caller inserts its work steps between 0c and 3b. Before task-specific todo items, copy the steps below verbatim, including their paragraphs, into its todo list in execution order. Keep an unfinished step as `skip: <reason>`.

Use `gh` for all GitHub reads and writes; use git for local history and pushes. Resolve the vstack root once through the Private-mode rule and reuse a supplied root. Resolve the absolute project Scratch dir once through skill://vstack-tmp with its path script and no kind argument; reuse a supplied Scratch dir.

Keep one run record across every ticket: requested and effective End state, current branch, whether this run created it (false unless observed), base SHA and whole-diff command, last SHA this run pushed, stopped slices, prune-comments outcome, final-diff Safety findings, Verify evidence paths, and any open decision-trail log path. Pass these facts into each chained skill and retain its hand-back.

## 0a. Settle the End state

Settle the End state once, before any work: commit, PR opened, merge-ready, or shipped. If the user's words or the ticket name it, use that; otherwise use one `ask` with these four options and commit recommended. With no answer, use commit. Reuse an already settled caller End state rather than asking again.

When implement gets architect's design package at the implement stop, put two questions in that same `ask`: the End state if unsettled, and confirmation of the sketch's interfaces as proposed seams. A checkpoint sign-off already covers the seams, so ask only for an unsettled End state, or neither if both are named. With no answer, use commit and count the proposed seams as agreed. A later tdd bug slice still needs red evidence under tdd's own fallback-seam rules.

The End state authorizes every step up to it: merge-ready authorizes babysit in drive mode; shipped authorizes ship to merge the verified run into the default branch. Deploys and releases are outside this flow. Never force-push a branch this run did not create. A stopped tdd slice caps the effective End state at commit even if a further state was requested.

## 0b. Branch

Read the default branch through `gh repo view --json defaultBranchRef` and the current branch through git. If the End state is PR opened or further and HEAD is on the default branch, create and switch to `<type>/<slug>` from HEAD, with a type and slug that describe the work. Use no worktree. Record that this run created the branch. With End state commit, stay on the current branch. An existing branch is not this run's creation; detached HEAD cannot start a PR chain.

## 0c. Decision trail

Start skill://decision-trail when the End state is merge-ready or shipped, or when the user says they will not watch the run ("going to bed", "I'll check later", "run until done", "don't stop", "be autonomous"). Otherwise start it only when the user asks. hillclimb always starts decision-trail. Reuse an already-open log instead of starting another one.

Fix its absolute `<Scratch dir>/decision-trail/<task-slug>-<session-uuid8>.tsv` path through decision-trail's current-session rules. Pass that path to chained skills and children. They append through its log helper, never start a log. Complete decision-trail's final review and Attention hand-back when the run ends.

## 3b. Prune comments

If the effective End state is PR opened or further, run skill://prune-comments over the whole diff before live proof and review. Commit accepted fixes, without staging unrelated or stopped-slice changes. If the critic is unavailable or its second report is rejected, keep and commit accepted fixes, list prune-comments as open, and continue. Its failure never blocks the chain.

Record "prune-comments already run" for open-pr even when the pass stopped, together with its open work; open-pr must not repeat this pass. At End state commit, keep this step as `skip: End state commit`.

## 4. Live proof

List the project's Verify skills: skills named `verify-*`, plus, in Private mode, directories `<vstack root>/skills/verify-*/`. Deduplicate links and targets. For a Private copy missing its checkout link, create an absolute symlink at `.omp/skills/verify-<app>` and ensure `.omp/skills/verify-*` is in the resolved git common dir's `info/exclude`, following skill://setup-app-verification. Leave shared ignores unchanged; preserve unrelated exclude lines and existing destinations. Read its SKILL.md by absolute path for the rest of this session; helpers stay relative to that directory.

If there is one Verify skill, use it. If several exist, use the one whose description names the changed surface; otherwise choose through `ask`. If none exists, say so in the reply, prove the change with tests and scripts, and recommend /skill:setup-app-verification. Drive the real surface through the chosen Verify skill. Save proof, notes, and disposable `data/` under `<Scratch dir>/verify/<app>-<run-id>/`. Preserve unavailable or failed proof as such, never as a passing result.

Drift is a failure in the Verify skill's own instructions (missing command, route, selector, or fixture) while its Doctor check passes. Wrong app behavior is a finding, never Drift. On Drift, run skill://maintain-app-verification for that one named feature, with no source-wave Fan-out. In Standard mode, maintenance edits only the Verify skill's directory and makes its own commit on the current branch, not a separate PR. In Private mode, edit the single copy under the vstack root in place and commit nothing. Retain its clean, changed, or blocked outcome, changed files, commit SHA, and product gaps; treat the gaps as findings. Then retry live proof once. Step 5 covers maintenance commits too.

Run-only consumers (ship's verifier and forensics) may reuse this live-proof procedure but never maintain. They report the drifted step and evidence to their caller. ship treats DRIFT as a ceiling; forensics captures with the surface's own profiler, debugger, or CDP instead.

## 5. Review the whole diff

Run skill://code-review once over the whole completed diff at every End state, including commit. Pin the base SHA, diff command, and commit list; include accepted cleanup and Standard-mode maintenance commits, plus the proven uncommitted work that implement will commit. Exclude stopped slices from what can be committed or published and identify them in the review brief.

implement reviews before its step 6 commit (Matt's order). perf-issue, refactor, and hillclimb review after their last work commit and fix accepted findings in new commits. Resolve accepted findings and update affected proof before advancing. Keep Standards, Spec, and Safety findings separate. Carry the Safety result and final-diff proof to open-pr; code-review owns the Safety trigger list.

## 6. Commit

Commit the accepted, proven work to the current branch. For implement, this follows review; the other callers use their own work commits and new commits for accepted review fixes. Stage only this run's accepted paths or hunks. Leave stopped slices and unrelated changes uncommitted. Keep Private config, artifacts, Verify maintenance, and Scratch out of git. Use the repo's commit convention; write commit bodies through skill://technical-writing, then skill://unslop.

## 7. Chain to the End state

Run the chain once, after all the work of the invocation, not once per ticket. At commit, stop. If a tdd slice stopped, keep its changes uncommitted, commit the independent proven work, report the cap at commit, and skip the whole chain. On architect Scrap, return before review and commit and skip the chain.

For PR opened or further, run skill://open-pr with the effective End state, branch-ownership flag, last pushed SHA, "prune-comments already run", any open cleanup work, final-diff Safety findings, Verify evidence, absolute Scratch dir, vstack root, and any open decision-trail log. Retain the PR URL, observed status and head SHA, and last pushed SHA. Stop on an unavailable or mismatched published head rather than advancing on an assumed PR.

For merge-ready or further, run skill://babysit in drive mode with the same chain facts and PR frontier. For shipped, after merge-ready is observed, run skill://ship with those facts. open-pr and babysit return to this caller; neither starts the next link. Chained skills append only to an existing decision-trail log. Stop at the effective End state or a reported blocker and report what was actually reached.

Conflict owner: if babysit reports a conflict, this run created the branch, and a fresh remote-tip read still equals the last SHA this run pushed, fetch the default branch, reconcile the reported caller drift, rebase onto that branch, and push with `--force-with-lease=<branch>:<last-pushed-sha>`. Record the new pushed SHA and run babysit again. Re-establish affected proof and Safety findings if the diff changed. If either ownership fact fails, stop and report which branch needs the rebase. Never adopt somebody else's remote tip as this run's last push to bypass the gate.
