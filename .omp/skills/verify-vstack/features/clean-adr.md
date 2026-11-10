# Clean ADRs

`/skill:clean-adr` judges every active ADR against later decisions and the project, archives files that no longer fully hold or that merge, and writes new ADRs stating what holds. The archive stays inside each source ADR directory. A holding ADR keeps its number and bytes unless citation repair changes a citation. The run asks no question and commits nothing.

## Sub-features

- `cadr-judge` scouts return a verdict, provision evidence, and same-decision ADRs for every active file, including files without supersession banners.
- `cadr-archive` fully superseded, partly superseded, and merged files move to one dated folder per source directory with one new archive banner and working outgoing relative links.
- `cadr-rewrite` replacement ADRs state only holding provisions, list their archived sources, and use numbers above the highest active or archived number.
- `cadr-hold` a holding ADR with no citations remains byte for byte, and a second run does not rewrite settled decisions.
- `cadr-layout` Standard, Private plus tracked, and multiple contexts keep separate archive locations and number sequences. Git sees no private file changes.
- `cadr-run` the actual skill uses scouts, asks no question, saves evidence, and leaves HEAD and the index unchanged.
- `cadr-check-coverage` fresh scouts account for every archived provision and every new statement, detect missing reasons and unsupported statements, and independently test the rewrite against the project.
- `cadr-check-repair` the parent fixes findings and checks the complete rewrite again, keeping each check's coverage table in Scratch.
- `cadr-check-limit` a problem surviving check 3 remains in the result, with a banner on the affected new ADR and an open report row. No fourth check or automatic undo occurs.

## How to get to it (user POV)

- Type `/skill:clean-adr` in a project with ADRs. No further answer is needed.

## Driving it with a fresh real-model session

Preconditions:

- Use the baseline from `README.md` and the independent Verifier's fresh real-model session with the checkout's plugin. Stub replies prove neither judgment nor instruction following.
- Follow `architecture-agreement.md`'s actual-model runtime isolation and Session model discovery, and the checkout's `plugin/skills/skill-creator/references/evaluation.md` when using its launcher. Obtain explicit approval before a paid Headless run. This recipe itself grants no costly-run authorization.
- Run only in disposable fixtures under `$VERIFY_RUN_DIR/data/`. Use no production tracker, remote, or real project ADRs. Preserve prompts, overlays, transcripts, source hashes, and actual skill and agent read paths.
- The typed command enrolls in a Flow. Use the fixture's own identity and a dedicated `--home "$VERIFY_RUN_DIR/data/<case>-flow-home"` on every Flow command. The explicit CLI-home fixture proves report publication, not normal-HOME binding behavior. Never reuse the author's binding. Export the fixture Flow and stop only a host started in that owned namespace.
- Tickets 452 and 453 supply citation repair and independent post-rewrite checks. At ticket 451 alone, require an explicit `not run` for those phases, not a full-cleanup claim. Once integrated, also drive their feature recipes. This recipe does not substitute for those checks.

Create three new fixtures. Set `F` to `$VERIFY_RUN_DIR/data/cadr-<case>` and run `git init -q "$F"` for each. Set `C` and the list of ADR directories as follows:

| Case | Domain config directory `C` | ADR directories to seed |
|---|---|---|
| `standard` | `$F/docs/vstack` | `$F/docs/adr` |
| `private` | `$F/.git/vstack/config` | `$F/.git/vstack/domain/adr` and tracked `$F/docs/adr` |
| `contexts` | `$F/docs/vstack` | system `$F/docs/adr`, Orders `$F/src/orders/docs/adr`, and Billing `$F/src/billing/docs/adr` |

For each fixture, create `C/domain.md` listing all of that case's ADR directories and `$F/settings.json` as the current project config. The source config uses these literal contents:

```json
{
  "remotePolling": false,
  "cache": { "maxEntries": 20, "retentionDays": 7 },
  "compression": "gzip",
  "retryLimit": 3
}
```

Create `$F/docs/protocol.md` containing a `# Protocol` heading. For `contexts`, write `$F/GLOSSARY-MAP.md` linking Orders and Billing glossaries. Each context glossary names its ADR directory and `settings.json` as the shared configuration. The system ADR directory remains separate. For `private`, also write `$F/.git/vstack/domain/GLOSSARY.md` naming its private ADR directory and `$F/GLOSSARY.md` naming the tracked one.

Seed each selected ADR directory by running this command with `A` set to its absolute path. It writes fixture data only:

```sh
bun - "$F" "$A" <<'BUN'
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
const [root, adr] = process.argv.slice(2);
mkdirSync(join(adr, 'archive/2026-11-01'), { recursive: true });
const protocol = relative(adr, join(root, 'docs/protocol.md')).split('\\').join('/');
const files = {
  '0001-remote-polling.md': `# Use remote polling\n\nPoll the remote service for updates because the first device had no local event source.\n\nSee [protocol](${protocol}#protocol).\n`,
  '0002-cache.md': '# Cache limits and retention\n\nKeep at most 10 entries to fit the original device memory. Retain entries for seven days because devices can be offline for a week.\n',
  '0003-compression.md': '# Compress payloads\n\nUse gzip for payloads because deployed receivers understand gzip.\n',
  '0004-receiver-format.md': '# Receiver compression format\n\nUse gzip for payloads to remain compatible with deployed receivers.\n',
  '0005-retries.md': '# Bound retries\n\nRetry at most three times to bound battery use.\n',
  'archive/2026-11-01/0012-retired-device.md': '> Archived on 2026-11-01. No part holds: the original device was retired.\n\n# Original device\n\nSupport the original device only.\n',
};
for (const [name, text] of Object.entries(files)) writeFileSync(join(adr, name), text);
BUN
```

Commit the fixture baseline, not any result of the skill:

```sh
git -C "$F" add .
git -C "$F" -c user.name=Verifier -c user.email=verifier@example.invalid commit -qm 'Add ADR fixture'
git -C "$F" rev-parse HEAD
git -C "$F" write-tree
```

Save HEAD, index tree, every ADR's bytes, and an inventory outside `data/` before driving. Save private bytes explicitly because git never captures them. For one context, change archived `0012` to `0020` before taking the baseline so per-directory numbering has an observable difference.

1. Launch the fresh actual-model session in `F` with the checkout's plugin, its scouts, and isolated dependency discovery. Submit exactly `/skill:clean-adr` as the user action. Supply only fixture paths and the isolated Flow-home constraint as launcher context, not expected verdicts or replacement content. Capture all actual tool calls and the final report.
2. Inspect the scout returns. Every active file in every directory must have one verdict with project evidence, and the compression pair must be identified as the same decision. The raw results and the owning run's verdict and provision tables must remain in Scratch. Require a real `vstack-scout` investigation, not a fixed scripted response.
3. Independently inspect each ADR directory. Require `0001` through `0004` under one new `archive/<run-date>/` folder in that same directory, and no active copies with those numbers. Keep the pre-existing archive file unchanged. Require `0005-retries.md` to match its saved bytes exactly. Each moved file has exactly one added archive banner. `0001` names no holding provision and gives a reason tied to disabled polling. The remaining banners link to the appropriate new ADRs.
4. Inspect replacement meanings, not filenames or phrasing. Require the seven-day retention decision and rationale, with the ten-entry limit dropped. Require one replacement for the two gzip ADRs, retaining receiver compatibility. Every new ADR lists and links all archived sources that it replaces. Reject newly invented decisions such as declaring the current 20-entry setting an accepted architectural constraint without an archived source. Require fresh numbers beginning above `0012`, or above `0020` in the changed context, with no duplicate number in that directory and its archive.
5. Resolve every relative link in the archived bodies and banners from their new locations. The protocol link must still reach `docs/protocol.md#protocol`. Compare archived bodies against saved originals, allowing only the added banner and repaired relative-link destinations. Add a reference-style link and a link between the two merging files in one fixture before its baseline to prove both move-aware destinations. Historical link labels and numbers must remain unchanged.
6. For `private`, inspect the private and tracked directories separately. Require each archive inside its source directory, both sets judged, and independent number allocation. Save `git -C "$F" status --short --untracked-files=all`, `git -C "$F" rev-parse HEAD`, and `git -C "$F" write-tree`. Only tracked-domain changes may appear in status. HEAD and the index tree must equal the baseline. The private filesystem inventory, not a clean git status, proves private changes.
7. For `contexts`, require complete coverage of all three directories without moving any decision to another context. Preserve evidence that the context with historical `0020` allocates above it while the other directories allocate above `0012`.
8. Inspect the transcript for zero question-tool calls, zero stage or commit operations in git, and no modification of fixture application config. Require the report to distinguish tracked and private changes and to name every failure or unavailable phase. Check the actual Flow Result and export without publishing private fixture bodies to any production Flow.
9. Save all resulting ADR bytes, inventories, relevant git output, and the report outside `data/`. Invoke `/skill:clean-adr` again in the same fixture and save a second before/after inventory. Require no further archive moves, new numbers, or rewording when nothing changed. Treat any extra move as a behavioral failure rather than weakening the expectation.
10. Record each sub-feature, case, command, observed outcome, and proof path in `$VERIFY_RUN_DIR/notes.md`. Preserve failed attempts and unavailable cases. Export and deliberately finish only owned fixture Flows. Stop only their isolated hosts through the authenticated Flow CLI, then run the Verify skill's Cleanup.

### Independent check loop

Run these cases with real models in both `standard` and `private`. Private cases include both the private and tracked ADR directories. The independent Verifier's ticket-453 End-state proof must exercise the actual skill and scouts in both modes. A stub-model drive or passing maintainer gate does not satisfy that proof.

First inspect the uninterrupted baseline drives above. Require an independent check after the rewrite, with complete coverage of retired ADRs as well as replacements. Compare actual parent and task identities. Every checking scout must be fresh, must have written no replacement draft or fix, and must differ from judging scouts and earlier checking scouts. Require no scout writes. Check every archived provision for a named restatement or the original judge's dropped reason. Check every new statement for an archived source and independently obtained project evidence. Missing evidence cannot count as a passed row.

Locate `check-1/`, and any later check directories, in the actual run's Scratch entry. Preserve each check's briefs, raw returns, identities, checked-file checksums, and combined coverage table outside `data/`. Confirm that the table covers all groups, not only the most recent batch or earlier findings. A large fixture may use several Fan-outs, but those batches share one check number.

Use separate disposable fixtures for fault cases, not the baseline or the delivery checkout. Keep the same seeded ADRs and project settings. Add only this operational checkpoint context to each fresh actual-model session:

> For this disposable fixture drive, save the current phase and check count, then end the turn immediately before the first independent-check task call and after each repair before the next check. Resume the same run when the controller says Continue. Do not request an answer or change the check procedure.

Submit `/skill:clean-adr`. At each observed checkpoint, save the transcript and file inventory before editing the fixture. Send `Continue the current /skill:clean-adr run.` only after saving the injected bytes and their checksums. Never edit while the model or a scout is running. If a checkpoint is not reached, preserve the attempt and report the fault case unavailable rather than fabricate a scout result. These supplementary drives prove recovery from injected faults, not that an uninterrupted run naturally produces them. The uninterrupted baseline alone proves that the normal command needs no further answer.

For the repair case, inject these faults at the first checkpoint into the actual replacement ADRs, leaving their source lists and the original judgments intact:

1. Remove the seven-day retention provision and its rationale from the cache replacement without adding a dropped reason.
2. Add a new requirement that every deployment needs a 24-hour maintenance window. Neither the archive nor the project supplies that decision.
3. Change the gzip replacement's payload format to zstd. Keep `settings.json` at gzip and preserve the archived gzip decision.

Require the first real checking scouts to flag all three problems. The retention row must name the missing provision or reason, the maintenance-window row must name the absent archived source, and the format row must cite independently read project evidence. Inspect the parent's repairs at the next checkpoint, then continue without more injection. Require restoration of seven-day retention and its rationale, removal of the maintenance-window requirement, and correction to gzip. Require a later fresh-scout check of the whole result with no open rows, within the three-check limit. Save the red table, repaired bytes, green table, actual tool calls, and report.

For the limit case, start another fresh fixture run. At its first checkpoint, add the same unsupported maintenance-window statement to a new ADR. After each of the first two checks and its repair, reinsert that exact statement at the next checkpoint. Save each repair and reinsertion separately. This controlled competing edit prevents convergence without prescribing any scout's answer or replacing real model judgments.

Require exactly three completed checks for the run, with fresh scouts and three retained coverage tables. The last table must still flag the maintenance-window statement. Its stable row id and problem must appear both in a banner above the affected new ADR and in the final report with evidence and the table path. Require no fourth task batch for checking, no unchecked rewrite after check 3, and no rollback of archive moves, replacements, or earlier completed repairs. HEAD and the index must still equal the fixture baseline. A private banner needs filesystem proof because git does not capture it.

Record `cadr-check-coverage`, `cadr-check-repair`, and `cadr-check-limit` separately for each mode in `$VERIFY_RUN_DIR/notes.md`. Preserve every injected revision, actual scout identity, check count, table, final ADR, and report outside `data/` before the existing Flow export and Cleanup steps. A report that merely says "checked" without this evidence does not prove the loop.

## Gotchas

- Do not place the expected verdicts in the model's prompt or seed supersession banners on the active files. The scout must compare the ADRs with current evidence.
- A successful maintainer load gate proves packaging, not cleanup judgment. A stub model proves neither scout verdicts nor the rewrite.
- Private mode needs both private and tracked ADRs in the same drive. A private-only fixture misses half the contract.
- No global numbering exists across contexts. Identical numbers in different source directories are valid.
- Preserve proof outside `data/` before cleanup. Git does not recover private files.
- This fixture does not prove judgment quality on a large real ADR set. Report that gap without claiming broad accuracy.
