# Clean ADRs

`/skill:clean-adr` judges every active ADR against later decisions and the project, archives files that no longer fully hold or that merge, and writes new ADRs stating what holds. The archive stays inside each source ADR directory. A holding ADR keeps its number and bytes unless citation repair changes a citation. The run asks no question and commits nothing.

## Sub-features

- `cadr-judge` scouts return a verdict, provision evidence, and same-decision ADRs for every active file, including files without supersession banners.
- `cadr-archive` fully superseded, partly superseded, and merged files move to one new `archive/<date>T<HHMM>/` folder per run in each source directory, with one new archive banner and working outgoing relative links. Existing destinations are refused, never shared.
- `cadr-rewrite` replacement ADRs state only holding provisions, list their archived sources, and use numbers above the highest active or archived number.
- `cadr-hold` a holding ADR with no citations remains byte for byte, and a second run does not rewrite settled decisions.
- `cadr-layout` Standard, Private plus tracked, and multiple contexts keep separate archive locations and number sequences. Git sees no private file changes.
- `cadr-run` the actual skill uses scouts, asks no question, saves evidence, and leaves HEAD and the index unchanged.
- `cadr-citations` holding ADRs and other live text cite replacements without changing their own ADR numbers.
- `cadr-history` plain history citations keep their bytes, and history links keep old numbered labels while opening run-time archive files.
- `cadr-retired` live citations with no replacement keep their numbers, link into the archive, and appear in the report.
- `cadr-report-only` listed paths stay byte for byte and get file, line, and new-target report rows. Omitting the list permits direct repairs.
- `cadr-check-coverage` fresh scouts account for every archived provision and every new statement, detect missing reasons and unsupported statements, and independently test the rewrite against the project.
- `cadr-check-repair` the parent fixes findings and checks the complete rewrite again, keeping each check's coverage table in Scratch.
- `cadr-check-limit` a problem surviving check 3 remains in the result, with a banner on the affected new ADR and an open report row. No fourth check or automatic undo occurs.

## How to get to it (user POV)

- Type `/skill:clean-adr` in a project with ADRs. No further answer is needed.

## Driving it with a fresh real-model session

Preconditions:

- Use the baseline from `README.md` and the independent Verifier's fresh real-model session with the checkout's plugin. Stub replies prove neither judgment nor instruction following.
- Use skill-creator's Session model and thinking discovery, but use the fixture-local isolation procedure below instead of architecture-agreement's custom-directory overlay. Parent discovery and an absolute selected-skill path do not prove delegated `skill://` resolution. Obtain explicit approval before a paid Headless run. This recipe itself grants no costly-run authorization.
- Run only in disposable fixtures under `$VERIFY_RUN_DIR/data/`. Use no production tracker, remote, or real project ADRs. Preserve prompts, overlays, transcripts, source hashes, and actual skill and agent read paths.
- The typed command enrolls in a Flow. Use the fixture's own identity and a dedicated `--home "$VERIFY_RUN_DIR/data/<case>-flow-home"` on every Flow command. The explicit CLI-home fixture proves report publication, not normal-HOME binding behavior. Never reuse the author's binding. Export the fixture Flow and stop only a host started in that owned namespace.
- Drive the citation cases below in Standard and Private mode. Archive/rewrite outcomes alone prove neither citation repair nor independent checks.

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
mkdirSync(join(adr, 'archive/2026-11-01T0900'), { recursive: true });
const protocol = relative(adr, join(root, 'docs/protocol.md')).split('\\').join('/');
const files = {
  '0001-remote-polling.md': `# Use remote polling\n\nPoll the remote service for updates because the first device had no local event source.\n\nSee [protocol](${protocol}#protocol).\n`,
  '0002-cache.md': '# Cache limits and retention\n\nKeep at most 10 entries to fit the original device memory. Retain entries for seven days because devices can be offline for a week.\n',
  '0003-compression.md': '# Compress payloads\n\nUse gzip for payloads because deployed receivers understand gzip.\n',
  '0004-receiver-format.md': '# Receiver compression format\n\nUse gzip for payloads to remain compatible with deployed receivers.\n',
  '0005-retries.md': '# Bound retries\n\nRetry at most three times to bound battery use.\n',
  'archive/2026-11-01T0900/0012-retired-device.md': '> Archived on 2026-11-01T0900. No part holds: the original device was retired.\n\n# Original device\n\nSupport the original device only.\n',
};
for (const [name, text] of Object.entries(files)) writeFileSync(join(adr, name), text);
BUN
```

For Standard and Private mode, add the citation fixtures under [Citation cases](#citation-cases) before committing the baseline. Keep their bytes and line numbers with the baseline evidence.

Commit the fixture baseline, not any result of the skill:

```sh
git -C "$F" add .
git -C "$F" -c user.name=Verifier -c user.email=verifier@example.invalid commit -qm 'Add ADR fixture'
git -C "$F" rev-parse HEAD
git -C "$F" write-tree
```

Save HEAD, index tree, every ADR's bytes, and an inventory outside `data/` before driving. Save private bytes explicitly because git never captures them. For one context, change archived `0012` to `0020` before taking the baseline so per-directory numbering has an observable difference.

### Pin the parent and scouts to the checkout

Before the fixture baseline, add `.omp/` to its `.gitignore`. After the baseline, prepare each fresh fixture with this owned helper:

```sh
bun "$SKILL_DIR/scripts/clean-adr-isolation.ts" "$CHECKOUT" "$F" "$VERIFY_RUN_DIR/<case>"
```

The helper refuses an existing fixture `.omp/`. It links native project skills and agents to the checkout and stages a project-local `vstack` package link and lock entry. Native project discovery takes precedence over installed skills and user agents. The project package shadows the installed package of the same name, including its extension. This persists through delegated rediscovery without changing HOME, credentials, installed skills, or global settings. `isolation-inputs.json` records the links and dependency hashes. The overlay includes only bare checkout skill names, so differing installed aliases cannot enter the dependency list.

Clear inherited `PI_*` and `OMP_*` variables, retain real `HOME` and credentials, then set `PI_CONFIG_FILES` to the helper's absolute `isolate.json` path. Pass that same file with `--config`. Launch from `F` with `--no-rules --no-context-files`, the discovered Session model and thinking level, and a persistent `--session-dir "$VERIFY_RUN_DIR/<case>/session"`. Use the project package, not `--plugin-dir` plus the installed package. Keep `/skill:clean-adr` available through the pinned native project skill and submit that exact user action. Launcher context may name only fixture paths, the supplied Scratch directory, and the isolated Flow home.

Before the paid turn, inspect fresh-runtime `get_state` and the startup `available_commands_update` frame with these exact launch inputs. Require the selected skill command and `vstack-scout` tool entry. Read `skill://clean-adr` and `skill://domain-modeling` through `omp read` from `F` with the same environment to check their initial paths. Keep the effective system prompt, actual user message, and selected skill read or native expansion. During the drive, retain every scout session beside its parent session. Afterward, inspect every actual dependency read in both the parent and scouts, including nested `eval` tool calls. Resolve each returned `[Skill file: ...]` path and require it under `$CHECKOUT/plugin/skills/`. Compare its bytes with the recorded input hash and the verified head. Retain the raw results and a manifest of scout identity, requested URI, resolved file, and SHA-256. Audit script invocations and agent-definition provenance too.

A parent-only discovery check, launcher prose instructing absolute reads, a passing Doctor, or matching product outputs cannot replace this audit. Any installed dependency path, changed source bytes, missing scout transcript, or missing resolution provenance leaves isolation unproven and the drive unavailable. Preserve the failed drive. Stop if a correction would require shared settings or an unsupported runtime override.

### Run the fixture

1. Launch the fresh actual-model session in `F` with the checkout's plugin, its scouts, and isolated dependency discovery. Submit exactly `/skill:clean-adr` as the user action. Supply only fixture paths and the isolated Flow-home constraint as launcher context, not expected verdicts or replacement content. Capture all actual tool calls and the final report.
2. Inspect the scout returns. Every active file in every directory must have one verdict with project evidence, and the compression pair must be identified as the same decision. The raw results and the owning run's verdict and provision tables must remain in Scratch. Require a real `vstack-scout` investigation, not a fixed scripted response.
3. Independently inspect each ADR directory. Require `0001` through `0004` under one new `archive/<date>T<HHMM>/` folder in that same directory, and no active copies with those numbers. Require a stamp such as `2026-11-10T1530`, with the same stamp in each added archive banner. Keep the pre-existing archive file unchanged except for incoming link destinations repaired by the citation cases. Require `0005-retries.md` to match its saved bytes exactly. Each moved file has exactly one added archive banner. `0001` names no holding provision and gives a reason tied to disabled polling. The remaining banners link to the appropriate new ADRs.
4. Inspect replacement meanings, not filenames or phrasing. Require the seven-day retention decision and rationale, with the ten-entry limit dropped. Require one replacement for the two gzip ADRs, retaining receiver compatibility. Every new ADR lists and links all archived sources that it replaces. Reject newly invented decisions such as declaring the current 20-entry setting an accepted architectural constraint without an archived source. Require fresh numbers beginning above `0012`, or above `0020` in the changed context, with no duplicate number in that directory and its archive.
5. Resolve every relative link in the archived bodies and banners from their new locations. The protocol link must still reach `docs/protocol.md#protocol`. Compare archived bodies against saved originals, allowing only the added banner and repaired relative-link destinations. Add a reference-style link and a link between the two merging files in one fixture before its baseline to prove both move-aware destinations. Historical link labels and numbers must remain unchanged.
6. For `private`, inspect the private and tracked directories separately. Require each archive inside its source directory, both sets judged, and independent number allocation. Save `git -C "$F" status --short --untracked-files=all`, `git -C "$F" rev-parse HEAD`, and `git -C "$F" write-tree`. Only tracked-domain changes may appear in status. HEAD and the index tree must equal the baseline. The private filesystem inventory, not a clean git status, proves private changes.
7. For `contexts`, require complete coverage of all three directories without moving any decision to another context. Preserve evidence that the context with historical `0020` allocates above it while the other directories allocate above `0012`.
8. Inspect the transcript for zero question-tool calls, zero stage or commit operations in git, and no modification of fixture application config. Require the report to distinguish tracked and private changes and to name every failure or unavailable phase. Check the actual Flow Result and export without publishing private fixture bodies to any production Flow.
9. Save all resulting ADR bytes, inventories, relevant git output, and the report outside `data/`. Invoke `/skill:clean-adr` again in the same fixture and save a second before/after inventory. Require no further archive moves, new numbers, or rewording when nothing changed. Treat any extra move as a behavioral failure rather than weakening the expectation.
10. In a separate same-day case, complete a first run and save all archive bytes and its folder stamp. Change `retryLimit` in `settings.json` to `5`. In each ADR directory, add a later ADR at the next unused number that replaces the three-retry bound with at most five retries to support slower reconnects. At a later minute on the same calendar day, invoke `/skill:clean-adr` again. Require `0005-retries.md` under a second `archive/<date>T<HHMM>/` folder in each affected source directory, with the same date and a different `HHMM`. The second run must not share the first folder or change its existing files. Retain both transcripts, stamps, and before/after inventories.
11. In separate collision fixtures, give the fresh actual-model session only this operational checkpoint instruction alongside the usual launcher context. Save the archive plan and end the turn immediately before creating any archive folder. At the observed checkpoint, create the proposed run-time destination. Seed one case with an empty folder and another with a noncolliding sentinel filename, then resume the same run. Require refusal of that destination without moving files into it or changing its contents. If the run replans with a later stamp, require a new absent destination and preserve the refusal evidence. Report unavailable checkpoint control rather than claiming collision proof.
12. Record each sub-feature, case, command, observed outcome, and proof path in `$VERIFY_RUN_DIR/notes.md`. Preserve failed attempts and unavailable cases. Export and deliberately finish only owned fixture Flows. Stop only their isolated hosts through the authenticated Flow CLI, then run the Verify skill's Cleanup.

### Citation cases

Run these cases through the same fresh real-model user action, not a scripted substitute. Use both the Standard fixture and the Private fixture with its private and tracked ADR directories. Add `journalSync: true` to `settings.json` before the baseline.

For each ADR directory `A`, add `0006-journal.md` with this holding decision and an inline link relative to that directory:

```md
# Flush the journal synchronously

Flush local journal writes synchronously to preserve acknowledged writes after power loss.

Use [ADR 0002](0002-cache.md) for cache retention.
```

Create these incoming citations before taking the baseline. When one file cites both Private-mode directories, give each directory its own named section so an unlinked number has a source context. Compute all relative destinations from the citing file's parent.

| File | Seed content for each ADR directory | Required result |
|---|---|---|
| `docs/live-citations.md` | A live inline link labelled `ADR 0002`, a live reference-style link labelled `ADR-0004`, and a live HTML link labelled `ADR 0002`. | Each number and destination names the appropriate cache or compression replacement. |
| `src/policy.ts` | A code comment citing plain `ADR 0004` and naming its ADR directory. | The comment names the compression replacement, not the archived number. |
| `docs/retired.md` | A live link labelled `ADR 0001` and a plain live `ADR 0001` citation. | Keep both numbers. Retarget the link to the retired original in the run-time archive folder. Report both occurrences and their archived targets. |
| `CHANGELOG.md` | A release entry with an inline link labelled `ADR 0002`. | Keep the old number and entry wording. Only the destination changes to the run-time archive folder. |
| `research/plain.md` | A past-research statement citing plain `ADR 0004`. | Keep every byte. |
| `research/links.md` | A past-research statement with a reference-style link labelled `ADR 0004`. | Keep the old number. Retarget its reference definition to the archived original. |
| `gated/policy.md` | A live link labelled `ADR 0002`, plain live `ADR 0004`, and a historical link labelled `ADR 0001`. | With `gated/` listed as report-only, keep every byte. Report each occurrence with its file, original line, and concrete replacement or archive target. |
| `gated-other/policy.md` | A live link labelled `ADR 0002`. | Repair it. A `gated/` entry must not protect a similarly named sibling. |

Append a historical link labelled `ADR 0002` to the pre-existing archived `0012` file. Append a link labelled `ADR 0004` to active `0002-cache.md`. Both links must keep their numbered labels and reach the correct archived original after that original moves. New ADRs' `Replaces` links must also reach their archived sources, never loop back to themselves.

In `C/domain.md`, set the report-only line as follows. For Private mode, also seed `<vstack root>/domain/gated.md` with a live link to the private cache ADR, list that file by its absolute path, and require the same byte-preservation and report-row checks.

```md
- clean-adr report-only paths: ["gated/"]
```

After the real-model drive, check `0006-journal.md` separately from the byte-for-byte holding `0005` case. Require `0006` to remain active with its original number and journal decision, with only its cache citation changed to the cache replacement. Resolve every affected destination outside report-only paths from its final file location, including archive banners, archived bodies, replacement provenance, reference definitions, and HTML links. Check fragments as well as file existence. Retired links go to the archive, not to an invented replacement.

Compare each protected file with its saved baseline bytes. Match every protected occurrence against the actual report using the baseline line number and the final target file, including the plain citation. In Private mode, require private and tracked citations to resolve within their own ADR namespaces despite identical numbers. Preserve the report, complete citation table, and filesystem link checks outside `data/`.

Repeat from fresh Standard and Private fixtures with the `clean-adr report-only paths` line omitted. Do not remove it only after a protected run, because that would test an already-cleaned ADR set. Require direct live-citation repair and historical-link retargeting in `gated/policy.md` and the private `gated.md` as well. Plain historical citations still keep their bytes. Save the fresh baselines and separate real-model transcripts. An empty list has the same direct-edit meaning.

### Independent check loop

Run these cases with real models in both `standard` and `private`. Private cases include both the private and tracked ADR directories. The independent Verifier's ticket-453 End-state proof must exercise the actual skill and scouts in both modes. A stub-model drive or passing maintainer gate does not satisfy that proof.

First inspect the uninterrupted baseline drives above. Require an independent check after the rewrite, with complete coverage of retired ADRs as well as replacements. Compare actual parent and task identities. Every checking scout must be fresh, must have written no replacement draft or fix, and must differ from judging scouts and earlier checking scouts. Require no scout writes. Check every archived provision for a named restatement or the original judge's dropped reason. Check every new statement for an archived source and independently obtained project evidence. Missing evidence cannot count as a passed row.

Locate `check-1/`, and any later check directories, in the actual run's Scratch entry. Preserve each check's briefs, raw returns, identities, checked-file checksums, and combined coverage table outside `data/`. Confirm that the table covers all groups, not only the most recent batch or earlier findings. A large fixture may use several Fan-outs, but those batches share one check number.

Keep the uninterrupted Standard and Private baselines evidence-poor. Configuration and policy comments do not prove runtime enforcement, offline durations, or deployed receiver capabilities. Require those unavailable claims to remain open even when source provenance and accepted policy are established. Require at most three whole-result checks, with each remaining id in the final report and each affected new ADR's banner. Save the coverage manifest, raw scout JSON, and completion-command outcome for each check. An identical second typed invocation must preserve every resulting ADR byte, including unresolved banners, rather than resume an earlier run or add late banners.

Use separate disposable fixtures for fault cases, not the baseline or delivery checkout. The persistent-limit case keeps the evidence-poor inputs above. The controlled-repair case uses a separate complete Bun simulator project whose claims its software can establish. Initialize a fresh empty Git fixture, then seed it before its baseline or model invocation:

```sh
git init -q "$F"
bun "$SKILL_DIR/scripts/clean-adr-evidence.ts" "$F" "$VERIFY_RUN_DIR/<case>-repair-seed" <standard|private>
bun "$F/src/help.ts"
```

The helper seeds settings, domain and glossary evidence pointers, accepted current policy, ADRs, citations, and maintained programs at `src/simulator/`. Private mode includes private and tracked ADR namespaces. This is the complete simulator system, not sample code standing in for an unspecified production system. Its clock is logical input. Its ADRs make no historical hardware, memory-measurement, physical-offline-duration, or deployed-fleet claim. Keep the original evidence-poor baselines and their rationales unchanged.

The producer selects payload entries by configured capacity and age. Its subprocess payload at seven logical days includes the stored reading; one millisecond later its actual decoded payload is empty. The helper also records capacity overflow, disabled remote input, synchronous journal appends, and bounded attempt-slot construction. Current policy explicitly retires the fixed ten-entry rule in favor of configurable capacity. Do not turn the configured twenty-entry value into a new architectural decision.

The named receiver program decodes the producer's gzip packet. A separate program encodes a real zstd packet and independently decodes it back to the original JSON. The gzip receiver must reject that valid alternate-codec packet. Preserve both successful and rejected wire bytes, input JSON, exact subprocess commands, stdout, stderr, exits, source hashes, and all observations. `evidence/actors/` in the fixture holds these records, including expired-empty payloads. They establish this software's behavior only.

Require the seed command to exit 0. Independently inspect the implementations and recorded transitions before starting the model. A seed failure blocks this case. Commit its seeded fixture baseline, save private bytes separately, and run the same isolation helper and actual-model procedure as above. Do not alter scout assessments or expected results to obtain a pass. If a retained claim still lacks genuine evidence, preserve the open row and report the fixture gap.

The controlled project also has a current `src/help.ts` command with namespace-qualified ADR lookup navigation. Each seeded occurrence has its own source line. Its references do not endorse the retired polling policy. Save the command output before and after the drive. Require its linked and plain `ADR 0001` occurrences to retain the old number, require each link to reach its own archived original, and match every occurrence to the actual same-case report's file, line, and archive target. Historical-only citation results do not prove this live-no-replacement case. Keep the original history-citation assertions unchanged.

The controlled-repair fixture must reach no-open-row convergence without weakening the completion procedure. Add only this operational checkpoint context to each fresh actual-model fault session:

> For this disposable fixture drive, save the current phase and check count, then end the turn immediately before the first independent-check task call and after each repair before the next check. Resume the same run when the controller says Continue. Do not request an answer or change the check procedure.

Submit `/skill:clean-adr`. At each observed checkpoint, save the transcript and file inventory before editing the fixture. Send `Continue the current /skill:clean-adr run.` only after saving the injected bytes and their checksums. Never edit while the model or a scout is running. If a checkpoint is not reached, preserve the attempt and report the fault case unavailable rather than fabricate a scout result. These supplementary drives prove recovery from injected faults, not that an uninterrupted run naturally produces them. The uninterrupted baseline alone proves that the normal command needs no further answer.

For the repair case, inject these faults at the first checkpoint into the actual replacement ADRs, leaving their source lists and the original judgments intact:

1. Remove the seven-day retention provision and its rationale from the cache replacement without adding a dropped reason.
2. Add a new requirement that every deployment needs a 24-hour maintenance window. Neither the archive nor the project supplies that decision.
3. Change the gzip replacement's payload format to zstd. Keep `settings.json` at gzip and preserve the archived gzip decision.

Require every coverage ownership row to retain its required `kind`, either `archived` or `new`, across outcomes and later manifests. The injected maintenance-window statement has `kind: "new"`. If a fresh scout verifies deletion from every current new ADR, require its stable row to close as `removed`, with `removedFrom`, current new ADR references, `problem: null`, and a resolution of the earlier open problem. If absence remains unverified, require the row to stay open. A closure as `dropped` fails this case even if the command reports `finish`. Archived provisions still close only through restatement or the original judge's evidence-backed dropped reason. Preserve the raw scout assessment unchanged in either outcome.

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
