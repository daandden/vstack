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

A seam is an existing public interface where a caller sees the changed behavior. Pick seams yourself, reusing those named by the spec's testing decisions, the ticket, or an earlier record. Prefer an existing seam to a new one, the highest seam that shows the behavior, and as few seams as possible, ideally one. For a bug, use skill://diagnosing-bugs to find where the real bug pattern happens and test there.

Run real code behind the seam. Replace only system boundaries with stand-ins, local before remote, following the dependency categories in skill://codebase-design/DEEPENING.md.

Record every pick with what it catches and misses: an `assumed` item in the owning Stage in a Flow, or a line in chat outside one. The user's pushback reopens that seam.

Ask only before writing a test at a Costly seam. Its test reaches a real service beyond localhost, needs a real credential, account, or paid quota, or its test command runs over 180 seconds, measured on the first run or estimated before writing the test. Ask once through `ask` under skill://flow-page's "Every ask in a Flow" contract, or plain `ask` outside a Flow. Reuse an earlier explicit approval for that costly use. In a subagent, return the costly seam as a question to the coordinator.
Inside implement or implement-spec, END-STATE.md's "Question timing" decides when the Costly seam question is asked.

Without the user's answer, including timeout, cancellation, headless operation, or an unavailable picker, do not use the Costly seam. Test at the best seam that is not costly, or prove the change another way, and name the gap. A first run that reveals the time limit stops further use until approval.

A seam that needs a new production interface, such as a port, an adapter, or an export only tests use, is a consequential architecture departure. Follow skill://implement's "Work within the agreement" rule before introducing it.

Follow skill://flow-page's "Stage entry/exit line" for a standalone result-producing tdd run. A test cycle within implement or implement-spec belongs to that existing run.

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

In a Flow, follow skill://implement/END-STATE.md's "Publish delivery progress" in the caller's Stage, or the standalone tdd Stage. Append red then green commands and observed outcomes to its Timeline, attach the captured outputs, and record checks against the tested revision. Outside a Flow, report the commands and observed outcomes in chat and keep the captured outputs. State a missing red, a Costly seam not used, a skipped check, or unavailable live proof explicitly. A green test reaches no delivery End state.
