# clean-adr archives ADRs and rewrites what holds

The clean-adr Utility skill moves an ADR into the ADR archive when part of it no longer holds, or when a rewrite merges it with other ADRs. It then writes new ADRs that state only what holds. Active ADRs are the rules that skills respect. The ADR archive is history. Skills read it to learn why, and never as a rule.

ADRs used to stay in place under banner quotes such as "Superseded by ADR 0040" and "the rest still stands". At baseline commit `4de7c8a875d9561f00c81be6f51b299ce3b01134`, 33 of 67 ADRs carried blockquote banners. The earlier count of 28 missed five files. A reader of one decision had to join several files and banners to learn what was true. A reader that takes ADRs as rules also met provisions that no longer applied. Regenerate the total and banner counts with these commands:

```sh
baseline=4de7c8a875d9561f00c81be6f51b299ce3b01134
git ls-tree --name-only "$baseline" docs/adr/ | wc -l
git grep -l '^>' "$baseline" -- 'docs/adr/*.md' | wc -l
```

The archive is `archive/<date>T<HHMM>/` inside the ADR directory that the ADR came from, for example `archive/2026-11-10T1530/`. Each run uses one new run-time folder in each affected ADR directory. A run never reuses an existing folder and refuses an existing destination rather than sharing it. This decision's earlier draft said `archive/<date>/`. Private mode and each context of a multi-context repo use the same layout under their own ADR directory. An archived ADR keeps its text. It gets one banner that names the replacing ADRs, or says that no part holds, and its relative links are repaired.

Each replacement uses `YYYYMMDD-slug.md` from the run's local date, following [ADR 20261111-new-adrs-are-named-by-date-and-slug](20261111-new-adrs-are-named-by-date-and-slug.md). Its full stem must be unused by active ADRs and ADRs anywhere under its source directory's archive. A clash needs a different slug. Each replacement lists the archived ADRs it replaces. Archived numbered and dated files keep their names, so old citations still identify the original decision.

An ADR that holds completely and needs no merge stays in place with its name, so later runs change only what went stale. Its text changes only where it cites an ADR that the run archives. A live citation and its link name the replacing ADR by its full stem.

The typed command authorizes the whole run, with no approval question. Scouts judge each ADR against later ADRs and the current project. After the rewrite, scouts that did not write the new ADRs check them twice over. Every archived provision is restated or dropped with a reason, and every new statement is true of the project. The skill fixes what the check finds and checks again, for at most three checks. Problems that remain stay in the result. The skill reports them and marks each affected new ADR with a banner. The skill also changes citations of archived numbers in live text to the replacing ADR. Citations in history, such as CHANGELOG entries and archived ADRs, keep their old numbers, but a link in history to an archived file is retargeted to its place in the run-time archive folder, so the old number still opens the ADR it named. The skill commits nothing.

The always-apply Private-mode rule states what the archive means, because that rule already says where ADRs live and reaches projects whose `domain.md` predates the archive. Only the skills whose behavior changes get edits. why reads the archive as historical evidence, and domain-modeling checks new stems against archived names.

Coverage distinguishes archived provisions from new statements with a required, stable `kind`. An archived provision closes only as restated or dropped with the original judge's evidence-backed reason. A later fix can delete an invented new statement without abandoning an archived decision. Its stable row then closes as `removed`, with its former new ADR paths, verified current-ADR evidence of absence from every new ADR, no problem, and a resolution if previously open. Unknown or unavailable evidence stays open. This avoids relabelling a deleted invention as an abandoned source provision.

Coverage owns claims actually asserted in archived or new ADR text. Runtime, rationale, and acceptance evidence gaps in those claims remain separate open rows. An unasserted question about motivation, history, or comparison is not an additional provision. For example, the written seven-day boundary-delivery rationale needs evidence, but no row asks why seven rather than eight days unless an ADR asserts that comparison.

## Considered options

- Move only fully superseded ADRs. At baseline commit `4de7c8a875d9561f00c81be6f51b299ce3b01134`, the active set would shrink by 4 files of 67 and still hold superseded provisions behind banners. Regenerate the fully superseded count with `git grep -l -E '^> (Superseded by|.*None of this ADR still stands)' 4de7c8a875d9561f00c81be6f51b299ce3b01134 -- 'docs/adr/*.md' | wc -l`. The total uses the `git ls-tree` command above.
- Trim each partly superseded ADR in place and archive its original. One name would identify two texts.
- Archive and rewrite every ADR on every run. An ADR that holds would get a reworded copy and a new name each run, and its citations would change each time.
- Reuse an archived filename for a new decision. Every old citation would point at a different decision without any sign of it.
- A sibling `adr-archive/` directory. No reader of the ADR directory could meet an archived ADR by accident, but every project's `domain.md` would need the second path.
- Approval before the directory changes, once or twice per run. The user chose a run with no questions. In Private mode git does not track ADRs, so the run-time archive folder is the only way back.
- Undo the run when the third check still fails. It discards the passed work for one open row.

## Consequences

- A wrong archive or rewrite lands without review. In Standard mode the change is an uncommitted diff. In Private mode a restore is a manual move out of the run-time folder.
- The checkout investigator agent becomes a general read-only agent named `vstack-scout`. clean-wt and clean-adr both fan out to it. The rename makes the Change note major, and a user's `task.agentModelOverrides.vstack-wt-investigator` setting stops applying until the key is renamed.
- The no-approval run removes questions, not a project's own change process. The domain docs config can list report-only paths. clean-adr reports citations under them and edits the rest. This repo lists `plugin/`, because plugin text changes only as a Hand edit. An isolated `vstack-worker` drafts it and it passes the maintain gates. A project that omits the list gets direct edits everywhere.
