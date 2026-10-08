# Changelog

Versions of the vstack plugin (`plugin/package.json`). See the README for when to raise each part of the version.

## [Unreleased]

## [0.1.1] - 2026-10-08

- The vstack extension (`plugin/extensions/vstack.ts`, listed in the manifest's `omp` field) registers `vstack_rename_session(name)` in every session. It sets a user-sourced session name, so omp's auto title never replaces it (#69).

## [0.1.0] - 2026-10-08

- First linkable plugin: `omp plugin link <clone>/plugin` loads vstack with the 24 adopt items, grill-me, grill-with-docs, resolving-merge-conflicts, unslop, technical-writing, and 19 `principle-*` skills, copied byte for byte from their Pins without `agents/openai.yaml` (#64).
- `pins.yaml` holds the five Pins, and `decision-register.yaml` holds a row for each of the 111 Upstream items (#64).
- `check-register` checks the register against the plugin and the Upstreams locally and in GitHub Actions (#64).
