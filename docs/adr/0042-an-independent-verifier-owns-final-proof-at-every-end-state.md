# An independent Verifier owns final proof at every End state

Every End state requires an independent Verifier's accepted Verdict on the committed work. The author keeps development tests, targeted smoke checks, and Verify skill setup or repair, without a mandatory full live-proof pass. The Verifier runs after commit, and the chain reuses its accepted Verdict for an unchanged patch or verifies a changed patch before declaring merge-ready or shipped. Running full live proof as both the author and an independent Verifier duplicates work. We accept that full proof arrives after review and commit so that an unchanged patch needs only one full run. Review still uses development checks and targeted Blast radius proof. A commit or green PR alone does not mean that the requested End state was reached.

## Consequences

- PASS and PASS+NOTES can pass after the caller reads the notes and resolves any open questions. FAIL, DRIFT, and unavailable proof do not pass.
- On FAIL, the author fixes the problem in a new commit. On DRIFT, the author repairs the Verify skill. Each pass of END-STATE step 6b allows one repair-and-retry cycle with a fresh independent Verifier. A pass that step 7 starts after babysit changes the patch can repair once more. If the second Verdict of a pass does not pass, the run stops and reports that it did not reach its End state.
- The shared End state block owns verification for implement, implement-spec, hillclimb, and tune-llm-flow. ship reuses an accepted Verdict only when its patch still matches. A stack retains separate Verdicts for its PRs.
- Verification follows [ADR 0007](0007-isolated-subagents-write-artifacts-through-the-vstack-root.md). The caller validates the full base and head SHAs, patch id, evidence, Verifier identity, and omp's isolation notice. The Verifier never runs in the author's checkout.
- Every End state retains the Verdict and evidence in its run record and on its flow page. Merge-ready posts a PR comment when the Code host supports it and reports a missing comment without blocking readiness. Shipped keeps its existing requirement to post the Verdict.
- End state selection and the rule against rewriting pushed commits stay unchanged under [ADR 0038](0038-a-project-default-end-state-replaces-the-per-run-question.md) and [ADR 0033](0033-chain-conflicts-resolve-by-merge-and-pushed-commits-stay.md).
