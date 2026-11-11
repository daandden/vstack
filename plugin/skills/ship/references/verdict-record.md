# Verdict records and required proof

The caller owns the required proof set. Before delegating, save `expected.json` in the attempt's Scratch entry and give the Verifier its contents. Include every required build, test, Doctor, Launch, journey, negative probe, parent-versus-head comparison, and cleanup step selected from the ticket and Verify skill. Give each step a unique stable ID and describe its action and passing observation in the brief. Required native proof stays required when the native runtime is unavailable.

The expected record has full `head_sha` and `base_sha` strings, the caller's computed stable `patch_id`, and a nonempty `required_steps` array of unique nonempty string IDs. An empty diff has an empty string patch id. For example:

```json
{
	"head_sha": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
	"base_sha": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	"patch_id": "cccccccccccccccccccccccccccccccccccccccc",
	"required_steps": ["tests", "branch-race-negative", "native-journey"]
}
```

Keep these expectations separate from the Verifier's report. A producer's own `required_steps` field cannot remove a requirement. A new required step invalidates reuse of a record that does not cover it, even when the patch id matches.

## Machine record

`vstack-verifier` owns the complete record fields and Verdict definitions. Every record also contains `proof_steps`, an array of objects with these fields:

- `id` is the step's unique nonempty string ID from the brief.
- `outcome` is `passed`, `failed`, or `unavailable`. A failed negative probe is `failed`; a required journey without its runtime is `unavailable`.
- `evidence` is a nonempty array of nonempty strings naming the action, observed result, and captured evidence paths. For unavailable proof, name the missing prerequisite and attempted route instead of inventing a log.

Record one outcome per ID per attempt. Preserve failed attempts and their evidence unchanged. A corrective follow-up belongs in a separate attempt record, not a replacement outcome or a note that changes the original failure into a pass. Extra optional step outcomes may be reported, but cannot satisfy a differently named required step. Label optional observations as such in the brief; never reclassify a required step after seeing its outcome.

A pre-check REFUSED record may have empty `proof_steps` and `evidence` arrays because no app checks ran. It still needs its identifier keys and reason notes under END-STATE step 6b, and it never passes. A passing legacy record without `proof_steps` is malformed, not a compatibility case.

## Caller checks

Decode the Verifier's actual completion text into its leading JSON record and separate omp-added isolation suffix as END-STATE step 6b requires. Save both unchanged. Check the actual suffix and every captured patch independently. A string inside JSON, a checker result, or a producer claim cannot prove isolation.

Run the shipped checker on the parent-owned expectations and decoded record:

```sh
bun <ship skill directory>/scripts/check-verdict.ts <expected.json> <record.json>
```

It exits 0 only for a structurally valid PASS or PASS+NOTES with matching identifiers, concrete evidence, every expected required step passed, and no cleanup error. It exits 2 for malformed inputs or nonpassing proof. Its JSON preserves a parsed record, lists problems, and returns `valid` separately so a valid REFUSED record stays REFUSED.

`ok: true` is necessary, not sufficient for acceptance. `requires_review` is always true. The caller must still inspect evidence against each claimed passing observation, validate omp's isolation suffix and captured patches, read notes, and resolve every `open_questions` item through top-level `ask` under `skill://flow-page`'s "Every ask in a Flow" contract. The checker validates string shapes, not evidence truth or human consent. It neither publishes nor mutates inputs.

Only after all END-STATE step 6b guards pass may implement or ship accept the Verdict. Preserve the expected set, unchanged record, checker output, actual isolation suffix, and evidence together. Missing, failed, or unavailable required proof blocks PASS and PASS+NOTES acceptance regardless of optional notes. A valid `cleanup_error` independently makes proof unavailable, even with complete passing steps.
