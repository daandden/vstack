# vstack

A personal omp plugin built on Matt Pocock's skills, with selected additions from pstack, good-css, and Emil Kowalski's UI guidance.

## Install

You need omp, Bun, git, and working HTTPS credentials for github.com. This repo is private.

1. Clone the repo: `git clone https://github.com/daandden/vstack.git`.
2. In the clone, run `bun install --frozen-lockfile`.
3. Link the plugin: `omp plugin link <clone>/plugin`.
4. Start a new omp session.
5. Run `/skill:setup-vstack` to configure the machine and project.

Setup handles existing Matt configurations through Migration. See the [setup guide](plugin/skills/setup-vstack/SKILL.md) for configuration, CI, and optional capabilities.

To update, run `git pull` and `bun install --frozen-lockfile` in the clone, then start a new omp session.

## Use

Start a change with `/skill:grill-with-docs` or `/skill:grill-me`. Confirm the grill's summary in your next prompt, or push back to revise it. Then choose the path:

- One session: `/skill:implement`.
- Multiple sessions: `/skill:to-spec`, `/skill:to-tickets`, then `/skill:implement-spec`.

The [Flow page](plugin/skills/flow-page/SKILL.md) keeps questions, answers, results, and delivery progress together across sessions. omp displays its link after replies when the session has a bound Flow.

Run `/vstack-clean [age]` to preview expired Scratch entries. The default is `90d`. Deletion requires UI confirmation. Open Flows stay protected. See the [Scratch guide](plugin/skills/vstack-tmp/SKILL.md).

Frontend implementation and delegated UI workers reach [emil-design-eng](plugin/skills/emil-design-eng/SKILL.md), [apple-design](plugin/skills/apple-design/SKILL.md), [mobile-native](plugin/skills/mobile-native/SKILL.md), and [break-ui](plugin/skills/break-ui/SKILL.md) conditionally through good-css. Apple-derived guidance applies to web interactions, and mobile-native covers mobile web, not Expo or Swift. Break-ui supplies realistic adverse-content cases to the existing implementation and Verify owners, not another executor. Motion construction reaches [animate](plugin/skills/animate/SKILL.md), while performance choices and stutter diagnosis reach [animation-performance](plugin/skills/animation-performance/SKILL.md) through good-css and diagnosing-bugs. Existing code review and delegated Standards reviewers also reach [review-animations](plugin/skills/review-animations/SKILL.md) for motion changes. Evidence-backed motion defects can block approval; browser-supported exceptions need applicable evidence rather than a blanket property ban. No extra UI command is needed. Other selected guidance remains deferred to its owning ticket. The [maintainer guide](docs/maintainer.md#ui-upstream) records the shipped subset and exclusions.

## Documentation

- [Maintainer guide](docs/maintainer.md): layout, checks, Upstreams, Updates, and versioning.
- [Glossary](GLOSSARY.md): skill kinds and project terminology.
- [Architecture decisions](docs/adr/).
- [LLM-flow improvement](plugin/skills/tune-llm-flow/SKILL.md).
- [Changelog](CHANGELOG.md).
