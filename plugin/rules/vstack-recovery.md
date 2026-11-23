---
description: Recover infrastructure failures owned by the current run with one retry, preserving consent and proof
alwaysApply: true
---

# Recover own-run failures

For an infrastructure failure, apply this rule before a skill's failure stop or skip clause. Repair only what this run owns, then retry the failed step once. Keep the failure, repair, consumed retry, and observed outcome in the run record so another worker or resumed step does not reset the allowance.

Recoverable cases include:

- Start the Local Flow host when none is running. Flow-page commands already start it on demand. Restart a host only when this run started it in its own isolated `--home` namespace.
- Republish and ask again a question the picker lost or never showed. In a Flow, resubmit the same contribution to recover its committed receipt. Then call `ask` once more with the receipt's `ask.html` unchanged. Preserve any recorded responses. A repeated receipt deduplicates publication, not asking.
- Rebuild a Verifier's clone inputs owned by this run and prepare a fresh isolated verification attempt. Keep the original refusal and evidence. Require the same SHAs, inputs, isolation checks, and proof.
- Read branch state again after a stale-state failure and retry under the existing branch and SHA guards. Re-reading never authorizes accepting an unexplained tip, changing the recorded branch, force-pushing, or bypassing a guard.

Stop the affected recovery before restarting shared services or changing global settings. Put the recovery question through `ask` under `skill://flow-page`'s "Every ask in a Flow" contract when enrolled, or ordinary `ask` outside a Flow. The normal Local Flow host serves every session of the operating-system user, even when this run started it. The ovnfs daemon and global omp settings are shared too. An unknown owner or namespace is not evidence of run ownership.

Stop for the maintainer if recovery would weaken proof or acceptance, or if the retry fails. Report the original failure, what you tried, the retry's outcome, and the evidence paths. A subagent returns the blocker and open questions to its coordinator for `ask`, rather than claiming a user answer. Recovery grants no new authorization for external actions.

While an answer is pending, wait. A recorded cancellation, timeout, or empty response is a response, not an infrastructure failure. Follow flow-page's existing re-ask rules for it. A headless recommendation is not an answer. None of these outcomes is consent, and an absent picker does not authorize dependent work.

Existing behavioral retry limits stay unchanged. A Verifier FAIL or DRIFT keeps its single repair-and-retry cycle, and babysit keeps its single classified CI rerun. This rule adds no behavioral retries.
