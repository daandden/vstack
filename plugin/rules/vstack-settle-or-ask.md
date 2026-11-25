---
alwaysApply: true
---

# Settle-or-ask test

Apply this test before offering any vstack question, in a Flow or in chat. Find facts in files and tools yourself. Check relevant decisions and conventions. Try a cheap experiment if it could settle the choice.

Settle the decision yourself when all three conditions in ADR 0037 hold:

- A later edit can undo it without a migration or a change to published text.
- The choice is not a matter of the user's taste.
- A repo fact, ADR, convention, or cheap experiment decides it. Cite the basis.

Settle the Bookkeeping list without asking or needing a cited repo fact (ADR 0069):

- Behavior-preserving refactors and cleanup. This includes removing proven dead code, merging duplicates, and keeping look-alikes separate. Preserve behavior, public contracts, scope, and proof.
- Recording a decision the user already made as an ADR, including its placement and supersession links. Recording settles no new fallback, guarantee, or policy.
- Carrying settled terms into the glossary and reusing existing definitions. A new product concept or preferred public name is not bookkeeping.

Internal names, file locations, and investigation order are not on the Bookkeeping list.

## Reasons to ask

Use a reason only when it applies. A reason permits a question. It does not require one or add a consent check. Existing rules still decide which actions need consent. Preserve the checks for posting on a PR or issue the user does not own, publishing Private-mode artifacts, deleting unrecoverable work, and reversing an earlier out-of-scope decision. Keep required architecture agreement even when only one shape is viable. A pending, timed-out, cancelled, empty, or headless response grants no consent.

- `taste`: The user's taste decides the name, wording, or look.
- `irreversible`: A later edit cannot undo the action.
- `undecided-by-evidence`: No fact, ADR, convention, or cheap experiment decides it.
- `spending`: It spends money or quota, or uses a Costly seam.
- `not-user-owned`: It posts on or changes something the user does not own.
- `waiver-or-reversal`: It waives proof or acceptance, or reverses an earlier out-of-scope decision.
- `user-only-fact`: Only the user has the access, observation, or intent. For an unknown defect cause, name the fact the user can supply and the investigation that left it missing.
- `explicit-decision-required`: The user names an Assumed pick to reopen or asks to decide, or a decision record requires explicit agreement.

For a new or re-asked Flow question, state the reason in `brief.ask_reason` and the actual evidence checked in `brief.evidence_checked`. Name what you checked and what it established or left open. The CLI checks the fields, not your judgment.

## Decisions the agent settles

- Decide behavior-preserving review refactors and cleanup case by case. Record each decision and reason on the review Result.
- Fix a reproducible found defect that blocks proof or the End state when the repair is in scope. Put the repair in a separate commit on the run's branch, in the same PR if the authorized End state opens one. Use a failing test first when there is a cheap test. File a nonblocking defect on the project's own tracker. Use `ask` before changing product behavior, changing a spec, or reversing an earlier out-of-scope decision. If the cause remains unknown after investigation, use `ask` only for a specific fact the user can supply or a decision they own. Otherwise report the blocker and its evidence without a question.
- Release the run's own settled worker clones only through the supported route after its lifecycle checks pass. Keep any clone the route cannot release. Close tickets whose acceptance criteria are met. Report the releases, retained clones, and closures.
- Apply an exact correction and show the result without a second approval. If the correction leaves a choice open, apply this test to that choice.
- Reuse approval for retries of the same Costly seam use within the approved allowance. Ask before exceeding the allowance.
- Record setup values that discovery determines without conflict. Keep the mode, default End state, and landing history questions. Apply this test to conflicts such as mismatched labels or more than one possible tracker remote.

## Record and reopen picks

Record each decision you settle with its pick and reason. Give the cited basis or name its Bookkeeping kind and explain why it fits. In a Flow, publish an `assumed` item in the owning Stage, before the round if it helps the reader answer. In chat, list the Assumed picks with their reasons. Assumed picks are not user answers.

When a note, Other text, or pushback names an Assumed pick, reopen only that pick as a normal question. Use `reopens` with its Assumed id in the next Flow round. Preserve the original record and link. The named pick leaves the current Assumed list. Unrelated picks and earlier answers stay as recorded.
