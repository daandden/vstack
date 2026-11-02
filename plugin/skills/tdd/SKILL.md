---
name: tdd
description: Test-driven development. Use when the user wants to build features or fix bugs test-first, mentions "red-green-refactor", or wants integration tests.
---

# Test-Driven Development

TDD is the red → green loop. This skill is the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns, and the rules of the loop. Every section applies on every cycle: consult them before and during the loop, not after.

When exploring the codebase, read `GLOSSARY.md` (if it exists) so test names and interface vocabulary match the project's domain language, and respect ADRs in the area you're touching.

## What a good test is

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists, and it survives refactors because it doesn't care about internal structure.

See [tests.md](tests.md) for examples and [mocking.md](mocking.md) for mocking guidelines.

## Seams: where tests go

A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals.

**Test only at pre-agreed seams.** Reuse a seam confirmed by the spec, ticket, or the user's own answer. For missing seams, write down the proposed boundaries and confirm them through one question before writing any test there. When bound to a Flow, use `flow_ask` under `skill://flow-page`'s "Every ask in a Flow" contract in the owning producer's Stage. Outside a Flow, a reference-only helper uses the existing omp-tools `ask` override. No test is written at an unconfirmed seam. Agreeing the seams up front puts testing effort on the critical paths and complex logic instead of every edge case.

Use this question: "What's the public interface, and which seams should we test?" Cover every missing seam in that one question, reusing the caller's seam question rather than asking a second time. A timed-out answer is not the user's, so the seam stays unconfirmed. Cancellation, a headless recommendation, or an unavailable picker also leaves it unconfirmed.

Follow `skill://flow-page`'s "Stage entry/exit line" for a standalone result-producing tdd run. A test cycle within implement or implement-spec is part of that existing run. Reuse seams already confirmed by the spec, ticket, or user. Ask only about a missing seam.

When the shape of that interface is itself in question (how deep the module is, where the seam belongs, what the interface should expose), use `skill://codebase-design` for the vocabulary. It is the shared source of the module, interface, depth, seam, adapter, leverage and locality terms, and it is a reference to consult, not a session to run.

## Anti-patterns

- **Implementation-coupled**: mocks internal collaborators, tests private methods, or verifies through a side channel (querying the database instead of using the interface). The tell: the test breaks when you refactor but behavior hasn't changed.
- **Tautological**: the assertion recomputes the expected value the way the code does (`expect(add(a, b)).toBe(a + b)`, a snapshot derived by hand the same way, a constant asserted equal to itself), so it passes by construction and can never disagree with the code. Expected values must come from an independent source of truth: a known-good literal, a worked example, the spec.
- **Horizontal slicing**: writing all tests first, then all implementation. Bulk tests verify _imagined_ behavior: you test the _shape_ of things rather than user-facing behavior, the tests go insensitive to real changes, and you commit to test structure before understanding the implementation. Work in **vertical slices** instead: one test → one implementation → repeat, each test a **tracer bullet** that responds to what the last cycle taught you.

## Rules of the loop

- **Red before green.** Write the failing test first, then only enough code to pass it. Don't anticipate future tests or add speculative features.
- **One slice at a time.** One seam, one test, one minimal implementation per cycle.
- **Refactoring is not part of the loop.** It belongs to the review stage (see `skill://code-review`), not the red → green implementation cycle.

## Record the loop

Follow skill://implement/END-STATE.md's "Publish delivery progress" in the caller's Stage, or the standalone tdd Stage. Append red then green commands and observed outcomes to its Timeline, attach the captured outputs, and record checks against the tested revision. State a missing red, unconfirmed seam, skipped check, or unavailable live proof explicitly. A green test reaches no delivery End state.
