# Shared End state block

implement, implement-spec, and hillclimb read this file before work. Reuse these steps by reference. Do not maintain a second copy in a caller. The caller inserts its work steps between 0b and 3b. Before task-specific todo items, add one todo item per step to its todo list in execution order, for the steps below and the caller's own steps. An item holds the step's id with its source, `shared` for a step in this file and `local` for a step in the caller's file, then the step's heading, such as `shared 0a. Settle the End state` or `local 5. Merge each result`. The source keeps apart a shared and a local step with the same number. Keep the ids as each file numbers them. The item also carries its status, as `skip: <reason>` for a step the run does not finish, and any blocker. The full text of a `shared` step stays in this file and the text of a `local` step stays in the caller's file. Do not copy step paragraphs into the todo list.

## Question timing

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before classifying a question. A question is gating if its answer can change the committed patch, its proof, or the End state. Resolve gating questions before advancing the affected work. Verifier open questions and CI-failure waivers remain gating.

Hold non-gating questions in the run record and continue delivery, including through chained skills. Holding a question grants no approval for its action. Routine release of the run's eligible workers and closure of proved tickets under the configured tracker rules are [close-out actions](#close-out), not held questions.

A Costly seam test optional for the requested End state has a non-gating approval question, held until that End state is reached or the run stops at a blocker. If the test is required to establish proof for the End state, its approval question is gating, so claim neither that proof nor the End state without it. Never run the test without explicit approval, and record each unrun test and its proof gap.

At close-out, apply the Settle-or-ask rule again to the held list. Use `ask` only for a question that still needs an answer. When enrolled, follow `skill://flow-page`'s "Every ask in a Flow" contract, including CLI publication and separate answer recording. In chat, use plain `ask`. Preserve unanswered questions and their pending actions in the run record and reply.

## Found defects

For implement and implement-spec, follow the Settle-or-ask test in `plugin/rules/vstack-settle-or-ask.md`. A found defect is a defect the run's change did not cause. Record the symptom, the baseline revision and reproduction evidence, and whether it blocks required proof or the authorized End state. A failed check on the changed head alone does not establish a baseline defect.

- **Blocking.** When the defect is reproducible on the unchanged baseline and has an in-scope repair, assign the repair to the existing implementation owner. Use a failing test first through skill://tdd when a cheap test can reproduce it. Record the proof gap if no cheap test applies. Keep the repair separate from the requested change. Land it on the run's branch under step 0b's guard, then re-establish the affected proof on the repaired tree. Use steps 4 and 6b as applicable. Preserve the existing retry limits. Step 7 carries the repair in the same PR when the authorized End state opens one. At End state commit, open no PR.
- **Nonblocking.** File the defect, with its reproduction and evidence, on the project's own tracker without a routine confirmation. Read `issue-tracker.md` in the project config directory from step 0a. Use its configured create and read operations. For MCP, select both operations from the named server's current descriptions and schemas using the project facts. Read the created issue back before claiming it was filed. If the route is unavailable, the write fails, or readback cannot confirm it, record that outcome and continue independent work. Preserve the existing posting and Private-mode checks.
- **Escalation.** Hold the affected work if a repair would change product behavior, change a spec, or reverse an earlier out-of-scope decision. Follow the agreement contract in skill://implement and [Question timing](#question-timing). If the cause is still unknown after investigation, identify the specific fact only the user can supply or the decision they own. Explain why independent work cannot resolve it. If neither exists, report the blocker with its evidence and ask nothing. Route any question through `ask` under skill://flow-page's "Every ask in a Flow" contract when enrolled, or plain `ask` otherwise. Unanswered questions and unresolved defects satisfy no proof.

Record each disposition and its reason as the Settle-or-ask rule says. In the run evidence and reply, distinguish a landed repair with its observed commit SHA and proof, a filed nonblocking defect with its read-back issue link, and an unresolved defect or failed tracker write with its evidence and what remains. A proposed repair or unconfirmed write is not a completed action.

## 0a. Settle the End state

If the caller supplies a vstack root, reuse it. Otherwise, resolve the vstack root once through the Private-mode rule. Reuse the caller's project Scratch dir and session id when supplied. At the top level, resolve the project dir once through `skill://vstack-tmp` with no kind and take the id from `PI_SESSION_ID`. Follow the subagent rule there if the brief lacks either value. The project's config directory is `<vstack root>/docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. Run Code host operations through `code-host.md` there. Run `ci-logs`, `rerun-ci`, `set-secret`, and `set-variable` through `ci.md` there. Operation ids name the steps; CLI configs supply command rows, while MCP configs supply the server, project facts, and pins. Use git for local history and pushes. Chained skills use the paths that the run passes them. They never resolve these paths again.

Keep one run record across every ticket. It holds the requested End state and the chain facts. Retain each chained skill's hand-back in the record. The chain facts are what step 7 passes to each chained skill:

- The effective End state
- The `code-host.md` and `ci.md` paths
- The vstack root
- The project Scratch dir and Scratch session id
- The local branch recorded in step 0b
- The last recorded commit SHA for each branch the run commits to
- The remote branch name (step 0b)
- The base SHA and the whole-diff command
- The last SHA this run pushed
- The prune-comments outcome with its open work
- The final-diff Blast radius findings (step 5)
- The development check evidence paths from step 4
- The accepted Verdict from step 6b, with Verifier identity, base and head SHAs, patch id, and evidence paths
- Held non-gating questions and their pending actions

Follow `skill://flow-page`'s "Stage entry/exit line" for the caller's implement or implement-spec run. Record the Flow id, Stage id, and URL in the run record and chain facts. Follow [Publish delivery progress](#publish-delivery-progress) throughout the run.

Settle the End state once, before any work: commit, merge-ready, or shipped. Commit stays on the current branch. Merge-ready opens a PR and drives it until it can merge. Shipped merges it into the default branch. Reuse an already settled caller End state rather than settling it again. Otherwise settle it in this order:

1. If the user's words or the ticket name an End state, use that. Words that only ask to open a PR settle merge-ready.
2. Otherwise, if `code-host.md`'s project facts hold the line `- Default End state: <commit|merge-ready|shipped>` with one of those three values exactly, take that project default with no question.
3. Otherwise use `ask` with the End states on offer and commit recommended, following `skill://flow-page`'s "Every ask in a Flow" contract for publication and separate answer recording.

Before work, say which End state the run took and where it came from: the words, the ticket, the project default, or the answer.

Submit `{ "kind": "end-state", "requested": "<requested End state>" }` once the choice is settled. Keep that requested value even when unsupported operations cap the effective chain. Record the ceiling and its reason in the run record and a Document Result. A ceiling is not a reached End state. Record the source of a choice as an answer or cited Assumed pick; a default or Headless choice is not user consent.

Offer only the End states whose needed operations the two config files support:

- merge-ready needs `default-branch`, `list-prs`, `create-pr`, `read-pr`, `required-checks`, `review-threads`, and `reply-thread` from `code-host.md`, plus `ci-logs` from `ci.md`.
- shipped needs the merge-ready operations plus `merge-methods`, `merge-pr`, and `comment-pr` from `code-host.md`.
- A stack of PRs also needs `retarget-pr`.

At the start of every run, read the current tool list, descriptions, and parameter schemas of each MCP server named by the configs this step reads, `code-host.md` included. Match every needed operation to a tool by what it does and the arguments its schema accepts, using the recorded project facts. A saved MCP operation row or tool name is not proof of current support. Keep Check and the CI rerun pinned; resolve other operations from the server's descriptions. If tool-list discovery fails or a server is unreachable, offer only commit and name that server and the observed failure. Tell the user to connect the named MCP server before starting a PR chain.

Every other operation, including `rerun-ci`, is optional. Chained skills resolve Code host operation ids through the same rule: choose an MCP tool from the named server's current descriptions and parameter schemas, using the project facts; a missing operation row does not mean unsupported. An optional MCP operation is unsupported when no live tool matches it. For a CLI config, use its command row, where `unsupported` keeps its meaning. A step whose optional operation is unsupported skips that action and reports the gap. If either `code-host.md` or `ci.md` is missing, offer only commit and tell the user to run `/skill:setup-vstack` to add the missing Code host or CI service config. If the user's words, the ticket, or the project default name an End state that the configs do not support, cap it at the furthest End state on offer and name the missing files or operations.

An interactive timeout does not settle the End state. Re-ask the unanswered gate once through the same contract, with `again` on the Flow-authored question before `ask`. If it times out again, stop before work, branching, or committing. Cancellation also stops before those actions. If the picker lost or never showed the question, apply the own-run recovery rule before stopping for unavailability. A recorded timeout, cancellation, or empty response follows the existing re-ask rules, not infrastructure recovery. A Headless run skips the project default. It takes the End state that its prompt names, or else commit, and says so. This Headless choice is not user consent. Tool absence is not a timed-out answer.

The End state authorizes every step up to it: merge-ready authorizes babysit in drive mode; shipped authorizes ship to merge the verified run into the default branch. Deploys and releases are outside this flow.

## 0b. Branch

Read the current branch with `git symbolic-ref -q HEAD`. Detached HEAD stops the run at every End state. With End state commit, stay on that branch. Otherwise read the default branch through the `default-branch` operation. If HEAD is on the default branch, create and switch to `<type>/<slug>` from HEAD, with a type and slug that describe the work. Otherwise stay on the current branch, an omp worktree's `wt/<time>` branch included. Use no worktree. Record the chosen local branch for the rest of the run.

Record the remote branch name. If the local branch is `wt/*`, the remote branch name is a new `<type>/<slug>` that describes the work. Otherwise it is the local branch's name. Never rename the local branch. Add `alias branch:<remote branch>` to the Flow, or the current branch at End state commit, so read-only observations follow the intended branch.

Read the remote tip before any history edit and before the first push. Run `git ls-remote --exit-code <remote> refs/heads/<remote branch>`. Exit code 2 means that the remote branch does not exist yet, and every commit after the base is unpushed. Otherwise fetch it with `git fetch <remote> refs/heads/<remote branch>` and record the fetched SHA as the remote tip. Every commit that the remote tip contains is pushed.

Push with `git push -u <remote> <local branch>:<remote branch>`, which creates the remote branch or fast-forwards it. Push every later update the same way. Before every push, require the pushed branch's `git rev-parse <branch>` to equal its tip recorded under the branch guard below. On a mismatch, push nothing. For a stale-state failure, read branch state again once under the own-run recovery rule and repeat the same guard; keep the recorded SHA unchanged. If the mismatch remains, stop with a blocker that names both SHAs. If git rejects a push, preserve its output and apply that same bounded recovery when the failure is run-owned infrastructure or stale state; otherwise stop and report it. After every push that updates the remote branch, record its SHA as the last SHA this run pushed. Return that SHA to the caller.

Keep every pushed commit as it is. Rebase, amend, or reorder only commits after the remote tip, and push only fast-forwards, never with `--force` or `--force-with-lease`. Bring a pushed branch up to date by merging its target into it.

Branch guard. Apply this rule to every commit and merge in this file and in every skill that reuses it:

1. At step 0b, record `git rev-parse <local branch>` as the local branch's initial commit SHA.
2. Before a commit or a merge that can commit automatically, run `git symbolic-ref -q HEAD`. Require `refs/heads/<branch>` for the recorded local branch, or for the reported branch that the Conflict owner checked out. For a stale-state or run-owned lookup failure, read branch state again and repeat this guard once under the own-run recovery rule. A persistent detached HEAD, another branch, or failed lookup stops the run before the commit. Leave the index and working tree as they are. Report the expected branch and the actual branch or detached SHA.
3. Right after a commit or merge, capture the new commit's SHA with `git rev-parse HEAD`. Require it to equal `git rev-parse <branch>` before recording it as that branch's last commit SHA. On a stale-state or run-owned lookup failure, repeat these reads once under the own-run recovery rule; never repeat a successful commit or merge. A persistent mismatch or failed lookup stops the run with both results. After an allowed history edit, make the same comparison before updating the recorded SHA.
4. Read commit lists with `git log <base>..<branch>` and the head SHA for verification or reporting with `git rev-parse <branch>`. The immediate post-commit check above uses `HEAD` only to identify the new commit.

Before a push, compare the branch tip with its last recorded commit SHA, as the push rule above says. A guard or tip-check blocker reaches no End state. Its delivery table row shows the expected and actual values.

## 3b. Prune comments

Run skill://prune-comments over the whole diff before development checks and review, at every End state. Make direct fixes only. Report any fix that needs a new shape as open. Keep accepted fixes for step 6, without staging unrelated changes. If the critic is unavailable or its second report is rejected, keep accepted fixes, list prune-comments as open, and continue. Its failure never blocks the chain.

Record "prune-comments already run" for open-pr even when the pass stopped, together with its open work; open-pr must not repeat this pass.

## 4. Prepare the Verify skill and run development checks

List the project's Verify skills: skills named `verify-*`, plus, in Private mode, directories `<vstack root>/skills/verify-*/`. Deduplicate links and targets. For a Private copy missing its checkout link, create an absolute symlink at `.omp/skills/verify-<app>` and ensure `.omp/skills/verify-*` is in the resolved git common dir's `info/exclude`, following skill://setup-app-verification. Leave shared ignores unchanged; preserve unrelated exclude lines and existing destinations. Read its SKILL.md by absolute path for the rest of this session; helpers stay relative to that directory.

If there is one Verify skill, use it. If several exist, use the one whose description names the changed surface. Otherwise choose through `ask` in the caller's Stage. If none exists, run skill://setup-app-verification in the same run to create one, and state that implement commits its output in step 6. Then use it. Run development tests and targeted smoke checks of the changed surface through the chosen Verify skill. The full drive belongs to the independent Verifier in step 6b. Open the marked `verify` session folder through `skill://vstack-tmp`. Save check output, notes, and disposable `data/` under `<app>-<run-id>/` inside it. Preserve unavailable or failed checks as such, never as a passing result.

For data-bearing frontend changes, read skill://break-ui before choosing robustness cases. Exercise realistic adverse content and applicable collection boundaries through that project's existing Verify interfaces. Include the same conditional reference in delegated UI verification briefs. The existing Verify owner retains execution and evidence; a loaded reference is not a passing check.

Drift is a failure in the Verify skill's own instructions (missing command, route, selector, or fixture) while its Doctor check passes. Wrong app behavior is a finding, never Drift. On Drift, run skill://maintain-app-verification for that one named feature, with no source-wave Fan-out, and state that implement commits its output in step 6. In Standard mode, maintenance edits only the Verify skill's directory. In Private mode, edit the single copy under the vstack root in place and commit nothing. Retain its clean, changed, or blocked outcome, changed files, and product gaps. Treat the gaps as findings. Then retry the smoke checks once. Step 5 covers maintenance edits too.

Run-only consumers (the step 6b Verifier and forensics) may reuse this discovery and choice but never maintain. They report the drifted step and evidence to their caller. Step 6b's caller repairs the Verify skill as that step says. Forensics captures with the surface's own profiler, debugger, or CDP instead.

## 5. Review the whole diff

Run skill://code-review once over the whole completed diff at every End state, including commit. Pin the base SHA, diff command, and commit list, reading the commit list from the branch ref as step 0b's branch guard says. Include accepted cleanup and Standard-mode Verify edits, plus the proven uncommitted work that implement will commit.

implement reviews before its step 6 commit (Matt's order). implement-spec's merger commits each ticket as it lands, implement-spec reviews once after its last merge, and step 6 commits the review fixes. hillclimb and tune-llm-flow commit each accepted win, review once after their last work commit, and commit review fixes in new commits. Keep Standards, Spec, and Blast radius findings separate. code-review owns the Blast radius trigger list.

code-review's result is each finding that it decided, plus the user's answer to each question that it asked about a finding. The review fixes are the changes that this result calls for: the suggested action of each decided card that asks for a change, a fix for each confirmed Blast radius risk, and the fix that the answer picks for each asked finding. Make the review fixes and update the affected development checks before advancing.

Carry the Blast radius findings and the final-diff proof to open-pr: the proven or unproven safety fact, confirmed risks, cleared items, proof paths, and the base and diff that they cover. open-pr reuses the Blast radius findings only when they cover its final diff and base.

## 6. Commit

Commit the accepted, checked work to the local branch from step 0b, after its branch guard. For implement, this follows review. implement-spec keeps its per-ticket merger commits and commits the review fixes here, after review. hillclimb and tune-llm-flow retain accepted-win commits and put review fixes in new commits. tune-llm-flow also retains its separate reusable-eval commit. Include the Standard-mode setup-app-verification and maintain-app-verification output that step 4 kept uncommitted. Stage only this run's accepted paths or hunks. Leave unrelated changes uncommitted. Keep Private config, artifacts, Verify maintenance, and Scratch out of git. Use the repo's commit convention. Write commit bodies.

For a found defect repaired by implement before this step, commit its checked hunks separately from the requested work. For implement-spec, retain the repair's separate Merger commit.

Record the actual commit as a task or Timeline fact with its SHA. A commit alone does not reach the commit End state. Step 6b must accept independent proof first.

The approved environment fixes from skill://session get one commit per approved mistake class. Each of these commits carries proof that its new check fails on a real past mistake.

## 6b. Verify the committed head

At every End state, commit included, an independent Verifier checks the committed head after step 6 (ADR 0043). The author's checks from step 4 are not independent verification. The Verifier checks only committed work: the base SHA from step 0a and the local branch's tip, `git rev-parse <local branch>`, or the PR's base and head SHAs from `read-pr` when step 7 or ship runs this step. Compute your own patch id for comparison as the first field of `git diff <base_sha>...<head_sha> | git patch-id --stable`.

Resolve your own `git rev-parse --show-toplevel` to an absolute path. Include `Shared checkout: <absolute Git toplevel>` in every Verifier brief, including retries and calls from ship. Give the Verifier the full base and head SHAs, the PR number when one exists, the relevant builds and tests, and the Verify skill's name or absolute path from step 4. Require parent-versus-head proof of the real changed surface, not only a successful launch.

Before delegation, prepare the attempt's `expected.json` and required-step brief under `skill://ship/references/verdict-record.md`, deriving the complete required set from the ticket, chosen Verify skill, and named development checks.

Verifier brief: before any mutation, follow `vstack-verifier`'s authoritative system Working Tree notice and canonical Shared checkout guard. Keep the Isolated clone's baseline unchanged, even when clean. Declare required untracked dependency and runtime paths in one Scratch JSON array, using `[]` when none are required. Prepare a separate detached head checkout through skill://vstack-worktree's `scripts/worktree.ts open --commit <head_sha> --record <record.json> --inputs <inputs.json>` and the bundled ship `scripts/prepare-verifier.ts` preflight and clean-head commands with that same declaration and record. Construction excludes unrelated caches; subsequent validation still refuses hidden undeclared source, clone-local masking, dirty tracked bytes, or missing declared inputs. Accept ovnfs or a fallback with `cloned: true`; report its fallback reason. A plain fallback or failed isolation or head setup returns REFUSED with reason and needed setup, without app checks or dependency-install fallback. The caller may rebuild its own clone inputs and retry as described below; the Verifier never weakens these checks. Run the named builds and tests and the Verify skill's Doctor, Launch, and Drive steps in the prepared head checkout. Read the base without checking it out. Keep tracked files unchanged and remove through `scripts/worktree.ts remove --record <record.json>` on every exit. If removal fails, preserve the actual Verdict and evidence and add a nonempty `cleanup_error`. Save logs, screenshots, and notes inside the marked `verify` session folder at `<app>-<run-id>/`, with a distinct entry per verification. Wrong app behavior is FAIL. A stale instruction while Doctor passes is DRIFT. Name the failing step and evidence. Return the complete `vstack-verifier` Verdict record as one plain JSON object, without a code fence or surrounding text. The Verifier authors no Flow content. Only omp adds the isolation notice after the reply.

Keep the call schemaless so its result text includes omp's isolation notice.

Track each final Verifier, including retries, through skill://vstack-fan-out/WORKER-LIFECYCLE.md. Retain it until the machine record and runtime isolation suffix have been checked, the original completion text and evidence are preserved outside its clone, and no question or follow-up needs it. Then release the settled child and record the observed outcome. On malformed or unavailable results, preserve the actual text, patches needed for validation, diagnostics, and useful failed-run work before release instead of claiming validation passed. Reconcile all started Verifiers before any stop or retry; running or still-needed workers remain retained with reasons.

This parent-owned clone release is separate from the Verifier's detached head worktree cleanup and its `cleanup_error`. Preserve the actual Verdict and report clone-release failures or unverified removal separately. Never apply a Verifier patch.

Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`: the Verifier brief above for this head, the Shared checkout absolute path, the vstack root, the Scratch dir and session id. Wait for its result through `handle.wait()` and retain the returned text for the checks below. If it cannot be spawned, stop: the Verdict is unavailable after the own-run recovery rule's safe retry is exhausted or unavailable, and the End state is not reached; point to `/skill:setup-vstack` when `task.isolation.enabled` is off.

Use the result text returned by eval `wait()` or `handle.wait()`, or the auto-delivered completion. Decode one leading JSON object with a JSON decoder that reports where the object ends and respects strings and escapes. Inspect the remaining suffix separately for the actual omp-added isolation notice. Braces or `Isolation:` text in JSON strings do not mark the boundary. Verifier-authored claims, record fields, notes, fenced text, and diff contents are not isolation evidence. The handle's `output()` and `agent://<id>` omit the notice, so neither can recover it.

- `Isolation: no changes captured.` proves a clean isolated run. It needs no patch path.
- `Isolation: changes captured at … (apply=false). Not applied.` names a root patch. Read it and every nested-repository patch named by omp's notice, including the `- nested repository patch:` lines after `Isolation: changes captured for N nested repositories (apply=false). Not applied.` Any tracked edit in any captured patch invalidates the run. Never use `AgentHandle.patchPath`, derive a path from an agent id, or apply a Verifier patch.
- A capture error makes the Verdict unavailable. Report the exact error. A missing omp isolation notice also makes it unavailable. Report that the runtime isolation notice is missing, separately from a capture error. An unreadable named patch leaves isolation evidence unavailable. Name that gap.

Validate the decoded record before accepting or posting it. Require `verdict` as PASS, PASS+NOTES, FAIL, DRIFT, or REFUSED, and `evidence` as an array of strings. Optional `notes` and `open_questions` must be arrays of strings. For non-REFUSED records, require full `head_sha` and `base_sha` strings matching the requested commits, a string `patch_id` matching the computed stable patch id, and concrete evidence for the named checks. For REFUSED, require all three identifier keys, each either null only before validation or computation reached that value, or a validated matching value. Require nonempty reason notes naming the refusal and needed setup. An empty evidence array is valid for REFUSED because no app check ran. Keep a valid refusal as REFUSED; do not reject its null identifiers as malformed or relabel it FAIL or DRIFT. REFUSED is always unavailable.

Check `proof_steps` and run the shipped `check-verdict.ts` on your saved `expected.json` and decoded record as `skill://ship/references/verdict-record.md`'s "Caller checks" says. The checker's success does not replace the actual isolation-suffix and captured-patch checks above, evidence review, notes review, or user answers below.

If supplied, `cleanup_error` must be a string with non-whitespace content. Empty or incorrectly typed values make the record malformed. A valid `cleanup_error` makes the run unavailable, regardless of its Verdict or isolation suffix. Preserve the actual Verdict and evidence, including an already REFUSED Verdict. Report the app outcome or refusal and the cleanup error separately. Never accept PASS or PASS+NOTES with this field. Missing, malformed, incomplete, or mismatched records or evidence never pass and are not posted. Record who produced the Verdict.

PASS and PASS+NOTES pass only when available, after you read the notes and put each `open_questions` item to the user through top-level `ask` in the caller's Stage under the shared contract. Silence is never approval. FAIL, DRIFT, REFUSED, and an unavailable Verdict never pass. The Verdict is unavailable if a Verifier cannot start, isolation is off, isolation or head preparation fails, a record is malformed or mismatched, the isolation notice is missing, a captured patch contains a tracked edit, or a valid `cleanup_error` is supplied. Preserve each failed attempt's actual record and evidence. For run-owned infrastructure, apply the own-run recovery rule before stopping: rebuild clone inputs this run owns, then retry with a fresh isolated Verifier and the same required inputs, SHAs, and proof checks. Account for the failed worker through the lifecycle contract before retrying. A failed retry, shared-state repair, or recovery that weakens proof stops the run; report what was tried and that the End state was not reached. For a clone failure that remains, retain its REFUSED record and point at omp's `worktree.clone` setting and `/skill:setup-vstack`. This infrastructure allowance does not reset or extend the FAIL or DRIFT cycle below.

For implement and implement-spec, route a found defect through [Found defects](#found-defects) before taking the repair path below.

On FAIL, fix the problem in a new commit, red-first through skill://tdd where a seam exists. On DRIFT, repair the Verify skill through skill://maintain-app-verification for the named feature, as step 4 says. In Standard mode, commit its output in a new commit. In Private mode, commit nothing. Each repair commit passes step 0b's branch guard first. Then run a fresh Verifier through this step on the current head. Allow one repair-and-retry cycle per pass of this step. If the second Verdict of a pass does not pass, stop and report that the End state was not reached.

Keep the accepted Verdict in the run record: verdict, Verifier identity, base and head SHAs, patch id, expected required proof set, per-step outcomes, checker output, and evidence paths. The owning producer publishes a human-readable Result and captures the original machine record and evidence. Step 7 reuses it only with coverage of the current required set, and the delivery table's Proof column shows it. Only after acceptance may the owning chain publish `reached: "commit"` with its SHA and Verdict evidence.

ship verifies its PRs through this step's brief and checks, with its own single-subagent line and Fan-out line. In ship, apply the same own-run infrastructure recovery before stopping for a Verifier that cannot start or has unavailable proof. A FAIL or DRIFT still caps the verified run as ship step 2 says, instead of the behavioral repair-and-retry cycle above.

## 7. Chain to the End state

Run the chain once, after all the work of the invocation, not once per ticket. At commit, stop after step 6b.

For merge-ready or shipped, run skill://open-pr with the chain facts from step 0a. Retain the PR URL, observed status and head SHA, and last pushed SHA. Stop on an unavailable or mismatched published head rather than advancing on an assumed PR.

Then run skill://babysit in drive mode with the chain facts and PR frontier. After babysit reports merge-ready, read the PR's base and head SHAs through `read-pr` and compute its current three-dot patch id. Reuse the accepted Verdict only when that patch id matches and its recorded passing steps cover the current required proof set. Record current SHAs beside the verified ones. Otherwise run step 6b on the new head. Push each step 6b repair commit with the step 0b push and run babysit again. A stack keeps one Verdict per PR, checked against its own base, head, and required set. Post each accepted Verdict through `comment-pr` from a Scratch file, with its SHAs, patch id, expected proof set, per-step outcomes, evidence paths, notes, and Verifier identity. Unsupported `comment-pr` is a reported, nonblocking gap for merge-ready.

If a chained skill returns a found defect, apply [Found defects](#found-defects). After a repair commit, use the guarded push and current-head proof routes above. Keep the original failed check and any consumed retry in the run record.

Publish `reached: "merge-ready"` only after both current-head readiness and accepted proof cover the final patch. For shipped, run skill://ship with those facts and accepted Verdicts. open-pr and babysit return to this caller. Neither starts the next link. Stop at the effective End state or a reported blocker and report what was actually reached.

Conflict owner: babysit reports each conflict and each stale base here. ship reports each branch that `update-branch` cannot update and each step 2 move. The reported branch can be any branch of the run's stack. Fetch it and check it out, and fetch its target: the PR's base branch from `read-pr`, or the default branch for a step 2 move. For a step 2 move, first retarget the PR to the default branch through `retarget-pr`. Pass step 0b's branch guard against the reported branch before running `git merge <remote>/<target>`, because the merge can commit automatically. Resolve each conflict once. Resolve a mechanical conflict yourself against the ticket and spec. If a conflicting hunk chooses between two behaviors, for example when both sides change the same rule, run `git merge --abort` and ask the user which behavior to keep through `ask` under `skill://flow-page`'s "Every ask in a Flow" contract. Then merge again and apply the answer. In a worker, return the question to the parent instead. Without the user's answer, leave the merge aborted and record a blocker. Reconcile the reported caller drift, and pass the same guard before an explicit merge commit. Record the resulting commit through step 0b's post-commit check. Push it as a fast-forward to the PR's head branch with the step 0b push. Then check out the recorded local branch again. If the reported branch is the run's remote branch, record the new last pushed SHA, and record the merged target tip as the new base SHA. Then run babysit again, or return a moved PR to ship for its fresh verdict. If the diff changed, re-establish the affected proof and Blast radius findings.

## Close-out

Run close-out when delivery stops at the effective End state or a blocker. Route remaining held questions through [Question timing](#question-timing).

Before the final report, reconcile every Isolated clone the run owns through `skill://vstack-fan-out/WORKER-LIFECYCLE.md`. implement-spec runs local step 9 for its implementers and review fixers. Release eligible workers through omp without a new confirmation. Keep any surviving clone if the supported operation is unavailable or fails. If the lifecycle check cannot verify removal, report it as retained and `not verified`, never released. For an expired job row, preserve the failure and report the host prerequisite named in the lifecycle contract. Do not delete clone files directly or act on another run's checkouts.

Follow the caller's completion and configured tracker rules without a routine confirmation for closing proved tickets. Missing required proof leaves a ticket open. Preserve `plugin/rules/vstack-posting.md` for draft-first posting where required and the existing consent check for deleting unrecoverable work.

When the run stops, at the effective End state, at commit, or at a blocker, publish a table Result on the caller's Stage with the columns Ticket, Status, Commit, and Proof. Write one row per ticket, or one row for unticketed work. Add a row for step 6 review fixes and for each step 6b Verifier repair commit:

- Ticket: the ticket's number and short title, a short name for the work, "Review fixes", or "Verifier repair".
- Status: `closed` only when the tracker confirms closure, `closing through the PR` when closure still depends on the PR, or the actual open or committed outcome with its reason.
- Commit: the short SHA of its commit, or `none` with where its changes wait, such as a held patch path or the working tree.
- Proof: red and green evidence paths and the accepted Verdict with its Verifier identity, patch id, and evidence paths, or the reason proof is missing.

Add one row per found defect. Use its disposition for Status, the repair SHA or `none` for Commit, and the proof paths, read-back issue link, or unresolved evidence for Proof. Count a found-defect repair only once if it is also a step 6b repair.

List worker outcomes separately in the close-out report and reply. For a verified release, give the worker identity, the observed release result, and the before and after evidence. For a retained worker, give its identity, why it stayed, and the preserved work and evidence paths. For an unsupported or failed release or unverified absence, include the diagnostic and any saved status. Worker retention is not a ticket closure or proof outcome.

Finish the caller's Stage through flow-page after publishing its Results and retiring unresolved questions with reasons. Close the Flow with `close` only when the requested End state was reached, every task is settled, no blocker or ticket remains open, and every Stage is finished. Otherwise leave it open. A completed Stage or a green observation does not close it.

## Publish delivery progress

This is the common publication contract for implement, implement-spec, tdd, pr, open-pr, babysit, ship, and Verify setup and maintenance. Read `skill://flow-page` for the typed fields and receipts. Keep canonical run records, PR body files, Verify skills, and machine verdicts as real deliverables. Publish their human-facing Results on the same Flow, never a separate report page.

Follow `skill://flow-page`'s "Stage entry/exit line". A nested tdd cycle is part of the existing implementation run, not an independent result-producing run. ship publishes its validated human summary.

Record shared and local execution steps as `task` items before work. Reuse existing ticket and chain task ids from `show` instead of duplicating them. Update only changed fields. Activate a task when work starts; mark it done with concrete evidence only when its completion criterion holds. Use `skipped` or `inapplicable` with a reason for omitted work. A task waiting for a missing prerequisite stays pending or active with a linked `blocker`; resolve that blocker only when the prerequisite clears.

Keep one Timeline Result per run and append events with `revise.add` as outcomes occur. Include red and green checks, live proof, commits, held patches, failed pushes, PR reads, review dispositions, exact CI build links and consumed reruns, verifier verdicts, queued or armed requests, and confirmed merges when they occur. Give commands, outcomes, source SHAs, evidence, and known times. Unknown, blocked, failed, and skipped are outcomes, not success. Capture redacted logs, screenshots, patches, and verdict files as typed attachments and link them to the relevant Results or Timeline events. Missing proof gets an unavailable attachment with its reason.

Publish a delivery table with named rows and evidence links plus a Document for chain facts, limitations, review risks, and blockers that do not fit the table. Use Code/diff when source or change excerpts explain a result. Revise the existing Result or append new events rather than copying the whole run. Keep each fact in its own record.

Record observed PR URLs and states with `pr` items, then update those ids after later reads. Record checks with `check` items and evidence tied to the queried head and exact build. A pending check stays pending. Unknown, cancelled, skipped, unsupported, or unavailable provider states belong in the Timeline and Document, not a fabricated passed or failed check. Authored facts remain reported facts; the strip's read-only observations from the separate Code host and CI configurations remain separate. Never execute observation configuration or infer authorization, readiness, or End state from the strip.

Only the owning chain updates `end-state.reached`: commit after step 6b accepts proof of the committed head, merge-ready after babysit's current-head conditions and final patch coverage pass, and shipped after ship confirms every requested PR merged into the default branch with accepted proof. Attach the establishing evidence. Nested verification and PR drafting preserve the caller's requested End state. A standalone non-delivery draft or Verify-maintenance run uses `requested: "none"` only when it delivers no commit or PR.

Publish Results before finishing the Stage, including when blocked. Return all original hand-back fields and concrete evidence paths to the caller. Publication supplements the hand-back and grants no execution, tracker, PR, or merge permission.
