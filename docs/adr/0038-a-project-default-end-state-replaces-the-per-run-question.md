# A project default End state replaces the per-run question

implement, implement-spec, and hillclimb asked for the End state on every run whose prompt and ticket named none. Users who always want the same End state in a project typed it into every prompt or answered the same question each time. So `code-host.md` now holds the project's default End state as one project fact, and step 0a takes it when the prompt and ticket name none. The configs still cap it, and the run says which End state it took before work. Shipped lets the chain merge into the default branch, so the default is a choice that the user makes once per project in setup-vstack. Setup recommends shipped in Standard mode and commit in Private mode.

## Considered Options

- A default by mode with no question: Standard mode would ship and Private mode would commit. Mode says where vstack keeps its config, not whether the user may merge, so every Standard-mode team repo would merge to main from a prompt that named no End state. The mode survives only as setup's recommendation.
- A sixth config file for the default: a setup re-run would find it as a missing file, but it adds a one-line file to setup, Migration, and Private mode. The End states past commit already need `code-host.md`, so the fact lives there.
- A `ci.md` fact: PRs and merges belong to the Code host, not the CI service.

## Consequences

- A project with no default in `code-host.md`, every project set up before this ADR included, still gets today's question, with commit recommended.
- A setup-vstack re-run reports a `code-host.md` that has no default End state, asks only that question, and adds the line after confirmation. Like the CI cutover in [ADR 0034](0034-the-ci-service-is-its-own-config.md), it edits an existing `code-host.md`.
- A Headless run ignores the project default and takes commit unless its prompt names an End state, so a test run never publishes by default.
