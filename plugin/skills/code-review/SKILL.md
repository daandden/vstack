---
name: code-review
description: Review changes since a fixed point on three axes, Standards, Spec, and conditional Safety. Runs each axis as its own reviewer in parallel and reports them side by side. Use to review a branch, PR, work-in-progress changes, or changes since a commit, branch, tag, or merge-base.
---

Review the supplied change scope against the fixed point on separate axes:

- Standards checks the documented coding standards and smell baseline.
- Spec checks the originating issue or spec.
- Safety runs blast-radius only in a run when the diff touches what outside code depends on, or the user requests it.

Each axis runs as its own reviewer so that findings from one do not mask another.

Resolve the absolute vstack root through the Private-mode rule once. Read `docs/vstack/issue-tracker.md` under that root in Standard mode, or `<vstack root>/config/issue-tracker.md` in Private mode. If it is missing, stop and tell the user to run `/skill:setup-vstack`. Subagents use the supplied root, never resolve it again.

## Process

### 1. Pin the fixed point

When the caller passes a pinned fixed point or diff command and commit list, reuse that scope. Also reuse any uncommitted work and untracked paths that the caller names. The PR case below does not run, and you create no worktree, even when the user's words name a PR.

Otherwise, when the user supplies a PR as a number or URL, pin it through these steps:

1. Read `code-host.md` under the vstack root: `docs/vstack/code-host.md` in Standard mode, `<vstack root>/config/code-host.md` in Private mode. If the file is missing, has no `read-pr` row, or its `read-pr` row says `unsupported`, stop. Tell the user to run `/skill:setup-vstack` to add the Code host. Never guess the host from the remote (ADR 0020), and never use `ask` for a fixed point instead.
2. Read the PR through `read-pr`. The fixed point is the target ref's latest commit (the base SHA). The reviewed commit is the source ref's latest commit (the head SHA).
3. Fetch the target branch and the host's PR head ref from the remote of the repo that `code-host.md` names. A fork's head commit is on no branch of that remote, so always fetch the PR head ref: `refs/pull/<n>/head` on GitHub, `refs/merge-requests/<n>/head` on GitLab. Make sure that both SHAs resolve with `git rev-parse --verify <sha>^{commit}`.
4. Create one detached worktree at the head SHA through `skill://vstack-worktree`, with the purpose `code-review-<first 12 characters of the head SHA>`. On a plain checkout, go on with tracked files only, because reviewers only read files. Leave the user's working tree, index, and current branch unchanged.
5. When the run ends, also when it stops early, remove the worktree with `git worktree remove --force <path>`.

Otherwise use the commit SHA, branch, tag, or merge-base that the user supplied. If none is supplied, use `ask` for the fixed point.

Make sure that the ref resolves with `git rev-parse <fixed-point>`.

Capture the review scope once. For committed work, use `git diff <fixed-point>...HEAD`; three-dot compares against the merge-base. When the caller passes uncommitted work, use `git diff <fixed-point>` against the working tree, including staged and unstaged changes, plus the contents of every untracked file the caller names. Capture those untracked paths explicitly; git diff does not include them. Stop for a bad ref or only when this complete scope is empty, not when `...HEAD` alone is empty.

Capture the commit list with `git log <fixed-point>..HEAD --oneline`; it may be empty for uncommitted work. For a PR, use `git diff <base-sha>...<head-sha>` and `git log <base-sha>..<head-sha> --oneline`. The head SHA replaces `HEAD`, and the uncommitted-work case does not apply. Give every reviewer the same diff command, untracked paths and contents, and commit list, and for a PR the worktree's absolute path. Use this complete scope for Safety triggers and every axis.

For Safety, a run exists when the user typed `/skill:code-review` or a user-typed Matt skill runs code-review (for example, implement's review step). The prompt header `[IMPORTANT: User invoked the "code-review" skill` marks a direct user invocation. A child reviewer uses the run fact in its parent's brief. A model-started code-review is not a run.

Check Safety after pinning the diff. The user's words override the trigger list, including "check safety" and "skip safety". A Safety trigger fires when requested or when the diff changes something that code outside it depends on:

- Public interface: an exported symbol, endpoint, CLI command or flag, or event changes or disappears.
- Persisted or wire data: a schema, migration, serialized format, stored key, or API payload.
- Configuration: a key, environment variable, feature flag, or default.
- Dependencies: an added, removed, or bumped dependency, a lockfile change, or a local patch change.
- Lifecycle or ordering: initialization, teardown, async timing, concurrency, or cache invalidation.

Record every trigger that fired, or `Safety: not triggered`. Record an explicit skip as `Safety: skipped by request`.

If a trigger fires outside a run, do not read `skill://blast-radius` or run the Safety reviewer. In the Safety report, name each trigger that fired. State that no safety proof ran, and recommend `/skill:code-review` for the proof. Standards and Spec run as before.

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

The axes that run are Standards, Spec unless step 2 found no spec, and Safety only when a step-1 trigger fired within a run. An explicit "skip safety" skips Safety even within a run.

When Safety runs, read `skill://vstack-tmp` and resolve the project Scratch dir once with its path script and no argument. Pass that absolute project dir, never the `blast-radius/` kind dir. A child uses the supplied dir without running the script. If this reviewer is itself a child, reuse the Scratch dir from its prompt.

With two or three axes, use this Fan-out line. With only Standards, use the single-subagent line below.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per axis that runs. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: that axis's reviewer prompt below, the vstack root, the Scratch dir. Wait for every result. If they cannot start, stop: report code-review as not run.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the Standards reviewer prompt below, the vstack root. Wait for its result. If it cannot be spawned, stop: report code-review as not run.

The Standards reviewer prompt must include:

- The full diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "Read changed files from this worktree at the head SHA, not from the current checkout."
- The list of standards-source files you found in step 3, plus the smell baseline from step 3 pasted in full (the reviewer has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

The Spec reviewer prompt must include:

- The full diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "Read changed files from this worktree at the head SHA, not from the current checkout."
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec reviewer and note this in the final report.

The Safety reviewer prompt must include:

- The pinned diff command, named untracked paths and contents, and commit list.
- For a PR, the worktree's absolute path from step 1: "blast-radius reuses this worktree, runs its step 5 proof against the head SHA in it, and creates no second worktree."
- Every trigger that fired.
- The run fact from step 1: "A user-started Matt run exists." A child runs Safety only when its parent's brief states this fact.
- The brief: "Run `skill://blast-radius` on this diff and skip its step 6. Return its hand-back in under 400 words, plus the proof script and its output."
- The supplied Scratch dir, with a distinct run entry under `blast-radius/`.

### 5. Aggregate

Present the reports under `## Standards`, `## Spec`, and `## Safety`, verbatim or lightly cleaned. For an axis that did not run, state why. Never merge or re-rank findings.

End with one line giving each axis's finding count and worst issue within that axis. For Safety include its trigger or skip reason. When the proof ran, state whether the safety fact is proven or unproven. When a trigger fired outside a run, use `Safety: triggered, no proof (not in a run)`. Keep any proof script and observed output alongside its report. Never select a worst issue across axes. For a PR, remove the worktree as step 1 says.

## Why three axes

A change can follow standards but implement the wrong requirement. It can implement the spec but violate conventions. It can pass both and break an unchanged caller, stored data, or teardown order.

Reporting each axis separately stops one from masking another.
