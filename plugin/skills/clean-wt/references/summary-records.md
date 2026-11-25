# Summary records

Keep `summary-records.json` beside the original command outputs in the run's `clean-wt` Scratch entry. Start with `{ "version": 2, "phase": "running" }`. Update the file as evidence arrives. Use full canonical checkout paths. The renderer accounts for original inventory entries only. The records do not authorize removal.

Verification and rendering reject version 1 records. Keep their saved reports rather than changing the version in place: the old records lack the current verification evidence.

- `inventory`: `{ "exit_code": 0, "file": "inventory.json" }`, referring to the unchanged initial inventory stdout. Omit until invoked. Use the observed status, or `null` for an interrupted command with no exit code. Save stdout even when it is invalid JSON. Keep the command and stderr separately. Use the same output object for each removal and verification inventory below. Relative file names resolve beside `summary-records.json`.
- `investigations`: one item per target that needed investigation. Save `{ path, status: "complete", checkout }` with the unchanged targeted checkout record. For incomplete work use `{ path, status: "failed" | "not-run", reason }` with the raw reason. If the targeted inventory finished but required approval evidence is still invalid, record `failed` until repaired. Keep all raw reports and any partial inventory separately.
- `removals`: append `{ origin: "automatic" | "picked", targets: [{ path, repository }] }` before each removal command. Record the established source repository name while the checkout still exists. For picked targets use the investigator's saved repository; for automatic targets resolve it from the established source Git directory. Never use the invocation directory or guess the repository from the checkout name. After the command, set `output` to its output object. Keep earlier attempts and their raw output files.
- `approval_plan`: the saved valid `approval-plan.json` path. Keep that plan unchanged after opening the rounds. Use `phase: "picking"` while its choices are open. The renderer copies the saved option labels in planner order.
- `offers`: append `{ question_ref }` after a round is published. Its offered paths are the round's saved mapping. When the round settles, set `picked` to the full mapped paths explicitly selected by the user. Use `[]` for a finished round without explicit picks. Leave `picked` absent only while the round is unsettled. Preserve the full observed answer separately, including any selections that gave no consent.
- `verification`: save `{ "inventory": { "exit_code": 0, "file": "verification.json" } }` after `inventory --verify summary-records.json`. Use the observed exit status and the unchanged verification stdout, even on failure. Keep the command and stderr separately.

Keep the `reader` completion event in stderr with the other progress events. It reports the limits and totals for the script's own file reads. The summary uses stdout for checkout accounting and does not use reader counters as removal or verification evidence.

Set `phase: "finished"` at every exit. On an early exit, also set `stop` to the failing step: `inventory`, `prepare-source`, `investigation`, `approval`, `removal`, `verification`, or `other`. Do not replace missing evidence with empty successful output.

Discovery records have an `outcome`: `inspected`, `protected`, `contents deferred`, `inspection failed`, `vanished`, or `replaced`. A scan with any failure or missing listed checkout reads both native listings once more. The confirmation read never adds checkouts. Only agreement between those listings and disk proves `vanished`. `Replaced` means a different checkout instance was observed at the listed path or under the listed ovnfs name. Keep the raw `failure` from `inspection failed` in Scratch. The summary counts `vanished`, `replaced`, and `inspection failed` separately. None proves that clean-wt kept or removed a checkout.

`Contents deferred` records have no discovery fingerprint. Save the targeted inventory record and its fingerprint in `investigations` after inspection. Until an investigation completes, the summary counts the checkout under `Contents deferred`, not kept or removed. Once an investigation completes, account for removal or retention with the usual evidence.

Keep versioned fingerprints unchanged in inventory records, investigation records, and approval mappings. The renderer retains raw inventory and investigation records in Scratch accounting. It uses the saved option labels without publishing the fingerprints. Only `remove` checks whether a saved fingerprint still matches.

## Verification output

Verification reads the successful discovery inventory and uses completed investigation records for their linked-worktree Git directory and branch. Keep discovery's `instance_id` unchanged when present. Verification reads both native listings again and checks only the original paths and ovnfs names. Checkouts added since discovery do not enter the summary.

- `checkouts` records fresh ownership for original checkouts that are still listed. `evidence_gaps` names unavailable native listings. `ownership_gaps` names unavailable shared ownership evidence. A confirmed live owner remains known when other ownership evidence is missing.
- `observations` records the facts for each original `path` independently. `omp_listed` and `ovnfs_listed` are booleans when the respective listing is available and `null` otherwise. `disk` is `present`, `absent`, or `unknown`. `entry_disk` checks a task wrapper separately when the wrapper and checkout paths differ. `disk_changed: true` records a change in directory presence or identity during verification.
- `instance` is `same` when checkout metadata matches discovery before and after verification. It is `replaced` when the identity differs or the listed ovnfs name and path no longer match. It is `unknown` when the identity cannot be confirmed, including when the original checkout is absent.
- `git_registered` checks the linked worktree's path against its recorded Git common directory. `branch_preserved` checks the named branch in that directory. Each is a boolean for a known fact or `null` when the check is unavailable. Detached worktrees have no branch to verify.

The report contains neither work-state evidence nor fingerprints. Under `--progress`, the `verification` `complete` event records the content file and byte counts. Both are zero.

## Publish the summary

Save the renderer's stdout. Validate it against this Stage, then submit it unchanged. The first submit receipt assigns `refs["cleanup-summary"]`. Save that id and pass it as `--revises <result-id>` on later renders. Do not create a second Result.

`summary.ts` saves `checkout-accounting.json` beside the input. It records full paths, raw records and reasons, offer and pick status, removal attempts, and verification facts.

The inventory omits disposable ignored paths from `changes`. A checkout with only those paths can be a clean automatic candidate. Account for the checkout's removal or retention as usual. Do not add a separate record for the omitted paths.

The skipped count covers both kinds of guarded skip. A final skip row states the verification gap without changing the count. While cleanup is running, the removed count reflects what the guard reported. The final count includes only verified removals.

After verification, count a checkout as removed only if the removal command reported success and the verification facts confirm it. Count a checkout as kept only if the listing, disk, identity, and ownership observations confirm it. Report confirmed ownership changes separately. Treat a checkout as unverified if it vanished during verification, was replaced, or has conflicting listing and disk evidence. If cleanup stops before verification runs, preserve the original classifications without claiming verification. Checkouts classified as not safe to judge appear only as counts.

If the run is not enrolled in a Flow, still keep the Scratch records and render the summary. Give the outcome directly in chat.
