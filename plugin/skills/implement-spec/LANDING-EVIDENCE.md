# Landing evidence

The implementer or non-maintain review fixer saves one JSON evidence record per attempt outside its Isolated clone, under the run's Scratch entry. Return its absolute path as the evidence reference. Save it even when no proof can be reused: the Merger gets the scoped check plan from this record, not from the passing proof or the landing subject.

## Scoped check plan

Record `scoped_checks` with these fields:

- `typecheck`: the repository-root command for the project's typecheck. If unavailable, use `null` and give the reason in `typecheck_unavailable`. A fallback cannot pass without the required typecheck.
- `tests`: the repository-root commands for the ticket's or wave's own tests, with their test selection already specified. If there are no scoped tests for prose-only work, use `[]` and record why in `no_scoped_tests`.
- `runtime_inputs`: checkout-relative paths of required untracked dependencies or other runtime inputs. Use `[]` if none are needed. Do not declare source or any path that overlaps the patch's affected paths.

Select commands from the project's existing interfaces. Keep full suites, E2E runs, and Verify gates out of this plan even if they ran in the worker. The Merger runs the recorded commands as written or returns why it could not run them. It does not infer a replacement plan.

## Checked source

Before a check that may supply passing proof, identify the Git tree of the worktree it will check. Capture that worktree with a fresh temporary index in Scratch. Seed the temporary index with the real index's tree (`git write-tree` then `git read-tree` with `GIT_INDEX_FILE` set only for the latter). From the repository root, run `git add -A -- .` and `git write-tree` with `GIT_INDEX_FILE` set to the temporary index. If `runtime_inputs` is nonempty, add one `:(top,exclude,literal)<path>` pathspec to `git add -A` for each input, after verifying that none overlaps tracked source or a patch path. This captures source edits, deletions, and nonignored new source files without treating declared untracked dependencies as staged source. It leaves the real index alone. Use the same capture for the Merger's disposable check view.

Use the following source checks in worker proof and in the Merger's fallback view. Apply them before and after each command. A matching tree ID is necessary, but does not by itself show which source the command used.

- Identify gitlinks and other nested repositories that can supply source. For a gitlink, require the nested checkout to be at the recorded commit and prove its source against that commit with the same checks, including inside further nested repositories. Withhold proof if nested source is missing, dirty, or not represented in the snapshot.
- Resolve source links and links in declared runtime inputs, including links inside a declared directory. Follow their targets rather than trusting the Git blob or declared directory name. Require source targets to belong to the captured snapshot in the checkout under test. Keep genuine runtime-only inputs such as packages installed from the lockfile. A link into unrelated Shared source or an unproved target makes the result unavailable as proof.
- Inventory ignored paths outside declared runtime inputs, including files a check creates. Ignored generated source is absent from the captured tree. Withhold proof if a command reads source there or you cannot rule out that source.

Capture the command, exit code, and output. After the check, recompute the tree with a fresh temporary index and require the same ID. Record the source checks and their observations for each command. If a command mutates source, or you cannot establish which source it used, omit passing proof. Never use the final index, patch, branch tip, or an after-the-fact hash as the check's input identity.

## Passing proof

Add `passing_proof` only when captured results show the typecheck and all scoped tests passed on one tree. Record `tested_tree` and `checks`. Each check entry has `command`, `exit_code`, and absolute paths to its `stdout`, `stderr`, and `source_inputs` evidence. Proof without that source evidence is unavailable for reuse. A broader worker run can supply proof only if its captured results establish that the plan's checks passed on that tree. Keep red and other outcomes separately. They are provenance, not passing proof.

A later edit does not acquire the earlier proof. Keep that proof attached to its original tree, or rerun the checks and record proof for the new tree. On the same base, proof for T1 cannot cover a patch that stages T2.
