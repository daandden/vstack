# Isolated-worker lifecycle

Parents own their isolated workers after completion. They preserve useful work, retain workers that still have a purpose, release settled children through omp, and verify that the clone disappeared. The shared contract is in vstack-fan-out. implement-spec supplies the implementer and review-fixer release triggers.

## Sub-features

- `worker-status` reports present, absent, or unknown through the read-only worker-clone CLI. The parent records retention separately. Absence requires a saved present identity.
- `worker-implementer` returns a real patch, lands it through a non-isolated merger, releases the implementer, and checks the ovnfs listing and saved run-record absence while the parent remains alive.
- `worker-fixer` holds a review-fixer patch while its question is unresolved. After a scripted answer resolves the question, a merger lands the fix and the parent releases the fixer.
- `worker-early-stop` retains a separate child with useful unlanded work. Both target releases leave this child intact. The fixture preserves its patch before releasing it at teardown.

## How to get to it (user POV)

- Run `/skill:implement-spec` for a spec whose tickets need isolated implementers and review fixes.
- At each release trigger, run `bun plugin/skills/vstack-fan-out/scripts/worker-clone.ts status <agent-id>...` from the original source checkout and save its complete JSON outside the checkout. Require `present` with checkout name, path, and run-record path. Issue `write proc://<agent-id>/kill`, then run `status <agent-id>... --before <saved-status.json>`. Preserve both outputs and the release result. Removal requires `absent`; `unknown` stays retained.

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

Step `worker-lifecycle-parent-vs-head`: Compare `.omp/skills/verify-vstack/scripts/worker-lifecycle.ts` with vstack base `7e732eb`. Without environment overrides, the base hardcodes `$HOME/.local/state/ovnfs` and `$HOME/checkouts` for both the wrapper and worker-status lookups. The head takes both paths from `ovnfs --json status`. The CLI regression tests supply red/green evidence. There is no meaningful executable red test for prose. This scripted drive proves real lifecycle operations, not autonomous compliance with every implement-spec instruction.

## Gotchas

- `process.execPath` inside omp's JavaScript eval is the omp executable, not Bun. Invoke the status script with `bun`.
- The eval-spawned workers and `task` mergers have no result schema. End their turns with text so omp completes the child and gives the queue back to the parent. The parent uses omp's patch capture notice, not a structured `yield` result.
- omp standardizes equivalent `/private/var` and `/var` source paths on macOS before computing run-record identity. The status CLI must match that spelling while keeping listing paths canonical.
- On omp 18.15.0 and 18.17.0, a settled child's expired job row can make `proc://<id>/kill` report not found even while its checkout survives. Record the failed operation and surviving checkout, preserve useful work, and report the host prerequisite for settled-agent release after job-row expiry. Do not revive a child just to kill it or delete the checkout directly.
- The early-stop path is exercised here. A real teardown timeout or backend cleanup failure is not injected by this recipe and must not be reported as tested.
- A failed drive may still have a successful RPC prompt result. Missing `lifecycle/passed.json`, a failed tool frame, or a failed assertion means the lifecycle proof failed. Preserve diagnostics and run Cleanup before starting a new run.
