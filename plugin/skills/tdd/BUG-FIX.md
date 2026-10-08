# Fixing a bug test-first

Use this when the cause of the bug is known and a cheap repro exists. When the cause is unknown, run `skill://diagnosing-bugs` instead.

The goal is one focused regression test that fails before the fix and passes after it.

## Steps

1. Understand the bug. Write down the intended behavior, the current behavior, the affected path, and the smallest repro you can observe.
2. Choose the narrowest check at an agreed seam. Prefer the kind of test the project already uses for that code path: unit, component, integration, or regression.
3. Write the failing test first. Make it the smallest test that would have caught the bug. It encodes the intended behavior, not the current implementation.
4. Run the new test before the fix. Confirm that it fails for the intended reason. If it passes, or fails for some other reason, correct the test or the repro before you edit the code.
5. Fix the bug. Make the smallest production change that gives the intended behavior and keeps the nearby contracts.
6. Run the test again and confirm that it passes.

## No practical failing test

Some bugs have no practical test: the test would need a broad harness, brittle mocks, slow end-to-end setup, or state that only exists in production.

- A targeted script, a repro command, or a browser check can take the place of the test, but only at a seam the user agreed through `ask`. It still has to fail before the fix and pass after it.
- When nobody can agree a seam (for example, the user is away), the slice stops. Leave its changes uncommitted. The reply says that the red evidence is missing, why, and that the End state is capped at commit.

## Guardrails

- Keep the test focused on this bug. Avoid broad fixture churn and coverage of unrelated code.
- For a flaky bug, make the test deterministic, and write down which signal the test locks down.
- When the bug shows a wider class of failures, land the focused test first. Add tests for the sibling cases after it.

## Reply

Report the evidence, not only the outcome:

- The failing-before test or check, and the failure it gave.
- The passing-after run, and any nearby checks you ran.
- Or: why the red evidence is missing, and that the End state is capped at commit.
