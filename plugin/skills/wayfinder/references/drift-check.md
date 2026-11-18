# Wayfinder drift check

Use this check only for a proposed issue-creation batch. Follow skill://to-spec/DRIFT-CHECK.md's "Collect the decisions", "Checker brief", and "Fix and show" for decision provenance, source coverage, corrections, and user conflicts. Apply its collection rules to the Flow evidence from [Read the Flow](#read-the-flow) in place of its `flow-page show` read. Add the map checks below instead of its implementation-ticket acceptance check. The owning Stage is charting for the initial proposal or the ticket Stage that surfaced a later batch.

## Prepare the proposal

Supply the checker with:

- The proposed map and chartable child tickets together for initial charting, or the proposed new tickets for a continuation. Include titles, bodies, types, intended parent membership, and blockers.
- The applicable user decisions, visible assumptions, and source requirements with their identities and provenance, collected as [Read the Flow](#read-the-flow) says. Preserve raw answers, separate readings, and unresolved status. A conversation can be the source, with no source issue.
- Destination, Notes, Decisions so far, Not yet specified, and Out of scope. For a continuation, read the current map and relevant existing ticket bodies, blockers, and resolutions. Include proposed map updates needed to evaluate the new batch, with the current state available for comparison.
- Supporting evidence for existing decisions and decision inputs, including source material and applicable domain records.

Use unambiguous draft identities for proposed issues and relationships. Keep them separate from real tracker identities. After a successful check, follow the existing create-then-wire steps and use only actual issue ids in published cross-references.

## Checker brief

Review only the supplied proposal and supporting evidence. Return findings and open questions to the parent. Make no tracker writes and never ask the user.

Return the shared coverage table with columns Decision, Covered in, and Found. Include one row per applicable user decision, visible assumption, or source requirement. Mark assumption rows "Assumed:" and keep unanswered requirements open. Covered in names a proposed map section or ticket, or an evidenced existing map location. An existing resolved decision, intentional fog, or an explicit scope boundary can account for a requirement without a new ticket.

Return a map-consistency findings table with columns Map section or ticket, Conflict or prerequisite, Evidence, and Required correction. Check:

- Alignment with Destination, Notes, and Out of scope.
- Contradictions with resolved decisions, and duplicate questions that silently reopen them.
- Whether a precise open question belongs in a decision ticket or remains insufficiently specified in-scope fog. An unknown answer is valid. Judge the precision of the question, not whether the answer is known.
- Every required decision input and its supplier. An existing input needs evidence. An input supplied by another ticket needs a declared direct or transitive blocking path from the consumer to that supplier. Parent membership and body links are not blocker edges.
- Cycles in declared blockers and cycles exposed by necessary decision prerequisites. Show the conflicting path. Do not propose a reverse edge that makes the map circular.

Use decision-ticket semantics. Do not demand implementation acceptance criteria, demoable build slices, complete future fog, or invented answers and capabilities to make the proposal pass. Preserve assumptions as assumptions, not consent.

## Fix, recheck, and record

Apply the shared "Fix and show" steps to coverage misses and contradictions. Fix every map-consistency finding too. For a real conflicting decision or another needed human choice, use `ask` on the owning Stage under skill://flow-page's "Every ask in a Flow" contract. Preserve the observed response separately from its reading. Cancellation, timeout, an empty response, or a headless recommendation settles no choice.

Record the checker identity from the `task` handle or completion, including its originating session when available. Tie the actual review to the exact proposal and tracker evidence it reviewed. Preserve its returned tables and open questions, not a reconstructed approval. For a correction or a relevant change after a usable review, send the revised proposal and the original findings to that same checker through its recorded `agent://` identity. Require its new reply. A saved transcript is evidence of a review, not proof that the checker can receive a follow-up. If the checker is no longer reachable, leave creation blocked rather than substituting another reviewer.

An unchanged clean review still covers its exact inputs. If no checker started or none returned usable findings or approval, record the failure and any retry already consumed. An eligible new attempt uses the [same single-subagent line and stop clause](../SKILL.md#before-creating-issues) in the current owning session. Continue only when the actual review covers the current proposal and resolves every finding.

Publish both tables on the owning Stage, retaining original findings, corrections, and the recheck outcome. A clean first review can state that no map-consistency findings were found. A clean check needs no blanket draft-approval question.

## Record a pending creation batch

If decision collection is blocked, the checker cannot start, returns no usable review, or leaves findings unresolved, keep the affected issues uncreated. Existing own-run infrastructure recovery applies. The check blocks issue creation, not the recording of Flow evidence.

When a conflict needs `ask`, publish the draft and findings as question context without marking the batch resumable. Save a `Pending creation` marker only when actually returning blocked, not while an `ask` is still pending.

Before returning blocked, save a Document Result titled `Wayfinder creation batch` with summary `Pending creation`. Follow `skill://flow-page/references/results.md` for Document Results. Include:

- The map's tracker id and named reference if it exists, or its draft id, title, and proposed Destination if it does not. For a ticket Stage, include the originating ticket's tracker id, named reference, and recorded resolution or scope ruling.
- The complete unpublished proposal, including the issue bodies, draft identities, parent membership, intended blocker edges, and planned changes to Not yet specified.
- Applicable decisions, visible assumptions, and unresolved questions, with their sources or Flow question ids. Preserve the distinction between a user's answer and a reading.
- The actual blocker, reviewer identity, reviewed inputs, and original review or observed checker failure. Link any review Results already on the Stage and retain the corrections and recheck outcome.

Keep the Stage in progress and require a `submit` receipt. To update an existing pending Document, submit a `revise` with `base` set to the saved pending Result's `changed` and `set.summary` set to `Pending creation`, followed by the full Document with `revises`, in one contribution. This preserves history and refuses a stale update. Never replace a competing publication marker or a completed outcome with `Pending creation`.

## Read the Flow

Every Wayfinder check reads the Flow this way, including initial charting and a continuation with no saved batch. Looking for a saved batch uses the same read. Run `show --flow <flow>` to locate Stages and pin the Flow id and authored revision. Then read the same Flow's [read-scoped `content` endpoint](../../flow-page/references/host-observations.md#present-the-page), resolved relative to `show`'s `live.url`. Require the same Flow id and authored revision in both reads. If the revisions differ, read both again.

`show` lists Assumed picks only by id, so take decision text from `content`. Collect the applicable close decisions, raw selections, and readings, plus each Assumed pick's current decision, pick, why, and provenance. Include earlier versions when a correction or reopening makes them relevant, and leave out Assumed picks that show `reopened_by`. Keep the conversation and source material as inputs beside the Flow evidence.

For a saved batch, find candidate Wayfinder Stages and their current Document Result ids and `changed` revisions in `show`. Read their titles, summaries, and Document contents from `content`, then match by Stage and Result id.

Treat an unavailable reader, failed read, or inconsistent evidence as a blocker. It does not prove that the Flow has no decisions or no saved batch. Follow the existing Local Flow host recovery rules. If decision collection stays blocked, keep the affected issues uncreated and [record the pending creation batch](#record-a-pending-creation-batch) with that blocker.

## Match a ticket batch

Find the Flow by `ticket:<original map id>` using skill://flow-page's discovery rules. Match the current `Wayfinder creation batch` Result on the recorded map id and originating ticket id. Require the recorded source ticket to match the Wayfinder Stage's ticket id. Honor any supplied Stage or ticket as an exact selector. For an explicit resumption, including a named closed ticket, match `Pending creation`, `Publishing <attempt id>`, and `Completed`. For ordinary map-only frontier selection, consider pending and publishing batches, but ignore past completed ones. If an explicit retry cannot identify its batch, report that instead of selecting a new ticket.

## Match a chart

Use the caller's Flow or Stage, or this session and agent's binding for the same chart. Look for the current `Wayfinder creation batch` Result in Wayfinder Stages without a ticket. Match the recorded draft identity, map name and Destination, or saved canonical map identity, to the requested chart. Honor a supplied Stage exactly. Include `Pending creation`, `Publishing <attempt id>`, and `Completed` in the match. Start a new chart only when the user requests new charting and discovery establishes that there is no matching saved chart. For an explicit retry with no identifiable batch, stop instead of interviewing again.

## Use the matching batch

- If there are multiple matches or the record is ambiguous, report the candidate names and Stage ids and stop.
- If the Result is `Completed`, report its saved outcome. Do not bind the finished Stage, claim or resolve the ticket again, or repeat an interview.
- If the Result is `Publishing <attempt id>`, treat the batch as held. Read the tracker to see what may already exist. Report what the read establishes and what remains unknown. Record new evidence on the same Stage if it is still in progress, without replacing the marker. Even an empty read does not release the marker or authorize replay.
- If the Result is `Pending creation`, bind its in-progress Stage and reload the current Result. If binding fails or the Result changed, check the latest state before acting. Stop if the batch is no longer identifiable. If the batch is still pending, read the tracker for possible prior creates. Stop on evidence of publication or ambiguity. For a ticket batch, refresh the map, closed source ticket and its recorded resolution or scope ruling, and relevant existing tickets and blockers. Resume with the saved proposal updated to the current evidence and settled choices. Do not claim, comment on, resolve, or reopen the source ticket again. For a chart, take the saved proposal to its pre-creation check without repeating the interviews.

## Verify immediately before the first create

1. After review and before any create, reload the current Result if the batch has one. Compare its id, summary, and `changed` to the pending revision used for the review. A completed match returns its saved outcome. Otherwise read current tracker evidence for the proposed issues, including possible existing maps when charting and closed children when continuing. If publication may have started or either read is ambiguous, record the evidence on the owning Stage if it is still in progress and stop without replaying.
2. Compare the current proposal, applicable decisions, map evidence, and blocker paths against the reviewed inputs. If a relevant input changed and publication has not started, review the changed proposal again. Repeat this verification after the review passes. Do not accept a changed pending revision as reviewed without tying it to the actual review.
3. For a pending Result, submit a version 1 contribution with `kind: "revise"`, `result` set to its id, `base` set to the Result's `changed` established for the reviewed inputs, and `set.summary` set to `Publishing <attempt id>`. Generate a unique attempt id, such as a UUID, so another writer's contribution cannot match yours and return its receipt as a replay. If the reviewed proposal differs from the saved draft, follow the `revise` item with a full Document revision in the same contribution. Keep the publishing summary and record the reviewed proposal for tracker readback. Require this attempt's successful, non-repeated receipt for the same Flow and Stage. If the revision is stale, the claim is refused, or the receipt is missing or ambiguous, stop. Re-read for evidence only. Do not overwrite the competing attempt or replay issue creation.
4. With the checks current and the receipt in hand when required, start the existing create-then-wire steps. The Result revision guard excludes competing publishers of the same pending batch. It does not lock the tracker or exclude external edits. If publication is interrupted or its outcome is uncertain, retain the marker and record tracker readback on the owning Stage. Do not replay the batch.

## Complete a saved batch

On success, revise the same Document with `revises` and summary `Completed`. Record the published tracker ids and named references or why no new issues were needed. Submit the revision with the Stage's finish. If no batch Result was saved, finish the Stage after the ordinary Results.
