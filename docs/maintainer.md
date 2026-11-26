# Maintainer guide

[Project overview and installation](../README.md)

## Layout

The repo scripts need Bun. Run `bun run test` and `bun scripts/check-register.ts` before every commit that touches `plugin/`, the register, or the Pins.

| Path | Ships | What it holds |
|---|---|---|
| `plugin/` | yes | The omp plugin. `package.json` (`name: vstack`, the version, the `omp` field), `skills/<name>/` (flat, one level deep; a skill's page templates sit in its `templates/`), `agents/`, `rules/`, and `extensions/vstack.ts`, the one extension, listed in the `omp` field. A skill's Bun scripts ship in its `scripts/` dir. The agent runs them with the bash tool as `bun "$(realpath skill://<name>/scripts/<script>.ts)"`: external programs never see `skill://` paths, and omp's in-process `realpath` turns the URL into the file path. |
| `pins.yaml` | no | One entry per Upstream: repo, Pin, how the next Pin is found, and which tree entries count as Upstream items. |
| `decision-register.yaml` | no | One row per Upstream item, `originals:` for vstack-only artifacts and third-party licenses that belong to no Upstream item, and `utility:` for Utility skills. |
| `house-style.yaml` | no | The House style: replacement rows and rules that turn Upstream text into vstack text. |
| `scripts/` | no | Bun CLIs: `check-register.ts`, `vstack-maintain.ts`, and `addon-judge-check.ts`. `lib/` holds shared modules. `load-smoke.sh` checks a fresh omp load. |
| `addon-questions.json`, `sample-prompts.json`, `sample-briefs.json` | no | The Addon judge catalog and its two sample corpora, read from the linked clone. |
| `.omp/skills/verify-vstack/` | no | The Verify skill, feature recipes, and omp driver. |
| `tests/` | no | Test suites, run with `bun run test`. Each script is run as a process over temp-dir fixtures (`tests/support/`). |
| `.github/workflows/` | no | CI: the tests and `check-register` on every push and pull request. |
| `change-notes/` | no | Pending Change notes, one JSON file per change, with its version level and CHANGELOG entries. |
| `plugin-release.json` | no | The latest Plugin release receipt, with its prepared commit, version, and date. |
| `CHANGELOG.md` | no | Dated Plugin releases. |
| `docs/adr/`, `GLOSSARY.md` | no | Decisions and vocabulary. |

Only `plugin/` ships. Plugin Upstreams are fetched when needed, never stored in this repo. The repo-only reader development skills below are tracked copies.

### Reader development skills

Five repo-only skills live under `.omp/skills/`: `vue-best-practices`, `vue-debug-guides`, `vue-testing-best-practices`, and `create-adaptable-composable` from `vuejs-ai/skills`, and `vueuse-functions` from `vueuse/skills`. `skills-lock.json` records their upstream paths and content hashes. They do not ship in `plugin/` and have no Pin or Decision register row.

The skills CLI 1.7.6 has no `omp` agent target. Its `pi` target installs project skills into `.agents/skills/`. To install the five skills from their upstreams, run these commands from the repo root. The `mv` command moves the five directories into `.omp/skills/`:

```sh
npx --yes skills@1.7.6 add vuejs-ai/skills --skill vue-best-practices vue-debug-guides vue-testing-best-practices create-adaptable-composable --agent pi --copy --yes
npx --yes skills@1.7.6 add vueuse/skills --skill vueuse-functions --agent pi --copy --yes
mv .agents/skills/vue-best-practices .agents/skills/vue-debug-guides .agents/skills/vue-testing-best-practices .agents/skills/create-adaptable-composable .agents/skills/vueuse-functions .omp/skills/
rmdir .agents/skills .agents
```

The skill files are tracked, so a normal checkout already has them. To restore missing skill directories from only the lock file, run this in a clean directory containing `skills-lock.json`:

```sh
npx --yes skills@1.7.6 experimental_install --frozen-lockfile --agent pi
mkdir -p .omp/skills
mv .agents/skills/vue-best-practices .agents/skills/vue-debug-guides .agents/skills/vue-testing-best-practices .agents/skills/create-adaptable-composable .agents/skills/vueuse-functions .omp/skills/
rmdir .agents/skills .agents
```

Frozen restoration refuses upstream content that no longer matches the recorded hash. To update, rerun the relevant `add` command in a clean directory, review the new skill files and lock entry, and replace the corresponding tracked copies together. Keep imported guidance unchanged. Repo-specific runtime and testing decisions still govern the reader.

### Typechecking

Install the development dependencies with `bun install --frozen-lockfile`. Run `bun run typecheck` to check the Bun scripts, plugin TypeScript, tests, Verify helpers, and reader shipping script. It uses `tsconfig.bun.json` and does not depend on Nuxt's generated files.

`@types/bun` supplies Bun APIs and `bun:test`. `@types/node` supplies API declarations such as `node:fs`; it does not require Node.js as the runtime. The compiler commands run through `bun --bun`. TypeScript stays on the 6.0 release line used by the installed Nuxt version, and `vue-tsc` is installed explicitly.

Check the Nuxt reader separately:

```sh
bun run reader:prepare
bun run reader:typecheck
```

`reader:prepare` generates the ignored `reader/.nuxt/` configuration and declarations. `reader:typecheck` runs that preparation itself before checking the reader's project references with `vue-tsc`. Preparation is required after a fresh checkout or a Nuxt configuration change. It does not build or replace the shipped reader bundle.

Both checks exit 0 on a clean tree and return a nonzero exit status for source errors. The Bun check includes the omp extension. The repo pins `@oh-my-pi/pi-ai`, `@oh-my-pi/pi-coding-agent`, and `@oh-my-pi/pi-tui` as exact devDependencies only for their TypeScript declarations. omp still supplies those modules to the extension at runtime, and tests mock them. Keep the pins on the omp version vstack targets. Do not replace them with ambient `any` modules or disable strict checking.

### Tern Flow links

`plugin/tern/vstack-flow/` and `plugin/tern/vstack-clean/` are the separately linked Tern plugins. `/skill:setup-vstack` links both, or run `tern plugin link <installed vstack>/tern/<plugin>` for each. Their Luau source and manifests ship with the omp package. The [Tern routing Verify recipe](../.omp/skills/verify-vstack/features/vstack-flow.md) and the [Scratch cleanup popup recipe](../.omp/skills/verify-vstack/features/vstack-clean.md) drive an isolated Tern instance.

The window plugin claims only local HTTP Flow URLs on `127.0.0.1` or `localhost`, with `/f/<project>/<flow>/<64 hex>/` followed by an optional fragment. User information, queries, and extra path segments stay with Tern. Tern applies `link_click` before calling the route. The route leaves clicks with `mods.alt` to Tern too.

Page reuse matches the URL through the capability segment and stays within the opener's tab. A floating opener uses the tiled pane underneath it. The plugin opens pages with the browser operation `open`, then `release`s them so they do not stay under automation. Tern gives those pages the `agent` website data store. Tern's own page opens use its shared store. `cx.layout:open` is not a substitute because it follows `link_target`, which may open an external browser.

Following remembers the most recently focused omp pane per tab. `targets.ts` runs outside Tern's UI thread, reads that pane's `omp_session_file` from `tern inspect --json`, and uses the session header's id and working directory for the packaged `flow-page.ts target` query. It never associates a pane through inherited `TERN_PANE`. On macOS the plugin starts Bun through `/bin/zsh -lc`; other desktop platforms use the login shell named by `SHELL`.

The window plugin polls selected sessions every 500 ms without overlapping processes. It navigates only on a selected-session change or a new non-null picker token, not on token refresh, picker closure, expiry, or a binding change alone. Browser and non-omp focus preserve selection. Navigation reuses only the matching Flow page in that tab and never focuses it. The reader holds fragment-driven moves while a field has focus and applies the latest move on blur. ACP conversation selection is not observed. The Verify recipe proves the native behavior locally; there is no Luau typecheck or automated Tern test.

Failed polls retain pending pane focus until a poll succeeds. A selected-session transition is acknowledged only after its target query succeeds, so recovery without a picker still reaches the bound Stage.

When the target already equals the page's URL, following dispatches the browser's standard `hashchange` event instead of asking Tern to load that URL again. An exact-URL load reloads the document and discards drafts. Replaying the event lets the reader reselect the question or hold it until blur without adding a reader-specific interface.

### Flow persistence

`plugin/skills/flow-page/scripts/store.ts` owns Flow persistence. The CLI, host, and Scratch cleanup use one Drizzle schema over Bun's built-in SQLite driver. Each project's Scratch dir holds `flow.db`, shared by its worktrees. WAL mode and a ten-second busy timeout allow independent CLI writers while the host reads. Contributions apply to the latest State in an immediate transaction, with revision, title, slug, creation time, and closed time saved alongside its JSON. Aliases, bindings, migration identities, id tombstones, Reader comments, learning progress, and observation context have separate tables. Captured bytes remain content-addressed files under each Flow's asset folder.

Scratch cleanup calls the store's retention listing and deletion operations. Listing reads indexed lifecycle columns from a temporary copy of the database and WAL outside the Scratch home. It leaves legacy JSON in place, and reads it directly when no indexed Flow covers that folder. `clean.ts` owns eligibility, including the 15-day closed-Flow floor. On confirmed deletion the store checks the Flow again, removes its row, files and bindings, and retains aliases, id tombstones, and historical migration identities. Host discovery records and Picker presence are not Flow data.

After confirmed Flow deletions, cleanup compacts each affected project once with `VACUUM` and checkpoints the WAL so `flow.db` shrinks even while a host connection stays open. Listing and runs that delete no Flows do not compact. Concurrent submits wait on the store's busy timeout and then commit. The deterministic compaction-overlap test needs `cc` and SQLite development headers to build its temporary I/O gate, which pauses a real `VACUUM` after it acquires the write lock.

Database opens import remaining JSON Flow folders independently, except for `validate`, which opens committed state read-only. Successful imports preserve identity, revision, reading order, bindings, comments, learning progress, and observation context. State, comment, and learning files are renamed to `*.imported.json` with their bytes unchanged, and are never read as current state again. Bindings import independently of Flow transactions. Each failed import prints one stderr line naming its Flow or binding, source file, and error, and keeps the source for retry without blocking other Flows. `validate` refuses pending JSON imports or schema migrations and tells the caller to run another flow-page command first. It never changes storage or host lifecycle.

Before import in the normal home, the CLI authenticates the running host. An identical runtime version already reads SQLite. For another version it checks the worker's control-authenticated `/.host/storage` route, which older supervisors forward. Only a 404 identifies a JSON-only worker and triggers the one-time authenticated stop under the host lock. Import waits for the listener to close. A failed replacement then reports unavailable, rather than serving frozen JSON. Isolated `--home` hosts are never stopped automatically.

The schema lives in `flow-page/scripts/schema.ts`. Generate migrations with `bun --bun drizzle-kit generate --dialect sqlite --schema ./plugin/skills/flow-page/scripts/schema.ts --out ./plugin/skills/flow-page/scripts/migrations`. Review every generated statement. Automatic migrations are additive forever: new tables, indexes, and nullable or defaulted columns only. Nothing is dropped, renamed, retyped, or newly constrained. The first opener applies pending migrations under one immediate transaction. Older SQLite generations keep reading and writing after newer migrations.

After changing the database source, schema, or Drizzle version, run `bun scripts/build-flow-store.ts`, then reseal the runtime. The generated `database-runtime.js` inlines locked `drizzle-orm` so even a pre-SQLite supervisor copies the dependency within an existing runtime root. `bun scripts/build-flow-store.ts --check` refuses stale output. `drizzle-kit` is a development dependency only. The manifest format and supervisor launch contract are unchanged.

### Flow reader delivery

The reader source and HTTP routes live in one Nuxt project under `reader/`. Nuxt server-renders each authorized Flow's content, then hydrates it for live updates. Browser assets ship under `plugin/skills/flow-page/reader/`, with the self-contained Nitro Bun server at `server/index.mjs` inside that directory. Installation and normal launch require no build or development server.

When reader or server source changes, run `bun run reader:build` and commit its shipped output with the source. `reader/build.ts` generates the compatibility shell, builds the server-rendered app with Nitro's Bun preset, and bundles the server's dependencies into one Bun module. Its resolver handles the file URLs in Nuxt's server output. Private SSR chunks use stable names rather than hashes of absolute external imports, and Nitro's generated plugin and handler identifiers use declaration order rather than absolute-path hashes. The shipped output is byte-identical across checkout paths. Each build uses its own `reader/.nuxt` directory, including isolated candidate builds. The Bun entry preserves the original Request, including its abort signal, for streaming publication holds. `reader/ship.ts` copies the complete output and seals the runtime manifest. An integration that changes neither source nor shipped files needs no rebuild.

After changing Flow runtime scripts or their shipped dependencies, run `bun plugin/skills/flow-page/scripts/generation.ts seal`. Commit `plugin/skills/flow-page/runtime.json` with those changes. The reader shipment command also seals this manifest after copying the complete reader. It records every Flow script, reader file, and shipped Scratch and figure script by hash. Do not seal a partial installation.

The desktop reader uses UnoCSS presetWind4, copied shadcn-vue controls, and VueUse. The Doop compact design supplies the Catppuccin Latte and Mocha tokens in `reader/app/assets/theme.css`. Keep spacing, typography, and control sizing on those tokens. TanStack Form uses omptype schemas for comments and quiz answers. Result tables use TanStack Table, and Metrics charts use Unovis.

The reader uses installed IosevkaTerm fonts when available and ships no fonts. UnoCSS generates icon masks from the local Lucide collection. `@nuxtjs/color-mode` keeps the browser's existing `flow-reader:theme` preference. The shipped reader makes no external font, icon, or color-mode requests and runs under the host's existing CSP.

The rendering hook authenticates the capability and checks Flow availability before Nuxt receives content. Initial Flow state belongs to the request and hydrates from Nuxt's escaped payload, so concurrent page responses cannot share Flow data. The final HTML response hashes its executable inline scripts into the existing CSP. Scripts receive neither `unsafe-inline` nor `unsafe-eval`. Preserve Nuxt's payload escaping when changing response hooks. Diagram drawing and historical figure caption enhancement run only after hydration.

The 44 px navigation bar reads the project name from the Local Flow host's project key. It links the Flow title to Overview and names the Focused Stage from a matching recorded ticket title or the Stage label. At 320 px, the Flow and Stage names each get at least 72 px before optional chips and counts take space. The current question and the Stages and Jump controls stay visible. Stages (`m`) opens the Map's full Stage list, where each row keeps its Stage label beside any recorded ticket title. Jump (`g`) opens the reading index without adding a sticky row. Excess queue chips and waiting Stages become counts. If there is no room for a separate count chip, the count appears on the Jump or Stages control that opens its list.

Each question shows one status beside its 17 px title. The Decision brief comes next when the round and question carry one. The brief shows the reason to ask and evidence checked when present. The reader does not infer a brief or missing fields for old records. The description and any example stay in the decision text. The options sit beside the deciding figure when the pane is wide enough and above it when the pane is narrow. The media is capped inline. Clicking it opens a full-width dialog that retains the caption, description, and Pele panning. Closing the dialog returns focus to the inline control.

To choose the deciding figure, the reader takes the first available comparison figure in recorded order: an Option diagram, Before and after, comparison table, Data chart, or Scenario walkthrough. If none exists, it tries the other declared Visual kinds, then a source excerpt, then an untyped historical figure. The remaining records stay in publication order inside **Sources and context**. An option preview never takes the place of the deciding figure.

**Sources and context** holds supporting links, Today facts and their sources, Term notes, figure sources, and additional figures. Historical questions keep their recorded Today text visible. **Earlier attempt** holds the earlier words and the agent's reading under separate labels. A superseded question still links to its latest attempt. The outcome uses the same effective answer projection as Overview and `show`, including withdrawn readings. Corrections and non-consent stay distinct from an explicit pick. The `-choices` and `-evidence` fragments still resolve and reveal folded content; the question no longer prints shortcuts to them or the authoring-only Reader needs.

The installed Local Flow host checks the complete runtime manifest before staging a replacement. Its stable listener keeps forwarding requests to the last good generation until the candidate starts and authenticates. The existing `flow-page/scripts/host.ts` generation entry still accepts home, port, and idle arguments, sends the IPC ready message, and attests through hello. It now starts the built Nitro server. The bundled output stays inside the existing reader runtime root, so an older supervisor's fixed file and package copier can stage it without extra installed packages. Replacement retains the port, credentials, and Flow links. Failed startup or mismatched installed files leave the last good generation active. Explicit isolated development hosts keep exact-byte compatibility and require their owner's authenticated stop after code changes. Agents have no new authority to restart the normal shared host. Committed content stays committed when the host is unavailable.

The first SQLite update is the exception to keeping a failed candidate's predecessor. The CLI stops a JSON-only host before import, so it cannot keep serving frozen JSON after a failed launch. A SQLite worker's authenticated `/.host/storage` route stays available through older supervisors. The `versions` route reads the indexed revision and aliases without loading the Flow's State.

Open readers detect host replacement separately from authored revisions and refresh content after reconnect. A changed reader generation reloads the page automatically. Before reloading, the reader saves open Reader comment drafts, their original Result revision and target, the fragment, disclosures, focus, and reading position in tab-local session storage. Older readers saved some disclosures by position. The new reader ignores those positions and opens the disclosures that contain the restored anchor or focus target. Restoring a draft never submits it. An in-flight comment write or unavailable recovery storage delays reload and keeps the current page and drafts visible. Automatic reload also retains the visit comparison's original baseline; an ordinary later visit still uses the normal browser-local visit marker.

An older reader may have saved a generated focus ID. The current reader restores legacy focus and selection only when the saved ID names a persistent control. It still restores the draft if it cannot identify the focused field.

The reader and the SVG export share flowchart step routing and label readability rules in `plugin/skills/vstack-figures/scripts/presentation.ts`. Edge labels keep Pele's background-colored label boxes. Cluster labels use a background-colored outline. Captured Mermaid sources get these rules on their next view without recapture. Historical SVGs retain their captured routes.

## Addon judge

Edit `addon-questions.json` for selection criteria, `sample-prompts.json` for user-prompt cases, and `sample-briefs.json` for subagent cases. The catalog holds `preamble`, `brief_preamble`, and a `questions` map keyed by full Addon names. Each question contains its situation and criteria, not repeated preamble text.

Read the canonical contracts before changing selection behavior:

- [Intent gathering and tool selection](adr/0039-main-agent-tools-pick-addons-from-gathered-intent.md).
- [Shared judge text](adr/0024-shared-judge-text-goes-in-the-jev-state-once.md).
- [Subagent selection](adr/0025-subagents-get-principle-picks-from-their-own-brief.md).

### By-hand judge check

After any change to the catalog or a corpus, run the check for each corpus:

```sh
TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts
TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts sample-briefs.json
```

CI does not run this check. The script reads the corpus at the path in its argument, `sample-prompts.json` by default. It sends every sample against its questions to live jev, in the state shape that the extension sends. A sample with `restated: true` holds a stored smol restatement, and the script sends it as it is, cut to 10,000 characters. These are offline samples from the former runtime design, not a runtime smol step. The six `restated-<name>` samples restate a synthetic mid-session talk. Each `fresh-<id>` sample restates only the words of the plain sample `<id>`, following the former fresh-start path of ADR 0026. It keeps that sample's `expected` and `allowed` lists, so the check flags a pick that the restatement adds or loses. Two of these samples also allow a pick that the restatement added and the user accepted: `fresh-cart-off-by-cent` and `fresh-h-legacy-config-api`. Never label such a sample afresh. A sample with `brief: true` holds a real subagent brief from a past Matt run. The script cleans it with the brief cleaner, puts `brief_preamble` in the state, and asks one question per principle, every principle except never-block-on-the-human. It cleans every other sample with the plain-prompt cleaner and asks every question. It flags an expected pick below 0.65 and an unexpected, non-allowed pick above 0.95. Scores from 0.65 through 0.95 are borderline. It prints flags, borderline picks, the pass count, question count, run count, and returned model. Exit codes are 0 with no flags, 1 with flags, and 2 for a missing key, bad arguments, or a failed or invalid response.

To record fresh baselines, run with `--runs 3 --print-means`. `--runs <n>` averages that many direct requests per prompt (default 1). `--print-means` prints a `MEANS` JSON line per prompt with `means`, `baseline_selected` (means at or above the `threshold` in the corpus), and `baseline_borderline` (means from 0.65 through 0.95). Copy the matching baseline maps into the corpus. Keep the returned model in the check evidence. After the corpus edit, run the check. A change to a preamble, to the state shape, or to the threshold needs fresh baselines. The script prints the maps but does not rewrite the corpus.

`scripts/addon-judge-ratchet.ts` scores catalog edits for omp's eval `ratchet` flows. Pass `--cases <file> --out <directory>`, with optional `--reps <n>` (default 3), `--only <comma-separated-ids>`, `--expect-model <id>` (default `jev-1.14.0`), and `--state <_state.json>`.

The case file has a `cases` array. Each case has a unique filename-safe `id`, a `stratum`, and a non-empty `forms` array. Each form has a `prompt`, `expected` Addon names, optional `allowed` names, and optional `restated` or `brief` flags, as in the sample corpora. Keep a raw prompt and its stored restatement in one case so they cannot cross the train/test split.

For each form, the runner sends the same request as the check. A form passes when jev selects every expected Addon at 0.70 or more and nothing outside `expected` and `allowed`. The case grade is the mean of its form grades. A request that succeeds after an API retry scores zero on `pass`.

The runner appends completed slots to `results.jsonl` and unscorable API, model, or response failures to `errors.jsonl`. Failures exit nonzero. With `--state`, it writes transcripts only for explicitly listed training ids. Without it, it writes no transcripts. Reusing an output directory resumes completed `(case id, repetition)` slots. Use a fresh output directory whenever the catalog, case file, model, or scoring rules change. `TYPESAFE_ENDPOINT` overrides the API URL for local boundary checks.

## Figure type reference

The executing caller chooses visuals from each question's reader needs and chooses its Mermaid types without a model judge. `plugin/skills/vstack-figures/references/mermaid-types.md` covers every visualization family in pinned Pele 1.12.0, including C4 views, railroad notations, and aliases. `tests/figure-types.test.ts` renders every example through the real figure CLI and checks documented keywords against an independent list.

## Architecture agreement provenance

`pstack/architect` contributes grounding, two architectural sketches, and screening to `grill-with-docs` and shared `codebase-design`. The grill uses `compare-attempts` for a large or contested design and records agreement before to-spec. The merged row ships no standalone architect command or implementation phase. DESIGN-IT-TWICE keeps its detailed-interface workflow.

[Architecture agreement belongs in the grill](adr/0053-architecture-agreement-belongs-in-the-grill.md) records the agreement and brief. [ADR 20261123-every-grill-sketches-two-shapes-and-contested-designs-run-compare-attempts](adr/20261123-every-grill-sketches-two-shapes-and-contested-designs-run-compare-attempts.md) amends when and how `grill-with-docs` compares designs. The [research note](research/architecture-design-in-grilling.md) is background, not policy. [A Flow starts only on request](adr/0046-a-flow-starts-only-on-request.md) still governs enrollment.

Published main's release notes through 9.0.4 remain intact. The architecture feature and reconciliation notes belong to 9.0.5, a compatibility Hand edit above both branch tips. The reconciliation preserves the UI upstream's Pin, register rows, and package metadata. It changes no approved target action or Disposition, and updates architecture references only for the ADR's number.

## Pins and Upstream clones

`pins.yaml` keys (`matt`, `pstack`, `css`, `emil`, `ui-sdk`, `cloudflare`) are register `upstream` values and local clone names under `~/.cache/vstack/upstreams/<key>`. Set `VSTACK_UPSTREAMS` or pass `--upstreams` for another directory. Blobless clones suffice. check-register never fetches, checks out, or moves HEAD. vstack-maintain plan fetches selected Upstreams without moving HEAD. Target checks fetch only missing Pins and held refs. Keep the cache outside every checkout. To create a clone:

```sh
git clone --filter=blob:none https://github.com/mattpocock/skills.git ~/.cache/vstack/upstreams/matt
git -C ~/.cache/vstack/upstreams/matt fetch --tags origin
```

`pin_kind` selects how the Update finds its next Pin. `tag` for Base selects the highest `v<major>.<minor>.<patch>` tag, excluding prereleases and other tag forms. `commit` selects the newest default-branch commit touching the configured `path`. `pin` is the tag name or full commit SHA.

Each entry's `items:` list says which tree entries at the Pin are Upstream items. `match` is a path glob from the repo root where `*` stays inside one path segment, `type` is `tree` or `blob`, and the first matching pattern sets the `kind`. For example, pstack's automations are one item each, so their nested skills get no rows.

### UI upstream

The UI upstream is `emilkowalski/skills`, keyed as `emil`, pinned at `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c`. Its `skills/*` pattern discovers twenty items. Twelve ship as adapted visible Utility skills, each with an upstream MIT notice. Existing implementation, review, verification, and evidence owners keep their roles. `choreograph` covers coordinated motion, and `gestures` covers direct manipulation with Vaul guidance only for projects already using it. Apple-derived guidance and mobile-native cover web work, not Expo or Swift. Break-ui remains reference knowledge for existing implementation and Verify owners.

`code-review` conditionally reaches motion review guidance in the coordinator and delegated Standards reviewers. The existing review owns blocking decisions and evidence. A browser-supported clip-path effect is not blocked by the upstream's broad property preference alone. [ADR 0051](adr/0051-selected-emil-skills-govern-animation-guidance.md), as amended by [ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css](adr/0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css.md), governs applicability.

None of the twelve adaptations is deferred. `ask-emil` is rejected as a second UI router. `learn-taste` merges its design-correction signals into `session`, which keeps its own approval and editing routes.

The six permanent exclusions for spec 338 are `animation-vocabulary`, `ask-sonner`, `pick-ui-library`, upstream `prototype`, `animate-expo`, and `write-swift`. Vstack's own prototype remains owned by the default branch; UI integration preserves its current version.

The initial registration is a consistent direct Hand edit, including the Pin, object identities, artifact associations, catalog, version, and changelog. `prepare` and target `check` read the register from HEAD. Before the bootstrap is committed, `check --take emil:skills/emil-design-eng` previews the source item, while `check-register` and `plan emil@<initial Pin>` inspect the working registration. Do not run `prepare` against the pre-bootstrap HEAD: it cannot preserve the new source. After that initial commit, use the existing Hand edit and Update commands normally. No bootstrap API or UI-specific runtime is involved.

The twelve UI skills load by description in any session or by name. They appear in the Decision register's utility list without Addon catalog questions or sample-prompt labels. They do not broaden principle-only build or subagent selection. [ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css](adr/0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css.md) records Emil precedence for CSS and animation. Good-css retains unique CSS techniques without hand-offs to or from these skills. Its seven caller instructions cover CSS only. Native description selection and instruction following remain unproven until explicitly approved remote evaluations run.

Use the [frontend-guidance Verify recipe](../.omp/skills/verify-vstack/features/frontend-guidance.md) for native main and delegated runs, an unrelated-task control, packaged-content inspection, and an isolated future-source planning check. Stub load proof does not establish instruction following or UI quality.

The [motion Verify recipe](../.omp/skills/verify-vstack/features/frontend-motion.md) covers construction and diagnosis through fresh main and worker paths, reduced motion, interruption, measured stutter, and browser-qualified property choices. Validate library claims against the runnable fixture's actual dependencies.

The [mobile-web Verify recipe](../.omp/skills/verify-vstack/features/frontend-mobile.md) adds touch, viewport, safe-area, hover, and input proof to those existing paths. Keep actual engine and dependency scope explicit. Emulation does not establish native-device behavior.

The [audit-to-selected-change recipe](../.omp/skills/verify-vstack/features/frontend-motion-audit.md) covers read-only main and delegated surveys, vetted priorities, rejected additive candidates, explicit diagnostic selection, and safe scoped subtraction through existing implementation and motion review. Audit findings enter the existing Flow owner rather than upstream execute dispatch or another plan-status workflow. Source hashes bracket selection; browser observations cover visibility, unmount, callbacks, focus, and retained useful motion.

The Update moves pstack to `0b46ec399d55f2829e88822998f53b84944837d3` and emil to the UI Pin above. Matt stays at `v1.3.2` and css at `92d436ba1937d1b1407c47e35abb3e199eaace2e`. Motion shorthand performance findings apply before Motion 14.2; layout animations, `onUpdate`, `transformTemplate`, inertia, and motion-value-driven values remain main-thread in every version. Browser acceleration still needs scenario-specific evidence.

`interrogate` is an answer-only Utility skill, not a review axis or End state step. It uses three isolated Session-model adversaries by default, independently reruns findings, merges shared root causes, reports dropped counts, and applies no fix. Failed starts or missing isolation stop its review; only started failures drop out, with at least two substantive candidates required. Existing review and final Verifier ownership remains unchanged.

Selection-only trigger evals across the twelve UI descriptions and interrogate, and live Addon judge checks, remain optional Costly seam tests requiring explicit approval. Unrun evals leave selection overlap unproven without blocking the mechanical Update gates. Do not infer native instruction following from a load smoke.

### UI SDK Upstream

The `ui-sdk` Upstream is `vercel-labs/ui`. Its commit Pin tracks `packages/core/skills`, with only `packages/core/skills/ui-sdk` registered as an item. Row `ui-sdk/ui-sdk` adapts the skill as the visible [ui-sdk Utility skill](../plugin/skills/ui-sdk/SKILL.md), with its Apache-2.0 license. It loads by description or by `/skill:ui-sdk` and has no Addon catalog key.

The skill uses the installed package docs for API facts. It keeps the agent bridge and its agent test for every UI SDK interface. The running workflow owns all other test seams and proof. See the [UI SDK ADR](adr/20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md) for the adaptation decision and the [frontend guidance Verify recipe](../.omp/skills/verify-vstack/features/frontend-guidance.md#native-utility-discovery) for loadability proof.

### Cloudflare upstream

The Cloudflare upstream is `cloudflare/skills`, keyed as `cloudflare` and pinned at `ff191de7d903788eceaf516a514ae7d3b56b924a`. Its `skills/*` pattern discovers 24 items. The first registration is one direct Hand edit with a patch Change note. As with the UI bootstrap, do not run `prepare` against the pre-bootstrap HEAD.

Sixteen ship as adapted visible Utility skills: `agents-sdk`, `basin`, `cf-cli`, `cloudflare`, `cloudflare-email-service`, `cloudflare-one`, `cloudflare-one-migrations`, `durable-objects`, `gateway-workers`, `k2`, `sandbox-next`, `turnstile-spin`, `web-perf`, `workers-best-practices`, `workers-profiling`, and `wrangler`. They load by description or by name in any session and have no Addon catalog keys.

The adaptations rewrite sentences flagged by `ask-tool` with omp `ask` instructions in each `references/skill-feedback.md` and in `turnstile-spin/SKILL.md`. Each `SKILL.md` that puts questions to the user adds one sentence routing them through `ask`, including confirmations and approval waits. The same rule applies to every feedback reference: use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract when enrolled, or plain `ask` outside a Flow. Feedback still requires approval of the exact title and body before posting. In `cloudflare/SKILL.md`, the broken relative link to the unshipped `nextjs-on-cloudflare` skill becomes an optional reference by name. The official Next.js docs link stays. Each changed file has a notice required by Apache-2.0 section 4(b). The Pin's root `LICENSE` ships byte for byte as [`plugin/LICENSE-cloudflare-skills`](../plugin/LICENSE-cloudflare-skills) under `originals:`. The Pin has no `NOTICE` file.

The eight rejected skills are `artifacts`, `cloudflare-app-bootstrap`, `flagship`, `frameworks-on-cloudflare`, `nextjs-on-cloudflare`, `sandbox-migrate-to-next`, `sandbox-stable`, and `workers-development`. Side is the only consumer and does not use them.

The other hand-offs in `cloudflare/SKILL.md` and `sandbox-next/SKILL.md` stay unchanged, so use the linked public docs when rejected skills such as `sandbox-stable` and the framework skills are unavailable.

When Cloudflare skills are also installed in `~/.agents/skills`, omp 19.0.0 keeps vstack's bare names, lists a differing `cloudflare` as `agents/cloudflare` with one warning, and deduplicates an identical `wrangler` without warning.

House style allowlists `agents-sdk` under `single-spawn` for its `useAgent` argument and `cloudflare` under `spawn-vocab` for Miniflare request and event dispatch. Neither is subagent wording. `ask-tool` has no exemption.

The deploy-confirmation conflict with `web-fullstack` is accepted. `wrangler` and `cf-cli` keep the Upstream deploy, rollback, secret, and resource-creation guidance, while `web-fullstack` keeps its explicit deploy request and per-step confirmations for Nuxt. A Nuxt-on-Cloudflare request can match both. See [ADR 20261126-cloudflare-platform-skills-are-adapted-utility-skills](adr/20261126-cloudflare-platform-skills-are-adapted-utility-skills.md).

At the Pin, the 16 skills contain 220 files totaling 703,678 bytes. The adapted plugin copies contain 220 files totaling 710,617 bytes. The 16 descriptions total 3,155 authored characters in both trees. The locked omp 19.0.0 put 1,427 characters of description hints for these skills into the prompt because it bounds and compresses descriptions.

Recount the selected skills at the Pin with Bash:

```bash
cache=~/.cache/vstack/upstreams/cloudflare
pin=ff191de7d903788eceaf516a514ae7d3b56b924a
skills=(agents-sdk basin cf-cli cloudflare cloudflare-email-service cloudflare-one
	cloudflare-one-migrations durable-objects gateway-workers k2 sandbox-next
	turnstile-spin web-perf workers-best-practices workers-profiling wrangler)
paths=("${skills[@]/#/skills/}")
git -C "$cache" ls-tree -lr "$pin" -- "${paths[@]}" |
	awk '$2 == "blob" { files++; bytes += $4 } END { print files, "files,", bytes, "bytes" }'
git -C "$cache" grep -h '^description: ' "$pin" -- "${paths[@]/%//SKILL.md}" |
	bun -e 'const lines = (await Bun.stdin.text()).trimEnd().split("\n"); console.log(lines.length, "descriptions,", lines.reduce((n, line) => n + [...Bun.YAML.parse(line).description].length, 0), "characters");'
```

### Web stack Utility

`web-fullstack` is a vstack original and visible Utility, not the rejected UI-upstream `pick-ui-library`. Its normal description and explicit name expose frontend library choice and requested Vue and Nuxt setup and deployment, including fullstack Nuxt on Cloudflare. It adds no Addon catalog key or automatic judge selection. The Flow reader keeps its copied Reka controls and Doop compact design under the [UI SDK ADR](adr/20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md). Its local server does not use the Cloudflare recipe.

The skill keeps advice read-only, preserves suitable installed packages and project tooling, and installs only task-required dependencies on an explicit setup request. For controls that native or installed components cannot cover, it recommends UI SDK. The app's manager installs `@ui-sdk/core` and its framework package, `@ui-sdk/vue` for Vue, and only Nuxt registers the module. The [UnoCSS recipe](../plugin/skills/web-fullstack/references/unocss-controls.md) keeps the app's tokens and local icon collection without importing `@ui-sdk/core/web.css`. web-fullstack owns stack choice and setup proof. The [ui-sdk Utility skill](../plugin/skills/ui-sdk/SKILL.md) owns library usage, not stack selection. Forms still use TanStack Form with omptype when needed. State and query tools stay optional.

Fullstack work curates Nuxt server routes on Cloudflare Workers with Static Assets, NuxtHub D1, and conditional Better Auth through `@nuxtjs/better-auth`. KV and R2 stay task-dependent. Setup ends with local D1 and browser proof in Nuxt dev and built workerd, plus a written deploy checklist. It makes no Cloudflare account request.

Only an explicit deploy request enters the [confirmed Cloudflare procedure](../plugin/skills/web-fullstack/references/cloudflare-deploy.md#deploy-only-on-explicit-request). It confirms the account before account discovery, then confirms each remote step. Deployment runs from the user's machine to one production Worker, without Workers Builds, CI, staging, or previews. The procedure owns the deploy steps and checks. The [fullstack ADR](adr/20261113-web-fullstack-curates-nuxt-on-cloudflare.md) records the stack and deploy boundary.

Use the [frontend-stack Verify recipe](../.omp/skills/verify-vstack/features/frontend-stack.md) for native consumers, generated apps, and public packaging. The controls steps check Select and Switch in Nuxt and Vue with Vite, including Nuxt hydration, with separate proof for keyboard and form behavior and for the agent bridge. The recipe also covers accountless confirmation stops. Its optional throwaway Worker and D1 deploy requires approval for that verification and confirmed teardown. Without approval, name the account-side proof gap. Prose wording assertions are not a substitute for those observations.

### OpenPencil Utility

[`open-pencil`](../plugin/skills/open-pencil/SKILL.md) is a visible vstack original listed under `originals:` and `utility:`. It has no Addon catalog key. It discovers the user's OpenPencil MCP tools and targets named documents, pages, and frames by ID. It neither configures the server nor adds project design-tool configuration. It maps annotated behavior and design tokens to the project's UI SDK components and tokens without changing the project's stack.

Under the [OpenPencil ADR](adr/20261126-the-open-pencil-utility-hands-over-a-design-baseline-kept-in-pikpak.md), the Design baseline is the agreed `.fig`, not the live document or a PNG. The Utility creates or reuses the SHA-256-named file in the user's PikPak folder after explicit agreement to the saved bytes. It checks the bytes downloaded by exact file ID before handing the ID, SHA-256, agreed frame node IDs, and mapped requirements to the spec. Handoff, implementation, and Verify use one PikPak `Read & write files` Personal Access Token. vstack stores no token. Verify fetches the recorded ID and renders the exact nodes with strict font resolution without the editor.

The [OpenPencil Verify recipe](../.omp/skills/verify-vstack/features/open-pencil.md) covers explicit targeting, the unreachable-server branch, and an approved live-account Design baseline round trip. Native model and live-account use need explicit approval.


## Decision register

Every row has `id`, `upstream`, `kind` (skill, principle, playbook, agent), `path` and `tree` (the item at the current Pin; `tree` is the git object SHA, a blob SHA for a single file), `disposition` (adopt, adapt, merge, reject), `artifacts` (paths under `plugin/`), and a one-line `reason`. `adr` is optional. A held row also has `held_at` (the Upstream ref its artifact is reconciled with) and `held_path` (the item's path at that ref); the two are set and cleared together, and `path` may be absent only on a held row whose item Upstream removed.

An artifact is one unit under `plugin/`: a skill directory (`plugin/skills/<name>`), an agent or rule file, another child of a top-level plugin directory, or a top-level file other than the manifest. Several rows can name one artifact. Artifacts with no Upstream item go under `originals:`, including third-party license files. Every non-reject row names at least one artifact. Only reject rows have `artifacts: []`.

The top-level `utility:` list names Utility skills as paths such as `plugin/skills/explain`. Each entry must name a shipped skill with no non-reject Base upstream row. A shipped skill with a key in the `questions` map of `addon-questions.json` is an Addon, whatever its rows (ADR 0019). Other shipped skills with a non-reject Base row are Matt skills. Every other shipped skill outside `utility:` is an Addon and needs a catalog key.

An adopt artifact is the Upstream item copied byte for byte, minus `agents/openai.yaml`, under the Upstream name. To copy one from its Pin:

```sh
mkdir -p /tmp/adopt
git -C ~/.cache/vstack/upstreams/matt archive v1.2.3 skills/productivity/grill-me | tar -x -C /tmp/adopt
mv /tmp/adopt/skills/productivity/grill-me plugin/skills/grill-me
rm plugin/skills/grill-me/agents/openai.yaml && rmdir plugin/skills/grill-me/agents
```

## check-register

```sh
bun scripts/check-register.ts
```

It proves that the register, `pins.yaml`, `plugin/`, and the Upstreams agree, and checks new ADR filenames. Options:

| Option | Env | Default |
|---|---|---|
| `--root <dir>` | | the repo that holds the script |
| `--source clones\|github` | `VSTACK_UPSTREAM_SOURCE` | `github` when `GITHUB_ACTIONS=true`, else `clones` |
| `--upstreams <dir>` | `VSTACK_UPSTREAMS` | `~/.cache/vstack/upstreams` |
| `--base <ref>` | `VSTACK_BASE_REF` | see "Change-note base" below |
| `--json` | | text output |
| `--list-classes` | | prints every failure class and exits |

The `github` source reads trees through the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`). It uses `GITHUB_TOKEN` or `GH_TOKEN` when set and `GITHUB_API_URL` as the API base. Both sources live in `scripts/lib/upstreams.ts`, which vstack-maintain reuses. Byte identity compares git blob SHAs without downloading contents. Page lint runs vstack's local script and reads no Upstream files.

Exit codes: 0 pass, 1 register failures, 2 the check could not run (bad arguments, unreadable `pins.yaml` or register, a missing clone or ref, an API error). Exit 2 prints the remedy, such as the clone or fetch command.

Text output prints one line per failure, `FAIL <class> <item>: <message>`, after `check-register:` note lines, and ends with `check-register: OK` or `check-register: <n> failure(s)`. `--json` prints `{"ok", "notes", "failures": [{"class", "item", "message"}]}`. The item is a row `id`, an artifact path, `plugin/package.json`, or `<upstream>:<path>` for an Upstream item with no row.

Artifact discovery reads the working tree, including untracked files. Register, text-scope, Addon, and version checks share its content inventory. Empty directories, `.DS_Store` files, and Python bytecode files ending in `.pyc` or `.pyo` directly under `__pycache__` do not count as shipped content. Discovery leaves these files and directories untouched.

Other files count even when an artifact lacks `SKILL.md`. Source inside `__pycache__` still counts. Directory names such as `dist`, `build`, `.cache`, `.nuxt`, and `.output` do not exclude their contents. The bundled Nuxt reader's `reader/index.html` and `reader/_flow-reader/` assets are shipped content, not local cache residue. A registered artifact with no shipped content reports `missing-artifact`.

| Class | Fails when |
|---|---|
| `invalid-row` | a row lacks a field or has a bad one: duplicate or missing `id`, `upstream` not in `pins.yaml`, unknown `kind`, no `reason`, an artifact outside `plugin/`, `tree` not a full SHA, `held_at` without `held_path` or the reverse |
| `invalid-disposition` | `disposition` is not adopt, adapt, merge, or reject |
| `reject-with-artifacts` | a reject row lists artifacts |
| `non-reject-without-artifacts` | an adopt, adapt, or merge row names no artifacts |
| `absent-path` | a row that is not held has no `path` |
| `missing-artifact` | a row or `originals:` names an artifact with no shipped content |
| `unregistered-artifact` | a plugin artifact that no row names and `originals:` does not list |
| `current-pin-mismatch` | `path` does not exist at the current Pin, or `tree` is not its object SHA there |
| `reconciled-missing` | a held row's `held_path` does not exist at `held_at` |
| `adopt-renamed` | an adopt artifact's name differs from the Upstream item's name at its reconciled version |
| `adopt-not-identical` | an adopt artifact's files differ from the item at its reconciled version, `(held_at, held_path)` on a held row and `(pin, path)` otherwise, minus `agents/openai.yaml` |
| `unregistered-upstream-item` | an item at a Pin (per `pins.yaml` `items:`) that no row's `path` names |
| `invalid-manifest` | `plugin/package.json` lacks `name: vstack`, an `x.y.z` version, or the `omp` field |
| `missing-change-note` | shipped `plugin/` text changed since the comparison base without a Change note added by the branch |
| `invalid-plugin-release` | a version change or consumed note lacks a new Plugin release receipt, the version is not exactly the highest prepared level, a prepared note remains, an unrelated note is removed, or CHANGELOG does not keep every prepared entry under the dated heading |
| `invalid-adr-name` | a file added under `docs/adr/` since the comparison base lacks a real `YYYYMMDD` date or a lowercase, hyphen-separated slug in `YYYYMMDD-slug.md` |
| `duplicate-adr-number` | legacy numbered ADRs share a number, except the exact existing 0065 and 0074 pairs |
| `invalid-house-style` | a row or rule in `house-style.yaml` lacks a field or has a bad one, a row comes after a row that rewrites its `from`, or a linted rule is missing; the item is `house-style.yaml:<id>` |
| `house-style-leftover` | a row's `from` still matches text the row covers (see "House style" below; adopt text only against `required` rows) |
| `migration-house-style` | setup-vstack is present but its `references/house-style.yaml` copy is missing, has invalid row fields, or differs from the root `uses: migration` rows in content or order |
| `skill-ref` | adapt, merge, or original markdown holds a bare `/<name>` token for a vstack skill, except a command explicitly labeled omp built-in |
| `spawn-vocab` | adapt, merge, or original markdown outside frontmatter and code fences holds `subagent_type`, `generalPurpose`, or `` `Task` ``, or says spawn or spin up outside inline code and outside a `Spawn one`, Fan-out, or `Headless batch (` line; dispatch fails only in a sentence naming an agent or role, not for reducer or request dispatch |
| `fan-out` | adapt, merge, or original markdown holds a Fan-out line off the form in `plugin/skills/vstack-fan-out/FORMS.md`: a line that does not start `Fan-out (skill://vstack-fan-out): parts: one per …`, is neither one `task` call with `tasks[]` nor one isolated eval `agent()` cell that says `wait()` or no `wait()`, names an agent the plugin does not ship, leaves out the vstack root, or has no `If they cannot start, stop:` clause. A removed judge-gated form fails too: a `Fan-out gate (` line, a `Fan-out (always` line, or a `- fan-out →` or `- inline →` branch line |
| `single-spawn` | adapt, merge, or original markdown holds a spawn site off the forms: a `Spawn one` line off the form in `plugin/skills/vstack-fan-out/FORMS.md` (an agent the plugin does not ship, no vstack root, no `If it cannot be spawned, stop:` ending, or a `skip it:` ending anywhere but compare-attempts' cross-judge line), a line naming another agent through `agent: "…"` or `agent="…"`, or a `task` call or eval `agent()` call that names no agent |
| `agent-spawns` | an adapt, merge, or original agent's `spawns:` lists `*` or an agent the plugin does not ship |
| `headless-run` | adapt, merge, or original markdown outside the rule's allowlist (skill-creator) holds a `Headless batch (` line or an `omp -p` command |
| `worktree-cmd` | adapt, merge, or original text runs `git worktree add` |
| `tmp-path` | adapt, merge, or original text names `$TMPDIR/`, `/tmp/`, or the OS temp directory, outside a `mktemp` line |
| `ask-tool` | any markdown artifact, adopt included, has a sentence with an `ask-tool` phrase that does not name `` `ask` `` |
| `page-css` | a page template or Flow reader stylesheet breaks vstack's hover, outline, or color check; the item is the file and the message holds the script's `path:line` lines |
| `invalid-utility` | a `utility:` entry names no shipped skill, or names a skill with a non-reject Base upstream row |
| `addon-slash-route` | text under `plugin/` or in `README.md` contains `/skill:<addon>`. Use `skill://<addon>` instead |
| `addon-question-mismatch` | a key in the `questions` map of `addon-questions.json` names no shipped skill or names a Utility skill, or a shipped Addon has no such key |
| `brief-sample-mismatch` | a sample in `sample-briefs.json` has an empty `prompt`, or an `expected` or `allowed` label that is not a subagent question (a principle in `addon-questions.json` other than `principle-never-block-on-the-human`). The item is `sample-briefs.json:<id>` |

Rows with an `invalid-row` or `invalid-disposition` failure are skipped by the checks that read their fields, so one bad row reports once. House style rows and rules with an `invalid-house-style` failure are skipped the same way.

A House style failure names the register row behind the artifact, or the artifact path when several rows or `originals:` name it. Its message lists the first file lines that break the row or rule.

### ADR filenames

New ADRs use `YYYYMMDD-slug.md`, with a real local creation date and a lowercase slug of letters and digits separated by single hyphens. Cite the full filename stem without `.md`. The date does not change when the branch lands later. If two branches choose the same date and slug, the second branch changes its unlanded slug and references before landing. Landed filenames stay stable.

The check reads files under `docs/adr/`, including untracked files. It validates names absent from the same comparison base used by the Change-note check. Existing filenames are not relinted or renamed, and prose citations are not checked. Duplicate legacy numbers are refused except for two existing pairs: `0065-flow-figures-get-color-roles-from-the-shared-role-pass.md` with `0065-n-stays-in-the-focused-stage-and-tern-tabs-follow-their-selected-session.md`, and `0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css.md` with `0074-private-mcp-config-is-shared-through-links-and-a-named-hook.md`. A third file with either number is not covered by that exception.

`ADR-name base` reports the comparison commit. The check does not verify an author's clock, enforce listing order, resolve a Git conflict, or certify custom ADR tools in other projects. The authoring convention applies to their new ADRs too, in their existing location, including Private mode. See [ADR 20261111-new-adrs-are-named-by-date-and-slug](adr/20261111-new-adrs-are-named-by-date-and-slug.md).

### Change-note base

The Change-note check compares shipped `plugin/` text in the working tree, including tracked and untracked files, with one commit:

1. `--base <ref>` or `VSTACK_BASE_REF`, when set. An all-zero SHA counts as unset.
2. Else the merge base of `HEAD` and `origin/HEAD`. This covers all changes on a feature branch.
3. Else `HEAD`, so only uncommitted changes count.

Recognized cache files do not count as shipped text. Removed paths count as changes. CHANGELOG and Change notes are not shipped text.

The output line `change-note base: <sha> <how it was chosen>` reports the choice. A plugin new since the base needs no note. A Change note already present at the base does not cover a new change. A branch-added note covers subsequent review fixes, so each push needs no new bookkeeping. CI uses the merge base with the PR's target branch for pull requests and with the default branch for feature pushes. Default-branch pushes use the preceding tip to check the newly landed delivery.

### Adding a failure class

Each check is a module in `scripts/lib/checks/` that exports a `Check`: the list of classes it reports and a `run(ctx)` that returns `{ class, item, message }` failures. `ctx` holds the root, the Pins, the register (`rows`, and `validRows` that passed the row checks), the plugin artifacts, the House style, the Upstream source, and the comparison base. To add a class, emit it from the check it belongs to and add it to that check's `classes`, or write a new module and append it to the list in `scripts/lib/checks/index.ts`. Then add a row to the class table above and a failing fixture to `tests/check-register.test.ts`. A test fails when `--list-classes` prints a class that has no fixture.

A lint over shipped text starts from `lintTargets(ctx)` in `scripts/lib/checks/scope.ts`: every registered artifact with its Disposition (adopt, adapt, merge, or original), its Upstreams, and its text files. Whether a lint covers a Disposition comes from the `scope` of its row or rule in `house-style.yaml`, through `inScope` in `scripts/lib/house-style.ts`; do not test Dispositions anywhere else.

### Page templates

A page template is any `*.html` or `*.css` under `plugin/skills/<name>/templates/`. `scripts/lib/checks/pages.ts` also checks every `*.css` under `reader/app/`. It runs `plugin/skills/vstack-maintain/scripts/check-css.mjs`, registered as part of the vstack-maintain original, over these files. Each flagged file reports `page-css`. With no matching files, the check does not run the script.

The script derives from the CSS upstream's `check-css.mjs` at `92d436ba1937d1b1407c47e35abb3e199eaace2e` and retains its MIT notice. vstack maintains this copy without Upstream fixes. It keeps the hover, outline, and color checks. It does not enforce logical properties, easing, transition property lists, reduced-motion gating, or duration limits. Pins supply no page lint.

Templates hold no authored figure. The caller writes Mermaid through vstack-figures and captures its source in the Flow. The host-backed reader draws it with Pele. An offline lesson instead renders an SVG and may inline its exact bytes.

## House style

`house-style.yaml` (ADR 0008) has two lists. Its header comment documents every field.

- `replacements:` are blind substitutions, applied in list order. `match` is `literal` (an exact substring), `name` (no `[\w-]` character on either side), or `ref` (only `/x`, `` `x` ``, `**x**`, and `skill://x`). The `glossary` row rewrites `CONTEXT.md` and leaves `CONTEXT-FORMAT.md` alone. `upstream` picks the artifacts a row applies to. `scope: required` binds every artifact, adopt included. `scope: adapted` binds adapt, merge, and original text. `uses` selects the Update (`update`), setup-vstack's Migration (`migration`), or both. A row that an earlier row rewrites fails `invalid-house-style`, so put the longer phrase first.
- `rules:` are what the agent applies by hand: the fixed spawn and Fan-out wording, skill references, worktrees, Scratch paths, and asking through `ask`. Each has `text`, a `scope`, and a `lint` line that says what `check-register` enforces. `allowlist` names the skills where a rule's form is allowed, and `check-register` skips that rule's lint in them. For example, it limits `headless-run` to skill-creator and lets writing-for-agents describe a subagent dispatch under `spawn-vocab`. See [Cloudflare upstream](#cloudflare-upstream) for the two spawn-lint false positives. `ask-tool` holds `phrases`, the list its lint matches as whole words in any case. Add a phrase when an asking sentence slipped past the list, and run `bun scripts/check-register.ts` to see which adopt items it would flip.
- The spawn and Fan-out lines themselves live in one place, `plugin/skills/vstack-fan-out/FORMS.md`: the Fan-out line (the `task` batch or the isolated eval batch) and the single-subagent lines. Copy a form from there, fill its slots, and keep it on one line. A vstack agent is an agent the plugin ships under `plugin/agents/`. The spawn lints read markdown outside frontmatter and code fences, so quoting a form in a fence is safe.

`scripts/lib/house-style.ts` is the one module that reads both lists and applies rows. It has no file access: `parseHouseStyle(doc, upstreamKeys)` validates a parsed file, `selectRows(rows, { use, upstreams, disposition, shippedNames })` picks the rows for one text, `applyRows(text, rows)` rewrites it, and `findRow(text, row)` finds leftovers. `loadHouseStyle(root, upstreamKeys)` in `scripts/lib/vstack-repo.ts` reads the file from a checkout.

To write an adapt item, start from the Upstream text at the Pin with the rows applied, then make the hand edits its contract needs:

```sh
bun -e 'import { applyRows, parseHouseStyle, selectRows } from "./scripts/lib/house-style.ts";
const pins = Bun.YAML.parse(await Bun.file("pins.yaml").text());
const { houseStyle } = parseHouseStyle(Bun.YAML.parse(await Bun.file("house-style.yaml").text()), new Set(Object.keys(pins.upstreams)));
const rows = selectRows(houseStyle.replacements, { use: "update", upstreams: ["matt"], disposition: "adapt" });
process.stdout.write(applyRows(await Bun.stdin.text(), rows));' \
  < <(git -C ~/.cache/vstack/upstreams/matt show v1.2.3:skills/engineering/wizard/SKILL.md) > plugin/skills/wizard/SKILL.md
```

setup-vstack ships the root `uses: migration` rows under `plugin/skills/setup-vstack/references/house-style.yaml`, with no `rules` list. Generate the copy with `selectRows(rows, {use: "migration"})` and `Bun.YAML.stringify({replacements: rows})`. `migration-house-style` checks its row schema and compares every field in order. The old-phrase scan skips this copy because its `from` phrases are data.

## Migration

Use `/skill:setup-vstack` for Migration. Read its [migration reference](../plugin/skills/setup-vstack/references/migration.md) before applying a plan. It documents Move and Private modes, mandatory items, stale-plan refusal, commit scope, and machine-state protection.

Moving the old private store is mandatory for every registered worktree. If the move fails, Migration rolls back the store, text, directory name, links, and exclude content. A destination conflict never merges files. The existing vstack copy wins, and an optional deletion item resolves the old copy. Migration stays incomplete until the old store moves or is deleted against that existing copy.

## vstack-maintain

`skill://vstack-maintain` is the Addon for Updates and Hand edits to vstack. The grill gathers facts and confirms decisions. implement's isolated drafting worker writes the text and runs the script's bookkeeping and gates in its own clone. implement applies the gated patch and owns git and the End state.

Run `bun install --frozen-lockfile` in each clone before running these commands.

```sh
bun scripts/vstack-maintain.ts plan [--scratch <dir> [--session-id <id>]] [<upstream>|<upstream>@<ref> ...]
bun scripts/vstack-maintain.ts merge --plan <plan.json> [--decisions <file>]
bun scripts/vstack-maintain.ts check [--plan <plan.json>] [<artifact> ...] \
  [--take <upstream>:<path>] [--rename <artifact>=<to>] [--remove <artifact>]
bun scripts/vstack-maintain.ts prepare --decisions <file> [--plan <plan.json>]
bun scripts/vstack-maintain.ts gates [--scratch <dir> [--session-id <id>]]
```

`plan` and `gates` require an omp session id in `PI_SESSION_ID`. A delegated run passes its parent's project Scratch dir and session id as `--scratch` and `--session-id`.

| Command | Output and effects |
|---|---|
| `plan` | Prints the absolute path of `plan.json` in one Scratch entry under the marked `maintain/<session-id>/` folder. It reads the checkout's Pins, register, and House style. It clones or fetches each selected Upstream in the external cache, finds its next Pin, and writes staged adopt copies and normalized sides in Scratch. With no arguments, it selects all Upstreams. `<upstream>@<ref>` fixes the chosen ref. An automatic Pin never moves backwards. A run with no moved Pin still writes a full plan with `moved: false`. |
| `merge` | Prints JSON `{rows}` with `id`, `effective_old`, `overlaps`, and `changes` for rows with normalized sides. Each change names its path, binary status, overlapping regions, and local and Upstream edits. It previews overlaps without writing drafts or checkout files. `--decisions` can supply `file_maps: {<row id>: {<Upstream file>: <local suffix>}}`. |
| `check` | Prints JSON `{targets}` for named artifacts and artifacts in `--plan`. It classifies additions and edits, reports register rows, dispositions, callers, and name clashes, and previews takes. Renames and removals also report adopt callers. Repeat `--take`, `--rename`, or `--remove` for multiple targets. A name clash refuses with the Upstream item and a possible take or another-name remedy. At least one target is required. |
| `prepare` | Prints JSON `{note, level, rows, targets, taken}`. It rebuilds the register, Pins, Hold fields, House style, adopt copies, and takes from branch HEAD, then writes one Change note. Version and CHANGELOG stay unchanged. implement must write adapt and merge text, move renamed artifacts, remove deleted artifacts, and update callers first. |
| `gates` | Prints JSON `{ok, outcome, stages, durationMs, phaseOccupancyMs, identity, evidence}`. It runs quick_validate for changed skills, prepares the required Upstream cache and checks the register, runs the full test command, and runs the load smoke. Every phase records its outcome, duration, producing command, working directory, and timestamps. Register checking includes cache preparation in its duration. Test-runner subphases include non-browser tests, browser tests, and candidate-reader preparation when present. The smoke runs outside the home directory and retains its existing validation requirements. It does not run the live Addon judge. |

Every `gates` invocation writes a persistent `maintain/<session-id>/<entry>/report.json` under the project Scratch dir. The report includes the invocation, Git head and base, dirty diff hash and status, runtime and platform identity, dependency-file hashes, and an environment hash. It records selected nonsecret environment values rather than their full contents. Command stdout and stderr remain in separate files beside the report and in the phase's `output`. Failed smoke artifacts join that entry, excluding the native-addon cache. The temporary smoke directory is always removed.

Reports begin with `outcome: "running"` before the first phase and update after each phase completes. SIGINT and SIGTERM mark active work interrupted, forward the signal to the command's process group, and retain diagnostics. Failed, interrupted, or incomplete child phases cannot pass because their runner exited zero. An uncatchable process kill can leave a report running, which is incomplete evidence, not a completed runtime. A tool's background acknowledgement is not a gate completion.

`durationMs` is elapsed time for one invocation. `phaseOccupancyMs` sums its top-level measured stages without counting nested phases twice. Summing occupancy across concurrent invocations measures consumed command time, not elapsed delivery time. Compare the same commands and runtime environment before claiming an improvement. The dominant historical cost is the non-browser suite, not browser scheduling. Timings do not authorize skipping any gate.

Each phase also records a `shadow` receipt with its input hashes, unknown inputs, predicted reuse, fresh result, and reusable-pass eligibility. The comparison uses a conservative dependency superset: the complete checkout, including ignored source, documents, examples, and templates, plus installed dependency and browser trees. Git metadata and the reader's generated working directories are excluded from source discovery. Their relevant identities are recorded separately. Commands, runtime binaries, platform, environment, Git head and base, Upstream commit and tree objects, and prepared candidate-reader bytes participate in the comparison. The output-only `VSTACK_GATE_PHASE_REPORT` destination does not affect the environment hash.

The run hashes inputs before execution and checks their bytes and file-change timestamps again afterward. Unknown identities, command overrides, changed inputs, missing or altered diagnostics, and failed, interrupted, or partial evidence prevent reusable passes. The previous receipt and its evidence must remain complete. The checkout's Git metadata stores only a pointer and hash for the latest Scratch receipt. Deleting Scratch evidence makes a later comparison miss.

Only gates captures shadow inputs. It hands the test runner its capture and the previous run's test subphases through `VSTACK_GATE_SHADOW`, so the runner hashes nothing again and gates evaluates and remembers every subphase. A plain `bun run test` captures nothing and writes no pointer.

Shadow predictions never skip commands or authorize delivery. The final integrated head still requires complete fresh gates and independent Verifier proof. Enabling actual reuse requires a separate decision.

`plan`, `merge`, and `check` are read-only fact-finding for the grill. They make no branch, worktree, or write in any checkout. Scratch and the Upstream cache must stay outside every checkout. The script refuses a `--scratch` dir or an `--upstreams` cache inside a checkout. `prepare` and `gates` serve implement. implement drafts every Update and Hand edit in one isolated drafting worker and applies the gated patch.

| Option | Env | Default or use |
|---|---|---|
| `--root <dir>` | | the plan's `root` when `--plan` is set, else the repo that holds the script |
| `--upstreams <dir>` | `VSTACK_UPSTREAMS` | `~/.cache/vstack/upstreams`, outside every checkout |
| `--remote <url>` | `VSTACK_UPSTREAM_REMOTE` | `https://github.com`. Clones use `<url>/<owner>/<name>.git` |
| `--source clones\|github` | | `clones`. `github` selects API tree reads for target checks and takes. Local clones still supply item bytes. `plan` and the register gate use clones. |
| `--plan <path>` | | the Scratch `plan.json` for `merge`, Update `prepare`, or additional `check` targets |
| `--decisions <file>` | | required by `prepare`. Optional file maps for `merge` |
| `--scratch <dir>` | | only for `plan` and `gates`. The absolute Scratch dir for their `maintain/` entry, outside every checkout. vstack-maintain's drafting worker passes the project's Scratch dir, because its clone's own `.git` gives another repo key |
| `-h`, `--help` | | print usage and exit 0 |

`VSTACK_BASE_REF` overrides the ref used to find the branch's merge base. Otherwise the script uses `origin/HEAD`, or `main` when that remote ref is absent. Tests can inject command arrays named `validate`, `check`, `test`, and `smoke` through the JSON object `VSTACK_MAINTAIN_COMMANDS`.

Exit codes: 0 for success, including a plan with no moved Pin. Exit 2 means refusal, bad arguments, inability to run, or failed gates. Refusals print JSON `{ok: false, reason}`, with `clashes` when relevant. There is no exit 1.

### Decisions JSON

One file holds Update rows and Hand edit targets together: `{ "decisions": [...], "targets": [...], "changelog": [...] }`. At least one row or target and one nonempty, one-line CHANGELOG entry are required. The file does not carry a commit message. implement owns the commit.

Each Update decision has a unique `id` and an `action` (`accept`, `hold`, or `defer`). Optional `disposition`, `artifacts`, and `reason` change the register row. A Disposition change needs a one-line reason. A deferred item needs `gist` and becomes reject with `Deferred at <pin>: <gist>`. Each changed row and new item needs a decision. New items also need `upstream` and `path`, and cannot Hold. Removed rows need `removal`: `drop` or `original` for an unshared artifact, `remove-contribution` or `keep-contribution` for a shared artifact. A renamed adopt item needs `rename: follow|keep`. Keeping its old name requires adapt and a reason.

Each Hand edit target has `action` (`add`, `edit`, `take`, `rename`, or `remove`), `kind` (`skill`, `agent`, or `rule`), and `artifact`. Artifact paths use `plugin/skills/<name>`, `plugin/agents/<name>.md`, or `plugin/rules/<name>.md`. A take adds `upstream`, `path`, and `reason`. A rename adds `to`. An adopt edit or rename needs `flip: { "confirmed": true, "reason": "..." }`. A removal that leaves a register row with no artifacts needs a reason. Each target appears once.

An `edit` target can also carry an optional, nonempty, one-line `reason`. `prepare` applies it to every adapt row that lists the artifact. Other Dispositions keep their reasons, and an adopt flip still uses `flip.reason`.

`prepare` validates decisions before its first checkout write. It derives bookkeeping from HEAD and replays accepted decisions recorded for that same HEAD. Its Change note records patch for a Hand edit, minor for an Update, and major when a shipped skill, agent, or command name is removed or renamed. Hold preserves the old contribution while current Pins and item identities move. The grill records moved refs and confirmed decisions. implement reruns `plan` at those refs and stops with a report if the row set differs.

`prepare` uses the `yaml` package's Document and source-token APIs to keep comments, quoting, flow style, key order, and untouched text. It leaves `plugin/package.json` and CHANGELOG unchanged.

### Preparation ownership

Before replacement, `prepare` requires each bookkeeping file, release-metadata file, and selected adopt or take destination to match HEAD or its last recorded prepared output. Added files, removed files, symlinks, executable modes, and untracked files inside replacement directories participate in this comparison. Existing adapt takes remain agent-owned and are not replaced.

Successful preparation saves its accepted decisions, plan, Change-note path, and output identities at the checkout's Git path `vstack-maintain/prepared.json`. This receipt stays outside the product files. Repeats combine accepted decisions by row id, target artifact, and dropped Upstream key. A new decision replaces the earlier decision for that key; omitted keys stay accepted. Entries accumulate without duplicates in that same Change note. A new HEAD starts a new preparation baseline. A different plan at the same HEAD refuses while an earlier Update remains uncommitted.

An `input-conflict` refusal lists `conflicts` paths and changes no checkout content. Reconcile the named differences; a dirty file alone grants no replacement permission. Keep the receipt for repeats and review-fix handoffs, including the original confirmed decisions for revised targets. Losing the receipt does not authorize replacement of dirty content.

Preparation holds a checkout-specific Git-path lock through validation, input rechecking, writes, and receipt persistence. A cooperating invocation receives `preparation-busy` and the lock path rather than overwriting the owner's work. Retry after that owner finishes. If the owner died, inspect the lock's `owner.json` and confirm its process has ended before removing only that abandoned lock. Inputs and HEAD are checked again immediately before replacement. This does not provide a filesystem-wide transaction against arbitrary external editors.

An unexpected `write-failure` reports the completed `written` paths, the `attempted` path, and a possibly partially written checkout. Inspect those files before recovery. A `receipt-write-failure` means checkout preparation completed but ownership persistence failed. Neither outcome claims an unchanged checkout or permits a blind retry.


### Plan JSON

`schema` changes only when a field changes meaning. Checkout and Scratch paths are absolute. Artifact and item paths keep their repo-relative form.

| Field | Holds |
|---|---|
| `schema` | `1` |
| `moved` | whether any selected Upstream changed its Pin |
| `root` | the checkout the run reads |
| `out` | the Scratch entry with `plan.json`, staged adopt copies, and normalized sides |
| `upstreams[]` | per selected Upstream: `key`, `repo`, `pin_kind`, `clone`, `old` and `new` Pins, `old_commit` and `new_commit` full SHAs, and `moved` |
| `rows[]` | one entry per register row of those Upstreams, in register order |
| `artifacts[]` | groups with `artifact`, contributing `rows`, `shared`, and `needs_work`. Reject rows name no group |
| `new[]` | unregistered items at the new Pin that no move took: `upstream`, `path`, `kind`, `type`, `tree` |
| `counts` | row counts for each class, plus `new` |

Each `rows[]` entry has `id`, `upstream`, `kind`, `disposition`, and `artifacts`, plus these fields:

| Field | Holds |
|---|---|
| `class` | `unchanged`, `changed`, `moved`, or `removed` |
| `held` | `{at, path}` from the Hold fields, or `null` |
| `effective_old` | `{ref, commit, path}` from the held version or old Pin. `path` is `null` only when absent from both |
| `new` | `{ref, commit, path, tree}` at the new Pin, or `null` for a removed item |
| `move` | `{from, to, by, similarity, renamed}` for a moved row, else `null`. `by` is `tree` or `similarity` |
| `files` | changed item files: `{path, status, same_after_house_style}`. Status is `added`, `modified`, or `deleted`. The equality flag applies to modified adapt or merge text, else it is `null`. |
| `house_style_rows` | ids of the `uses: update` House style rows applied to both Upstream sides, in order |
| `sides` | `{old, new}` directories for adapt and merge rows with changed files, else `null`. Missing files stay absent on that side. Binary files stay unchanged. These are the base and incoming sides for implement's merge. |
| `staged` | `{path, files, dropped}` for changed or moved adopt rows, else `null`. `files` records each path and verified blob SHA. `dropped` lists `agents/openai.yaml` when present Upstream. |

## Skill contracts

Consult the skill instead of maintaining a second copy of its procedure here:

- [Existing-code explanations](../plugin/skills/explain/SKILL.md).
- [Session review and approved lessons](../plugin/skills/session/SKILL.md).
- [Flow authoring](../plugin/skills/flow-page/SKILL.md), [reader needs](../plugin/skills/flow-page/references/reader-needs.md), and [host observations](../plugin/skills/flow-page/references/host-observations.md).
- [LLM-flow improvement](../plugin/skills/tune-llm-flow/SKILL.md).
- [Implementation and independent verification](../plugin/skills/implement/END-STATE.md).

## Tests

Run `bun run test` for the full suite through `scripts/test.ts`. It limits discovery to `tests/` through `bunfig.toml` and sets a 30-second timeout because suites launch real `git`, `omp`, and `bun` processes. A preload's `setDefaultTimeout` applies to only one test file, so the runner passes the timeout to every Bun test command.

The test runner checks the candidate's Nuxt CLI, Playwright, and installed Chromium first. It builds the shell and Nitro server into a temporary directory before running non-browser tests, then runs each browser file in its own process. Missing tools fail early with the required dependency named. A failed preparation or test stops the runner before later phases. When gates sets `VSTACK_GATE_PHASE_REPORT`, the runner records the real candidate-reader readiness, candidate-reader build, non-browser, and browser phases through the same measured report.

Browser tests receive only the temporary candidate assets and server. The `readerProof` JSON line records source and asset SHA-256 identities alongside the runtime. Temporary build directories are deleted on completion or failure. Neither `reader/.nuxt`, `reader/.output`, nor the shipped bundle is replaced.

Run a focused browser file through the same preparation route:

```sh
bun scripts/test.ts tests/flow-reader-foundation.browser.test.ts
```

Direct `bun test` bypasses candidate preparation. It is suitable for focused non-browser tests, not evidence that a reader change works. `FLOW_READER_ASSETS` and `FLOW_READER_SERVER` select the prepared app only for isolated `--home` hosts. Both are refused for the normal host. The final integration still runs `bun run reader:build`, full maintainer gates, and independent verification of the final head.

The script runs every `*.browser.test.ts` file in its own Bun process after the other tests. Bun 1.3.14 closes Playwright's extra Chromium stdio descriptors a second time during garbage collection, and a later test's subprocess can own those numbers by then ([microsoft/playwright#42692](https://github.com/microsoft/playwright/issues/42692)). On Linux this throws `EBADF` in an unrelated test or leaves its subprocess wait hanging.

Tests use temporary repos, homes, fixture Upstreams, and process boundaries. Machine setup tests need `omp` and skip without it. Never use real credentials or the user's omp home in a fixture.

Private MCP tests require Git 2.54 or later on PATH and check actual configuration-hook dispatch before running success cases. Unsupported-Git coverage uses an isolated executable boundary that refuses its version query and delegates repository operations to real Git. It does not assume a system Git version. The workstation Verify recipe separately inspects Apple Git.

CI uses the runner image's Git and records its version and actual named-hook dispatch before any test runs. The job fails there if the image's Git cannot dispatch configuration hooks. CI does not build Git or install packages for it.

Flow-page tests assert receipts, refusals, `show` snapshots, stored bytes, and element ids, never page wording or markup. Prove browser and native omp behavior through the linked Verify recipes.

The extension tests use `tests/support/extension-host.ts` and `extension-mocks.ts` for controlled host and judge boundaries. They do not replace a fresh omp session. Use the [Verify skill](../.omp/skills/verify-vstack/SKILL.md) and its [feature map](../.omp/skills/verify-vstack/features/README.md) for live proof.

### Non-browser test cost

Profile the non-browser phase with its unchanged command:

```sh
bun test --timeout 30000 --path-ignore-patterns '**/*.browser.test.ts'
```

Bun reports each test's duration. Group those durations by file before choosing an optimization. Keep the command, revision, runtime, platform, exit status, and raw output for both versions. Repeat the same selection to report variation. A failed run is diagnostic evidence, not a passing baseline.

The native clean-wt ownership refresh uses one `lsof` query for the union of session-lease files and process working directories. File descriptors distinguish lease records from cwd records. Every pre-removal refresh still executes. Linux retains its procfs path. To compare the affected inventory, removal, and source-fact cases:

```sh
bun test --timeout 30000 tests/clean-wt.test.ts --test-name-pattern 'unused clean linked|dirty work is removed only|shared prepared source facts'
```

The gate-timing propagation matrix uses a local compiler fixture so each outcome does not rebuild Nuxt. It still runs readiness, generation, non-browser tests, and each selected browser subprocess through the real runner. `tests/reader-proof.test.ts` retains real Nuxt and Chromium coverage of candidate-source generation and dependency failures. Full gates still execute every required phase.

## Versions and CHANGELOG

A plugin change carries a Change note instead of changing the version or dated CHANGELOG headings. `prepare` writes `change-notes/<uuid>.json` with `schema: 1`, a `level` of `patch`, `minor`, or `major`, and an `entries` array of nonempty, one-line CHANGELOG entries. The shared module `scripts/lib/change-notes.ts` owns this format, reads pending notes at a ref, reports their highest level, and folds a prepared set into CHANGELOG.

Patch means a Hand edit, minor means an Update, and major means a shipped skill, agent, or command name was removed or renamed. Repeated preparations at the same HEAD reuse one note and combine entries without duplicates. Review fixes on a branch with a note need no further note or version change.

A Plugin release is a separate maintainer-run change, landed through a normal PR. Run it from a commit that contains the pending notes:

```sh
bun scripts/vstack-maintain.ts release
```

The command folds every Change note at HEAD under one `## [x.y.z] - <date>` heading, keeps each entry's text, and raises `plugin/package.json` once by their highest level. It removes only those notes. It writes working-tree changes without committing or opening a PR. Commit the manifest, CHANGELOG, note removals, and `plugin-release.json` together, then land them through a normal PR. ship does not cut Plugin releases.

The Plugin release receipt records HEAD's full SHA, the version, and the UTC date. `check-register` reads that commit's note set rather than newer main's set. It checks the exact version increase, removal of every prepared note, and the dated CHANGELOG entries. It rejects a version change without a new receipt and refuses to consume the same prepared Plugin release against an already raised base version.

Notes added on main while the Plugin release PR is open stay pending for the next Plugin release. CI compares plugin changes limited to the Plugin release with the branch's common ancestor so newer main's independent edits do not require another note on the Plugin release branch. The Plugin release command refuses changed Plugin release inputs and reports `input-conflict` before writing. Notes outside its committed set remain untouched, including untracked notes. With no notes at HEAD, it refuses without writing.

Add new entries through Change notes rather than an Unreleased section. [ADR 0064](adr/0064-change-notes-replace-per-pr-plugin-versions.md) records why delivery PRs leave shared Plugin release files alone.
