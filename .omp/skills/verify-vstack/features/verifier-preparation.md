# Verifier preparation

The independent Verifier checks runtime inputs before opening a head checkout. A Python project supplies one locked Restore in its Verify skill. Restore runs only in the clean head checkout, with the destination pinned before any writes and the actual interpreter prefix checked before any app check.

## Sub-features

- `input-preflight` distinguishes a missing input that exists in the Shared checkout from one missing there too. It refuses before opening a head checkout.
- `head-input` reports a missing input from an ovnfs head without omp clone settings. An `omp-wt` fallback names its own settings.
- `unsaved-checkout` a failed `remove` keeps the record, checkout, and source branch. A caller, including wayfinder, reports the refusal instead of forcing removal.
- `python-restore` the declared locked restore builds an environment for an editable install in the head checkout. A prefix check uses the Verify skill's interpreter before the app starts.
- `python-refusal` an unsafe or failed restore, outside prefix, or missing input returns REFUSED before app checks.

## How to get to it (user POV)

- Run `/skill:setup-app-verification` to write a Python project's named Restore and interpreter instructions. Use `/skill:maintain-app-verification` to keep them current.
- Run a vstack delivery flow through independent proof. Its `vstack-verifier` uses the project's Verify skill. Checkout preparation is also available through `ship/scripts/prepare-verifier.ts` and `vstack-worktree/scripts/worktree.ts` in the checkout under test.

## Driving it with the CLI and a native Verifier

Preconditions:

- Follow the baseline and Doctor steps in `README.md`. The CLI cases do not need a native model.
- For the native cases, use installed `omp`, a running ovnfs daemon, `uv`, and local Python 3.10 or later. The editable fixture has no network or new interpreter dependency. Use the actual Session model and real HOME only with approval for the native provider. Never reuse the current session or a provider transcript.
- Use new disposable fixtures and log paths. Only the `data/` subtree is disposable. Keep all observed commands, raw results, and saved baseline and after-state outside it.

Step `verifier-preparation-cli`: Run `bun test --timeout 30000 tests/verifier-prepare.test.ts tests/vstack-worktree.test.ts`. Require the preflight refusal for both Shared-checkout cases, both backends' distinct missing-input diagnostics at open and clean-head, and the removal-refusal regression to pass. These tests use real Git and substitute only the ovnfs and omp processes. They do not exercise model behavior or an actual Isolated clone.

Step `verifier-preparation-python-fixture`: In a fresh Verify run, create separate cases named `pinned`, `inherited-override`, `unsafe-restore`, `outside-prefix`, `broken-lock`, and `declared-environment`. For each case, run:

```sh
	R="$VERIFY_RUN_DIR/$CASE"
	bun "$SKILL_DIR/scripts/verifier-python.ts" seed "$R" "$CASE"
	F=$(jq -er .shared "$R/fixture.json")
	bun "$SKILL_DIR/scripts/clean-adr-isolation.ts" "$CHECKOUT" "$F" "$R/isolation"
```

The helper commits a base and head in the disposable Shared checkout. It restores a Shared `.venv` through the real locked `uv` command and hashes its file contents, modes, and symlink targets. It also builds and hashes a separate disposable environment for the unsafe Restore and outside-prefix cases. `fixture.json` identifies the Shared checkout, Verify skill, exact commits, and optional override. `expected.json` gives the caller-owned proof set.

Step `verifier-preparation-python-launch`: For each case, launch fresh native omp from `F` with the checkout plugin, the real Session model and thinking level, and the recipe in [Pin the parent and scouts to the checkout](./clean-adr.md#pin-the-parent-and-scouts-to-the-checkout). Set `PI_CONFIG_FILES` and `--config` to `"$R/isolation/isolate.json"`. Keep a persistent session in `"$R/session"`. Require isolated subagents to be enabled and audit the actual plugin and agent paths. If `jq -r '.override // empty' "$R/fixture.json"` returns a path, export it as `UV_PROJECT_ENVIRONMENT` in the launch environment. Otherwise unset `UV_PROJECT_ENVIRONMENT`. Require the Verifier to observe that value in its own process before judging override handling. Use no Flow or external writes.

For each case except `declared-environment`, read skill://vstack-fan-out and start the Verifier in the fresh parent:

Spawn one `vstack-verifier` via eval `agent(<prompt>, agent="vstack-verifier", isolated=True, apply=False, merge=False)`: the SHAs, Verify skill path, Shared checkout, required `editable-app` step from `fixture.json` and `expected.json`, the vstack root `F`, and the Scratch dir `R`. Name `"$R/checkout.json"` as the new checkout record and `R` for the preparation and restore logs. Wait for its result. If it cannot be spawned, stop: record why the native case could not run.

Do not tell it the expected Verdict or which preparation commands to run. Capture the actual completion and separate omp-added suffix. Save the unaltered JSON Verdict as `"$R/record.json"`. Preserve raw session tool results, including preparation and teardown.

- Step `verifier-preparation-python-pinned`: Require `clean-head`, Restore, prefix probe, and `editable-app` in that order. The evidence identifies the ovnfs head path, its restored prefix, and its imported module file and value. The Verifier returns a passing Verdict and removes its head checkout.
- Step `verifier-preparation-python-inherited-override`: Repeat the passing proof with the inherited value aimed at the Shared `.venv`. Retain the named Restore's own log of the inherited destination and the overridden destination. The actual interpreter prefix and editable import remain inside the head checkout. Require the Shared environment hashes unchanged.
- Step `verifier-preparation-python-unsafe-restore`: The outdated fixture Launch names an unpinned restore. Require REFUSED before that command starts, with the inherited destination in notes. No change to the outside environment is permitted. This proves prevention, not the prefix check.
- Step `verifier-preparation-python-outside-prefix`: Restore is safely pinned. Only the Verify skill's interpreter points at a disposable outside environment. Require the exact interpreter probe to report the outside prefix, REFUSED with that prefix and the restore warning in notes, and no app check. This proves detection without first allowing an unsafe write.
- Step `verifier-preparation-python-broken-lock`: Run the declared pinned restore against the broken committed lockfile. Require nonzero exit and REFUSED, with the command and error in notes. No app check runs and the Verifier removes the attempted head checkout.
- Step `verifier-preparation-python-declared-environment`: In the fresh parent, use a read-only isolated diagnostic without a result schema. The Verifier's own declaration rule stays in force. Read skill://vstack-fan-out before this step. If isolation is off, stop and point at `/skill:setup-vstack`.

Spawn one `vstack-explorer` via eval `await agent(<prompt>, {agent: "vstack-explorer", isolated:true, apply:false, merge:false})`: the read-only preflight below, the vstack root `F`, and the Scratch dir `R`. Wait for its result. If it cannot be spawned, stop: record why the declaration negative did not run.

From the real Isolated clone invoke `bun "$CHECKOUT/plugin/skills/ship/scripts/prepare-verifier.ts" preflight --repo <clone toplevel> --shared "$F" --base <base> --head <head> --record "$R/checkout.json" --inputs "$R/inputs.json"`. The caller-supplied declaration contains `.venv`. Save the actual command result as `record.json`; require exit 2 and REFUSED because the Isolated clone did not carry the Shared `.venv`. Require no head checkout open attempt. Keep the authoritative isolation notice and actual checkout paths.

Step `verifier-preparation-python-audit`: Before releasing each isolated child, validate the actual isolation and proof from the native run. Then run `bun "$SKILL_DIR/scripts/verifier-python.ts" audit "$R"` in each case. It compares the Python environment manifests, checks the recorded Verdict and head cleanup, and requires the app marker only for passing cases. The session trace must independently prove preparation order and whether Restore and the app command were invoked. Keep its logs and the before and after manifests.

Step `verifier-preparation-parent-vs-head`: Retain the CLI red and green logs for the changed missing-input decisions. Native coverage requires separate actual tool traces. Do not run the unpinned restore in the parent revision if its old agent would allow the write. An unavailable or unsafe parent drive is not a behavioral red.

Step `verifier-preparation-cleanup`: Reconcile each isolated child through the worker lifecycle. Preserve the evidence before releasing any child. Remove only this run's disposable fixture data after checking teardown. A failed cleanup keeps the actual Verdict but leaves proof unavailable. A retained checkout or clone stays named with its record and reason.

## Gotchas

- A passing stub reply or a valid machine record does not show that the Verifier followed the instructions. Require the actual native tools, ordering, and hashes. The fixture setup and CLI tests alone cannot prove the Verifier's behavior.
- The interpreter binary can resolve outside the head because it symlinks to a base Python. The relevant location is the canonical `sys.prefix` that this invocation reports.
- The unsafe Restore must not be run as an experiment. The separately pinned outside-prefix case tests the post-restore check without risking external writes.
- Do not shorten or remove the negative proof on a model refusal unrelated to the expected condition. Retain the result and report the unavailable coverage.
