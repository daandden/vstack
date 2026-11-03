---
status: accepted
---

# ADR 0049: Flow reader uses Nuxt with Vite+ on Bun

This design is implemented by #314. It amends the rendering and static-fallback promises in [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md). The Bun host serves the prebuilt Nuxt reader, and a running host is required. The #316 candidate proof exercises a fresh isolated linked-plugin session, actual CLI and native omp presentation, installed assets, a running host's bundle incompatibility, authenticated restart, and committed-content recovery in an already-open Chromium reader. This is not independent verification of the final integrated commit or closure of spec #309.

Use Nuxt for the Flow frontend and the Vite+ product for supported development tooling. Keep Bun as the production runtime for the Local Flow host. The goal is a reader-facing redesign that makes decisions and evidence clearer, not a framework rewrite presented as a user-experience improvement by itself.

The reader may require the running Local Flow host. Directly opening a saved Flow folder without a server is no longer a required fallback. A host failure must be reported as unavailable rather than presented as a working static reader. This removes the requirement that one renderer produce both the live application and a server-free export; it does not remove persisted Flow content or captured evidence.

## Boundaries and alternatives

Retaining the bespoke renderer and its static fallback would preserve today's delivery model, but the user chose a Nuxt redesign and accepted a host-required reader. A client-only shell must not be advertised as preserving the old readable static export. Production Bun is a requirement, not a requirement that every development tool execute under Bun.

Nuxt retains its framework configuration and commands. Vite+ provides the supported package-script workflow and suitable development tools; it does not replace Nuxt's builder. The [Vite+ command guidance](https://viteplus.dev/guide/troubleshooting#vp-dev-or-vp-build-does-not-run-my-script) distinguishes built-in Vite commands from `vp run` package scripts. #314 generates the client reader ahead of time and ships its files under `plugin/skills/flow-page/reader/`. The Bun host serves that bundle and the Flow's structured content.

Typed Stage-bound authoring, Flow identity, authorization, and captured evidence keep their existing ownership. The reader does not become a workflow executor. Executable artifacts retain their separate-origin isolation.

## Design approval and verification

The user approved prototype revision `reader-review-r3`, variant A, in Flow question 18. They required a compact layout based on the current Flow page, Catppuccin Mocha dark mode, and Catppuccin Latte light mode. The prototype exercises the reading model in [ADR 0048](0048-flow-content-keeps-first-publication-order.md) and retains the reader's position during fixture updates. #313 and #314 implement the approved direction. Prototype evidence is not proof of the final integrated product.

The approved authoring regression evaluation assesses structural questions at their first publication, requires useful question-local visuals for those cases, and retains legitimate prose controls. Adding a diagram later does not repair the original score. This is not a universal runtime semantic-review gate. #311 and #315 retain their recorded evidence and limits. #316 completed two fresh paired batches, each with one with-skill and one no-skill trial for each of four subjects. The final-input batch used the recorded `openai-codex/gpt-6.1-sol` Session model at high thinking, isolated homes, frozen bindings, and actual CLI/reader captures, with no main-model fallback or provider failure. In separate reviews of the earlier and final-input examples, the user judged only the with-skill explanation adequate for all four subjects. The original mobile failure remains recorded; the user accepted the repaired mobile comparison in both themes and reclassified the current over-wide control as wide-but-legible rather than a font-readability negative. `judging.json` records those distinct judgments. Earlier interrupted, rate-limited, or fallback attempts remain unavailable, not accepted trials.
