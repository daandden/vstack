# Isolated-worker lifecycle

Parents own their isolated workers after completion. They preserve useful work, retain workers that still have a purpose, release settled children through omp, and verify that the clone disappeared. The shared contract is in vstack-fan-out. implement-spec supplies the implementer and review-fixer release triggers.

## Sub-features

- `worker-status` reports present, absent, retained, or unknown through the read-only worker-clone CLI. A pre-release absent state cannot prove removal.
- `worker-implementer` returns a real patch, lands it through a non-isolated merger, releases the implementer, and checks disk and listing absence while the parent remains alive.
- `worker-fixer` holds a review-fixer patch while its question is unresolved. After a scripted answer resolves the question, a merger lands the fix and the parent releases the fixer.
- `worker-early-stop` retains a separate child with useful unlanded work. Both target releases leave this child intact. The fixture preserves its patch before releasing it at teardown.

## How to get to it (user POV)

- Run `/skill:implement-spec` for a spec whose tickets need isolated implementers and review fixes.
- At each release trigger, run `bun plugin/skills/vstack-fan-out/scripts/worker-clone.ts status <agent-id>...` from the original source checkout, issue `write proc://<agent-id>/kill`, then run status again. Preserve both outputs and the release result.

## Driving it with worker-lifecycle.ts

Preconditions:

- Follow the baseline and Doctor steps in `README.md`.
- Use a new `VERIFY_RUN_DIR`. The helper configures isolation only in that run's throwaway omp home.
- The checkout contains the status CLI. The helper invokes that checkout's script, not the installed plugin's script.

Run:

```sh
bun "$SKILL_DIR/scripts/worker-lifecycle.ts" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

The helper uses `drive.ts` with one serialized provider-reply queue. It starts a fresh parent session with the plugin linked and a committed disposable integration repository. All worker edits, patch capture, task mergers, commits, and release calls run through real omp tools. The stub replaces only the model provider.

A successful command prints `lifecycle: passed`. Check these files before Cleanup:

- `lifecycle/implementer-before.json` reports present, and `implementer-after.json` reports absent. `implementer-release.json` preserves the observed release result and integration commit. `implementer.patch` preserves the patch outside the clone.
- `lifecycle/fixer-question.json` records retention with its unanswered question. `fixer-answer.json` records the scripted fixture answer separately. `fixer-release.json` records the later landing and release. `fixer-after.json` reports absent.
- `lifecycle/early-stop-retained.json` records the unfinished child's reason and preserved patch. `protected-after-implementer.json` and `protected-after-fixer.json` both report present. `protected-after-preservation.json` reports absent only after its useful work is preserved.
- `lifecycle/passed.json` names both integration commits and the final fixture repository. Inspect the repository with `git show <commit>:lifecycle.txt`: the implementer commit contains `implemented`, and the review-fixer commit contains `reviewed`.
- `worker-lifecycle/rpc.jsonl` contains the actual tool results and a final `get_state` response. Decisive disk and listing observations occur before this parent exits. Require no failing `tool_execution_end` frame.

Run Doctor again and then Cleanup as the Verify skill says. Cleanup removes the disposable repository and home, not the patch copies, raw RPC proof, or lifecycle records. Confirm those evidence files survive.

Compare against the parent revision by reading its status-command availability and lifecycle contract. The old revision has no status CLI. The CLI regression tests supply red/green evidence. There is no meaningful executable red test for prose. This scripted drive proves real lifecycle operations, not autonomous compliance with every implement-spec instruction.

## Gotchas

- `process.execPath` inside omp's JavaScript eval is the omp executable, not Bun. Invoke the status script with `bun`.
- Eval-spawned workers submit with `yield`; the nonstructured `task` merger ends with text. Mixing those completions desynchronizes the reply queue.
- omp standardizes equivalent `/private/var` and `/var` source paths on macOS before computing clone identity. The status CLI must match that spelling while keeping listing paths canonical.
- On omp 18.15.0, a settled child's expired job row can make `proc://<id>/kill` report not found even while the clone survives. Record the failed operation and surviving clone, preserve useful work, and report the host prerequisite for settled-agent release after job-row expiry. Do not revive a child just to kill it or delete the clone directly.
- The early-stop path is exercised here. A real teardown timeout or backend cleanup failure is not injected by this recipe and must not be reported as tested.
- A failed drive may still have a successful RPC prompt result. Missing `lifecycle/passed.json`, a failed tool frame, or a failed assertion means the lifecycle proof failed. Preserve diagnostics and run Cleanup before starting a new run.
