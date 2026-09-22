# Issue #13 verification

Verified on 2026-09-22 with Bun 1.3.14 and OMP 18.2.8.

## Installation surface

Installed the generated root through the public CLI into a disposable workspace's `.omp/config.yml`, then launched OMP without `--config`, a launch wrapper, or a skill filter. `omp config get skills.customDirectories --json` reported the absolute generated/current/skills pointer. A real RPC startup and `get_available_commands` returned `skill:wizard`. No `skill:poteto-mode`, `skill:shipping`, `skill:multi-phase-plan`, or `skill:bro` route was present. Existing unrelated user skills remained outside vstack ownership.

A separate noninteractive real OMP session used the existing available `openai-codex/gpt-6-astra` selector to exercise the skill. This was a smoke-test model selection, not a vstack model-role configuration or entitlement claim for #14. Extensions, rules, and LSP were disabled for the disposable scenario. Skill loading and the project configuration remained ordinary OMP discovery.

## Observed invocation

The request supplied an already-confirmed, one-stage procedure: capture a dummy public value from a paper note into the workspace `.env`. It prohibited browser access, network actions, secrets, Git operations, publication, and executing the interactive script during authoring.

The OMP event stream recorded:

1. Native `read` of `skill://wizard` from the generated stack.
2. Native `read` of `skill://wizard/template.sh`.
3. Copying the resolved template into `setup-demo.sh`.
4. Replacing its example stage with `Local manual value`, capturing `DEMO_VALUE` and writing only the disposable `.env`.
5. Successful `bash -n` and executable permissions.
6. A handoff telling the human how to run it. OMP exited successfully without executing the wizard or making Git/remote changes.

The parent then compared the emitted library with the generated template and executed the script twice with controlled stdin. First input was `paper-demo-13`; second input was an empty line. Both runs exited zero, displayed `Stage 1/1` and `Setup complete`, and left exactly `DEMO_VALUE=paper-demo-13` in `.env`. This exercised the supporting resource's actual value capture, persistence, and rerun behavior, not merely prompt text. No real credentials, external service, browser, or publication action was exercised.

## Regression and reproducibility

The maintained regression covers a plausible destructive failure: a broken patch during regeneration. It builds and installs through the public CLI, regenerates successfully, breaks the patch in an isolated copy, and observes failure without changing the installed template, workspace config, or local-only skill. A subsequent real OMP RPC launch still discovers wizard and that local-only skill. Typechecking and the targeted test passed during development.

A second build in a clean temporary checkout fetched both approved upstreams over the network, without the existing Git cache or mirrors. Its generated release digest matched the cached build exactly. Independent inventory validation accounted for all 96 allowlisted entries and three explicitly excluded automation entries; the playbooks split into 12 drops, 9 folds, and 2 standalone families.

The initial red run failed because the build CLI did not exist. After implementation the scenario passed. Final typechecking passed; the complete vstack suite passed with **1 test, 13 assertions, 0 failures**. An initial unscoped run also picked up 52 vendored unit tests (all passed); `bunfig.toml` now limits discovery to the owned `tests/` directory. Independent Standards and Spec reviews reported no findings against the implementation staged from `a614451dfa8ae63a832514d505f142c7c78e3fd0`.

The unscoped upstream test run created a `node_modules` directory inside the pstack mirror. The next build rejected that non-pristine input. Comparison against the approved Git archive found no changed pinned files and only those generated dependencies; removing that throwaway directory restored the original release digest. The scoped suite and subsequent build/typecheck passed.

## Limits

The manual procedure's scope was supplied as already confirmed; interactive native `ask` presentation was not exercised. The actual Bash prompt and repeat-run default were exercised with controlled stdin. Network-service setup, hidden real-secret entry, shellcheck (not installed), and external publication were not tested. These are not requirements to contact real services for this installation slice.

No claim is made about the pending workflow families, safe-upstream-sync transition policy (#15), model roles/agents (#14), entitlement of other models, cloud lifecycle, watchers, or panel isolation. Upstream workflows outside the installed wizard are not exposed to OMP. The OMP standalone `read` CLI resolved a global skill instead of the project custom root during an exploratory probe; acceptance therefore used full OMP session discovery and actual tool results, not that shortcut.

Temporary scripts, dummy `.env`, and raw model events are not committed. This record retains only sanitized observations.
