# vstack

A personal omp plugin built on Matt Pocock's skills, with selected additions from pstack, good-css, and Emil Kowalski's UI guidance.

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

The package also ships the `vstack-flow` Tern window plugin at `plugin/tern/vstack-flow`. To link it, run `tern plugin link <clone>/plugin/tern/vstack-flow`. A Cmd-click on a local Flow link opens its page beside the opener pane or navigates the tab's open page of that Flow. Cmd+Option-click and other web links keep Tern's own behavior. The link points into vstack, so updates need no separate plugin copy.

After vstack ships this plugin, remove the old `vstack-flow/` directory, README row, AGENTS.md section, and Verify recipe from `daandden/tern-plugins` in a separate change.

Setup handles existing Matt configurations through Migration. See the [setup guide](plugin/skills/setup-vstack/SKILL.md) for configuration, CI, and optional capabilities.

To update, run `git pull` and `bun install --frozen-lockfile` in the clone, then start a new omp session.

If a running Local Flow host reports an incompatible reader after an update, stop that owned host with `bun plugin/skills/flow-page/scripts/flow-page.ts host stop`. The next Flow command starts the refreshed reader.

## Use

Start a change with `/skill:grill-with-docs` or `/skill:grill-me`. Confirm the grill's summary in your next prompt, or push back to revise it. Then choose the path:

- One session: `/skill:implement`.
- Multiple sessions: `/skill:to-spec`, `/skill:to-tickets`, then `/skill:implement-spec`.

The [Flow page](plugin/skills/flow-page/SKILL.md) keeps questions, answers, results, and delivery progress in one first-publication sequence across sessions. Answers and revisions stay in place; unprovable historical order has its own boundary. The reader requires the Local Flow host, with no static fallback. While a bound main-agent question picker is open in the interactive TUI, the extension shows a Flow panel above the composer with the clickable live link. If the host is unavailable, the panel shows the error and the picker still opens. Completion summaries do not repeat the link.

Run `/vstack-clean [age]` to preview expired Scratch entries. The default is `90d`. Deletion requires UI confirmation. Open Flows stay protected. See the [Scratch guide](plugin/skills/vstack-tmp/SKILL.md).

Frontend implementation and delegated UI workers reach [emil-design-eng](plugin/skills/emil-design-eng/SKILL.md), [apple-design](plugin/skills/apple-design/SKILL.md), [mobile-native](plugin/skills/mobile-native/SKILL.md), and [break-ui](plugin/skills/break-ui/SKILL.md) conditionally through good-css. Apple-derived guidance applies to web interactions, and mobile-native covers mobile web, not Expo or Swift. Break-ui supplies realistic adverse-content cases to the existing implementation and Verify owners, not another executor. Motion construction reaches [animate](plugin/skills/animate/SKILL.md), while performance choices and stutter diagnosis reach [animation-performance](plugin/skills/animation-performance/SKILL.md) through good-css and diagnosing-bugs. Existing code review and delegated Standards reviewers also reach [review-animations](plugin/skills/review-animations/SKILL.md) for motion changes. Evidence-backed motion defects can block approval; browser-supported exceptions need applicable evidence rather than a blanket property ban. No extra UI command is needed. The [maintainer guide](docs/maintainer.md#ui-upstream) records all ten shipped adaptations and the six exclusions.

Read-only motion audits reach [improve-animations](plugin/skills/improve-animations/SKILL.md), while [find-animation-opportunities](plugin/skills/find-animation-opportunities/SKILL.md) distinguishes useful additions from rejected candidates. The current grill or planning owner obtains explicit selection in the existing Flow. Selected subtraction uses [remove-animations](plugin/skills/remove-animations/SKILL.md) through the normal implementation and motion-review path, with visibility, callbacks, unmount, focus, and dependency approval preserved. No separate animation executor or plan-status system is added.

## Documentation

- [Maintainer guide](docs/maintainer.md): layout, checks, Upstreams, Updates, and versioning.
- [Glossary](GLOSSARY.md): skill kinds and project terminology.
- [Architecture decisions](docs/adr/).
- [LLM-flow improvement](plugin/skills/tune-llm-flow/SKILL.md).
- [Changelog](CHANGELOG.md).
