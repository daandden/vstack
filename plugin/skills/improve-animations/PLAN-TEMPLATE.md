# Selected motion requirements

Use these fields in the current owner's existing spec, ticket, or implementation hand-off after explicit selection. This reference is not a repository plan file, status ledger, or executor protocol. One selected finding is one bounded requirement unless multiple findings share the same remedy and scope.

## Identity and evidence

Record the selected finding id, title, priority, category, source revision, and actual selection record. Include the precise file and line, current code excerpt, observed behavior, user impact, and browser evidence. Keep uncertainty explicit. A self-contained requirement must remain understandable without the audit conversation.

## Target and conventions

Describe the exact end state and observable behavior. For retained or proposed motion, specify properties, duration, curve, reduced-motion behavior, and cancellation policy. Pull applicable values from [AUDIT.md](AUDIT.md) rather than approximate them from memory. For subtraction, specify the static end state and immediate lifecycle instead of inventing replacement motion.

Name a current repo exemplar for tokens, component structure, state, and file placement. Validate library-dependent recipes against actual installed versions before including executable API advice.

## Authorized scope

List concrete ordered edits, affected files, permitted obsolete-code cleanup, and exclusions. Keep useful unselected motion untouched. Retuning retained motion and adding opportunities are separate selections. Dependency removal requires its own explicit approval through the owner even when the library becomes unused.

Record the expected source revision or relevant code preconditions. If they drift enough to invalidate the target, return to the owner with the difference before expanding scope.

## Completion checks

Reuse the agreed public seams and existing Verify recipe. Name applicable mechanical commands and expected outcomes. Give concrete browser actions and observable states for the ordinary path, keyboard, reduced motion, interruption, and slow playback where it helps assess feel.

For removal, account for hidden initial styles, entry and exit callbacks, delayed unmount, cancellation, exactly-once effects, focus entry and restoration, and selectors that waited for deleted animation. Check these where affected, not as a demand to redesign unrelated components.

Retain browser identity, ARIA, full-resolution screenshots, observations, limits, and the evidence-backed motion review under the owner's Scratch. Every browser open uses `app: { tern: false }` and records its returned backend and engine. The existing review owner applies skill://review-animations and retains blocking authority. The implementation owner retains normal delivery and verification gates.
