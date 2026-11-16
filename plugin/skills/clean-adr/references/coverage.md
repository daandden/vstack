# Derive the check outcome from coverage

Use this procedure for every numbered whole-result check. The bundled command computes completion from coverage rows. Scout verdict labels and parent summaries do not decide completion.

## Prepare ownership before the check

Save a manifest in the check's Scratch directory. Give every archived provision and new statement a stable row id and one owning group. Separate independent claims when they need different evidence, such as a configured retention period, runtime enforcement, and the operational rationale. Use namespace-qualified ids. Keep the previous check's ids even after a fix. Add rows for statements introduced by a fix or findings discovered by a scout.

Every archived provision owns its rows regardless of its disposition. A dropped provision still needs separate rows for runtime enforcement and rationale asserted by its archived text. An evidence-backed abandonment reason closes only the disposition row, not those claim rows. Keep them open as `unavailable` or `unknown` when independent project evidence is missing, even if the provision has no replacement ADR.

Each manifest group names its raw scout JSON file. A relative report path resolves from the manifest's directory. Every row requires `kind`: `archived` for a provision in an archived ADR, or `new` for a statement in a new ADR. Keep that kind with the stable id through later fixes, including deletion of a new statement. `source` names the provision or statement by path and section or line. `affectedAdrs` lists the new ADR paths that need a banner if the row stays open. Use an empty array when no replacement exists.

```json
{
	"check": 1,
	"groups": [{
		"id": "tracked-retention",
		"report": "tracked-retention.json",
		"rows": [{
			"id": "tracked-retention-runtime",
			"kind": "archived",
			"source": "docs/adr/archive/2026-11-11T1640/0002-cache.md:5",
			"affectedAdrs": ["docs/adr/0013-cache-retention.md"]
		}, {
			"id": "tracked-retention-maintenance-window",
			"kind": "new",
			"source": "docs/adr/0013-cache-retention.md:5 before repair",
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
	}, {
		"id": "tracked-retention-maintenance-window",
		"disposition": "removed",
		"removedFrom": ["docs/adr/0013-cache-retention.md"],
		"evidence": {
			"status": "verified",
			"references": ["docs/adr/0013-cache-retention.md:1-8", "docs/adr/0014-payload-format.md:1-8"],
			"detail": "Read every current new ADR. None contains the invented maintenance-window requirement."
		},
		"problem": null,
		"resolution": "The later fix deleted the unsupported requirement. Current new ADRs establish its absence."
	}]
}
```

`disposition` is `restated`, `dropped`, `removed`, or `missing`. A restated row needs its replacement provision location. Only an archived row can be dropped. It needs `droppedReason`, the original judge's evidence-backed reason. Use `missing` for an omitted provision or a new statement with no archived source. A new statement's source mapping must also appear in the coverage table.

Only a `kind: "new"` row can be `removed`. It means a later fix deleted that statement from every new ADR, not that the project abandoned an archived decision. Return `removedFrom` as a nonempty array of the new ADR paths that held it. Supply verified evidence citing the current new ADRs and a finding that establishes absence from every new ADR. Each `removedFrom` path needs a current-ADR reference, optionally with a line or fragment suffix. Return `problem: null` and, for a previously open id, the required `resolution`. Keep deleted invented statements under their original ids as `removed`, never `dropped`. Archived provisions still need restatement or the original judge's abandonment reason.

`evidence.status` is `verified`, `unavailable`, or `unknown`. `verified` needs independent references and a finding in `detail` that establishes this row's own claim as written. Evidence that contradicts the claim, or shows a different value or mechanism, never verifies it. Record the contradiction as the row's `problem` and keep the row open. Use `unavailable` when no evidence of the claimed behavior exists. For a dropped archived claim, current behavior that differs from it supports only the disposition row. Source provenance establishes where wording came from. Accepted policy establishes a constraint, not its runtime enforcement or empirical rationale. Keep the latter claims in separate unavailable or unknown rows when the project supplies no independent evidence. Missing evidence does not establish abandonment and does not authorize a replacement decision.

A dropped archived provision's runtime and rationale rows ask whether the project behaved as the archived text says under the configuration that text governed. They do not ask whether current settings enforce the retired rule. That difference belongs to the disposition row. The relevant configuration includes only the settings and values that this provision's own claim names. Evidence must show its stated value and effect. Settings the claim does not name may have any value in that evidence. Assess a restated provision as the project runs it now. Verify an archived-behavior row only with independently cited project source implementing it and a recorded execution or other project record under the relevant configuration showing its stated value and effect. Cite both. Current-settings behavior, accepted policy, retirement, or a run at a different stated value never verifies the archived behavior. Without evidence of that behavior, keep the row open as `unavailable` or `unknown`.

`problem` is a nonempty description for a defect, or `null` when no separate defect exists. An unavailable-evidence row stays open even with `problem: null`, preserved source wording, an accepted constraint, or a scout's PASS label. Include every discovered evidence gap in a claim actually asserted by archived or new ADR text, including gaps that affect no replacement ADR. Keep separate rows for runtime, rationale, and acceptance gaps in those asserted claims. A question about motivation, history, or comparison that no ADR asserts is not a provision and gets no row. For example, an asserted seven-day boundary-delivery rationale needs evidence, but an unasserted explanation for choosing seven rather than eight days does not.

To close a previously open id, the fresh scout also returns `resolution`, explaining how its independently cited evidence settles the previous problem. Keep the same claim and id. A category rename, a policy-acceptance citation for missing runtime evidence, or disappearance from a later table is not a resolution. Pass the previous outcome and raw earlier problem to the scout.

## Run the completion command

Resolve the bundled script through `skill://clean-adr/scripts/check-coverage.ts`. Run it with the manifest and save its stdout as this check's `outcome.json`:

```sh
bun "$(realpath skill://clean-adr/scripts/check-coverage.ts)" <check-dir>/manifest.json
bun "$(realpath skill://clean-adr/scripts/check-coverage.ts)" <check-dir>/manifest.json <previous-check-dir>/outcome.json
```

Check 1 takes only the manifest. Checks 2 and 3 require the preceding completed outcome. The command carries prior ownership and kind forward, so omitting a previously open row cannot close it. A missing or invalid kind, or a kind change for an existing id, exits 2 like reassignment. It writes no files. Capture stdout, stderr, and exit code separately, then preserve the successful JSON as `outcome.json`.

An exit of 2 means the input needs repair. Preserve the diagnostic and repair the named input without changing scout evidence to obtain a clean result. This input correction does not start another independent check. If the procedure cannot run, report the independent check as incomplete.

On exit 0, use `action`:

- `finish` means every owned row has complete coverage, an evidenced disposition, verified independent evidence, and no problem. For a removed new statement, current new ADR evidence establishes deletion, not historical acceptance or runtime enforcement of the deleted claim.
- `recheck` means rows remain open after check 1 or 2. Fix only what evidence settles, then run the next whole-result check with fresh scouts.
- `report-open` means check 3 completed with open rows. Stop rewriting, banner each affected new ADR, and report every row.
- `incomplete` means a group has no usable report. Retain the work and report the unchecked groups. Do not claim the numbered check completed.

Use `openRewriteRows` verbatim as the open-row list. Retain each row's evidence in the raw scout result and coverage table. The command does not judge whether evidence is true or whether the manifest covers the actual prose. The parent and independent scouts still own those judgments. Never replace an open row with a nonblocking evidence-boundary summary.
