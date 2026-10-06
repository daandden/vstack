# House style touches adopt items only through required rows

The House style lives in the root `house-style.yaml`. Each replacement row has a scope. A `required` row covers renames and config paths. Every shipped artifact must follow it, so an adopt item that contains its Upstream phrase fails `check-register.ts`, and the Update proposes switching that item to adapt. An `adapted` row covers omp phrasing. It applies only to adapt, merge, and original text, so adopt items keep their Upstream wording. Adopted Matt skills therefore keep saying `/grilling`, while adapted text says `skill://grilling`. The two forms coexist on purpose. `scripts/update-plan.ts` runs every row the Update uses over both Upstream sides (`effectiveOld` and the new Pin) before `git merge-file`. New Upstream text then arrives already substituted, and the merge base matches the vstack text. The agent applies only the judgment rules: the Fan-out block, the single spawn, and skill references. We chose this so that ADR 0001's hash check on adopt items survives a growing House style, and so that substitutions come out the same on every Update.

## Considered Options

- **One scope: every row applies everywhere**: rejected. A single phrasing row, such as `/grilling` → `skill://grilling`, would switch grill-me, grill-with-docs, and other adopt items to adapt for wording alone.
- **A per-row list of items**: rejected. The lists go stale whenever an Upstream adds an item.
- **The agent applies rows after `git merge-file`**, as first written in "Define the `vstack update` flow end to end": rejected. The result would vary between runs, and every Upstream edit next to a substituted line would become a conflict.

## Consequences

- A new `required` row switches every adopt item that contains its phrase to adapt. This automates the rename cascade.
- `check-register.ts` fails when an artifact contains the Upstream phrase of a row in scope. For adapt, merge, and original text, it also fails on a bare `/<vstack-skill>` token and on Upstream spawn wording outside a Fan-out block or a single-spawn line.
- Migration-only rows (`uses: [migration]`) never run on Upstream text. setup-vstack ships a filtered copy, `references/house-style.yaml`. That copy is the canonical replacement data, and it has to contain every `from`, so the old-phrase scan skips it. `check-register.ts` instead validates the copy's schema and fails unless it matches the `uses: migration` rows of the root file exactly. setup-vstack's other text refers to old phrases only by pointing at that file, so the lint needs no other exemption.
