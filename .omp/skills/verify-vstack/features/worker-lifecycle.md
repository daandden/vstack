# Isolated-worker lifecycle

Parents own their isolated workers after completion. They preserve useful work, retain workers that still have a purpose, release settled children through omp, and verify that the clone disappeared. The shared contract is in vstack-fan-out. implement-spec supplies the implementer and review-fixer release triggers.

## Sub-features

- `worker-status` reports present, absent, or unknown through the read-only worker-clone CLI. The parent records retention separately. Absence requires a saved present identity.
- `worker-processes` checks for leftover processes before each release through `worker-clone.ts processes`. It stops only processes proven to belong to the worker and holds the release otherwise.
- `worker-implementer` returns a real patch, lands it through a non-isolated merger, releases the implementer, and checks the ovnfs listing and saved run-record absence while the parent remains alive.
- `worker-fixer` holds a review-fixer patch while its question is unresolved. After a scripted answer resolves the question, a merger lands the fix and the parent releases the fixer.
- `worker-early-stop` retains a separate child with useful unlanded work. Both target releases leave this child intact. The fixture preserves its patch before releasing it at teardown.

## How to get to it (user POV)

- Run `/skill:implement-spec` for a spec whose tickets need isolated implementers and review fixes.
- At each release trigger, follow "Preserve, release, and observe" in `plugin/skills/vstack-fan-out/WORKER-LIFECYCLE.md`, steps 1–5, including its rerun after any signal. Run the CLI from the original source checkout, run `processes` through a bash call, and save every output and the release result outside the checkout.

## Driving it with worker-lifecycle.ts

Preconditions:

- Follow the baseline and Doctor steps in `README.md`.
- Use a new `VERIFY_RUN_DIR`. The helper configures isolation only in that run's throwaway omp home.
- The checkout contains the status CLI. The helper invokes that checkout's script, not the installed plugin's script.
- Use real omp and an installed real ovnfs daemon. The helper asks `ovnfs --json status` under the calling home, then uses the returned state and mount for both the throwaway omp wrapper and worker-status lookups. The public status command honors `OVNFS_STATE` and `OVNFS_MOUNT` when set. The helper changes no machine settings.

Step `worker-lifecycle-drive`: Run:

```sh
bun "$SKILL_DIR/scripts/worker-lifecycle.ts" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

The helper uses `drive.ts` with one serialized provider-reply queue. It starts a fresh parent session with the plugin linked and a committed disposable integration repository. All worker edits, patch capture, task mergers, commits, and release calls run through real omp tools. The stub replaces only the model provider.

A successful command prints `lifecycle: passed`. Check these files before Cleanup:

- Step `worker-lifecycle-implementer`: `lifecycle/implementer-before.status.json` reports present and saves `identity: {name, path, record}`. `implementer-after.status.json` reports absent against that saved status. `implementer-release.json` preserves the observed release result and integration commit. `implementer.patch` preserves the patch outside the checkout.
- Step `worker-lifecycle-processes`: The implementer left a SIGHUP-ignoring detached process, the `lifecycle-svc` named service, and a JS eval kernel in its checkout. After its patch lands, `lifecycle/implementer-processes.json` reports `release: "proceed"`, the worker's session id, and exactly four candidates. Three are the `vstack-verify-leftover` process, the service's `__omp_worker_shell_process` wrapper, and the wrapper's child, each with `owner: "worker"`, `service: false`, and outcome `terminated` or `killed`. The fourth is the worker's `__omp_worker_js_eval_process` kernel, with `owner: "omp"` and outcome `omp-managed`, still alive before release. `implementer-service-wake.json` records that omp woke the implementer when its service stopped. `implementer-processes-recheck.json`, taken after the woken worker settled again, reports `proceed` with only omp-managed candidates. After release, none of the four PIDs is alive, so omp ended the kernel itself. `fixer-processes.json` and `protected-processes.json` report `proceed` with no candidates.
- Step `worker-lifecycle-fixer`: `lifecycle/fixer-question.json` records retention with its unanswered question. `fixer-answer.json` records the scripted fixture answer separately. `fixer-release.json` records the later landing and release. `fixer-after.json` reports absent.
- Step `worker-lifecycle-early-stop`: `lifecycle/early-stop-retained.json` records the unfinished child's reason and preserved patch. `protected-after-implementer.json` and `protected-after-fixer.json` both report present. `protected-after-preservation.json` reports absent only after its useful work is preserved.
- Step `worker-lifecycle-passed`: `lifecycle/passed.json` names both integration commits and the final fixture repository. Inspect the repository with `git show <commit>:lifecycle.txt`: the implementer commit contains `implemented`, and the review-fixer commit contains `reviewed`.
- Step `worker-lifecycle-rpc`: `worker-lifecycle/rpc.jsonl` contains the actual tool results and a final `get_state` response. Decisive disk and listing observations occur before this parent exits. Require no failing `tool_execution_end` frame.

Step `worker-lifecycle-nondefault-namespace`: Repeat the drive in a new Verify run with an owned daemon. Create a fresh, short temporary directory and a disposable `HOME`:

```sh
T=$(realpath "$(mktemp -d /tmp/vstack-ovnfs.XXXXXX)")
H="$T/home"
mkdir -p "$H/.o2"
printf 'state: %s\nmount: %s\n' "$T/state" "$T/mount" > "$H/.o2/ovnfs.yml"
```

Start the daemon with `env -u OVNFS_STATE -u OVNFS_MOUNT HOME="$H" ovnfs start`. Save the start result and `env -u OVNFS_STATE -u OVNFS_MOUNT HOME="$H" ovnfs --json status` to the Verify run. Require that both paths equal the config and retain the PID.

Run the helper with that same `env -u OVNFS_STATE -u OVNFS_MOUNT HOME="$H"` prefix. Compare `lifecycle/ovnfs-status.json` with the captured status. Call the generated `data/ovnfs` wrapper with `--json status` under `HOME="$VERIFY_RUN_DIR/data/home"` and those variables unset. Require the same state and mount. Require every saved present worker identity to be on that mount, and the matching after-state to be absent. This exercises discovery without environment overrides and verifies both consumers against the running daemon.

Before stopping this daemon, run `ovnfs --json status` with the original disposable HOME and no overrides. Require the recorded PID, state, and mount. Stop only that daemon using the same environment and `ovnfs stop`. Retain discovery, run, and teardown evidence before deleting the temporary directory. Leave the original user's daemon and home unchanged.

Step `worker-lifecycle-namespace-overrides`: Repeat the owned-daemon drive above in a new Verify run, with a fresh `T`, `H`, and config. Use `env HOME="$H" OVNFS_STATE="$T/override-state" OVNFS_MOUNT="$T/override-mount"` for the daemon start, caller status, helper, teardown status, and stop commands. Require status and the helper's discovery to agree on the two override paths, not the config paths. Call the generated wrapper in the throwaway omp home with both override variables unset, as in the config-only drive. Require the wrapper and the saved worker identities to use the override namespace, and the matching after-states to be absent. Keep the same run and teardown evidence.

Run `bun test --timeout 30000 tests/worker-lifecycle.test.ts` and save the result as separate CLI proof. The command-boundary fixture observes status in the caller's home and the configured wrapper in the throwaway home. Both paths arrive unmodified, including when the caller overrides them. This test does not exercise real isolated work.

Step `worker-lifecycle-cleanup`: Run Doctor again and then Cleanup as the Verify skill says. Cleanup removes the disposable repository and home, not the patch copies, raw RPC proof, or lifecycle records. Confirm those evidence files survive.

Step `worker-lifecycle-parent-vs-head`: Compare `.omp/skills/verify-vstack/scripts/worker-lifecycle.ts` and `plugin/skills/vstack-fan-out/scripts/worker-clone.ts` with the change's base. Probe the base CLI without checking out the base: `T=$(mktemp -d); git archive 85d494c plugin/skills/vstack-fan-out/scripts plugin/skills/vstack-worktree/scripts | tar -x -C "$T"; bun "$T/plugin/skills/vstack-fan-out/scripts/worker-clone.ts" processes X --before /dev/null`. It prints `usage: worker-clone.ts status <agent-id>... [--before <saved-status.json>]` and exits 2. At base, the helper releases workers without a process check. Under that base, SIGHUP-ignoring and named-service leftovers survived `proc://<id>/kill` during #627 triage. The head stops them before release, as `worker-lifecycle-processes` shows. Earlier namespace evidence: base `7e732eb` hardcodes `$HOME/.local/state/ovnfs` and `$HOME/checkouts` for both the wrapper and worker-status lookups, and the head takes both paths from `ovnfs --json status`. The CLI regression tests supply red/green evidence. There is no meaningful executable red test for prose. This scripted drive proves real lifecycle operations, not autonomous compliance with every implement-spec instruction.

## Gotchas

- `process.execPath` inside omp's JavaScript eval is the omp executable, not Bun. Invoke the status script with `bun`.
- The eval-spawned workers and `task` mergers have no result schema. End their turns with text so omp completes the child and gives the queue back to the parent. The parent uses omp's patch capture notice, not a structured `yield` result.
- omp standardizes equivalent `/private/var` and `/var` source paths on macOS before computing run-record identity. The status CLI must match that spelling while keeping listing paths canonical.
- On omp 18.15.0 and 18.17.0, a settled child's expired job row can make `proc://<id>/kill` report not found even while its checkout survives. Record the failed operation and surviving checkout, preserve useful work, and report the host prerequisite for settled-agent release after job-row expiry. Do not revive a child just to kill it or delete the checkout directly.
- On omp 19.2.1, stopping a worker's named service wakes the settled worker with `Supervised process <name> failed with exit code 143.` In a stub drive, that wake takes a model reply. The helper lands the implementer's patch, runs `processes`, answers the wake with one text reply, waits for that reply in the worker's session file, and then runs `processes` again before release, so the reply queue stays in order.
- Eval cells get no `PI_SESSION_FILE`. Run `processes` through `tool.bash`, as the helper does.
- The early-stop path is exercised here. A real teardown timeout or backend cleanup failure is not injected by this recipe and must not be reported as tested.
- A failed drive may still have a successful RPC prompt result. Missing `lifecycle/passed.json`, a failed tool frame, or a failed assertion means the lifecycle proof failed. Preserve diagnostics and run Cleanup before starting a new run.
