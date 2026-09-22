# Issue #15 verification

Verified on 2026-09-22 with Bun 1.3.14 and real OMP. All upstream transitions described here used disposable local Git repositories. Production source pins were not advanced and nothing was published.

## Public transition boundary

`tests/sync.test.ts` exercises the public build/install/sync CLI and launches real OMP RPC discovery in disposable workspaces. It covers:

- Numeric highest-stable tag selection, prerelease exclusion, stable build metadata, and equal-precedence/prefix ambiguity.
- Changed accepted tag commits and rewritten tag objects, including an annotated tag rewritten at the same commit.
- Automatic eligibility for narrowly verified UI metadata; mixed metadata/resource changes remain pending as an entire transition.
- Exact-candidate approval, changed generated resources after approval, fresh preparation and renewed approval.
- Independently nominated and approved Pstack advancement while Matt remains pending, with stale Matt activation rejected.
- Clean patch application requiring semantic review; conflicts and invalid candidate discovery metadata preserving the accepted stack.
- Unbuilt local selection changes rejected rather than smuggled into an automatic upstream transition.
- An unavailable OMP executable at activation rejecting the otherwise approved candidate without advancing its pin.
- Isolated rebasing of a conflicting source patch, followed by reviewed activation and successful regeneration without changing the old active stack during preparation.
- YAML aliases into unknown instruction sections remaining approval-gated rather than bypassing classification through shared object mutation.

Observations include the consumed release's provenance, the accepted lock, supporting resource contents, dated sync records, continued real OMP discovery, preserved local-only skills, and absence of the dropped dispatcher. Tests do not assert prompt wording or private helper calls.

The initial red test failed because `sync prepare` was not implemented. Additional red-to-green cases exposed unbuilt local selections entering an automatic candidate, missing stable SemVer build-metadata support, and rewritten tag objects being treated as no transition. Typechecking and individual test files were run throughout development. Existing build/install regression and the real pinned build also passed after the generator changes.

## Live model-driven consumed-stack smoke

A separate throwaway scenario copied the implementation at the start of the run (generator digest `f5977a450b40aa388de4416d9d84a5526a4950ab4c2c7c9d2eeb752a50c93e51`). It created two local upstreams, built the stack, and installed its durable `generated/current/skills` pointer into a disposable workspace. A fixture skill explicitly allowed reading its sibling resource and prohibited edits, network tools, and Git operations.

The public commands prepared a behavioral Matt transition, showed its exact fingerprint, rejected activation without approval, accepted a reviewed decision, and activated it. Before approval, provenance was unchanged. After activation, the generated provenance lock matched `config/sources.lock.json`; Matt advanced while Pstack's source entry remained identical.

| Evidence | Pending candidate | After approved activation |
| --- | --- | --- |
| Matt tag | `v1.0.0` | `v1.1.0` |
| Matt SHA | `888ddea196946f96e13f0d5b54202d5a31aa7be8` | `ec94ec468c5a6eef1703fc8a0e80a49678b42b27` |
| Resource result | `OLD-af29af08-8573-424d-bbc3-28724aa06c56` | `NEW-af29af08-8573-424d-bbc3-28724aa06c56` |

Both ordinary installed-pointer sessions used:

```sh
omp --mode json --print --model openai-codex/gpt-6-astra \
  --no-extensions --no-lsp --no-rules --no-session --no-title --max-time 150 \
  '<read-only fixture request>'
```

The request was: “Read skill://matt and then skill://matt/resource.txt using the read tool. Output only the resource nonce. Do not edit any file, use network tools, or perform Git operations. This is a read-only local fixture smoke.”

Actual tool execution results, not model self-report, recorded reads of `skill://matt` and `skill://matt/resource.txt`. Both resolved under the installed workspace's `generated/current/skills/matt/`. The pending session read and returned the old nonce; the fresh post-activation session read and returned the new nonce. Each completed session had two successful tool executions calling only `read`, with no file edits, network tools, or Git calls. Both sessions exited zero.

Review evidence covered the complete local upstream diff, which changed only the resource nonce, direct inspection of the candidate resource, and the old-version live session. The activated record retained both source pins, the exact candidate fingerprint, the approval reference, and the review rationale. A user note and a local-only skill remained byte-for-byte unchanged. The full fixture, raw model events, and throwaway scripts were removed after collecting sanitized observations.

## Final verification and review

Final `bun run typecheck` passed. The complete `bun test` suite ran once after implementation and review corrections: **12 tests passed, 0 failed, 142 assertions across 2 files**. Eleven tests cover sync; the existing installation regression remains intact. Final `bun run build` produced the unchanged accepted-source release `b5ad5e1ed2e1bf96fdd28ae1e0f8c3639f37ec84caf99efc441f596cbe53e978` without advancing production pins.

Independent Standards and Spec reviews ran in parallel against the starting commit `0cc69f0148b616cb908bfb96a758d0ae403aa47e`. Standards identified duplicated release-storage logic; it is now centralized in the integrity-checking `storeRelease` helper. Spec reproduced a YAML-alias classification bypass; non-mutating projection and a public CLI regression resolve it. Both follow-up reviews reported **zero remaining findings**.

The Spec reviewer also exercised a disposable rebase activation with a user-modified active release. Final publication failed with `Active release modified; preserve edits before activation`; the original lock and patch bytes were restored and the user edit was preserved. This was a throwaway runtime probe, not an added implementation-coupled test.

## Limits

- Live model invocation exercised the copied implementation snapshot above. Subsequent tag-identity and evidence-integrity hardening, isolated rebasing, and YAML-alias correction are covered by deterministic CLI regressions, not a repeated live model turn.
- The candidate resource was directly inspected before approval; no model session was pointed at the candidate-only directory before activation. Live model evidence covers the installed old and activated new stack.
- One initial pending-session attempt was cancelled by the surrounding execution timeout; a fresh run completed and supplied the reported evidence.
- Runtime activation structurally validates the candidate and repeats real OMP discovery. It does not infer semantic compatibility from discovery, prove the quality of approval prose, or automatically exercise arbitrary upstream behavior. Maintainers must supply meaningful review and behavior evidence for each gated transition.
- Production remote authentication/fetch failures, process termination during filesystem publication, other model entitlements, unrelated workflow families, watchers, and cloud or publication behavior were not exercised. No such capability is claimed.
