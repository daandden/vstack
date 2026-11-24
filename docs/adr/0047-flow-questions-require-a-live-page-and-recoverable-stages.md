# Flow questions require a live page and recoverable Stages

The user chose this recovery contract in the `flow-ask-session-bug-e326f1` interview. It amends [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md)'s page fallback and Stage lifecycle behavior. These are accepted design decisions, not a claim that the implementation is complete.

Flow publication and asking are separate operations. Remove the `flow_ask` tool without a replacement wrapper or compatibility alias. Publish the complete question round through the Flow CLI, verify current live serving, display the page URL in chat, then call the existing `ask` tool with the receipt's generated question identities and labels. Record the observed response separately. Keep full Flow question and answer history. The chat link is sufficient; remove page-publication `notify` calls and report failures through ordinary tool outcomes and chat. Native TUI verification must establish that the visible URL precedes asking.

The existing `ask` integration owns its normal retry and cancellation behavior. A repeated publication receipt must not suppress a separate ask call. Retry an unrecorded failed delivery using the already published question; if a non-consent answer has already been recorded, use the existing linked re-ask contract to preserve that attempt. Never reinterpret cancellation, timeout or missing output as approval, or ask already settled questions as if they were unanswered. Do not introduce a vstack delivery queue or another custom picker route to replace the removed tool.

Questions require a working live URL and current presentation. A current static page remains readable evidence but is not sufficient to open the picker. When live serving, publication, or picker delivery fails, preserve the actual receipt and error without inventing an answer or approval. A recoverable blocker leaves the owning Stage in progress for continuation. Finish it when the skill's work completes or is deliberately abandoned, not merely because a tool is unavailable. A finished Stage remains immutable.

The installed runtime owns the normal per-user Local Flow host. Normal commands from worktrees resolve host operation to that runtime rather than competing with checkout-specific host code. Development host code uses an explicitly isolated home namespace and a separate port. An installed-runtime update can replace its authenticated older host under the host lock. It must not stop an unrelated listener or another namespace's host. Retain compatibility checks rather than allowing arbitrary source versions to render shared data.

## Why

An actual CLI replay showed an older host rejecting the current caller, then the current host rejecting the older caller after replacement. Both ran Bun 1.3.14. The host fingerprint includes Flow script and template bytes, while one home namespace has one host record and port. Distinct source versions therefore compete even without a Bun version change. Manual restart restores one version but does not resolve competing ownership.

The previous blocked-return rule finished the Stage while its work was still incomplete. The CLI then correctly refused to bind that finished Stage, forcing a continuation Stage for a temporary failure. Keeping recoverable work in progress preserves its identity without reopening finished history.

## Alternatives rejected

- Keep static fallback for questions. The user requires a live page before the picker opens.
- Finish every blocked Stage and create a continuation on retry. Temporary failures should not split unfinished work across Stages.
- Let every checkout automatically replace the shared host. Replacing one version can make the other version incompatible.
- Automatically run a host per source fingerprint. This adds host lifecycle and URL-routing complexity to normal use. Development already has an explicit isolated namespace.

The earlier Eval errors, `Unknown tool from js runtime: flow_ask`, remain a separate dispatch observation. Later direct tool calls succeeded. This decision does not assert an unproven registration cause or authorize an unrelated Eval redesign.

## Selective removal of the coupled tool

The user confirmed keeping full Flow history and requested a revert of the introducing change where possible, while retaining independent fixes. Use the mainline introduction, `18b2cf1e64bbac9d83404d3d4ace6f5bbf24d1dc` from PR #337, as the removal reference. It changes 57 files. Its first parent is `f3ff8a21ad57d99bc4915cce9a6f857e309cc944`; do not rewind to the original feature branch's older base.

Remove the wrapper, its registration, custom-route detection, wrapper-only response mapping, caller requirements, and lint allowance. Replace wrapper-specific proof with ordinary `ask` proof. Keep the Flow publisher, generated receipt questions, and full question and answer records. Stock omp `ask` replaces the omp-tools override. [ADR 0056](0056-flow-questions-show-their-link-in-a-flow-panel.md) records how the Flow panel follows the native dialog.

Retain these independent capabilities from mixed hunks:

- Flow `multi` support in question parsing, storage, generated receipts and snapshots, with direct coverage independent of the wrapper.
- Headless recommendations and silence are not approval. Cancellation, timeout and unavailable questioning do not authorize gates, approve missing test seams, or release held patches.
- Migration choices include only optional items. Mandatory items remain in the apply set, and changed plans require renewed approval.
- Preserve actual words, notes, images and timeout evidence. Do not reconstruct missing partial answers or invent a note target from merged text.
- Preserve atomic publication, stale-page recovery without duplicate authoring, coordinator-owned questions, and reuse of the caller's seam question.

Session-specific presentation and binding, context isolation, intent-based enrollment, and Scratch identity fixes predate #337 and must remain. Preserve the later standalone research Flow-closing change as well. Do not downgrade release metadata or erase historical release notes to remove the feature. No separate unrelated runtime repair was found in #337's reconciliation.

This selective removal does not implement the separately accepted host-ownership change. The introducing commit did not change host compatibility code, so its reversal cannot fix that incident. Retain the live-page prerequisite and report host failures without asking. The prior coupled-delivery specification was stopped before publication and is not the implementation contract.

## Question-only link presentation

In the `flow-link-before-questions-d9d032` interview on 2026-11-03, the user chose one clickable Flow link before each vstack question round, not only during grilling. This supersedes ADR 0044's every-turn presentation and the earlier requirement above to retain session-specific presentation. This accepted amendment changes presentation only; the other recovery decisions retain their own implementation status.

For a question round on a Flow, publish the complete round, verify its current live content, show exactly one clickable live URL in assistant chat, then call the ordinary `ask` tool. One call containing several questions gets one link. A later round gets its own link. Keep the existing native Ratchet approval exception and its visible pre-gate link requirement.

Remove automatic post-reply Flow messages and the separate `/vstack-clean` result link. Result-only replies and completion summaries show no Flow link or path reminder. Do not open a browser automatically. The user chose access at the question handoff over repeated reminders or links on result-only outcomes.

Keep session and agent authoring identity, binding isolation, full Flow history, enrollment rules, and ordinary asking and answer recording. This change neither enrolls unbound questions in a Flow nor introduces a custom picker, delivery queue, or retry gate.

[ADR 0054](0054-flow-questions-show-their-link-in-a-flow-popup.md) replaces the chat link before questions with a Flow popup and lets questions open when the Local Flow host is down.

[ADR 0062](0062-the-agent-picks-test-seams-and-asks-only-for-costly-ones.md) lets the agent pick test seams itself. The rule above that silence and headless picks do not approve a missing test seam now applies only to a Costly seam.

[ADR 20261111-the-installed-flow-host-replaces-itself-on-update](20261111-the-installed-flow-host-replaces-itself-on-update.md) builds the host ownership above: the installed host replaces itself on update, and every CLI copy writes through the installed code.

[ADR 20261116-scratch-cleanup-moves-to-a-tern-popup](20261116-scratch-cleanup-moves-to-a-tern-popup.md) removes the cleanup Result itself: `/vstack-clean` now writes nothing to a Flow.

[ADR 20261123-flow-records-native-ask-values](20261123-flow-records-native-ask-values.md) allows equal submitted values to count as the same answer when native `ask` does not report input origin. The separate publication, raw-answer, and non-consent rules still apply.
