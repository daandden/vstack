# vstack requires ovnfs for isolated work and its own separate checkouts

Starting with omp 18.17, isolated subagents run in ovnfs checkouts whenever the `ovnfs` binary is found and `isolation.backend` is `auto`, and omp tells agents to open ovnfs checkouts instead of running `git worktree add`. In the `omp-bash-wt-update` interview on 2026-11-06, the user chose ovnfs as vstack's only isolation backend. setup-vstack checks for ovnfs, isolated roles stop without it, and the worker locator drops the APFS clone layout that [ADR 0007](0007-isolated-subagents-write-artifacts-through-the-vstack-root.md) assumed. vstack-worktree opens every vstack checkout with `ovnfs new` (with `--rev` for a commit). It falls back to `omp wt add`, and reports the failure, only when ovnfs is installed but `ovnfs new` fails. On a machine without ovnfs it stops and points at setup-vstack. clean-wt also inventories the ovnfs checkouts omp made and applies its owner, dirty-work and unique-history guards before it calls `ovnfs rm`. It keeps recognizing legacy APFS task copies until they are gone.

## Considered Options

- **Support both backends and detect which one each run used**: rejected. The user chose one layout to support over keeping vstack working on machines without ovnfs.
- **Leave ovnfs leftovers to omp's run-end cleanup and `omp worktree clear`**: rejected. A kept checkout can hold work that omp could not capture, and `omp worktree clear` documents no guard for it.
- **Keep `omp wt add` for vstack's own checkouts**: rejected. It conflicts with omp's Separate checkouts guidance. A Verifier head worktree made inside an isolated checkout is registered to that checkout's git dir, so it is orphaned when the checkout goes. One such orphan was observed.
- **Drop all APFS code at once and clear old copies with `omp worktree clear`**: rejected. Existing APFS leftovers may hold work that only clean-wt's checks protect.

## Consequences

- omp has no APFS fallback for isolated tasks once ovnfs is found. If an ovnfs checkout fails, the isolated task fails. vstack adds no fallback there.
- An ovnfs checkout sits on the ovnfs mount, outside the omp worktree base, and has a private git dir. `omp worktree list` does not list it. vstack locates a worker through ovnfs's own listing and omp's run record, not through the omp base layout.
- The Verifier's isolation proof is unchanged: an ovnfs isolated subagent still receives omp's Working Tree notice naming its checkout.
- Releasing a settled agent through `proc://<id>/kill` can still fail after its job row expires on omp 18.17.0, as WORKER-LIFECYCLE records for 18.15.0.
