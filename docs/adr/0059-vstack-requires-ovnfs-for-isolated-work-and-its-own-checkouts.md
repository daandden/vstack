# ADR 0059: vstack requires ovnfs for isolated work and its own separate checkouts

Starting with omp 18.17, isolated subagents run in ovnfs checkouts whenever the `ovnfs` binary is found and `isolation.backend` is `auto`, and omp tells agents to open ovnfs checkouts instead of running `git worktree add`. In the `omp-bash-wt-update` interview on 2026-11-06, the user chose ovnfs as vstack's only isolation backend. setup-vstack checks for ovnfs, isolated roles stop without it, and the worker locator drops the APFS clone layout that [ADR 0007](0007-isolated-subagents-write-artifacts-through-the-vstack-root.md) assumed.

vstack-worktree opens each checkout with `ovnfs new`, then forces and validates the requested revision in its independent private Git directory. ovnfs v0.1.1 accepts an ovnfs checkout as a source without `--rev`, but rejects that source with `--rev`. The script therefore sets the revision through Git after creation and preserves ignored build inputs. It falls back to `omp wt add`, with the failure reported, only when ovnfs is installed, `ovnfs new` fails, and the source is outside ovnfs. An ovnfs source cannot fall back to a checkout sharing its private Git directory. The shared executable resolver prefers omp's `ovnfs.path` and uses PATH only when unset. An invalid configured executable stops at setup-vstack.

clean-wt inventories the ovnfs checkouts omp made and applies its owner, dirty-work, and unique-history guards before calling `ovnfs rm`. It keeps recognizing legacy APFS task copies until they are gone.

Amended on 2026-11-09 for ovnfs v0.3.0, whose `rm` also deletes the checkout's snapshots. clean-wt's Git guards cannot see work that exists only in a snapshot, so clean-wt keeps snapshots through `ovnfs ctl rm` with `sticky_snapshots`. It runs plain `ovnfs rm` only when the daemon rejects that field, because a daemon older than v0.3.0 never deletes snapshots. Inspecting snapshot contents before removal was rejected because it would add a second, ovnfs-specific uniqueness guard. vstack-worktree keeps plain `ovnfs rm` for the checkouts it opened, so their snapshots go with them.

Amended on 2026-11-12 for ovnfs v0.4.0, which gives the source repository a git remote `ovnfs/NAME` for each live checkout unless `git_remotes: false` is set. After a fetch, `refs/remotes/ovnfs/NAME/HEAD` reaches the checkout's own commits, but ovnfs deletes that ref when it removes the checkout. clean-wt therefore never counts `refs/remotes/ovnfs/*` as a copy of a commit, and never picks an `ovnfs/` remote as the source's remote default. setup-vstack's Migration likewise skips `ovnfs/` remotes when it seeds the Code host. Requiring `git_remotes: false` through setup-vstack was rejected: it would turn off an ovnfs feature for all of the user's work, need a restart of the shared daemon, and leave the guard open whenever the setting came back on.

Amended on 2026-11-17 for [issue #522](https://github.com/daandden/vstack/issues/522). clean-wt inventories all native omp entries and eligible `omp-*` ovnfs checkouts across repositories from any directory, including outside Git. Native `parentRepo`, task-session ancestry, Git alternates, and ovnfs source chains establish each checkout's source repository. Missing origin evidence keeps it uncertain. Inventory reads each native listing once and inspects each checkout once. History and integration checks use the established repository rather than the invocation directory.

Every ovnfs entry protects the checkout containing its source, even when the dependent is named, a verifier, unknown-origin, or from another repository. The protection names each dependent and covers native checkouts, task wrappers, and ovnfs sources. Removal refreshes the listing before acting. Neither automatic cleanup nor an earlier dirty-work approval overrides that protection. The reporter's removed source checkouts left surviving ovnfs dependents with unreadable files. Repository-scoped cleanup could not protect sources used by excluded dependents, so retaining that scope was rejected. Existing ownership, uncertain-origin, unique-history, fingerprint, snapshot, and approval guards remain.

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
