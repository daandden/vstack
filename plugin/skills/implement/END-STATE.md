# Shared End state block

implement, implement-spec, hillclimb, and tune-llm-flow read this file before work. Reuse these steps by reference. Do not maintain a second copy in a caller. The caller inserts its work steps between 0b and 3b. Before task-specific todo items, add one todo item per step to its todo list in execution order, for the steps below and the caller's own steps. An item holds the step's id with its source, `shared` for a step in this file and `local` for a step in the caller's file, then the step's heading, such as `shared 0a. Settle the End state` or `local 5. Merge each result`. The source keeps apart a shared and a local step with the same number. Keep the ids as each file numbers them. The item also carries its status, as `skip: <reason>` for a step the run does not finish, and any blocker. The full text of a `shared` step stays in this file and the text of a `local` step stays in the caller's file. Do not copy step paragraphs into the todo list.

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
- The final-diff Blast radius findings (step 5)
- The development check evidence paths (step 4)
- The accepted Verdict (step 6b): verdict, Verifier identity, base and head SHAs, patch id, and evidence paths

The run keeps its asks and its results on the flow's Grilling page (`skill://grilling-page`). Before the End state below, find the page as grilling-page's "Find or start the page" says, and add the caller's Stage, an implement or implement-spec Stage, as its "Add a Stage" says. The spec that the run works from counts as the caller's spec, and each ticket counts as its ticket, also through the ticket's parent spec. So implement-spec in a new omp session finds the page that to-spec renamed after the spec issue. With no spec and no ticket, continue only a page whose path this session already printed, such as the page of a grill-with-docs that ran before. Otherwise start a new page. Record the page path in the run record. Every `ask` of these shared steps is a question in the caller's Stage, including the End state below when this step asks it, and the Verify skill choice in step 4.

Settle the End state once, before any work: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped merges it into the default branch. Reuse an already settled caller End state rather than settling it again. Otherwise settle it in this order:

1. If the user's words or the ticket name an End state, use that. Words that only ask to open a PR settle merge-ready.
2. Otherwise, if `code-host.md`'s project facts hold the line `- Default End state: <commit|merge-ready|shipped>` with one of those three values exactly, take that project default with no question.
3. Otherwise use `ask` with the End states on offer and commit recommended.

Before work, say which End state the run took and where it came from: the words, the ticket, the project default, or the answer.

Offer only the End states whose needed operations the two config files support:

- merge-ready needs `default-branch`, `list-prs`, `create-pr`, `read-pr`, `required-checks`, `review-threads`, and `reply-thread` from `code-host.md`, plus `ci-logs` from `ci.md`.
- shipped needs the merge-ready operations plus `merge-methods`, `merge-pr`, and `comment-pr` from `code-host.md`.
- A stack of PRs also needs `retarget-pr`.

At the start of every run, read the current tool list, descriptions, and parameter schemas of each MCP server named by the configs this step reads, `code-host.md` included. Match every needed operation to a tool by what it does and the arguments its schema accepts, using the recorded project facts. A saved MCP operation row or tool name is not proof of current support. Keep Check and the CI rerun pinned; resolve other operations from the server's descriptions. If tool-list discovery fails or a server is unreachable, offer only commit and name that server and the observed failure. Tell the user to connect the named MCP server before starting a PR chain.

Every other operation, including `rerun-ci`, is optional. Chained skills resolve Code host operation ids through the same rule: choose an MCP tool from the named server's current descriptions and parameter schemas, using the project facts; a missing operation row does not mean unsupported. An optional MCP operation is unsupported when no live tool matches it. For a CLI config, use its command row, where `unsupported` keeps its meaning. A step whose optional operation is unsupported skips that action and reports the gap. If either `code-host.md` or `ci.md` is missing, offer only commit and tell the user to run `/skill:setup-vstack` to add the missing Code host or CI service config. If the user's words, the ticket, or the project default name an End state that the configs do not support, cap it at the furthest End state on offer and name the missing files or operations.

An interactive timeout does not settle the End state. Re-ask the unanswered gate once. If it times out again, stop before work, branching, or committing. A Headless run with no `ask` tool skips the project default. It takes the End state that its prompt names, or else commit, and says so. Tool absence is not a timed-out answer.

The End state authorizes every step up to it: merge-ready authorizes babysit in drive mode; shipped authorizes ship to merge the verified run into the default branch. Deploys and releases are outside this flow.

## 0b. Branch

With End state commit, stay on the current branch. Otherwise read the default branch through the `default-branch` operation and the current branch through git. If HEAD is on the default branch, create and switch to `<type>/<slug>` from HEAD, with a type and slug that describe the work. Otherwise stay on the current branch, an omp worktree's `wt/<time>` branch included. Use no worktree. Detached HEAD cannot start a PR chain.

Record the remote branch name. If the local branch is `wt/*`, the remote branch name is a new `<type>/<slug>` that describes the work. Otherwise it is the local branch's name. Never rename the local branch. Append the page's `flow` record again with `branch` set to the remote branch name, or to the current branch at End state commit.

Read the remote tip before any history edit and before the first push. Run `git ls-remote --exit-code <remote> refs/heads/<remote branch>`. Exit code 2 means that the remote branch does not exist yet, and every commit after the base is unpushed. Otherwise fetch it with `git fetch <remote> refs/heads/<remote branch>` and record the fetched SHA as the remote tip. Every commit that the remote tip contains is pushed.

Push with `git push -u <remote> <local branch>:<remote branch>`, which creates the remote branch or fast-forwards it. Push every later update the same way. If git rejects a push, stop and report its output. After every push that updates the remote branch, record its SHA as the last SHA this run pushed. Return that SHA to the caller.

Keep every pushed commit as it is. Rebase, amend, or reorder only commits after the remote tip, and push only fast-forwards, never with `--force` or `--force-with-lease`. Bring a pushed branch up to date by merging its target into it.

## 3b. Prune comments

Run skill://prune-comments over the whole diff before the development checks and review, at every End state. Make direct fixes only. Report any fix that needs a new shape as open. Keep accepted fixes for step 6, without staging unrelated changes. If the critic is unavailable or its second report is rejected, keep accepted fixes, list prune-comments as open, and continue. Its failure never blocks the chain.

Record "prune-comments already run" for open-pr even when the pass stopped, together with its open work; open-pr must not repeat this pass.

## 4. Prepare the Verify skill and run development checks

List the project's Verify skills: skills named `verify-*`, plus, in Private mode, directories `<vstack root>/skills/verify-*/`. Deduplicate links and targets. For a Private copy missing its checkout link, create an absolute symlink at `.omp/skills/verify-<app>` and ensure `.omp/skills/verify-*` is in the resolved git common dir's `info/exclude`, following skill://setup-app-verification. Leave shared ignores unchanged; preserve unrelated exclude lines and existing destinations. Read its SKILL.md by absolute path for the rest of this session; helpers stay relative to that directory.

If there is one Verify skill, use it. If several exist, use the one whose description names the changed surface. Otherwise choose through `ask`. If none exists, run skill://setup-app-verification in the same run to create one, and state that implement commits its output in step 6. Then use it. Run the development tests for the change, plus targeted smoke checks of the changed surface through the chosen Verify skill. The full drive belongs to the independent Verifier in step 6b. Save check output, notes, and disposable `data/` under `<Scratch dir>/verify/<app>-<run-id>/`. Preserve unavailable or failed checks as such, never as a passing result.

Drift is a failure in the Verify skill's own instructions (missing command, route, selector, or fixture) while its Doctor check passes. Wrong app behavior is a finding, never Drift. On Drift, run skill://maintain-app-verification for that one named feature, with no source-wave Fan-out, and state that implement commits its output in step 6. In Standard mode, maintenance edits only the Verify skill's directory. In Private mode, edit the single copy under the vstack root in place and commit nothing. Retain its clean, changed, or blocked outcome, changed files, and product gaps. Treat the gaps as findings. Then retry the smoke checks once. Step 5 covers maintenance edits too.

Run-only consumers (the step 6b Verifier and forensics) may reuse this discovery and choice but never maintain. They report the drifted step and evidence to their caller. Step 6b's caller repairs the Verify skill as that step says; forensics captures with the surface's own profiler, debugger, or CDP instead.

## 5. Review the whole diff

Run skill://code-review once over the whole completed diff at every End state, including commit. Pin the base SHA, diff command, and commit list. Include accepted cleanup and Standard-mode Verify edits, plus the checked uncommitted work that implement will commit.

implement reviews before its step 6 commit (Matt's order). implement-spec's merger commits each ticket as it lands, implement-spec reviews once after its last merge, and step 6 commits the review fixes. hillclimb and tune-llm-flow commit each accepted win, review once after their last work commit, and commit the review fixes in new commits. Keep Standards, Spec, and Blast radius findings separate. code-review owns the Blast radius trigger list.

code-review's result is each finding that it decided, plus the user's answer to each question that it asked about a finding. The review fixes are the changes that this result calls for: the suggested action of each decided card that asks for a change, a fix for each confirmed Blast radius risk, and the fix that the answer picks for each asked finding. Make the review fixes and update the affected development checks before advancing.

Carry the Blast radius findings and the final-diff proof to open-pr: the proven or unproven safety fact, confirmed risks, cleared items, proof paths, and the base and diff that they cover. open-pr reuses the Blast radius findings only when they cover its final diff and base.

## 6. Commit

Commit the accepted, checked work to the current branch. For implement, this follows review. implement-spec keeps its per-ticket merger commits and commits the review fixes here, after review. hillclimb and tune-llm-flow retain their accepted-win commits and put review fixes in new commits. tune-llm-flow also retains its separate reusable-eval commit. Include the Standard-mode setup-app-verification and maintain-app-verification output that step 4 kept uncommitted in this commit. Stage only this run's accepted paths or hunks. Leave unrelated changes uncommitted. Keep Private config, artifacts, Verify maintenance, and Scratch out of git. Use the repo's commit convention. Write commit bodies.

The approved environment fixes from skill://session get one commit per approved mistake class. Each of these commits carries proof that its new check fails on a real past mistake.

## 6b. Verify the committed head

At every End state, commit included, an independent Verifier checks the committed head after step 6 (ADR 0042). The author's checks from step 4 are not independent verification. The Verifier checks only committed work: the base SHA from step 0a and the current branch's HEAD, or the PR's base and head SHAs from `read-pr` when step 7 or ship runs this step. Compute your own patch id for comparison as the first field of `git diff <base_sha>...<head_sha> | git patch-id --stable`.

Give the Verifier the full base and head SHAs, the PR number when one exists, the relevant builds and tests, and the Verify skill's name or absolute path from step 4. Its brief requires parent-versus-head proof of the real changed surface, not only a successful launch. The Verifier runs in its own clone, never in this checkout (ADR 0007), and checks out only the supplied head SHA. It reads the base for comparison without moving its checkout to another commit.

Verifier brief: run the named builds and tests and drive the Verify skill's Doctor, Launch, and Drive steps over the changed surface, within the `vstack-verifier` agent's rights. Save logs, screenshots, and notes under `<Scratch dir>/verify/<app>-<run-id>/`, with a distinct entry per verification. A wrong app behavior is FAIL. A stale instruction while Doctor passes is DRIFT; name the failing step and evidence. Return the complete `vstack-verifier` Verdict record as that agent defines it. Only omp adds the isolation notice after the reply.

Keep the call schemaless so its result text includes omp's isolation notice.

Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`: the Verifier brief above for this head, the vstack root, the Scratch dir. Wait for its result through `handle.wait()` and retain the returned text for the checks below. If it cannot be spawned, stop: the Verdict is unavailable and the End state is not reached; point to `/skill:setup-vstack` when `task.isolation.enabled` is off.

Use the result text returned by eval `wait()` or `handle.wait()`, or the auto-delivered completion. Decode one leading JSON object with a JSON decoder that reports where the object ends and respects strings and escapes. Inspect the remaining suffix separately for the actual omp-added isolation notice. Braces or `Isolation:` text in JSON strings do not mark the boundary. Verifier-authored claims, record fields, notes, fenced text, and diff contents are not isolation evidence. The handle's `output()` and `agent://<id>` omit the notice, so neither can recover it.

- `Isolation: no changes captured.` proves a clean isolated run. It needs no patch path.
- `Isolation: changes captured at … (apply=false). Not applied.` names a root patch. Read it and every nested-repository patch named by omp's notice, including the `- nested repository patch:` lines after `Isolation: changes captured for N nested repositories (apply=false). Not applied.` Any tracked edit in any captured patch invalidates the run. Never use `AgentHandle.patchPath`, derive a path from an agent id, or apply a Verifier patch.
- A capture error makes the Verdict unavailable. Report the exact error. A missing omp isolation notice also makes it unavailable. Report that the runtime isolation notice is missing, separately from a capture error. An unreadable named patch leaves isolation evidence unavailable; name that gap.

Require the JSON record to have `verdict` as PASS, PASS+NOTES, FAIL, or DRIFT, `head_sha` and `base_sha` as full SHA strings matching the requested commits, `patch_id` as a string matching the computed patch id, and `evidence` as an array of strings with concrete check evidence. Optional `notes` and `open_questions` must be arrays of strings. Missing, malformed, incomplete, or mismatched records or evidence do not pass. Record who produced the Verdict.

PASS and PASS+NOTES pass after you read the notes and ask each `open_questions` item through top-level `ask`; silence is never approval. FAIL, DRIFT, and an unavailable Verdict never pass. The Verdict is unavailable if a Verifier cannot start, isolation is off, omp could not clone a clean worktree for the head, a record is malformed or mismatched, the isolation notice is missing, or a captured patch contains a tracked edit. When the Verifier reports a failed clone, point at omp's `worktree.clone` setting and `/skill:setup-vstack`. An unavailable Verdict stops the run: report that the End state was not reached.

On FAIL, fix the problem in a new commit, red-first through skill://tdd where a seam exists. On DRIFT, repair the Verify skill through skill://maintain-app-verification for the named feature, as step 4 says. In Standard mode, commit its output in a new commit; in Private mode, commit nothing. Then run a fresh Verifier through this step on the current head. Allow one repair-and-retry cycle per pass of this step. If the second Verdict of a pass does not pass, stop and report that the End state was not reached.

Keep the accepted Verdict in the run record: the verdict, Verifier identity, base and head SHAs, patch id, and evidence paths. Step 7 reuses it, and the Report block's Proof column shows it.

ship verifies its PRs through this step's brief and checks, with its own single-subagent line and Fan-out line. In ship, a Verifier that cannot start stops ship. A FAIL, DRIFT, or other unavailable Verdict caps the verified run as ship step 2 says, instead of the repair-and-retry cycle above.

## 7. Chain to the End state

Run the chain once, after all the work of the invocation, not once per ticket. At commit, stop after step 6b.

For merge-ready or shipped, run skill://open-pr with the chain facts from step 0a. Retain the PR URL, observed status and head SHA, and last pushed SHA. Stop on an unavailable or mismatched published head rather than advancing on an assumed PR.

Then run skill://babysit in drive mode with the chain facts and PR frontier. After babysit reports merge-ready, read the PR's base and head SHAs through `read-pr` and compute its current three-dot patch id. If it matches the accepted Verdict's patch id, reuse the Verdict and record the current SHAs beside the verified ones. Otherwise run step 6b on the new head. Push each step 6b repair commit with the step 0b push, and run babysit again. A stack keeps one Verdict per PR, each checked against its own base and head. Post each accepted Verdict through `comment-pr` from a Scratch file, with its SHAs, patch id, evidence paths, notes, and Verifier identity. If `comment-pr` is unsupported, report the missing comment as a gap; it does not block merge-ready.

For shipped, after merge-ready is observed, run skill://ship with those facts and the accepted Verdicts. open-pr and babysit return to this caller; neither starts the next link. Stop at the effective End state or a reported blocker and report what was actually reached. A commit or a green PR alone does not reach the End state: the run reaches it only when an accepted Verdict covers the final patch.

Conflict owner: babysit reports each conflict and each stale base here. ship reports each branch that `update-branch` cannot update and each step 2 move. The reported branch can be any branch of the run's stack. Fetch it and check it out, and fetch its target: the PR's base branch from `read-pr`, or the default branch for a step 2 move. For a step 2 move, first retarget the PR to the default branch through `retarget-pr`. Run `git merge <remote>/<target>`, resolve each conflict once, reconcile the reported caller drift, and commit the merge. Push it as a fast-forward to the PR's head branch with the step 0b push. Then check out the current branch again. If the reported branch is the run's remote branch, record the new last pushed SHA, and record the merged target tip as the new base SHA. Then run babysit again, or return a moved PR to ship for its fresh Verdict. If the diff changed, the accepted Verdict no longer covers it: re-establish the affected development checks and Blast radius findings, and the patch id check above runs step 6b again.

When the run stops, at the effective End state, at commit, or at a blocker, show the run results on the caller's Stage. Append a table Report block, as grilling-page says, with the columns Ticket, Status, Commit, and Proof. Write one row per ticket, or one row for the work when the run has no ticket. When step 6 committed review fixes, add one row for them, and one row for each repair commit from step 6b:

- Ticket: the ticket's number and short title, a short name for the work, "Review fixes", or "Verifier repair".
- Status: the outcome that the caller's reply gives, such as resolved, closing through the PR, committed, or open with its reason.
- Commit: the short SHA of its commit, or `none` with where its changes wait, such as a held patch path or the working tree.
- Proof: the paths of its red and green evidence, and the accepted Verdict that covers it with its verdict, Verifier identity, patch id, and evidence paths, or the reason that the Verdict is missing.

Then end the caller's Stage as grilling-page's "Add a Stage" says. If the run reached its End state, an accepted Verdict covers the final patch, and no ticket is open, append the page's `flow` record again with state `closed`. Otherwise the flow stays open, so that a later run continues its page.
