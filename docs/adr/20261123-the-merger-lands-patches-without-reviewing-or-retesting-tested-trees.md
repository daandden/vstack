# The Merger lands patches without reviewing them or retesting tested trees

The user chose this in the `merger-stops-reviewing-code-e870da` grill. Across 367 implement-spec Merger runs from the 46 most recent sessions, checks and waiting on them took about 32 of 53 active hours. Reading the patch, source, ticket, and spec took about 13 hours. 68 runs loaded the code-review skill, and some reported findings or rewrote patch text. Only one Merger runs at a time, and no implementer starts while it runs, so every Merger minute delays the next ticket. code-review already reviews the whole integration diff once in implement-spec step 7.

A dedicated `vstack-merger` agent now carries the Merger's contract. Beyond the vstack root and Scratch dir that every vstack subagent prompt carries, the orchestrator passes only the Merger's own slots: the ticket or review-fix wave, the patch path, the integration branch, the implementer's base SHA, and the implementer's reported changed paths and evidence path, which the scope guard and proof reuse below need. Like every vstack agent it has no `model` field, so it runs on the Session model unless the user sets `task.agentModelOverrides` for it (ADR 0004). The Merger judges scope by file paths only. It compares the patch's paths with the implementer's reported changed paths before it applies, and the staged paths with the patch's paths before it commits. It reads the ticket and the spec only to resolve a conflict, and it never reviews content, loads code-review, or reports findings.

The Merger skips checks only on the exact tree that passed. An implementer or review fixer records the git tree id of the tree its passing typecheck and tests ran on, together with that passing evidence. After applying, the Merger compares that recorded id with the tree id of its staged index. When they match, the staged tree is the tested tree, so the Merger cites that proof and commits without rerunning checks. A missing id, a mismatch, missing passing proof, or a resolved conflict makes it run typechecking and the ticket's own tests, never full suites, E2E runs, or Verify gates. The same base and a clean apply do not prove a tested tree. For example, a worker on base B passes its tests on tree T1, then edits a file without rerunning, so its patch yields tree T2. The patch applies cleanly onto B, but T2 differs from T1, so the Merger runs its checks. The review-fix landing in step 7 uses the same agent and rules but leaves its hunks staged for shared step 6. This amends ADR 0022.

## Considered Options

- Keep reading the hunks for scope but forbid review: rejected, because reading the hunks is the expensive part.
- Run typechecking and the ticket's own tests on every merge: rejected, because a rerun on a tree identical to one that already passed repeats captured proof.
- Skip checks whenever the integration tip equals the worker's base and the apply is clean: rejected, because the worker can change files after its passing run, so that condition does not identify the tested tree.
- Keep `vstack-worker` and pass a fixed brief file verbatim: rejected. The worker would still see the general worker prompt, and the Merger could not take its own model override.

## Consequences

- An integration commit can land on the implementer's proof alone. An environment difference between the Isolated clone and the Shared checkout, or a flaky test, surfaces only at shared steps 4 and 6b, which still check the whole branch after the last merge.
- Off-ticket content inside the ticket's own files lands and is caught by step 7's review.
