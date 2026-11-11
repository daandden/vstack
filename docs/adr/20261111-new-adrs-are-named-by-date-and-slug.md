# New ADRs are named by date and slug

The user chose this in the `vstack-session-health-review-fa87f3` grill. Numbering a new ADR by scanning for the highest number and adding one made parallel branches pick the same number: seven of 50 reviewed sessions renumbered an ADR, main renumbered five ADRs to 0067–0071 in commit `2b607cf0`, and two ADRs both carry 0065 today. Each renumbering left published Flow pages, specs, and tickets citing the old number.

A new ADR is named `YYYYMMDD-slug.md` from the local date on the day it is created and is never renamed, even when its branch lands later. Existing numbered ADRs keep their names, including both 0065 files, which are cited by their full file names. Text cites a new ADR by its full stem, such as `ADR 20261111-new-adrs-are-named-by-date-and-slug`. When two branches create the same date and slug, the branch that lands second picks a different slug before it lands. A check requires new ADR files to use this form and refuses any new duplicate legacy number, while accepting the existing duplicate.

This changes `domain-modeling`'s ADR-FORMAT.md, which stays an adapt row of the Decision register. It applies to new ADRs in every project that uses the plugin. No project renames existing ADRs.

## Alternatives rejected

- Assign the number when the PR lands. Flow pages and tickets published before landing would still cite a draft name.
- Keep numbers and add only a duplicate-number check. Renames would still happen after references exist.
- Cite by slug alone or by a short random id. A slug can repeat across days, and an id needs a lookup to mean anything.
- Add a random suffix to every name, or reserve names on main. Both burden every ADR to prevent a clash that needs the same day and slug.
- UTC dates. vstack has one maintainer, whose local date is the one they recognize.
