---
status: accepted
---

# clean-wt skips byte proof for listed generated ignored content

clean-wt used to keep every ignored file of an unused checkout only as a preserved copy when the source checkout held the same bytes, so names proved nothing. On 2026-11-24 an inventory of 62 unused checkouts read 155.6 GB and classified 53 of them dirty. About 40 minutes later, `git status` without `--ignored` showed 43 of those 53 as clean. Their discovery reads summed to 131.3 GB, and their most common ignored names were `node_modules`, build output, caches, IDE metadata, and `.DS_Store`. That retrospective cross-check suggests generated content drove most of the cost, but the run did not record which ignored paths made each checkout dirty. The maintainer chose to treat ignored paths on a fixed list of generated names as disposable. clean-wt neither reads nor compares them, and they never make a checkout dirty. Every other ignored file keeps the byte proof, and tracked work, untracked work, history, owners, and snapshots keep their guards.

## Considered Options

- Keep byte proof for every ignored file. Rejected: it made cleanup slow and sent most unused checkouts to a picker question.

## Consequences

A hand edit inside a listed folder, such as a debugging change in `node_modules` or a one-off build artifact, is deleted without proof or a question. The list is part of clean-wt's published contract and changes only through an edit to it.
