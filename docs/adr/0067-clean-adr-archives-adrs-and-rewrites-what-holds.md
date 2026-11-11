# clean-adr archives ADRs and rewrites what holds

The clean-adr Utility skill moves an ADR into the ADR archive when part of it no longer holds, or when a rewrite merges it with other ADRs. It then writes new ADRs that state only what holds. Active ADRs are the rules that skills respect. The ADR archive is history. Skills read it to learn why, and never as a rule.

ADRs used to stay in place under banner quotes such as "Superseded by ADR 0040" and "the rest still stands". At baseline commit `4de7c8a875d9561f00c81be6f51b299ce3b01134`, 33 of 67 ADRs carried blockquote banners. The earlier count of 28 missed five files. A reader of one decision had to join several files and banners to learn what was true. A reader that takes ADRs as rules also met provisions that no longer applied. Regenerate the total and banner counts with these commands:

```sh
baseline=4de7c8a875d9561f00c81be6f51b299ce3b01134
git ls-tree --name-only "$baseline" docs/adr/ | wc -l
git grep -l '^>' "$baseline" -- 'docs/adr/*.md' | wc -l
```

The archive is `archive/<date>T<HHMM>/` inside the ADR directory that the ADR came from, for example `archive/2026-11-10T1530/`. Each run uses one new run-time folder in each affected ADR directory. A run never reuses an existing folder and refuses an existing destination rather than sharing it. ADR 0067's earlier wording said `archive/<date>/`. Private mode and each context of a multi-context repo use the same layout under their own ADR directory. An archived ADR keeps its text. It gets one banner that names the replacing ADRs, or says that no part holds, and its relative links are repaired.

No ADR number is used twice. A new ADR takes the next number after the highest one in the ADR directory and its archive, and lists the archived ADRs that it replaces. A citation of an archived number that nobody updated finds that ADR only in the archive, and the banner there leads to the replacement. The same citation under reused numbers would point at an unrelated decision.

An ADR that holds completely and needs no merge stays in place with its number, so later runs change only what went stale. Its text changes only where it cites an ADR that the run archives. That citation and its link move to the replacing ADR.

The typed command authorizes the whole run, with no approval question. Scouts judge each ADR against later ADRs and the current project. After the rewrite, scouts that did not write the new ADRs check them twice over. Every archived provision is restated or dropped with a reason, and every new statement is true of the project. The skill fixes what the check finds and checks again, for at most three checks. Problems that remain stay in the result. The skill reports them and marks each affected new ADR with a banner. The skill also changes citations of archived numbers in live text to the replacing ADR. Citations in history, such as CHANGELOG entries and archived ADRs, keep their old numbers, but a link in history to an archived file is retargeted to its place in the run-time archive folder, so the old number still opens the ADR it named. The skill commits nothing.

The always-apply Private-mode rule states what the archive means, because that rule already says where ADRs live and reaches projects whose `domain.md` predates the archive. Only the skills whose behavior changes get edits. why reads the archive, and domain-modeling counts archived numbers.

## Considered options

- Move only fully superseded ADRs. At baseline commit `4de7c8a875d9561f00c81be6f51b299ce3b01134`, the active set would shrink by 4 files of 67 and still hold superseded provisions behind banners. Regenerate the fully superseded count with `git grep -l -E '^> (Superseded by|.*None of this ADR still stands)' 4de7c8a875d9561f00c81be6f51b299ce3b01134 -- 'docs/adr/*.md' | wc -l`. The total uses the `git ls-tree` command above.
- Trim each partly superseded ADR in place and archive its original. One number would name two texts.
- Archive and rewrite every ADR on every run. An ADR that holds would get a reworded copy and a new number each run, and its citations would change each time.
- Restart numbering at 0001 for each new set. Every old citation would point at a different decision without any sign of it.
- A sibling `adr-archive/` directory. No reader of the ADR directory could meet an archived ADR by accident, but every project's `domain.md` would need the second path.
- Approval before the directory changes, once or twice per run. The user chose a run with no questions. In Private mode git does not track ADRs, so the run-time archive folder is the only way back.
- Undo the run when the third check still fails. It discards the passed work for one open row.

## Consequences

- A wrong archive or rewrite lands without review. In Standard mode the change is an uncommitted diff. In Private mode a restore is a manual move out of the run-time folder.
- The checkout investigator agent becomes a general read-only agent named `vstack-scout`. clean-wt and clean-adr both fan out to it. The rename makes the Change note major, and a user's `task.agentModelOverrides.vstack-wt-investigator` setting stops applying until the key is renamed.
- The no-approval run removes questions, not a project's own change process. The domain docs config can list report-only paths. clean-adr reports citations under them and edits the rest. This repo lists `plugin/`, because plugin text changes only as a Hand edit. An isolated `vstack-worker` drafts it and it passes the maintain gates. A project that omits the list gets direct edits everywhere.
