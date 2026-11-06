# Account for isolated workers

The parent owns every Isolated clone it starts. Apply this contract after using each result and before every return, including partial starts, failures, retries, and early stops. Parking, a result, and a landed patch do not reclaim a checkout.

Before starting an isolated role, require an installed ovnfs and `isolation.backend: auto`, as checked by setup-vstack. Resolve `ovnfs` on PATH or through `omp config get ovnfs.path`. If ovnfs is missing, stop and point at `/skill:setup-vstack`. Keep `isolated=True, apply=False, merge=False`. omp owns isolated checkout creation and fails the task if ovnfs fails. vstack adds no fallback for isolated tasks.

Record each worker's agent id, role, ticket or review wave, checkout identity, useful patch and evidence paths, and lifecycle decision in the caller's run record. Record retention with a concrete reason or a release request with its observed outcome and before/after evidence. Keep running workers and workers needed for an unanswered question, conflict, follow-up, retry input, or intentional service. Revisit retention when that need resolves.

## Preserve, release, and observe

1. Confirm the caller's safe trigger. Accepted work must have landed, and no question, conflict, follow-up, or service may still need the worker. A rejected, failed, superseded, or unapplied worker needs preservation instead of landing. Save all useful work, answers, logs, and evidence outside its checkout. Recover patches only from actual omp completion notices. Copy held or retry patches into stable run Scratch paths, because release can overwrite omp's captured `<id>.patch`. If capture failed, preserve useful files from the located checkout. Retain the worker if preservation is incomplete.
2. From the same absolute Git toplevel and worktree base used to start the worker, capture read-only status:

   ```sh
   bun "$(realpath skill://vstack-fan-out/scripts/worker-clone.ts)" status <agent-id>...
   ```

   Save the complete JSON outside every worker checkout as `<before.json>`. Require the worker to be `present`. Its `identity` saves the ovnfs checkout `name` and `path`, plus the omp run `record` path. `unknown` is an identity or inspection gap. Retain the worker and report the gap rather than guessing a path.
3. Release only your own settled child through `write proc://<agent-id>/kill`, with no content. Preserve the actual reply or failure. If the supported operation is unavailable, report the host prerequisite. Do not replace it with filesystem removal, kill unrelated sessions, or change retention settings.
4. After release settles, capture status from the same repo and base, passing the saved pre-release JSON:

   ```sh
   bun "$(realpath skill://vstack-fan-out/scripts/worker-clone.ts)" status <agent-id>... --before <before.json>
   ```

   Report `removed` only when the saved status was `present`, the release result was observed, and status now reports `absent`. That requires a successful ovnfs listing with neither the saved checkout name nor path, and the saved run record to be gone. If either item survives, the listing fails, or identity cannot be validated, status is `unknown`. Report `not verified` and retain the worker. A kill reply such as `Cancelled`, parked status, or patch landing is not removal proof. Keep the diagnostics and do not automatically retry.

Immediate `proc` release has been observed to work. On omp 18.15.0 and 18.17.0, a settled child's expired job row can make `proc://<id>/kill` report not found while its checkout survives. Preserve that failure and the surviving checkout evidence. Report `not verified` with the checkout retained, and name the host prerequisite: supported release for settled agents after job-row expiry. Preserve useful work outside the checkout. Do not revive the agent just to kill it, delete its files, or kill the parent.

Reconcile every worker before returning. Retention is the parent's decision, including when status is `unknown`. Keep user `/wt` checkouts and explicitly created separate checkouts under their own lifecycle rules.

## Read-only status

`worker-clone.ts status <id>... [--before <before.json>]` emits `{repo, base, listing, workers}`. Each worker has `id`, `clone`, `identity`, `state`, and a diagnostic `reason`. The clone path and identity are null until located. States are `present`, `absent`, and `unknown`. The CLI never releases, deletes, or writes a record. Without saved pre-release evidence, missing items are always `unknown`, never `absent`. A saved observation does not replace the parent's release receipt.

The shared `scripts/checkout-locator.ts` owns discovery for worker status and clean-wt. Worker status uses ovnfs only. clean-wt retains legacy APFS discovery. The base follows `OMP_WORKTREE_DIR`, else `omp config get worktree.base`, else `~/.omp/wt`.

On omp 18.17.0, a worker's run record is `base/t<hash>/.omp-ovnfs-checkout.json`. The hash is the last nine hexadecimal digits of `Bun.hash(absoluteRepoRoot + "\0" + id)`, padded to sixteen digits first. On Darwin, strip `/private` from the source root only when both spellings resolve to the same directory. The record contains `{command, checkout}`. Join its checkout name to `ovnfs --json ls` to find the path and source. Require the source to match the caller's Git toplevel and the path to be a directory. The checkout lives on the ovnfs mount, not under the base, and `omp worktree list` does not list it. A changed layout or malformed record is an evidence gap, not proof of removal.
