# ADR archive history

why reads active ADRs and the ADR archive as evidence for a decision. domain-modeling creates date-and-slug ADRs with stems unused by active and archived ADRs. The archive stays inside the relevant ADR directory in Standard mode, Private mode, and each context.

## Sub-features

- `aah-why` answers a motivation question with a citation to an ADR found only in an `archive/<date>T<HHMM>/` run-time folder.
- `aah-number` creates a local-date `YYYYMMDD-slug.md` ADR without reusing any active or recursively archived stem. Existing numbered ADRs keep their names.
- `aah-layout` repeats both behaviors in Standard and Private layouts and in a context-scoped ADR directory.
- `aah-setup` fresh setup drafts and Private-mode Migration config name the ADR archive.

## How to get to it (user POV)

- Type `/skill:why` with a question about an existing decision.
- Ask domain-modeling to record an accepted decision as an ADR.
- Run `/skill:setup-vstack` in a new project, or accept its Private-mode Migration for an existing Matt project.

## Driving it with a fresh real-model session

Preconditions:

- Use the baseline from `README.md`. The stub driver cannot prove historical investigation or naming choices.
- Use the independent Verifier's fresh session and the checkout's plugin, not the installed skill copies. Keep the fixture under `$VERIFY_RUN_DIR/data/` and retain the transcript and actual dependency read paths.
- A paid Headless run is a Costly seam. Do not start one without explicit approval. If the real-model session is unavailable, report the missing behavioral proof instead of scripting its answers.
- Confine every write and git operation to the disposable fixture. Use no production tracker or remote. If the session enrolls in a Flow, use its own identity and a dedicated `--home "$VERIFY_RUN_DIR/data/flow-home"` on every Flow command. Preserve its export and stop only that owned host after the drive.

Create one new Git fixture per row. Set `F` to its absolute path, then run `git init -q "$F"`. Set `A` to the row's ADR directory and `C` to its domain config directory:

| Case | `A` | `C` |
|---|---|---|
| Standard | `$F/docs/adr` | `$F/docs/vstack` |
| Private | `$F/.git/vstack/domain/adr` | `$F/.git/vstack/config` |
| Standard context | `$F/src/orders/docs/adr` | `$F/docs/vstack` |
| Private context | `$F/.git/vstack/domain/orders/adr` | `$F/.git/vstack/config` |

For each fixture, create the same evidence with these commands:

```sh
mkdir -p "$A/archive/2026-11-09T0900" "$C" "$F/src"
printf '# Domain docs\n\nRead ADRs in %s.\n' "$A" > "$C/domain.md"
printf '# Retain the offline queue\n\nOrders remain queued during outages.\n' > "$A/0001-offline-queue.md"
printf '# Acknowledge local writes\n\nA local durable write acknowledges enqueueing.\n' > "$A/0002-local-ack.md"
printf '# Keep queue entries private\n\nQueue entries stay on this device.\n' > "$A/0003-private-queue.md"
printf '> Archived on 2026-11-09T0900. No part holds: the serial vendor protocol was retired.\n\n# Serial queue constraint\n\nThe first queue sent one order at a time because the vendor serial protocol could not distinguish simultaneous acknowledgements.\n' > "$A/archive/2026-11-09T0900/0004-serial-queue.md"
printf 'export const historicalQueueLimit = 1;\n' > "$F/src/queue.ts"
git -C "$F" add .
git -C "$F" -c user.name=Verifier -c user.email=verifier@example.invalid commit -qm 'Add queue fixture'
```

For each context case, also write a `GLOSSARY-MAP.md` at the domain root. Point it to an Orders glossary alongside the selected context's ADR directory, and name that directory in the glossary. In Private mode the domain root is `$F/.git/vstack/domain/`. In Standard mode it is `$F`. Keep system-wide and context-scoped directories distinct.

1. Start the fresh session in `F`. Ask `/skill:why Why did the original queue send one order at a time? Investigate the local repository only.` Do not name the archive or reveal the expected rationale in the prompt.
2. Retain the answer and the source reads. Require a citation to `A/archive/2026-11-09T0900/0004-serial-queue.md` and the vendor acknowledgement rationale. The answer must treat the retired serial constraint as history, not as a current rule. Missing Code host or tracker config is a reported gap, not a reason to omit local ADR evidence. Save the answer and its actual cited lines as `aah-why-<case>.md`.
3. In the same fixture, ask `Use domain-modeling to record this accepted decision in this context's ADR directory: retain queued orders for seven days because devices must complete week-long offline expeditions. We reject a hosted queue because devices have no network during those expeditions. Write the ADR; do not change application code.` Name the context for the context cases. Do not supply a filename.
4. Save the resulting file inventory and new ADR. Require exactly one new `YYYYMMDD-slug.md` ADR inside `A`, using its local creation date and a stem unused by active ADRs and ADRs recursively under `archive/`. Existing `0001` through `0003` remain active and `0004` remains at its run-time path with its original bytes. Check the new ADR records the supplied decision and rationale. Require any new citation to use its full stem. A proposed filename without a written ADR does not pass. Save the inventory and before/after bytes as `aah-number-<case>.json`. For a collision probe, seed a dated archived ADR with the proposed stem before creation and require a different slug without changing that archive file.
5. For a Private fixture, add a separate tracked `docs/adr/archive/2026-11-09T0900/0007-device-limit.md` with a different historical rationale. Ask a new why question about that decision and require a citation to the tracked archive. This proves Private mode also reads the repo's own domain docs. Neither that number nor its neighboring directory determines the new private filename.
6. Run `bun test --timeout 30000 tests/setup-vstack-migration.test.ts` from `CHECKOUT` and retain its output. Its fixture projects cover Private copy and legacy private-store Migration, including archive paths and preserved hand edits. For fresh setup proof, drive `/skill:setup-vstack` in a separate empty fixture through its draft step. Check the actual Standard and Private domain drafts name `archive/<date>T<HHMM>/` inside their ADR directories, with a new run-time folder per run and refusal of existing destinations. Confirm writes only through the real setup approval, or report the draft-only limit. Retain the drafts and transcript, not an assertion on the skill's wording.
7. Record each case, commands, source reads, written ADR, and outcome in `$VERIFY_RUN_DIR/notes.md`. Preserve failures and unavailable cases. Copy evidence out of `data/` before the Verify skill's Cleanup. Close and stop only the fixture's own Flow resources when used.

## Gotchas

- A stub answer that cites `0004` proves no search behavior. Use actual source reads and the final historical explanation.
- Do not put the vendor acknowledgement rationale in an active ADR, application comment, commit title, or question. It must be discoverable only in the archive.
- Each new stem must be unused in its own ADR directory and recursive archive. A neighboring context's stems do not create clashes.
- The fixture does not evaluate clean-adr's judgments or large-project search quality. Its archive is already populated.
- Do not report a live setup approval without a real recorded answer. No Headless recommendation grants consent.
