# Repair citations of archived ADRs

Use the archive/rewrite phase's complete original-to-archive-to-replacement link map. Repair citations before independent checks. Keep the citation inventory, proposed changes, applied changes, and report-only rows in the run's existing Scratch entry.

## Read the report-only list

Read the optional line in the project's domain docs config:

```md
- clean-adr report-only paths: ["plugin/"]
```

The value is a JSON array of literal file or directory paths, not globs. Relative paths start at the checkout root, even when the config lives in `<vstack root>/config/`. Absolute paths can name private files. A directory entry includes its descendants, not similarly named sibling directories. An absent line or an empty array means direct citation repair everywhere. Combine lists from the private config and the repo's tracked domain config when both apply. Record malformed or unresolvable entries as a configuration failure and stop citation writes until the list is understood. Do not silently treat an unreadable list as empty or ask a question.

Report-only paths protect citation text and link destinations, not just Markdown links. Leave those files unedited during citation repair. This repo lists `plugin/` because plugin edits require a separate gated Hand edit. Do not run that Hand edit as part of clean-adr.

## Inventory incoming citations

Search all project-owned text for each archived number and original file path. Include live code, skills, agents, rules, config, docs, and every active ADR, including holding ADRs. Include hidden project text directories. In Private mode, search the resolved vstack root's config, domain, artifacts, and skills as well as tracked project text. Search the ADR archive and historical project text for incoming links too. Exclude dependency copies, generated binaries, and unrelated git metadata. Do not rely on git's tracked-file list to discover private citations.

Look for numbered forms such as `ADR 0007`, `ADR-0007`, and filename references, plus links whose label has no number. Cover inline Markdown links and images, reference definitions, HTML destinations, bare paths, and project-hosted URLs. Leave links to unrelated projects alone. A link identifies the ADR directory it targets. Resolve a bare number within its citing context and cited provision, never by a project-wide number substitution. Equal numbers in different contexts or in private and tracked ADR directories name different files.

Record each occurrence's file, line, cited source ADR, live or historical role, old destination when present, and intended target. Classify the passage by its purpose, not just its extension or directory:

- Live passages state or rely on current decisions. Holding ADRs are live too.
- Historical passages record what was decided or shipped at the time. CHANGELOG entries, research notes describing past decisions, and archived ADR bodies keep their old numbers and wording.
- A new ADR's list of archived sources, such as its `Replaces` links, is provenance. Keep those references pointed at the archived originals, not at the new ADR itself.

A file can contain both live and historical passages. Read the surrounding text before choosing a target. If the evidence cannot identify a source or distinguish those roles, retain the occurrence and report the ambiguity with its candidate targets. Do not invent a replacement or claim that citation repair completed for that occurrence.

## Choose each new target

Use these rules for every inventoried occurrence, including ones under report-only paths:

| Passage | Number and wording | Link destination or target for a plain citation |
|---|---|---|
| Live, with a replacement | Name the replacing ADR for the provision being cited. | The replacing ADR. |
| Historical, or explicit archived-source provenance | Keep the old number and historical wording. | The archived file in its run-time folder under `archive/<date>T<HHMM>/`. |
| Live, with no replacement because no part holds | Keep the old number. | The archived file and its retirement banner. Also report this live citation. |

When a source has several replacements, read the cited provision and link the replacement that carries it. If the citation covers several surviving provisions, name and link every relevant replacement. A holding ADR keeps its own number and stays in place; only its affected citations and destinations change. Do not archive the citing ADR merely because one of its citations changed.

For a plain historical citation, change nothing. For a plain live citation with a replacement, update the number even when no link exists. For a plain live citation with no replacement, keep the number and report the archived target. Preserve a link's syntax and query suffix. Keep a historical fragment attached to its original heading. For a live link, map its fragment to the replacement's corresponding provision and verify that heading exists, rather than carrying an obsolete fragment into the replacement. Express relative destinations from the citing file's actual location, using the final link map. Retarget project-local absolute paths and project-hosted URLs in their existing form as well.

## Apply and account for the repair

Finish the occurrence-to-target table before editing. For every occurrence under a report-only path, save a report row with the file, line, old citation or link, intended new ADR number when any, and concrete new target path or URL. State whether that target is a replacement or an archived original. Include plain citations as well as links. Leave the file's bytes unchanged.

Apply the other planned changes without changing unrelated text or user edits. Repair incoming history links even though their old numbered labels stay unchanged. The outgoing links repaired during the archive phase already point at historical destinations; do not redirect those to replacements. Include incoming links from pre-existing run-time archive folders and links between files moved in this run.

Resolve every affected link outside report-only paths from its final citing location. Check that the file exists and any fragment reaches its intended provision. Search again for each original path and archived number. Account for every remaining occurrence as history, explicit provenance, a reported live citation with no replacement, a report-only row, or an unresolved failure. A live citation with a replacement is complete only when its number and link both name the replacement. Record pre-existing broken links separately from failures introduced by this run.

Pass the citation table, report-only rows, live citations with no replacement, unresolved ambiguities, and link-check diagnostics to independent checks and the final report. Citation repair is complete only when every occurrence has an outcome and every affected link outside report-only paths resolves, apart from explicitly recorded pre-existing failures. Keep unresolved rows visible rather than describing the cleanup as complete.
