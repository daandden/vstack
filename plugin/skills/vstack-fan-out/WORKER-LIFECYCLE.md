# Account for isolated workers

The parent owns every Isolated clone it starts. Apply this contract after using each result and before every return, including partial starts, failures, retries, and early stops. Parking, a result, and a landed patch do not reclaim a clone.

Record each worker's agent id, role, ticket or review wave, absolute clone path, useful patch and evidence paths, and lifecycle decision in the caller's run record. Record either retention with a concrete reason or a release request with its observed outcome and before/after evidence. Keep running workers and workers needed for an unanswered question, conflict, follow-up, retry input, or intentional service. Revisit that decision when the need resolves. A held question keeps its worker available.

## Preserve, release, and observe

1. Confirm the caller's safe trigger. Accepted work must have landed, and no question, conflict, follow-up, or service may still need the worker. A rejected, failed, superseded, or unapplied worker needs preservation instead of landing. Before release, save all useful work, answers, logs, and evidence outside its clone. Recover patches only from actual omp completion notices. Copy exact held or retry patches into stable run Scratch paths, because release can overwrite omp's captured `<id>.patch`. If capture failed or a patch is unavailable, preserve useful files from the located clone before release. If preservation is incomplete, retain it and name the missing material.
2. From the same absolute Git toplevel and worktree base used to start the worker, capture read-only status before release:

   ```sh
   bun "$(realpath skill://vstack-fan-out/scripts/worker-clone.ts)" status <agent-id>...
   ```

   Save the JSON outside every clone. Require this same worker to be `present`, with its owner identity checked, before claiming a later release removed it. A pre-release `absent` proves no transition. `unknown` is an identity or inspection gap, not permission to guess a path. Retain the worker and report that gap until it is resolved.
3. Release only your own settled child through `write proc://<agent-id>/kill`, with no content. Preserve the actual reply or failure. A running or still-needed child stays retained. If the supported operation is unavailable, report the host prerequisite. Do not replace it with filesystem removal, kill unrelated sessions, or change retention settings.
4. After the release operation settles, capture status again from the same repo and base. Report `removed` only when the worker was located `present` before, the release result was observed, and status now proves both disk and listing absence with no retained sibling. A kill reply such as `Cancelled`, parked status, or patch landing is never removal proof. A surviving original or `.retained-*` sibling means cleanup failed or remains retained. An unknown identity, timeout, failed listing, inspection error, or missing evidence means `not verified`, never success. Keep the exact diagnostics and do not automatically retry.

Immediate `proc` release has been observed to work, but omp v18.15.0 can lose access to a known settled agent after its job row expires, even while its clone survives. If `proc` reports that the agent was not found, preserve that failure and the surviving clone evidence, report the outcome as `not verified` and the clone as retained, and name the host prerequisite: supported release for settled agents after job-row expiry. Preserve useful work outside the clone. Do not revive the agent just to kill it, delete its files, or kill the parent.

Reconcile every worker before the caller returns. Record running or needed workers as retained rather than releasing them to finish the accounting. Keep user `/wt` checkouts and explicitly created temporary Git worktrees under their own lifecycle rules.

## Read-only status

`worker-clone.ts status <id>...` emits `{repo, base, listing, workers}`. Each worker has `id`, `clone`, `state`, `retained` sibling paths, and a diagnostic `reason` when needed. States are `present`, `absent`, `retained`, and `unknown`. It never releases or deletes anything. `absent` is an observation, not a release receipt.

The script gets the repo from the current Git toplevel. The base follows clean-wt's resolution: `OMP_WORKTREE_DIR`, else `omp config get worktree.base` when set, else `~/.omp/wt`. It passes that resolved base to one `omp worktree list --json` for the batch. Base and listing paths stay canonical. For the source identity hash on Darwin, it strips `/private` from the Git root only when the original and stripped paths resolve to the same location, matching omp's project-root spelling. Other platforms keep the Git root unchanged.

The locator follows observed omp v18.15.0 naming: a wrapper at `base/t` plus the last nine hexadecimal digits of `Bun.hash(absoluteRepoRoot + "\0" + id)`, padded to sixteen digits first, with the checkout at `wrapper/m`. Existing wrappers must identify the worker in `.omp-isolation-owner.json`. Matching `.retained-*` siblings count as survivors even when absent from the listing. Unexpected naming, malformed identity, or inaccessible paths are evidence gaps. If omp changes this layout, report the unsupported locator rather than treating an unlocated worker as removed.
