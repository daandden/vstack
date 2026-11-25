# Every vstack question passes the Settle-or-ask test

The user chose this in the `reduce-vstack-ask-friction-605361` interview on 2026-11-25, in Grill with docs Q1 to Q7. It refines [ADR 0037](0037-the-grill-settles-reversible-decisions-in-the-open.md) and [ADR 0069](0069-the-grill-owns-a-fixed-bookkeeping-list.md), and amends [ADR 0068](0068-flow-tracker-and-config-writes-publish-without-approval.md). These are accepted design decisions, not a claim that the implementation is complete.

Only grilling applied ADR 0037's test. code-review, implement's close-out, setup-vstack, and to-spec each carried their own instruction to ask. An audit of 164 extracted `ask` call records from 42 vstack session files, dated 2026-11-19 to 2026-11-25, found that about 55 of roughly 280 questions were ones the agent could have settled: the answer was in the repo or a cheap experiment, an ADR or skill rule had already decided it, or the question confirmed something with no realistic alternative. The audit is a sample with estimated deduplication, not a census of every question. About 20 of the avoidable questions had no rule behind them. The Settle-or-ask test is now one shared rule that every asking skill cites in place of its own instruction. ADR 0037's three conditions and the Bookkeeping list stay the test. A question needs a reason to ask: taste (names, wording, looks); a later edit cannot undo it; no fact, ADR, convention, or cheap experiment decides it; it spends money, quota, or a Costly seam; it changes something the user does not own; it waives proof or acceptance or reverses an out-of-scope decision; only the user has the fact; or the user or a decision record requires the question. A reason permits a question and never requires one, so existing rules still decide when consent is needed. In a Flow, `validate` and `submit` refuse a new question that does not state its reason and what the agent checked first. Everything else the agent settles as an Assumed pick, which the user can still reopen.

The user picked the shared rule with its check, the five kinds below, and the name. The exact list of reasons, the rule's home, the Costly seam approval boundary, and the exemption for stored questions are the agent's Assumed picks from that interview.

The agent now settles these kinds, which skills asked about before:

- code-review decides behavior-preserving refactor and cleanup findings and shows each decision with its reason on the review Result.
- A run fixes a defect it did not cause when the defect reproduces on the baseline, blocks proof or the End state, and has an in-scope repair. The repair is a separate commit on the run's branch. It goes in the run's PR only when the authorized End state opens one. The run files a nonblocking defect on the project's own tracker. It still asks when the fix would change product behavior, change a spec, or reverse an earlier out-of-scope decision. If the cause remains unknown after investigation, it asks only for a specific user-only fact or a decision the user owns. Otherwise it reports the blocker with its evidence.
- A run releases its own settled worker clones through the supported route and closes tickets whose criteria are met. When supported release fails, it keeps the clone and reports it.
- An exact correction from the user is applied and shown without a second approval. An approval for a Costly seam covers retries of the same use within the approved allowance.
- setup-vstack records a value that discovery determined without conflict and asks only on a conflict.

## Considered Options

- **The same shared rule in prose only.** No contract change, but grilling's existing line that facts are the agent's job was skipped about seven times in the audited week. ADR 0042 and ADR 20261123-flow-questions-require-a-decision-brief recorded the same failure: only a refusal held.
- **Patch each skill's own instruction.** The smallest change, but it leaves four local exception lists and does nothing for the questions no rule caused.
- **Fix a found defect in its own PR, as pstack's Autonomous run playbook does.** Each PR stays on one subject, but the run waits for a second review and CI cycle. Asked about six such defects, the user chose the run's PR five times.

## Consequences

- The agent sometimes decides the other way from the user. In the audit the user went against the recommendation on 2 of about 18 refactor findings. The cost is one reopened decision and a small commit.
- A run's PR can carry a fix its spec did not ask for, with no size limit.
- A released clone cannot be restored. Only its landed patch and the evidence saved outside it remain.
- Questions asked outside a Flow follow the rule but get no check.
- Questions stored earlier stay readable without the new fields.
- grill-with-docs still asks its architecture question when only one shape is viable (ADR 20261123-every-grill-sketches-two-shapes-and-contested-designs-run-compare-attempts).
