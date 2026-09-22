# Domain Docs

This repo uses a single-context layout: `CONTEXT.md` at the repo root and ADRs under `docs/adr/`.

## Before exploring, read these

- Read `CONTEXT.md` for domain terminology.
- Read ADRs in `docs/adr/` that touch the area you are about to work in.

If these files do not exist, proceed silently. Do not flag their absence or suggest creating them upfront. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue, refactor proposal, hypothesis, or test, use the term defined in `CONTEXT.md`. Do not drift to synonyms the glossary explicitly avoids.

If a concept is missing, reconsider whether it belongs to the project or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface the conflict explicitly rather than silently overriding the decision. Identify the ADR and explain why it is worth reopening.
