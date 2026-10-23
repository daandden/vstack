# The Addon judge runs through omp's judge role

The extension picks Addons through omp's judge chain, `resolveJudge` from `@oh-my-pi/pi-coding-agent/judgment`, and no longer sends its own `POST /v1/systemone` to `typesafe/jev-latest`. The Addon judge is whatever native judge model the omp `judge` role names: TypeSafe, OpenRouter Decisions, Workers AI, or OpenAI Decisions. Before, the extension checked `hasNativeJudge` and then ignored the role. A role that pinned a jev version or routed jev through OpenRouter passed that check and still got `jev-latest` or no picks. The user keeps `typesafe/jev-latest` as the judge role, and vstack does not force that choice. The selection still runs only when the role's first candidate is native, because a chat model answers only 0 or 1 and the 0.70 threshold means nothing for it.

## Considered Options

- Accept only jev models on any route. This keeps the judge on the model that vstack calibrated, but vstack then needs its own rule for which model ids count as jev. The user chose to let the judge role decide.
- Accept only TypeSafe's own API. This is closest to the old code, but jev through OpenRouter still gets no picks and no warning.
- Keep vstack's own retry around omp's call. omp's native client already retries 408, 429, and 5xx responses up to 3 times, so one pick could send up to 6 requests.
- Drop vstack's deadlines and rely on omp's timeouts. A stalled judge would then hold the prompt until omp's 30-second hook cap, and the 25-second cap of [ADR 0026](0026-every-matt-run-start-sends-a-smol-restatement-to-jev.md) would no longer hold.
- Move the calibration scripts to the judge role too. Each maintainer would then measure a different model, and a plain Bun script cannot import omp's package.

## Consequences

- vstack keeps its 4-second deadline, and the 25-second cap on a restated run start, and races omp's call against them. omp's backoff sleep ignores the abort, so a late request can finish in the background after the hook has returned with no picks.
- Each pick passes `journalJudgmentUsage` and `sharedJudgmentCache()`. Addon judge cost shows in the session's cost ledger under the purpose `vstack-addons`, and an identical state is answered from the cache.
- The 0.70 threshold and both sample corpora stay jev measurements. `scripts/addon-judge-check.ts` keeps calling TypeSafe `jev-latest` directly, and `scripts/visual_judge_check.py` keeps refusing a model that is not `typesafe/jev`. This change re-records `sample-briefs.json` on jev-1.14.0, which `jev-latest` resolves to today, with no flags. On jev-1.14.0, `sample-prompts.json` has 5 flags, so it keeps its jev-1.13.0 baselines until the catalog is tuned in [#235](https://github.com/daandden/vstack/issues/235). Picks on another native judge are not calibrated.
- setup-vstack fails the judge role check only when no role is set, and it still offers `typesafe/jev-latest`. Another role passes with a note that vstack calibrates against jev. setup checks TypeSafe credentials only when the role uses the `typesafe` provider. setup cannot tell a native role from a chat role, so a chat role also passes with that note.
- This amends [ADR 0002](0002-principles-are-selected-per-prompt-by-jev.md), [ADR 0021](0021-a-mid-session-matt-run-start-sends-a-smol-restatement-to-jev.md), and [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) where they name the direct TypeSafe call.
