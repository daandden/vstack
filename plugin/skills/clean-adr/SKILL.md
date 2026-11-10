---
name: clean-adr
description: "Archive ADRs that no longer fully hold and restate the decisions that hold today."
disable-model-invocation: true
---

# clean-adr

Typing `/skill:clean-adr` authorizes judging, archiving, rewriting, citation repair, and independent checks without approval questions. Commit nothing. Leave tracked changes in the working tree. Preserve the ADR archive so the user can restore a Private-mode ADR by hand.

## Flow page and diagnostics

Follow `skill://flow-page`'s "Stage entry/exit line" before discovery. Resolve the vstack root by the Private-mode rule once. Use the supplied Scratch dir, or resolve it through skill://vstack-tmp. Keep this run's inventory, scout briefs and raw results, verdict table, rewrite plan, provision coverage, link map, command diagnostics, and final report in one `clean-adr` entry under that Scratch dir. The parent writes these records. Scouts write no Scratch.

In a Flow, publish the report as Results with captured diagnostics before every exit. Outside a Flow, return the full report in chat. Private-mode publication restrictions still apply. Without prior permission to publish private contents, report aggregate outcomes and evidence locations without disclosing those contents. Do not ask a publication question during this run.

## 1. Inventory every active ADR

Read the project's domain docs config and glossary, including `GLOSSARY-MAP.md` when present. Read the repo's own tracked domain docs in Private mode as well. Discover every ADR directory from those records:

- Standard mode includes `docs/adr/` and each context's ADR directory.
- Private mode includes `<vstack root>/domain/adr/`, each private context's ADR directory, and the repo's tracked ADR directories.

Read [citation repair's report-only list](references/citations.md#read-the-report-only-list) before changing any citation or link. Apply it to outgoing link repair in archived bodies as well as incoming citations.

Deduplicate directories by their resolved paths without merging their namespaces. Keep each ADR's source directory and context throughout the run. Never move an ADR between contexts or between private and tracked directories.

Inventory the numbered active files outside `archive/`. Read each one. Record its path, number, contents checksum, context, and outgoing relative links. Inventory archived numbers recursively for numbering, but treat archived text as historical evidence, not a current rule. Record the current branch, HEAD, and existing working changes without altering them. An empty active set produces a no-change report.

Group related active ADRs by decision, not just by adjacent numbers. Give every active ADR exactly one owning group. Give each scout access to later ADRs and cross-group references so grouping does not hide a replacement. For a large set, schedule several Fan-outs of manageable related groups. Record the groups before investigation and account for every group after each batch.

## 2. Judge what holds

Investigation brief: investigate the supplied group read-only. Read every assigned ADR and later ADRs that affect it. Compare each provision with the current code, skills, config, and other project evidence. Supersession banners are leads, not sufficient evidence. Distinguish an unimplemented but still accepted constraint from a decision the project has abandoned. Return one verdict per assigned ADR: `holds`, `partly-holds`, `none-holds`, or `merge`. For each verdict, return the source path, provision-level evidence with file and line or command output, what still holds, what no longer holds and why, missing evidence, and every other ADR that describes the same decision, including ADRs outside this group. A `merge` verdict names all proposed members and the common decision. Return command failures and open uncertainties. Write nothing, start no subagents, and ask no questions.

With two or more groups in a batch, use the Fan-out line. With one group, use the single-subagent line. With none, skip investigation.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per group of related active ADRs in this batch. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-scout"`. Each `task`: the investigation brief above, its assigned ADR paths and context, the complete active inventory and relevant project paths, the vstack root. Wait for every result. If they cannot start, stop: leave the ADRs unchanged and report the uninvestigated groups and why they could not start.

Spawn one `vstack-scout` via `task` (`agent: "vstack-scout"`): the investigation brief above, its assigned ADR paths and context, the complete active inventory and relevant project paths, the vstack root. Wait for its result. If it cannot be spawned, stop: leave the ADRs unchanged and report the uninvestigated group and why its investigation could not start.

Save every result. Reconcile cross-group merge proposals and conflicting verdicts against the cited evidence. Keep an uncertain provision visible in the plan rather than inventing a decision. If evidence cannot settle an affected rewrite, leave those ADRs unchanged and report the unresolved group. Continue with independently settled groups. Do not ask a question or silently treat an uncertain group as holding.

Complete the verdict table only when every active ADR has a verdict or an explicit investigation gap.

## 3. Plan the archive and replacement ADRs

Read `skill://domain-modeling/ADR-FORMAT.md` for the fallback format. Follow the project's own ADR format when it has one. This command already authorizes the rewrite, so no ADR-offer or approval step applies.

Keep a fully holding ADR in place with its number and original bytes unless citation repair later needs to change a citation. Archive the whole file when any provision no longer holds, or when the rewrite merges that file with other ADRs. Do not trim a partly holding ADR in place. Do not rewrite a holding ADR just to improve its wording.

For each source directory, plan new ADRs that state only the settled provisions that hold. Merge ADRs describing one decision into one replacement within that directory. Related decisions across directories remain in their own contexts. An ADR with no holding provisions needs no replacement. Preserve the rationale for the holding decision, but introduce no new decision, inferred constraint, or unsupported justification.

Allocate each new number after the highest number anywhere in its source ADR directory and all dated folders under its `archive/`. Reserve numbers for the whole plan before writing, incrementing for each new ADR. Never reuse a number or derive a private context's number from a tracked or neighboring directory.

Use one run date, `YYYY-MM-DD`, for `archive/<date>/` inside each affected source directory. Keep the original basenames. If that date already exists, preserve its files and refuse a destination collision rather than overwrite history. Prepare a complete mapping of original paths to archive paths and replacing ADR paths. One original may have several replacements. A retired decision instead records `no part holds` and its evidence-backed reason.

Write a provision coverage table. Every provision of every file to archive must map to a replacement provision or an explicit dropped reason. Each replacement statement must map back to its source. Each replacement ADR lists and links all archived ADRs it replaces. Save this plan before any move.

Validate the plan with read-only file checks before execution. Check that every source still matches its inventoried checksum, every archive destination is free, every reserved number is unused, every replacement has sources, and each archived provision has a disposition. Save the command and its outcome. On a failed check, refresh the affected inventory and reconcile the plan before proceeding. Preserve user changes. Never overwrite a file changed since investigation under an earlier plan.

## 4. Archive and write what holds

Write the planned replacement ADRs at their real target paths. Move each planned original to its own directory's dated archive folder. Preserve its historical body, including existing supersession quotes. Add exactly one new archive banner above it:

```md
> Archived on YYYY-MM-DD. Replaced by [ADR NNNN](../../NNNN-slug.md).
```

List every replacing ADR in the banner. When no part holds, use this form with the actual reason:

```md
> Archived on YYYY-MM-DD. No part holds: <evidence-backed reason>.
```

Repair outgoing relative links in archived bodies without rewriting their historical wording or cited numbers. Resolve each link from the file's original parent, then express its actual destination relative to its new parent. If the destination also moved, use its archive path from the complete link map, not its replacement. Preserve fragments, query suffixes, link labels, and image syntax. Cover inline links, reference definitions, and relative HTML link or image destinations. Leave external URLs and absolute paths alone. A same-file fragment remains a same-file fragment.

Check repaired destinations outside report-only paths against the filesystem and preserve the original body except for these link destinations. Record pre-existing broken links separately rather than attributing them to this move. Save the written paths and operation failures. On failure, retain completed work and its mapping, stop dependent operations, and report the actual state rather than claiming an atomic run.

## 5. Continue with citation repair and independent checks

### Repair citations

Read [Repair citations of archived ADRs](references/citations.md). Use the archive/rewrite phase's link map to repair live citations, retarget history links, and report protected paths without editing them. Finish the occurrence-to-target table and link checks before independent checks. Keep these phases separate from judging and file moves.

Pass the link map, verdicts, provision coverage, written paths, and citation outcomes to independent checks before the final report. If their procedure is unavailable, record independent checks as `not run` and report only the archive/rewrite and citation outcomes, not a completed cleanup.

### Check the rewrite

Count the first independent check as check 1. Run at most three checks for the whole run, not three per group. With no archived ADRs and no replacements, record the check as not needed.

Record the parent and every agent that wrote a replacement draft or a later fix. For every check, use fresh `vstack-scout` agents that wrote none of those drafts or fixes. Do not resume a judging scout or an earlier checking scout. The parent fixes findings, not the scouts.

Group the run's archived ADRs and new ADRs by related decision and source directory. Include retired ADRs with no replacement. Give every archived provision and every new statement an owning group, with cross-group sources available. For a large set, run several Fan-outs of manageable groups within the same numbered check. Finish all groups before deciding that check's outcome.

Check brief: read the assigned archived bodies, replacement ADRs, original judgments, rewrite plan, and current project. Return a coverage table with rows for every archived provision and every new statement. Each row names its source provision and replacement statement by path and section or line, its disposition, the original judge's dropped reason when applicable, independent project evidence, and any problem. Mark each archived provision `restated` in a named new ADR or `dropped` with the judge's reason. A missing provision or dropped reason is a miss, not a reason to invent one. Flag every new statement with no archived source, including unsupported rationale or an inferred constraint. Independently re-test every new statement against the current code, skills, config, and other project evidence. Do not accept the first judgment as proof. Distinguish an accepted but unimplemented constraint from an abandoned decision. Name contradictions, false statements, and evidence gaps, including affected new ADR paths. Return command failures and unresolved rows explicitly. Investigate read-only and write no Scratch.

With two or more groups in a batch, use the Fan-out line. With one group, use the single-subagent line.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per group of archived and new ADRs in this check batch. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-scout"`. Each `task`: the check brief above, its assigned paths and context, the complete archive-to-replacement map and relevant project paths, the vstack root. Wait for every result. If they cannot start, stop: retain completed work and report the check number, unchecked groups, and why the check could not finish.

Spawn one `vstack-scout` via `task` (`agent: "vstack-scout"`): the check brief above, its assigned paths and context, the complete archive-to-replacement map and relevant project paths, the vstack root. Wait for its result. If it cannot be spawned, stop: retain completed work and report the check number, unchecked group, and why the check could not finish.

The parent saves each check separately under this run's Scratch entry as `check-1/`, `check-2/`, or `check-3/`. Keep its briefs, scout identities, draft-author identities, raw results, checked-file checksums, and combined coverage table there. Give problem rows stable ids across checks. Preserve earlier tables rather than overwrite them. Account for every assigned provision and statement. Missing coverage or unavailable evidence stays open.

If no row is open, finish the loop. Otherwise, after check 1 or 2, fix each miss, contradiction, or false statement that the evidence settles. Restore omitted holding provisions, remove invented decisions, and correct false restatements. Drop a provision only with an evidence-backed reason. Keep a row open when the evidence cannot settle it. Update the rewrite plan and coverage, and pass changed replacement mappings back through archive banners, links, and citation repair. Then increment the check number and check the complete result again with fresh scouts, including groups that passed earlier.

If a row remains open after check 3, stop rewriting. Keep the result, including every completed fix. Add a banner above each affected new ADR that names its remaining problems and their row ids:

```md
> Unresolved after clean-adr check 3. Row <id>: <problem>.
```

List all remaining problems affecting that ADR in its banner. For a missing provision, mark the intended replacement ADR. If no replacement exists, keep that fact in the report rather than invent a new decision to carry a banner. Report every open row with its source, affected new ADRs, problem, evidence, and coverage-table path. Report the number of completed checks and any unchecked groups. Never run a fourth check, undo the run, or describe open rows as settled.

## 6. Report the run

Account for every inventoried ADR. Report holding ADRs left in place, archived paths and their replacements or retirement reasons, new numbers, unresolved verdicts, operation failures, and pre-existing broken links. Include citation repair and independent-check outcomes, with skipped phases and missing proof explicit. Link the saved raw scout results, provision coverage, link map, and command diagnostics. In a Flow, use table Results for ADR outcomes and a Document Result for failures that have no ADR row.

Report every citation or link under report-only paths with its file, line, and new target. List live citations with no replacement and their archived targets separately. Include applied citation repairs, unresolved source or history classifications, and affected link-check failures. Distinguish protected non-edits from failures and pre-existing broken links.

State that no commit was made. Distinguish tracked working-tree changes from private changes that git does not show. Do not stage, commit, push, prune the archive, or automatically restore the run.
