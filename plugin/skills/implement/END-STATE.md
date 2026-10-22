# Shared End state block

implement, implement-spec, and hillclimb read this file before work. Reuse these steps by reference. Do not maintain a second copy in a caller. The caller inserts its work steps between 0b and 3b. Before task-specific todo items, add one todo item per step to its todo list in execution order, for the steps below and the caller's own steps. An item holds the step's id with its source, `shared` for a step in this file and `local` for a step in the caller's file, then the step's heading, such as `shared 0a. Settle the End state` or `local 5. Merge each result`. The source keeps apart a shared and a local step with the same number. Keep the ids as each file numbers them. The item also carries its status, as `skip: <reason>` for a step the run does not finish, and any blocker. The full text of a `shared` step stays in this file and the text of a `local` step stays in the caller's file. Do not copy step paragraphs into the todo list.

## 0a. Settle the End state

If the caller supplies a vstack root, reuse it. Otherwise, resolve the vstack root once through the Private-mode rule. If the caller supplies a Scratch dir, reuse it. Otherwise, resolve the absolute project Scratch dir once through skill://vstack-tmp with its path script and no kind argument. The project's config directory is `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. Run Code host operations through `code-host.md` there. Run `ci-logs`, `rerun-ci`, `set-secret`, and `set-variable` through `ci.md` there. Operation ids name the steps; CLI configs supply command rows, while MCP configs supply the server, project facts, and pins. Use git for local history and pushes. Chained skills use the paths that the run passes them. They never resolve these paths again.

Keep one run record across every ticket. It holds the requested End state and the chain facts. Retain each chained skill's hand-back in the record. The chain facts are what step 7 passes to each chained skill:

- The effective End state
- The `code-host.md` and `ci.md` paths
- The vstack root
- The Scratch dir
- The current branch
- The remote branch name (step 0b)
- The base SHA and the whole-diff command
- The last SHA this run pushed
- The prune-comments outcome with its open work
- The final-diff Safety findings (step 5)
- The Verify evidence paths

The run keeps its asks and its results on the flow's Grilling page (`skill://grilling-page`). Before the End state below, find the page as grilling-page's "Find or start the page" says, and add the caller's Stage, an implement or implement-spec Stage, as its "Add a Stage" says. The spec that the run works from counts as the caller's spec, and each ticket counts as its ticket, also through the ticket's parent spec. So implement-spec in a new omp session finds the page that to-spec renamed after the spec issue. With no spec and no ticket, continue only a page whose path this session already printed, such as the page of a grill-with-docs that ran before. Otherwise start a new page. Record the page path in the run record. Every `ask` of these shared steps is a question in the caller's Stage, including the End state below and the Verify skill choice in step 4.

Settle the End state once, before any work: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped merges it into the default branch. If the user's words or the ticket name an End state, use that. Words that only ask to open a PR settle merge-ready. Say so before work. Otherwise use `ask` with the End states on offer and commit recommended. Reuse an already settled caller End state rather than asking again.

Offer only the End states whose needed operations the two config files support:

- merge-ready needs `default-branch`, `list-prs`, `create-pr`, `read-pr`, `required-checks`, `review-threads`, and `reply-thread` from `code-host.md`, plus `ci-logs` from `ci.md`.
- shipped needs the merge-ready operations plus `merge-methods`, `merge-pr`, and `comment-pr` from `code-host.md`.
- A stack of PRs also needs `retarget-pr`.

At the start of every run, read the current tool list, descriptions, and parameter schemas of each MCP server named by the configs this step reads, `code-host.md` included. Match every needed operation to a tool by what it does and the arguments its schema accepts, using the recorded project facts. A saved MCP operation row or tool name is not proof of current support. Keep Check and the CI rerun pinned; resolve other operations from the server's descriptions. If tool-list discovery fails or a server is unreachable, offer only commit and name that server and the observed failure. Tell the user to connect the named MCP server before starting a PR chain.

Every other operation, including `rerun-ci`, is optional. Chained skills resolve Code host operation ids through the same rule: choose an MCP tool from the named server's current descriptions and parameter schemas, using the project facts; a missing operation row does not mean unsupported. An optional MCP operation is unsupported when no live tool matches it. For a CLI config, use its command row, where `unsupported` keeps its meaning. A step whose optional operation is unsupported skips that action and reports the gap. If either `code-host.md` or `ci.md` is missing, offer only commit and tell the user to run `/skill:setup-vstack` to add the missing Code host or CI service config. If the user's words or the ticket name an End state that the configs do not support, cap it at the furthest End state on offer and name the missing files or operations.

An interactive timeout does not settle the End state. Re-ask the unanswered gate once. If it times out again, stop before work, branching, or committing. Only in a Headless run with no `ask` tool, take the recommended End state (commit) and say so. Tool absence is not a timed-out answer.

The End state authorizes every step up to it: merge-ready authorizes babysit in drive mode; shipped authorizes ship to merge the verified run into the default branch. Deploys and releases are outside this flow.

## 0b. Branch

With End state commit, stay on the current branch. Otherwise read the default branch through the `default-branch` operation and the current branch through git. If HEAD is on the default branch, create and switch to `<type>/<slug>` from HEAD, with a type and slug that describe the work. Otherwise stay on the current branch, an omp worktree's `wt/<time>` branch included. Use no worktree. Detached HEAD cannot start a PR chain.

Record the remote branch name. If the local branch is `wt/*`, the remote branch name is a new `<type>/<slug>` that describes the work. Otherwise it is the local branch's name. Never rename the local branch. Append the page's `flow` record again with `branch` set to the remote branch name, or to the current branch at End state commit.

Read the remote tip before any history edit and before the first push. Run `git ls-remote --exit-code <remote> refs/heads/<remote branch>`. Exit code 2 means that the remote branch does not exist yet, and every commit after the base is unpushed. Otherwise fetch it with `git fetch <remote> refs/heads/<remote branch>` and record the fetched SHA as the remote tip. Every commit that the remote tip contains is pushed.

Push with `git push -u <remote> <local branch>:<remote branch>`, which creates the remote branch or fast-forwards it. Push every later update the same way. If git rejects a push, stop and report its output. After every push that updates the remote branch, record its SHA as the last SHA this run pushed. Return that SHA to the caller.

Keep every pushed commit as it is. Rebase, amend, or reorder only commits after the remote tip, and push only fast-forwards, never with `--force` or `--force-with-lease`. Bring a pushed branch up to date by merging its target into it.

## 3b. Prune comments

Run skill://prune-comments over the whole diff before live proof and review, at every End state. Make direct fixes only. Report any fix that needs a new shape as open. Keep accepted fixes for step 6, without staging unrelated changes. If the critic is unavailable or its second report is rejected, keep accepted fixes, list prune-comments as open, and continue. Its failure never blocks the chain.

Record "prune-comments already run" for open-pr even when the pass stopped, together with its open work; open-pr must not repeat this pass.

## 4. Live proof

List the project's Verify skills: skills named `verify-*`, plus, in Private mode, directories `<vstack root>/skills/verify-*/`. Deduplicate links and targets. For a Private copy missing its checkout link, create an absolute symlink at `.omp/skills/verify-<app>` and ensure `.omp/skills/verify-*` is in the resolved git common dir's `info/exclude`, following skill://setup-app-verification. Leave shared ignores unchanged; preserve unrelated exclude lines and existing destinations. Read its SKILL.md by absolute path for the rest of this session; helpers stay relative to that directory.

If there is one Verify skill, use it. If several exist, use the one whose description names the changed surface. Otherwise choose through `ask`. If none exists, run skill://setup-app-verification in the same run to create one, and state that implement commits its output in step 6. Then use it. Drive the real surface through the chosen Verify skill. Save proof, notes, and disposable `data/` under `<Scratch dir>/verify/<app>-<run-id>/`. Preserve unavailable or failed proof as such, never as a passing result.

Drift is a failure in the Verify skill's own instructions (missing command, route, selector, or fixture) while its Doctor check passes. Wrong app behavior is a finding, never Drift. On Drift, run skill://maintain-app-verification for that one named feature, with no source-wave Fan-out, and state that implement commits its output in step 6. In Standard mode, maintenance edits only the Verify skill's directory. In Private mode, edit the single copy under the vstack root in place and commit nothing. Retain its clean, changed, or blocked outcome, changed files, and product gaps. Treat the gaps as findings. Then retry live proof once. Step 5 covers maintenance edits too.

Run-only consumers (ship's verifier and forensics) may reuse this live-proof procedure but never maintain. They report the drifted step and evidence to their caller. ship treats DRIFT as a ceiling; forensics captures with the surface's own profiler, debugger, or CDP instead.

## 5. Review the whole diff

Run skill://code-review once over the whole completed diff at every End state, including commit. Pin the base SHA, diff command, and commit list. Include accepted cleanup and Standard-mode Verify edits, plus the proven uncommitted work that implement will commit.

implement reviews before its step 6 commit (Matt's order). implement-spec's merger commits each ticket as it lands, implement-spec reviews once after its last merge, and step 6 commits the review fixes. hillclimb commits each accepted win, reviews once after its last accepted win, and commits the review fixes in new commits. Keep Standards, Spec, and Safety findings separate. code-review owns the Safety trigger list.

code-review's result is each finding that it decided, plus the user's answer to each question that it asked about a finding. The review fixes are the changes that this result calls for: the suggested action of each decided card that asks for a change, a fix for each confirmed Safety risk, and the fix that the answer picks for each asked finding. Make the review fixes and update the affected proof before advancing.

Carry the Safety findings and the final-diff proof to open-pr: the proven or unproven safety fact, confirmed risks, cleared items, proof paths, and the base and diff that they cover. open-pr reuses the Safety findings only when they cover its final diff and base.

## 6. Commit

Commit the accepted, proven work to the current branch. For implement, this follows review. implement-spec keeps its per-ticket merger commits and commits the review fixes here, after review. hillclimb uses its accepted-win commits and new commits for the review fixes. Include the Standard-mode setup-app-verification and maintain-app-verification output that step 4 kept uncommitted in this commit. Stage only this run's accepted paths or hunks. Leave unrelated changes uncommitted. Keep Private config, artifacts, Verify maintenance, and Scratch out of git. Use the repo's commit convention. Write commit bodies.

The approved environment fixes from skill://session get one commit per approved mistake class. Each of these commits carries proof that its new check fails on a real past mistake.

## 7. Chain to the End state

Run the chain once, after all the work of the invocation, not once per ticket. At commit, stop.

For merge-ready or shipped, run skill://open-pr with the chain facts from step 0a. Retain the PR URL, observed status and head SHA, and last pushed SHA. Stop on an unavailable or mismatched published head rather than advancing on an assumed PR.

Then run skill://babysit in drive mode with the chain facts and PR frontier. For shipped, after merge-ready is observed, run skill://ship with those facts. open-pr and babysit return to this caller; neither starts the next link. Stop at the effective End state or a reported blocker and report what was actually reached.

Conflict owner: babysit reports each conflict and each stale base here. ship reports each branch that `update-branch` cannot update and each step 2 move. The reported branch can be any branch of the run's stack. Fetch it and check it out, and fetch its target: the PR's base branch from `read-pr`, or the default branch for a step 2 move. For a step 2 move, first retarget the PR to the default branch through `retarget-pr`. Run `git merge <remote>/<target>`, resolve each conflict once, reconcile the reported caller drift, and commit the merge. Push it as a fast-forward to the PR's head branch with the step 0b push. Then check out the current branch again. If the reported branch is the run's remote branch, record the new last pushed SHA, and record the merged target tip as the new base SHA. Then run babysit again, or return a moved PR to ship for its fresh verdict. If the diff changed, re-establish the affected proof and Safety findings.

When the run stops, at the effective End state, at commit, or at a blocker, show the run results on the caller's Stage. Append a table Report block, as grilling-page says, with the columns Ticket, Status, Commit, and Proof. Write one row per ticket, or one row for the work when the run has no ticket. When step 6 committed review fixes, add one row for them:

- Ticket: the ticket's number and short title, a short name for the work, or "Review fixes".
- Status: the outcome that the caller's reply gives, such as resolved, closing through the PR, committed, or open with its reason.
- Commit: the short SHA of its commit, or `none` with where its changes wait, such as a held patch path or the working tree.
- Proof: the paths of its red and green evidence and its live proof, or the reason that proof is missing.

Then end the caller's Stage as grilling-page's "Add a Stage" says. If the run reached its End state and left no ticket open, append the page's `flow` record again with state `closed`. Otherwise the flow stays open, so that a later run continues its page.
