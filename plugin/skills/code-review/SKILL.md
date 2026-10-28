---
name: code-review
description: Review changes since a fixed point on three axes, Standards, Spec, and conditional Blast radius. Runs each axis as its own reviewer in parallel, publishes a linked summary and findings on the Flow page, and asks only about findings it cannot decide. Use to review a branch, PR, work-in-progress changes, or changes since a commit, branch, tag, or merge-base.
---

Review the supplied change scope against the fixed point on separate axes:

- Standards checks the documented coding standards and smell baseline.
- Spec checks the originating issue or spec.
- Blast radius runs blast-radius only in a run when the diff touches what outside code depends on, or the user requests it.

Each axis runs as its own reviewer so that findings from one do not mask another.

Resolve the absolute vstack root through the Private-mode rule once. Read `docs/vstack/issue-tracker.md` under that root in Standard mode, or `<vstack root>/config/issue-tracker.md` in Private mode. If it is missing, stop and tell the user to run `/skill:setup-vstack`. Subagents use the supplied root, never resolve it again.

code-review runs as its own Stage on the Flow page, also when implement or implement-spec runs it. Read `skill://flow-page` before publishing or asking. Use `bound` to find this session and agent's Flow, then `open --flow <flow> --skill code-review`, or start a Flow when unbound. Every `ask` below is a question in that Stage. A code-review in a subagent returns its structured review Result and open questions without writing a page or asking. The caller publishes that Result in a code-review Stage and asks its questions.

## Process

### 1. Pin the fixed point

When the caller passes a pinned fixed point or diff command and commit list, reuse that scope. Also reuse any uncommitted work and untracked paths that the caller names. The PR case below does not run, and you create no worktree, even when the user's words name a PR.

Otherwise, when the user supplies a PR as a number or URL, pin it through these steps:

1. Read `code-host.md` under the vstack root: `docs/vstack/code-host.md` in Standard mode, `<vstack root>/config/code-host.md` in Private mode. If it is missing, stop and tell the user to run `/skill:setup-vstack`. For a CLI config, require a usable `read-pr` command row, not `unsupported`. For an MCP config, read the named server's current tool list, descriptions, and parameter schemas. Select its tool for `read-pr` by what it does and the arguments it accepts, using the recorded project facts. No operation row is needed. If discovery fails, the server is unreachable, or no tool can read the PR, stop and name the server and the failure or missing capability. Tell the user to connect that server or update setup. Never guess the host from the remote or use `ask` for a fixed point.
2. Read the PR through that `read-pr` command or selected tool. Use the config's project facts to interpret the response. The fixed point is the target ref's latest commit, the base SHA. The reviewed commit is the source ref's latest commit, the head SHA.
3. Fetch both exact commits from the repo and remote that the config names. For an MCP config, follow its project facts for fetching the PR's base and head, including a fork's head; do not assume GitHub or GitLab refs. For the GitHub and GitLab CLI configs, fetch the target branch and the PR head ref: `refs/pull/<n>/head` on GitHub, `refs/merge-requests/<n>/head` on GitLab. A fork's head need not be a branch on that remote. Make sure that both full SHAs resolve with `git rev-parse --verify <sha>^{commit}`. If the fetch facts or either commit are unavailable, stop and report the gap rather than reviewing a substitute.
4. Create one detached worktree at the head SHA through `skill://vstack-worktree`, with the purpose `code-review-<first 12 characters of the head SHA>`. On a plain checkout, go on with tracked files only, because reviewers only read files. Leave the user's working tree, index, and current branch unchanged.
5. When the run ends, also when it stops early, remove the worktree with `git worktree remove --force <path>`.

Otherwise use the commit SHA, branch, tag, or merge-base that the user supplied. If none is supplied, use `ask` for the fixed point.

Make sure that the ref resolves with `git rev-parse <fixed-point>`.

Capture the review scope once. For committed work, use `git diff <fixed-point>...HEAD`; three-dot compares against the merge-base. When the caller passes uncommitted work, use `git diff <fixed-point>` against the working tree, including staged and unstaged changes, plus the contents of every untracked file the caller names. Capture those untracked paths explicitly; git diff does not include them. Stop for a bad ref or only when this complete scope is empty, not when `...HEAD` alone is empty.

Capture the commit list with `git log <fixed-point>..HEAD --oneline`; it may be empty for uncommitted work. For a PR, use `git diff <base-sha>...<head-sha>` and `git log <base-sha>..<head-sha> --oneline`. The head SHA replaces `HEAD`, and the uncommitted-work case does not apply. Give every reviewer the same diff command, untracked paths and contents, and commit list, and for a PR the worktree's absolute path. Use this complete scope for Blast radius triggers and every axis.

For Blast radius, a run exists when the user typed `/skill:code-review` or a user-typed Matt skill runs code-review (for example, implement's review step). The prompt header `[IMPORTANT: User invoked the "code-review" skill` marks a direct user invocation. A child reviewer uses the run fact in its parent's brief. A model-started code-review is not a run.

Check Blast radius after pinning the diff. The user's words override the trigger list, including "check blast radius" and "skip blast radius", and the older "check safety" and "skip safety". A Blast radius trigger fires when requested or when the diff changes something that code outside it depends on:

- Public interface: an exported symbol, endpoint, CLI command or flag, or event changes or disappears.
- Persisted or wire data: a schema, migration, serialized format, stored key, or API payload.
- Configuration: a key, environment variable, feature flag, or default.
- Dependencies: an added, removed, or bumped dependency, a lockfile change, or a local patch change.
- Lifecycle or ordering: initialization, teardown, async timing, concurrency, or cache invalidation.

Record every trigger that fired, or `Blast radius: not triggered`. Record an explicit skip as `Blast radius: skipped by request`.

If a trigger fires outside a run, do not read `skill://blast-radius` or run the Blast radius reviewer. In the Blast radius report, name each trigger that fired. State that no blast-radius proof ran, and recommend `/skill:code-review` for the proof. Standards and Spec run as before.

### 2. Identify the spec source

Read the tracker workflow from the vstack configuration above. Look for the originating spec in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`), fetched through that workflow.
2. A path the user passed as an argument.
3. A file under `docs/`, `specs/`, or `.scratch/` matching the branch or feature. In Private mode search `<vstack root>/artifacts/` instead of `.scratch/` too.
4. If nothing is found, use `ask` for the spec source. If the user says there is none, skip Spec and report `no spec available`.

### 3. Identify the standards sources

Anything in the repo that documents how code is written, such as `CODING_STANDARDS.md` or `CONTRIBUTING.md`.

On top of whatever the repo documents, the Standards axis always carries the smell baseline below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- The repo overrides. A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- Always a judgement call. Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- Mysterious Name: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- Duplicated Code: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- Feature Envy: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- Data Clumps: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- Primitive Obsession: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- Repeated Switches: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- Shotgun Surgery: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- Divergent Change: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- Speculative Generality: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- Message Chains: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- Middle Man: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- Refused Bequest: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Run the reviewers

The axes that run are Standards, Spec unless step 2 found no spec, and Blast radius only when a step-1 trigger fired within a run. An explicit "skip blast radius" or "skip safety" skips Blast radius even within a run.

When Blast radius runs, read `skill://vstack-tmp` and resolve the project Scratch dir once with its path script and no argument. Pass that absolute project dir, never the `blast-radius/` kind dir. A child uses the supplied dir without running the script. If this reviewer is itself a child, reuse the Scratch dir from its prompt.

With two or three axes, use this Fan-out line. With only Standards, use the single-subagent line below.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per axis that runs. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: that axis's reviewer prompt below, the vstack root, the Scratch dir. Wait for every result. If they cannot start, stop: publish the affected axes as blocked through step 5 and report code-review as not run.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the Standards reviewer prompt below, the vstack root. Wait for its result. If it cannot be spawned, stop: publish Standards as blocked through step 5 and report code-review as not run.

The Standards reviewer prompt must include:

- The full diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "Read changed files from this worktree at the head SHA, not from the current checkout."
- The list of standards-source files you found in step 3, plus the smell baseline from step 3 pasted in full (the reviewer has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Give each finding a short title, a label (`issue` for a hard violation, `suggestion` for a judgement call), whether it blocks the merge, its impact, the suggested change, and its evidence, in that order. Open the impact with what a user or caller sees, such as 'When you run X, Y happens instead of Z', then state the decision the user faces. The impact describes behavior only and names no file path; the file and line go in the evidence, for whoever fixes it. Say whether the cited sources settle the change, or why it needs the user's judgement. Under 400 words."

The Spec reviewer prompt must include:

- The full diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "Read changed files from this worktree at the head SHA, not from the current checkout."
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Give each finding a short title, a label such as `issue` or `suggestion`, whether it blocks the merge, its impact, the suggested change, and its evidence, in that order. Open the impact with what a user or caller sees, such as 'When you run X, Y happens instead of Z', then state the decision the user faces. The impact describes behavior only and names no file path; the file and line go in the evidence, for whoever fixes it. Say whether the spec settles the change, or why it needs the user's judgement, such as a spec line that reads two ways. Under 400 words."

If the user confirms there is no spec, skip the Spec reviewer and record the reason in the review's Spec axis. An unreadable source is unavailable, not a clean review.

The Blast radius reviewer prompt must include:

- The pinned diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "blast-radius reuses this worktree, runs its step 5 proof against the head SHA in it, and creates no second worktree."
- Every trigger that fired.
- The run fact from step 1: "A user-started Matt run exists." A child runs Blast radius only when its parent's brief states this fact.
- The brief: "Run `skill://blast-radius` on this diff and skip its step 6. Return its hand-back in under 400 words, plus the proof script and its output."
- The supplied Scratch dir, with a distinct run entry under `blast-radius/`.

### 5. Show the report, then ask

Publish through `skill://flow-page` before asking about findings. Submit one `review` Result with all three `axes` and its authoritative `entries`. The renderer derives one summary table at the start of the Stage and links each finding to its full card. Do not author a second summary table or a separate report page.

- Each axis names `standards`, `spec`, or `blast-radius`, and has a `status`: `findings` when it completed with findings, `clean` when it completed without findings, `skipped` when deliberately not run or not triggered, `unavailable` when its source or provider could not be read, or `blocked` when a prerequisite prevented completion. Every status except `findings` needs a `reason`. A blocked axis may retain findings already established, but its reason must name the uncompleted work. Never use `clean` for an axis that did not run.
- Each finding is one entry with a local `ref` such as `std-1`, its `axis`, `title`, `label`, `blocking`, `impact`, `location`, `action`, and `evidence`. `location` gives the source file and line, or the named interface when no source line is known. Keep each reviewer's order within its axis. The impact opens with what a user or caller sees. The script assigns the entry's id and links, including after a focused correction.
- Blast radius risks use the same finding cards. Keep the confirmed or unproven proof level in the `label`, the consequence in `impact`, the proposed change and missing proof in `action`, and the proof script, command, and observed output in `evidence`. Publish the safety fact and cleared checks as a separate `ledger` Result. Do not repeat risks in that ledger. A clean Blast radius axis may still have a safety fact and cleared checks, but has no fabricated finding card.
- When a trigger fires outside a run, use Blast radius `skipped`, with a reason naming the triggers, stating that no proof ran, and recommending `/skill:code-review`. A missing spec is `skipped` only when the user says none exists. A source that cannot be read is `unavailable`. If reviewers cannot start, publish the affected axes as `blocked` with the launch failure before stopping.

Decide each finding that its evidence settles: a documented-standard breach, a missing or incorrect spec requirement, a confirmed risk, or a cleared claim. A card holds its decision in `blocking` and `action`, and a claim in `status` and `consequence`. Ask about every other finding, one question per finding. Examples are an unsettled baseline smell, behavior the spec neither asks for nor rules out, an ambiguous spec line, and an unproven claim. If every finding is decided, ask nothing. Otherwise submit one round and use its receipt's `ask` payload unchanged. Each question names the finding and ends with "?". Its `results` names `<review ref or id>/<entry ref or id>` so the script links both ways. Record the answers through the common interface.

Submit a `close` covering the recorded decisions, or an `extra` outcome when there were no questions or Assumed picks. Then finish the Stage. Its completion authorizes no downstream action.

In chat, summarize each axis's count and worst issue, or its explicit state and reason, instead of repeating the findings. For Blast radius include its triggers or skip reason and, when proof ran, whether the safety fact is proven or unproven. Never select a worst issue across axes. The extension presents the bound Flow URL after the main-agent reply. The caller receives each decided finding plus each question's answer. For a PR, remove the worktree as step 1 says.

## Why three axes

A change can follow standards but implement the wrong requirement. It can implement the spec but violate conventions. It can pass both and break an unchanged caller, stored data, or teardown order.

Reporting each axis separately stops one from masking another.
