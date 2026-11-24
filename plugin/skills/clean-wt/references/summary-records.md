# Summary records

Keep `summary-records.json` beside the original command outputs in the run's `clean-wt` Scratch entry. Start with `{ "version": 1, "phase": "running" }`. Update the file as evidence arrives. Use full canonical checkout paths in every record. The renderer only accounts for original inventory entries; the records do not authorize removal.

- `inventory`: `{ "exit_code": 0, "file": "inventory.json" }`, referring to the unchanged initial inventory stdout. Omit until invoked. Use the observed status, or `null` for an interrupted command with no exit code. Save stdout even when it is invalid JSON. Keep the command and stderr separately. Use the same output object for each removal and verification inventory below. Relative file names resolve beside `summary-records.json`.
- `investigations`: one item per target that needed investigation. Save `{ path, status: "complete", checkout }` with the unchanged targeted checkout record. For incomplete work use `{ path, status: "failed" | "not-run", reason }` with the raw reason. If the targeted inventory finished but required approval evidence is still invalid, record `failed` until repaired. Keep all raw reports and any partial inventory separately.
- `removals`: append `{ origin: "automatic" | "picked", targets: [{ path, repository }] }` before each removal command. Record the established source repository name while the checkout still exists. For picked targets use the investigator's saved repository; for automatic targets resolve it from the established source Git directory. Never use the invocation directory or guess the repository from the checkout name. After the command, set `output` to its output object. Keep earlier attempts and their raw output files.
- `approval_plan`: the saved valid `approval-plan.json` path. Keep that plan unchanged after opening the rounds. Use `phase: "picking"` while its choices are open. The renderer copies the saved option labels in planner order.
- `offers`: append `{ question_ref }` after a round is published. Its offered paths are the round's saved mapping. When the round settles, set `picked` to the full mapped paths explicitly selected by the user. Use `[]` for a finished round without explicit picks. Leave `picked` absent only while the round is unsettled. Preserve the full observed answer separately, including any selections that gave no consent.
- `verification`: save `{ inventory, observations: [{ path, disk }] }`. Use `disk: "present"`, `"absent"`, or `"unknown"` based on the independent path check. For removed ovnfs checkouts add `ovnfs_listed`. For removed linked worktrees add `git_registered` and, if the checkout had a branch, `branch_preserved`. Use booleans only for observed facts. Omit unknown observations or record `null` for those optional fields. Keep raw verification commands and outputs in Scratch.

Set `phase: "finished"` at every exit. On an early exit, also set `stop` to the failing step: `inventory`, `prepare-source`, `investigation`, `approval`, `removal`, `verification`, or `other`. Do not replace missing evidence with empty successful output.

## Publish the summary

Save the renderer's stdout. Validate it against this Stage, then submit it unchanged. The first submit receipt assigns `refs["cleanup-summary"]`. Save that id and pass it as `--revises <result-id>` on later renders. Do not create a second Result.

`summary.ts` saves `checkout-accounting.json` beside the input. It records full paths, raw records and reasons, offer and pick status, removal attempts, and verification facts.

The inventory omits disposable ignored paths from `changes`. A checkout with only those paths can be a clean automatic candidate. Account for the checkout's removal or retention as usual. Do not add a separate record for the omitted paths.

The skipped count covers both kinds of guarded skip. A final skip row notes missing presence or ownership evidence without changing that count. While cleanup is running, the removed count reflects what the guard reported. The final count includes only verified removals.

After a verification attempt, a normal finish does not count a checkout as kept unless verification lists it and a separate check confirms its disk presence. The summary reports changes in confirmed ownership and excludes newly uncertain ownership from the kept count. If cleanup stops before verification finishes, the summary preserves the inventory and investigation classifications without treating them as verified. Checkouts classified as not safe to judge appear only as counts.

If the run is not enrolled in a Flow, still keep the Scratch records and render the summary. Give the outcome directly in chat.
