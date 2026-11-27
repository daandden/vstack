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
3. From the same repo and worktree base, run the process check for the same worker ids through the parent's omp `bash` tool. The tool supplies `PI_SESSION_FILE`. Eval cells do not.

   ```sh
   bun "$(realpath skill://vstack-fan-out/scripts/worker-clone.ts)" processes <agent-id>... --before <before.json>
   ```

   Append `--service <pid>` for each service the run record still retains a worker for. Save each run's stdout, stderr, and exit status beside `<before.json>`. Record the JSON path with the worker's evidence.

   If the command exits nonzero or prints empty or unparseable JSON, retain the worker and report the diagnostic. On `release: "hold"`, retain the worker and report the reason. Report each candidate's PID, command, matched path, owner, and outcome. Never signal processes of other sessions yourself.

   A signal can wake the worker. For example, omp can report `Supervised process <name> failed with exit code 143.` after a named service stops. If the command sent a signal or the report cannot establish that it sent none, wait for the worker to settle again. Rerun `processes` once with the same `<before.json>`. If the second run still finds candidates other than `omp-managed`, retain the worker and report them.

   Continue to step 4 only after a run reports `release: "proceed"` and sends no signals. See [Process check](#process-check) for the report fields and outcomes.
4. Release only your own settled child through `write proc://<agent-id>/kill`, with no content. Preserve the actual reply or failure. If the supported operation is unavailable, report the host prerequisite. Do not replace it with filesystem removal, kill unrelated sessions, or change retention settings.
5. After release settles, capture status from the same repo and base, passing the saved pre-release JSON:

   ```sh
   bun "$(realpath skill://vstack-fan-out/scripts/worker-clone.ts)" status <agent-id>... --before <before.json>
   ```

   Report `removed` only when the saved status was `present`, the release result was observed, and status now reports `absent`. That requires a successful ovnfs listing with neither the saved checkout name nor path, and the saved run record to be gone. If either item survives, the listing fails, or identity cannot be validated, status is `unknown`. Report `not verified` and retain the worker. A kill reply such as `Cancelled`, parked status, or patch landing is not removal proof. Keep the diagnostics and do not automatically retry.

   For each `omp-managed` candidate, confirm that its PID no longer runs with its recorded `started` identity. Use `ps -p <pid>` to see if the PID is still present, then compare the native start identity if it is present. Report a surviving eval kernel as a host gap. Never signal it.

Immediate `proc` release has been observed to work. On omp 18.15.0 and 18.17.0, a settled child's expired job row can make `proc://<id>/kill` report not found while its checkout survives. Preserve that failure and the surviving checkout evidence. Report `not verified` with the checkout retained, and name the host prerequisite: supported release for settled agents after job-row expiry. Preserve useful work outside the checkout. Do not revive the agent just to kill it, delete its files, or kill the parent.

Reconcile every worker before returning. Retention is the parent's decision, including when status is `unknown`. Keep user `/wt` checkouts and explicitly created separate checkouts under their own lifecycle rules.

## Read-only status

`worker-clone.ts status <id>... [--before <before.json>]` emits `{repo, base, listing, workers}`. Each worker has `id`, `clone`, `identity`, `state`, and a diagnostic `reason`. The clone path and identity are null until located. States are `present`, `absent`, and `unknown`. `status` only reads. Without saved pre-release evidence, missing items are always `unknown`, never `absent`. A saved observation does not replace the parent's release receipt.

The shared `scripts/checkout-locator.ts` owns discovery for worker status and clean-wt. Worker status uses ovnfs only. clean-wt retains legacy APFS discovery. The base follows `OMP_WORKTREE_DIR`, else `omp config get worktree.base`, else `~/.omp/wt`.

On omp 18.17.0, a worker's run record is `base/t<hash>/.omp-ovnfs-checkout.json`. The hash is the last nine hexadecimal digits of `Bun.hash(absoluteRepoRoot + "\0" + id)`, padded to sixteen digits first. On Darwin, strip `/private` from the source root only when both spellings resolve to the same directory. The record contains `{command, checkout}`. Join its checkout name to `ovnfs --json ls` to find the path and source. Require the source to match the caller's Git toplevel and the path to be a directory. The checkout lives on the ovnfs mount, not under the base, and `omp worktree list` does not list it. A changed layout or malformed record is an evidence gap, not proof of removal.

## Process check

`worker-clone.ts processes <id>... --before <before.json> [--service <pid>]...` emits `{scan, workers}`. A failed scan holds every worker. `processes` can signal processes, but neither subcommand releases a worker, deletes a checkout, or writes a record. omp stops a session's tagged background processes on release, but processes that ignore SIGHUP and named-service processes can survive. Once omp removes the checkout, their working directories no longer identify it.

On omp 19.2.1, remove `.jsonl` from `$PI_SESSION_FILE` to get the directory that contains `<agent-id>.jsonl`. Its opening `type: "session"` record supplies the worker session `id` and `cwd`. The `cwd` must match the saved checkout.

On macOS, the scan lists PIDs with `proc_listallpids`. It reads the working directory through `PROC_PIDVNODEPATHINFO` and the executable through `proc_pidpath`. On Linux, the scan lists PIDs in `/proc` and reads `/proc/<pid>/cwd` and `/proc/<pid>/exe`. Failure to enumerate PIDs fails the scan. A PID is a candidate only if at least one readable path is within the saved checkout or its realpath.

The `started` field identifies the process at that PID. On macOS it is the start time in seconds and microseconds. On Linux it is the start time in clock ticks since boot. The scan reads the identity when a native path first matches. Before checking ownership, `processes` reads the identity again. A different `started` value gives `skipped-reused`. A missing process or zombie gives `exited`. An unreadable identity leaves ownership `unproven` and holds the worker.

To prove ownership, `processes` rechecks the native paths, reads the structured environment and any needed arguments, and confirms the identity again. At least one readable path must still be within the saved checkout or its realpath. The identity must stay the same. A matching `OMP_BASH_SESSION` tag proves `worker` ownership. A foreign tag with a known worker session gives `other`. Otherwise ownership is `unproven` unless the candidate matches the eval kernel rule.

An eval kernel has `owner: "omp"` and `service: false` only if both identity reads around the ownership check show the CLI's own parent PID and the environment has no `OMP_BASH_SESSION` tag. This match requires running the check through the parent's omp `bash` tool as in step 3. The structured `argv` and provenance must meet one of these rules:

- JS: Exactly two elements, with `argv[1]` equal to `__omp_worker_js_eval_process`. Both native executable paths must be readable and the candidate's path must equal the parent's path.
- Python: Exactly three elements: the interpreter in `argv[0]`, `-u` in `argv[1]`, and the runner in `argv[2]`. All of these provenance checks must pass:
  - The runner's parent directory is named `omp-python-runner-<digits>` and its realpath is a direct child of `realpath(os.tmpdir())`.
  - `lstat` must show that the directory is a real directory, not a symlink, owned by the current UID with mode exactly `0700`.
  - The runner is named `runner-<[a-z0-9]+>.py`. `lstat` must show that it is a regular file, not a symlink, owned by the current UID. Its first line must be exactly `"""OMP Python runner — subprocess wrapper used by the coding-agent host.`.
  - The runner, `argv[0]`, and the native executable path must all be outside the worker checkout, both as read and by realpath when it resolves. Relative arguments resolve against the candidate's working directory. If the working directory is unreadable, both arguments must be absolute.

Missing required evidence or a mismatch during the ownership check leaves ownership `unproven`.

The Python signature identifies the file format, not its provenance. A process deliberately launched with a runner from omp's own private temp directory and with its tag stripped would be treated as omp's if the remaining checks pass.

In release probes on omp 19.2.1, omp stopped the workers' eval kernels. `processes` excludes these kernels from signal preflight and signaling. A run with only `omp-managed` candidates reports `release: "proceed"`.

If any `held` candidate belongs to another session, has unproven ownership, or is part of a retained service, `processes` signals none of that worker's candidates. Before the first signal, it checks the identities of all candidates eligible for signaling. An unreadable identity at preflight marks that candidate `unproven` and `held` and holds all signals for the worker. A changed identity, a process that exited, or a zombie found during preflight does not hold the worker.

`processes` rechecks identity immediately before each SIGTERM and SIGKILL. If that check fails after preflight, it stops signaling partway, reports the PID, and holds the worker. Candidates eligible for signaling that received no signal stay `held`. Candidates already signaled keep their observed outcomes.

Candidate outcomes:

- `omp-managed`: The candidate is an eval kernel that omp stops on worker release. The command did not signal it.
- `held`: The command did not signal the candidate because the worker's check was blocked or signaling stopped partway.
- `exited`: No signal was delivered. The candidate was gone or a zombie.
- `skipped-reused`: No signal was delivered. The PID referred to a different process.
- `terminated`: The command delivered SIGTERM and confirmed that the original process stopped running without delivering SIGKILL.
- `killed`: The original process stopped running after SIGKILL.
- `survived`: The command could not establish that the original process stopped running after a signal attempt.
