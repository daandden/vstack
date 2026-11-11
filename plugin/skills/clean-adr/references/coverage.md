# Derive the check outcome from coverage

Use this procedure for every numbered whole-result check. The bundled command computes completion from coverage rows. Scout verdict labels and parent summaries do not decide completion.

## Prepare ownership before the check

Save a manifest in the check's Scratch directory. Give every archived provision and new statement a stable row id and one owning group. Separate independent claims when they need different evidence, such as a configured retention period, runtime enforcement, and the operational rationale. Use namespace-qualified ids. Keep the previous check's ids even after a fix. Add rows for statements introduced by a fix or findings discovered by a scout.

Each manifest group names its raw scout JSON file. A relative report path resolves from the manifest's directory. `source` names the provision or statement by path and section or line. `affectedAdrs` lists the new ADR paths that need a banner if the row stays open. Use an empty array when no replacement exists.

```json
{
	"check": 1,
	"groups": [{
		"id": "tracked-retention",
		"report": "tracked-retention.json",
		"rows": [{
			"id": "tracked-retention-runtime",
			"source": "docs/adr/archive/2026-11-11T1640/0002-cache.md:5",
			"affectedAdrs": ["docs/adr/0013-cache-retention.md"]
		}]
	}]
}
```

## Request structured evidence from each scout

Include the manifest's assigned rows in the check brief. Request its coverage table and this JSON object in its returned result. The parent saves the JSON without changing its evidence assessments. Scouts write no files.

```json
{
	"rows": [{
		"id": "tracked-retention-runtime",
		"disposition": "restated",
		"replacement": "docs/adr/0013-cache-retention.md:3",
		"evidence": {
			"status": "unavailable",
			"references": ["settings.json:5"],
			"detail": "Seven days is configured and accepted; runtime enforcement is unproven."
		},
		"problem": null
	}]
}
```

`disposition` is `restated`, `dropped`, or `missing`. A restated row needs its replacement provision location. A dropped row needs `droppedReason`, the judge's evidence-backed reason. Use `missing` for an omitted provision or a new statement with no archived source. A new statement's source mapping must also appear in the coverage table.

`evidence.status` is `verified`, `unavailable`, or `unknown`. `verified` needs independent references and a finding in `detail` that establishes this row's claim. Source provenance establishes where wording came from. Accepted policy establishes a constraint, not its runtime enforcement or empirical rationale. Keep the latter claims in separate unavailable or unknown rows when the project supplies no independent evidence. Missing evidence does not establish abandonment and does not authorize a replacement decision.

`problem` is a nonempty description for a defect, or `null` when no separate defect exists. An unavailable-evidence row stays open even with `problem: null`, preserved source wording, an accepted constraint, or a scout's PASS label. Include every discovered gap as a row, including gaps that affect no replacement ADR.

To close a previously open id, the fresh scout also returns `resolution`, explaining how its independently cited evidence settles the previous problem. Keep the same claim and id. A category rename, a policy-acceptance citation for missing runtime evidence, or disappearance from a later table is not a resolution. Pass the previous outcome and raw earlier problem to the scout.

## Run the completion command

Resolve the bundled script through `skill://clean-adr/scripts/check-coverage.ts`. Run it with the manifest and save its stdout as this check's `outcome.json`:

```sh
bun "$(realpath skill://clean-adr/scripts/check-coverage.ts)" <check-dir>/manifest.json
bun "$(realpath skill://clean-adr/scripts/check-coverage.ts)" <check-dir>/manifest.json <previous-check-dir>/outcome.json
```

Check 1 takes only the manifest. Checks 2 and 3 require the preceding completed outcome. The command carries prior ownership forward, so omitting a previously open row cannot close it. It writes no files. Capture stdout, stderr, and exit code separately, then preserve the successful JSON as `outcome.json`.

An exit of 2 means the input needs repair. Preserve the diagnostic and repair the named input without changing scout evidence to obtain a clean result. This input correction does not start another independent check. If the procedure cannot run, report the independent check as incomplete.

On exit 0, use `action`:

- `finish` means every owned row has complete coverage, an evidenced disposition, verified independent evidence, and no problem.
- `recheck` means rows remain open after check 1 or 2. Fix only what evidence settles, then run the next whole-result check with fresh scouts.
- `report-open` means check 3 completed with open rows. Stop rewriting, banner each affected new ADR, and report every row.
- `incomplete` means a group has no usable report. Retain the work and report the unchecked groups. Do not claim the numbered check completed.

Use `openRewriteRows` verbatim as the open-row list. Retain each row's evidence in the raw scout result and coverage table. The command does not judge whether evidence is true or whether the manifest covers the actual prose. The parent and independent scouts still own those judgments. Never replace an open row with a nonblocking evidence-boundary summary.
