# vstack

A personal omp plugin built on Matt Pocock's skills, with selected additions from pstack and good-css.

`/skill:grill-with-docs` assesses each change for consequential unsettled architecture choices before implementation commits to them. It reuses applicable decisions and patterns when their assumptions still hold. A routine change gets a brief grounded reason, not a mandatory diagram or new design document. An open choice gets proportionate visual alternatives, screened trade-offs, and a recommendation through the existing grill. The Architecture brief records the actual agreement in Flow Results, with responsibilities, interactions, guarantees, constraints, and rationale. Recommendations and unanswered or automatic picks are not your consent.

The grill stops at shared understanding. It creates no source scaffold, starts no next skill, and publishes no spec automatically. You invoke `/skill:to-spec` to synthesize a larger change into a self-contained canonical spec with the necessary agreed visuals. A newly discovered consequential fork holds affected synthesis for user-invoked grilling rather than silently choosing an architecture. Implementing agents retain signatures and coding details within the agreed guarantees.

## Install

You need omp, Bun, git, and working HTTPS credentials for github.com. This repo is private.

1. Clone the repo: `git clone https://github.com/daandden/vstack.git`.
2. In the clone, run `bun install --frozen-lockfile`.
3. Link the plugin: `omp plugin link <clone>/plugin`.
4. Start a new omp session.
5. Run `/skill:setup-vstack` to configure the machine and project.

The Flow reader ships prebuilt under `plugin/skills/flow-page/reader/`. Installation needs no reader build.

Setup handles existing Matt configurations through Migration. See the [setup guide](plugin/skills/setup-vstack/SKILL.md) for configuration, CI, and optional capabilities.

To update, run `git pull` and `bun install --frozen-lockfile` in the clone, then start a new omp session.

If a running Local Flow host reports an incompatible reader after an update, stop that owned host with `bun plugin/skills/flow-page/scripts/flow-page.ts host stop`. The next Flow command starts the refreshed reader.

## Use

Start a change with `/skill:grill-with-docs` or `/skill:grill-me`. Confirm the grill's summary in your next prompt, or push back to revise it. Then choose the path:

- One session: `/skill:implement`.
- Multiple sessions: `/skill:to-spec`, `/skill:to-tickets`, then `/skill:implement-spec`.

The [Flow page](plugin/skills/flow-page/SKILL.md) keeps questions, answers, results, and delivery progress in one first-publication sequence across sessions. Answers and revisions stay in place; unprovable historical order has its own boundary. The reader requires the Local Flow host, with no static fallback. Before each enrolled question round, the agent shows one clickable live link shared by all questions in that call. Completion summaries do not repeat it.

Run `/vstack-clean [age]` to preview expired Scratch entries. The default is `90d`. Deletion requires UI confirmation. Open Flows stay protected. See the [Scratch guide](plugin/skills/vstack-tmp/SKILL.md).

## Documentation

- [Maintainer guide](docs/maintainer.md): layout, checks, Upstreams, Updates, and versioning.
- [Glossary](GLOSSARY.md): skill kinds and project terminology.
- [Architecture decisions](docs/adr/).
- [LLM-flow improvement](plugin/skills/tune-llm-flow/SKILL.md).
- [Changelog](CHANGELOG.md).
