# Initial pinned stack installation

Source transition: uninstalled → Matt `v1.2.3` (`6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`) and pstack approved-SHA exception (`c1c0a32802223f4be824112dd83d33ad29a8b26c`).

Approval: #12 accepts the Matt starting tag. The user explicitly selected “Approve research SHA” for the full pstack SHA during the #13 implementation session on 2026-09-22. This is initial source approval, not blanket approval of future transitions or every upstream workflow.

Classification: approved initial behavioral installation; no automatic-update classification.

- Preserve complete locked stable Matt skill directories and pstack skills as pristine source evidence, with licenses. Exclude root steering, distribution machinery, and out-of-scope source categories from the mirror allowlist.
- Activate the complete Matt wizard only. Apply a minimal source patch for native OMP questions/resource loading and explicit publication/commit permission. Keep its description, template library, and UI metadata.
- Record every approved/pending/dropped family, including all 23 playbooks and excluded source entries. Pending families do not produce placeholders or discovery routes.
- Install a durable per-workspace custom skill directory pointer; preserve unrelated settings and local-only skills.

Rationale and verification: [issue #13 verification](../verification/issue-13.md). OMP discovered and invoked the generated wizard; the emitted script exercised the retained resource twice successfully. Failed regeneration preserved the installed stack and user work. Full sync/update transition machinery remains owned by #15.
