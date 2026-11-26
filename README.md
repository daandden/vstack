# vstack

A personal omp plugin built on Matt Pocock's skills, with selected additions from pstack, good-css, Emil Kowalski's UI guidance, and Vercel Labs' UI SDK.

`/skill:grill-with-docs` traces the systems each change touches and sketches two shapes at the level of owners, modules, and contracts. For a large or contested design, it starts `compare-attempts` automatically and brings the synthesis to the design question. If only one shape is viable, the second sketch shows why and is not offered as a choice.

After you explicitly agree, `grill-with-docs` records the direction and trade-offs in an Architecture brief on the Flow, then continues into `/skill:to-spec` in the same turn under [ADR 0067](docs/adr/0067-grill-with-docs-continues-into-to-spec.md). An unanswered question or automatic pick is not consent. The chain stops at the spec. Implementing agents retain signatures and coding details within the agreed guarantees.

## Install

You need omp, Bun, git, and working HTTPS credentials for github.com. This repo is private.

1. Clone the repo: `git clone https://github.com/daandden/vstack.git`.
2. In the clone, run `bun install --frozen-lockfile`.
3. Link the plugin: `omp plugin link <clone>/plugin`.
4. Start a new omp session.
5. Run `/skill:setup-vstack` to configure the machine and project.

The Flow reader ships prebuilt under `plugin/skills/flow-page/reader/`. Installation needs no reader build.

The package also ships the `vstack-flow` Tern window plugin at `plugin/tern/vstack-flow`. To link it, run `tern plugin link <clone>/plugin/tern/vstack-flow`. A Cmd-click on a local Flow link opens its page beside the opener pane or navigates the tab's open page of that Flow. Cmd+Option-click and other web links keep Tern's own behavior. The link points into vstack, so updates need no separate plugin copy.

Each Tern tab's existing Flow page follows its most recently focused omp session, switching to that session's bound Stage or newly asked question. Focusing the page or a non-omp pane keeps the selection. Following never opens a page or moves another tab's page. The plugin needs `bun` and `tern` on the login shell's PATH. Multiple conversations inside one ACP pane do not follow.

After vstack ships this plugin, remove the old `vstack-flow/` directory, README row, AGENTS.md section, and Verify recipe from `daandden/tern-plugins` in a separate change.

Setup handles existing Matt configurations through Migration. See the [setup guide](plugin/skills/setup-vstack/SKILL.md) for configuration, CI, and optional capabilities.

To update, run `git pull` and `bun install --frozen-lockfile` in the clone, then start a new omp session.

After the update, the running Local Flow host replaces itself. It keeps serving the last good version until the updated version starts, and Flow links stay the same. An incomplete or failing update leaves the last good version serving. Open Flow pages reload to the new reader and keep unsent Reader comments and the reading position.

A host started by a vstack version from before this behavior cannot replace itself. If it reports an incompatible reader after the update, stop it with `bun plugin/skills/flow-page/scripts/flow-page.ts host stop`. The next Flow command starts the updated host on the same links.

## Use

Start a change with `/skill:grill-with-docs` if you want to agree a design and continue into a spec in the same turn. Use `/skill:grill-me` for an interview that stops at the summary. With `/skill:grill-me`, use your next prompt to confirm the summary or push back, then start the next skill yourself.

Choose how to proceed:

- One session: `/skill:implement`.
- Multiple sessions: start `/skill:to-spec` if you don't already have a spec, then run `/skill:to-tickets` and `/skill:implement-spec`.

The [Flow page](plugin/skills/flow-page/SKILL.md) keeps questions, answers, results, and delivery progress in one first-publication sequence across sessions. Answers and revisions stay in place; unprovable historical order has its own boundary. The reader requires the Local Flow host, with no static fallback. While a bound main-agent question picker is open in the interactive TUI, the extension shows a Flow panel above the composer with the clickable live link. If the host is unavailable, the panel shows the error and the picker still opens. Completion summaries do not repeat the link.

In Tern, run `/vstack-clean [age]` to open the Scratch cleanup popup over your pane. It lists expired Scratch entries, all unticked; Delete asks once more before anything goes. The default age is `15d`. Deletion handles read-only snapshot directories without following symlinks, and open Flows stay protected. Outside Tern, or without the `vstack-clean` Tern plugin that `/skill:setup-vstack` links, the Command deletes nothing. The popup runs cleanup through the login shell, so `bun` must be on the login shell's PATH; a version manager activated only in `.zshrc` does not count. See the [Scratch guide](plugin/skills/vstack-tmp/SKILL.md).

Use `/skill:web-fullstack <task>` for frontend library choice or requested Vue and Nuxt setup and deployment, including fullstack Nuxt on Cloudflare Workers with Static Assets. It checks the target app and keeps suitable installed solutions. Advice is read-only. Frontend-only Vue with Vite stays supported. Fullstack uses Nuxt server routes and NuxtHub D1, with KV or R2 only when needed. Apps needing sign-in use Better Auth through `@nuxtjs/better-auth`; other apps get no auth library. Bun applies only without an existing or requested manager. Setup proves local D1 in Nuxt dev and built `wrangler dev`, including the requested sign-in flow, then writes a deploy checklist. It makes no Cloudflare account request. Deploys run only on explicit request, from your machine to one production Worker, with account and per-step confirmation. Auth apps require the live origin as Worker runtime `NUXT_PUBLIC_SITE_URL`, followed by a read-only live auth check. Secret values go directly into your private Wrangler terminal prompt, never chat or the Flow. Cloudflare is the only curated host. The [curated choices](plugin/skills/web-fullstack/references/choices.md), [auth recipe](plugin/skills/web-fullstack/references/auth.md), and [Cloudflare deploy procedure](plugin/skills/web-fullstack/references/cloudflare-deploy.md) describe the scope.

When native or installed controls are not enough, web-fullstack recommends UI SDK for keyboard, focus, and ARIA behavior. The [UnoCSS recipe](plugin/skills/web-fullstack/references/unocss-controls.md) styles those controls with the app's tokens and keeps its local icon artwork.

The twelve Emil-derived skills are visible Utility skills. They can load by description in any session or by name, without Addon judge selection. Their guidance takes precedence over good-css for CSS and animation under [ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css](docs/adr/0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css.md). [Choreograph](plugin/skills/choreograph/SKILL.md) coordinates several moving elements; [gestures](plugin/skills/gestures/SKILL.md) covers direct manipulation and suggests Vaul only when the project already depends on it.

Use the [ui-sdk Utility skill](plugin/skills/ui-sdk/SKILL.md) when a project has `@ui-sdk/*` installed or the task names UI SDK. You can also start it with `/skill:ui-sdk`. It covers composing UI SDK controls, building missing components from core behaviors, and making each interface usable by agents. It uses the installed package docs for API details and leaves general test and proof decisions to the running workflow.

Use the [open-pencil Utility skill](plugin/skills/open-pencil/SKILL.md) to work on named documents, pages, and frames through your existing OpenPencil MCP server. Start it with `/skill:open-pencil` or name OpenPencil in your request. It maps design intent to the project's UI SDK components and tokens. After you agree to the frames, the skill keeps the agreed `.fig` in PikPak as a Design baseline. The spec records the file ID, SHA-256, frame node IDs, and required behaviors and tokens. Handoff, implementation, and verification use one PikPak token. Implementation and verification fetch and check the exact bytes without opening the live document.

Frontend implementation and delegated UI workers can reach [emil-design-eng](plugin/skills/emil-design-eng/SKILL.md), [apple-design](plugin/skills/apple-design/SKILL.md), [mobile-native](plugin/skills/mobile-native/SKILL.md), and [break-ui](plugin/skills/break-ui/SKILL.md) through their descriptions. Apple-derived guidance applies to web interactions, and mobile-native covers mobile web, not Expo or Swift. Break-ui supplies realistic adverse-content cases to existing implementation and Verify owners, not another executor. Motion construction uses [animate](plugin/skills/animate/SKILL.md); driver choices and stutter diagnosis use [animation-performance](plugin/skills/animation-performance/SKILL.md). Existing code review and delegated Standards reviewers also reach [review-animations](plugin/skills/review-animations/SKILL.md) for motion changes. Evidence-backed motion defects can block approval; browser-supported exceptions need applicable evidence rather than a blanket property ban. The [maintainer guide](docs/maintainer.md#ui-upstream) records all twelve shipped adaptations and six exclusions.

Read-only motion audits reach [improve-animations](plugin/skills/improve-animations/SKILL.md), while [find-animation-opportunities](plugin/skills/find-animation-opportunities/SKILL.md) distinguishes useful additions from rejected candidates. The current grill or planning owner obtains explicit selection in the existing Flow. Selected subtraction uses [remove-animations](plugin/skills/remove-animations/SKILL.md) through the normal implementation and motion-review path, with visibility, callbacks, unmount, focus, and dependency approval preserved. No separate animation executor or plan-status system is added.

[Interrogate](plugin/skills/interrogate/SKILL.md) runs adversaries in isolated clones on the Session model and keeps only failures the coordinator independently reproduces. It reports findings without fixes and does not replace code-review or the final Verifier.

## Documentation

- [Maintainer guide](docs/maintainer.md): layout, checks, Upstreams, Updates, and versioning.
- [Glossary](GLOSSARY.md): skill kinds and project terminology.
- [Architecture decisions](docs/adr/).
- [LLM-flow improvement](plugin/skills/tune-llm-flow/SKILL.md).
- [Changelog](CHANGELOG.md).
