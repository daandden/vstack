# Maintainer guide

[Project overview and installation](../README.md)

## Layout

The repo scripts need Bun. Run `bun run test` and `bun scripts/check-register.ts` before every commit that touches `plugin/`, the register, or the Pins.

| Path | Ships | What it holds |
|---|---|---|
| `plugin/` | yes | The omp plugin. `package.json` (`name: vstack`, the version, the `omp` field), `skills/<name>/` (flat, one level deep; a skill's page templates sit in its `templates/`), `agents/`, `rules/`, and `extensions/vstack.ts`, the one extension, listed in the `omp` field. A skill's Bun scripts ship in its `scripts/` dir. The agent runs them with the bash tool as `bun "$(realpath skill://<name>/scripts/<script>.ts)"`: external programs never see `skill://` paths, and omp's in-process `realpath` turns the URL into the file path. |
| `pins.yaml` | no | One entry per Upstream: repo, Pin, how the next Pin is found, and which tree entries count as Upstream items. |
| `decision-register.yaml` | no | One row per Upstream item, `originals:` for vstack-only artifacts, and `utility:` for Utility skills. |
| `house-style.yaml` | no | The House style: replacement rows and rules that turn Upstream text into vstack text. |
| `scripts/` | no | Bun CLIs: `check-register.ts`, `vstack-maintain.ts`, and `addon-judge-check.ts`. `lib/` holds shared modules. `load-smoke.sh` checks a fresh omp load. |
| `addon-questions.json`, `sample-prompts.json`, `sample-briefs.json` | no | The Addon judge catalog and its two sample corpora, read from the linked clone. |
| `.omp/skills/verify-vstack/` | no | The Verify skill, feature recipes, and omp driver. |
| `tests/` | no | Test suites, run with `bun run test`. Each script is run as a process over temp-dir fixtures (`tests/support/`). |
| `.github/workflows/` | no | CI: the tests and `check-register` on every push and pull request. |
| `CHANGELOG.md` | no | Unreleased section plus one entry per plugin version. |
| `docs/adr/`, `GLOSSARY.md` | no | Decisions and vocabulary. |

Only `plugin/` ships. Upstreams are fetched when needed, never stored in this repo.

### Flow reader delivery

The reader source lives under `reader/`. Its production bundle ships prebuilt under `plugin/skills/flow-page/reader/`. Installation and normal launch require no build or development server.

When reader source changes, run `./node_modules/.bin/vp run reader:build` and commit its shipped output with the source. Compare the source and shipped file inventories against the prior commit to establish freshness. An integration that changes neither source nor shipped files needs no rebuild.

The Local Flow host loads its reader bytes at startup. A changed bundle makes a running host incompatible. Stop only the owned host with `bun plugin/skills/flow-page/scripts/flow-page.ts host stop`, then use `bound` or `show` to start the current host and retrieve the live URL. Stored Flow data is not a static reader. Committed content stays committed when the host is unavailable.

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

## Pins and Upstream clones

`pins.yaml` keys (`matt`, `pstack`, `css`) are register `upstream` values and local clone names under `~/.cache/vstack/upstreams/<key>`. Set `VSTACK_UPSTREAMS` or pass `--upstreams` for another directory. Blobless clones suffice. check-register never fetches, checks out, or moves HEAD. vstack-maintain plan fetches selected Upstreams without moving HEAD. Target checks fetch only missing Pins and held refs. Keep the cache outside every checkout. To create a clone:

```sh
git clone --filter=blob:none https://github.com/mattpocock/skills.git ~/.cache/vstack/upstreams/matt
git -C ~/.cache/vstack/upstreams/matt fetch --tags origin
```

`pin_kind` selects how the Update finds its next Pin. `tag` for Base selects the highest `v<major>.<minor>.<patch>` tag, excluding prereleases and other tag forms. `commit` for Enhancement and CSS selects the newest default-branch commit touching the configured `path`. `pin` is the tag name or full commit SHA.

Each entry's `items:` list says which tree entries at the Pin are Upstream items. `match` is a path glob from the repo root where `*` stays inside one path segment, `type` is `tree` or `blob`, and the first matching pattern sets the `kind`. For example, pstack's automations are one item each, so their nested skills get no rows.

One entry, the CSS upstream, also has `page_lint: scripts/check-css.mjs`: the script `check-register` runs at that Pin over vstack's page templates (see "Page templates" below).

## Decision register

Every row has `id`, `upstream`, `kind` (skill, principle, playbook, agent), `path` and `tree` (the item at the current Pin; `tree` is the git object SHA, a blob SHA for a single file), `disposition` (adopt, adapt, merge, reject), `artifacts` (paths under `plugin/`), and a one-line `reason`. `adr` is optional. A held row also has `held_at` (the Upstream ref its artifact is reconciled with) and `held_path` (the item's path at that ref); the two are set and cleared together, and `path` may be absent only on a held row whose item Upstream removed.

An artifact is one unit under `plugin/`: a skill directory (`plugin/skills/<name>`), an agent or rule file, or another child of a top-level plugin directory. Several rows can name one artifact. Artifacts with no Upstream item go under `originals:`. Every non-reject row names at least one artifact. Only reject rows have `artifacts: []`.

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

It proves that the register, `pins.yaml`, `plugin/`, and the Upstreams agree. Options:

| Option | Env | Default |
|---|---|---|
| `--root <dir>` | | the repo that holds the script |
| `--source clones\|github` | `VSTACK_UPSTREAM_SOURCE` | `github` when `GITHUB_ACTIONS=true`, else `clones` |
| `--upstreams <dir>` | `VSTACK_UPSTREAMS` | `~/.cache/vstack/upstreams` |
| `--base <ref>` | `VSTACK_BASE_REF` | see "Version base" below |
| `--json` | | text output |
| `--list-classes` | | prints every failure class and exits |

The `github` source reads trees through the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`). It uses `GITHUB_TOKEN` or `GH_TOKEN` when set and `GITHUB_API_URL` as the API base. Both sources live in `scripts/lib/upstreams.ts`, which vstack-maintain reuses. Byte identity compares git blob SHAs without downloading contents. Page lint reads the CSS script only when a page template exists. The clones source uses `git cat-file`. A blobless clone fetches that blob on first read. The github source uses `contents/<path>?ref=<pin>`.

Exit codes: 0 pass, 1 register failures, 2 the check could not run (bad arguments, unreadable `pins.yaml` or register, a missing clone or ref, an API error). Exit 2 prints the remedy, such as the clone or fetch command.

Text output prints one line per failure, `FAIL <class> <item>: <message>`, after `check-register:` note lines, and ends with `check-register: OK` or `check-register: <n> failure(s)`. `--json` prints `{"ok", "notes", "failures": [{"class", "item", "message"}]}`. The item is a row `id`, an artifact path, `plugin/package.json`, or `<upstream>:<path>` for an Upstream item with no row.

| Class | Fails when |
|---|---|
| `invalid-row` | a row lacks a field or has a bad one: duplicate or missing `id`, `upstream` not in `pins.yaml`, unknown `kind`, no `reason`, an artifact outside `plugin/`, `tree` not a full SHA, `held_at` without `held_path` or the reverse |
| `invalid-disposition` | `disposition` is not adopt, adapt, merge, or reject |
| `reject-with-artifacts` | a reject row lists artifacts |
| `non-reject-without-artifacts` | an adopt, adapt, or merge row names no artifacts |
| `absent-path` | a row that is not held has no `path` |
| `missing-artifact` | a row or `originals:` names a path that does not exist |
| `unregistered-artifact` | a plugin artifact that no row names and `originals:` does not list |
| `current-pin-mismatch` | `path` does not exist at the current Pin, or `tree` is not its object SHA there |
| `reconciled-missing` | a held row's `held_path` does not exist at `held_at` |
| `adopt-renamed` | an adopt artifact's name differs from the Upstream item's name at its reconciled version |
| `adopt-not-identical` | an adopt artifact's files differ from the item at its reconciled version, `(held_at, held_path)` on a held row and `(pin, path)` otherwise, minus `agents/openai.yaml` |
| `unregistered-upstream-item` | an item at a Pin (per `pins.yaml` `items:`) that no row's `path` names |
| `invalid-manifest` | `plugin/package.json` lacks `name: vstack`, an `x.y.z` version, or the `omp` field |
| `no-version-bump` | `plugin/` changed since the version base and the version is not higher than the base's |
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
| `ask-tool` | any markdown artifact, adopt included, has a sentence with an `ask-tool` phrase that names neither `` `ask` `` nor `` `flow_ask` `` |
| `page-css` | a page template breaks the CSS upstream's `check-css.mjs` at its Pin; the item is the template and the message holds the script's `path:line` lines |
| `invalid-utility` | a `utility:` entry names no shipped skill, or names a skill with a non-reject Base upstream row |
| `addon-slash-route` | text under `plugin/` or in `README.md` contains `/skill:<addon>`. Use `skill://<addon>` instead |
| `addon-question-mismatch` | a key in the `questions` map of `addon-questions.json` names no shipped skill or names a Utility skill, or a shipped Addon has no such key |
| `brief-sample-mismatch` | a sample in `sample-briefs.json` has an empty `prompt`, or an `expected` or `allowed` label that is not a subagent question (a principle in `addon-questions.json` other than `principle-never-block-on-the-human`). The item is `sample-briefs.json:<id>` |

Rows with an `invalid-row` or `invalid-disposition` failure are skipped by the checks that read their fields, so one bad row reports once. House style rows and rules with an `invalid-house-style` failure are skipped the same way.

A House style failure names the register row behind the artifact, or the artifact path when several rows or `originals:` name it. Its message lists the first file lines that break the row or rule.

### Version base

The version-bump check compares `plugin/` in the working tree, tracked and untracked files, with one commit:

1. `--base <ref>` or `VSTACK_BASE_REF`, when set. An all-zero SHA, which GitHub sends for a new branch, counts as unset.
2. Else the merge base of `HEAD` and `origin/HEAD`. On a branch this covers every change the branch makes; on the default branch it covers unpushed and uncommitted changes.
3. Else `HEAD`, so only uncommitted changes count.

The note line `version base: <sha> <how it was chosen>` shows the choice. When the base has no `plugin/package.json`, the plugin is new and needs no bump. A branch that is not based on `origin/HEAD` passes its own base, for example `--base feat/vstack-build`. CI passes the pull request's base on a pull request and the push's `before` commit on a push, falling back to the merge base with the default branch.

### Adding a failure class

Each check is a module in `scripts/lib/checks/` that exports a `Check`: the list of classes it reports and a `run(ctx)` that returns `{ class, item, message }` failures. `ctx` holds the root, the Pins, the register (`rows`, and `validRows` that passed the row checks), the plugin artifacts, the House style, the Upstream source, and the version base. To add a class, emit it from the check it belongs to and add it to that check's `classes`, or write a new module and append it to the list in `scripts/lib/checks/index.ts`. Then add a row to the class table above and a failing fixture to `tests/check-register.test.ts`. A test fails when `--list-classes` prints a class that has no fixture.

A lint over shipped text starts from `lintTargets(ctx)` in `scripts/lib/checks/scope.ts`: every registered artifact with its Disposition (adopt, adapt, merge, or original), its Upstreams, and its text files. Whether a lint covers a Disposition comes from the `scope` of its row or rule in `house-style.yaml`, through `inScope` in `scripts/lib/house-style.ts`; do not test Dispositions anywhere else.

### Page templates

Every page vstack writes for the user, the Flow page and teach's lessons, starts from a page template. Every template follows good-css (#61). A page template is any `*.html` or `*.css` under `plugin/skills/<name>/templates/`. `scripts/lib/checks/pages.ts` runs the CSS Upstream's `page_lint:` script at its Pin over these files. Each flagged template reports `page-css`. With no template, the check reads nothing. Templates hold no authored figure. The caller writes Mermaid and renders it through vstack-figures with Pele, captures the SVG in the Flow, and may inline its exact bytes in an offline lesson.

## House style

`house-style.yaml` (ADR 0008) has two lists. Its header comment documents every field.

- `replacements:` are blind substitutions, applied in list order. `match` is `literal` (an exact substring), `name` (no `[\w-]` character on either side), or `ref` (only `/x`, `` `x` ``, `**x**`, and `skill://x`). The `glossary` row rewrites `CONTEXT.md` and leaves `CONTEXT-FORMAT.md` alone. `upstream` picks the artifacts a row applies to. `scope: required` binds every artifact, adopt included. `scope: adapted` binds adapt, merge, and original text. `uses` selects the Update (`update`), setup-vstack's Migration (`migration`), or both. A row that an earlier row rewrites fails `invalid-house-style`, so put the longer phrase first.
- `rules:` are what the agent applies by hand: the fixed spawn and Fan-out wording, skill references, worktrees, Scratch paths, eval for Python, and asking through `ask`. Each has `text`, a `scope`, and a `lint` line that says what `check-register` enforces. `allowlist` names the skills where a rule's form is allowed, and `check-register` skips that rule's lint in them. It limits `headless-run` to skill-creator and lets writing-for-agents describe a subagent dispatch under `spawn-vocab`. `ask-tool` holds `phrases`, the list its lint matches as whole words in any case. Add a phrase when an asking sentence slipped past the list, and run `bun scripts/check-register.ts` to see which adopt items it would flip.
- The spawn and Fan-out lines themselves live in one place, `plugin/skills/vstack-fan-out/FORMS.md`: the Fan-out line (the `task` batch or the isolated eval batch) and the single-subagent lines. Copy a form from there, fill its slots, and keep it on one line. A vstack agent is an agent the plugin ships under `plugin/agents/`. The spawn lints read markdown outside frontmatter and code fences, so quoting a form in a fence is safe.

`scripts/lib/house-style.ts` is the one module that reads both lists and applies rows. It has no file access: `parseHouseStyle(doc, upstreamKeys)` validates a parsed file, `selectRows(rows, { use, upstreams, disposition, shippedNames })` picks the rows for one text, `applyRows(text, rows)` rewrites it, and `findRow(text, row)` finds leftovers. `loadHouseStyle(root, upstreamKeys)` in `scripts/lib/vstack-repo.ts` reads the file from a checkout.

To write an adapt item, start from the Upstream text at the Pin with the rows applied, then make the hand edits its contract needs:

```sh
bun -e 'import { applyRows, parseHouseStyle, selectRows } from "./scripts/lib/house-style.ts";
const { houseStyle } = parseHouseStyle(Bun.YAML.parse(await Bun.file("house-style.yaml").text()), new Set(["matt", "pstack", "css"]));
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
bun scripts/vstack-maintain.ts plan [--scratch <dir>] [<upstream>|<upstream>@<ref> ...]
bun scripts/vstack-maintain.ts merge --plan <plan.json> [--decisions <file>]
bun scripts/vstack-maintain.ts check [--plan <plan.json>] [<artifact> ...] \
  [--take <upstream>:<path>] [--rename <artifact>=<to>] [--remove <artifact>]
bun scripts/vstack-maintain.ts prepare --decisions <file> [--plan <plan.json>]
bun scripts/vstack-maintain.ts gates [--scratch <dir>]
```

| Command | Output and effects |
|---|---|
| `plan` | Prints the absolute path of `plan.json` in one Scratch entry under `~/.vstack/tmp/<repo-key>/maintain/`, or under `<dir>/maintain/` with `--scratch <dir>`. It reads the checkout's Pins, register, and House style. It clones or fetches each selected Upstream in the external cache, finds its next Pin, and writes staged adopt copies and normalized sides in Scratch. With no arguments, it selects all Upstreams. `<upstream>@<ref>` fixes the chosen ref. An automatic Pin never moves backwards. A run with no moved Pin still writes a full plan with `moved: false`. |
| `merge` | Prints JSON `{rows}` with `id`, `effective_old`, `overlaps`, and `changes` for rows with normalized sides. Each change names its path, binary status, overlapping regions, and local and Upstream edits. It previews overlaps without writing drafts or checkout files. `--decisions` can supply `file_maps: {<row id>: {<Upstream file>: <local suffix>}}`. |
| `check` | Prints JSON `{targets}` for named artifacts and artifacts in `--plan`. It classifies additions and edits, reports register rows, dispositions, callers, and name clashes, and previews takes. Renames and removals also report adopt callers. Repeat `--take`, `--rename`, or `--remove` for multiple targets. A name clash refuses with the Upstream item and a possible take or another-name remedy. At least one target is required. |
| `prepare` | Prints JSON `{version, rows, targets, taken}`. It rebuilds bookkeeping from branch HEAD: the register, Pins, Hold fields, House style, version, and CHANGELOG. It copies adopt items and taken items from the selected Pin. implement must write adapt and merge text, move renamed artifacts, remove deleted artifacts, and update callers first. |
| `gates` | Prints JSON `{ok, stages}`. It runs quick_validate for changed skills, check-register, `bun test`, and the load smoke. Each stage reports its name, result, output, and process exit code when available. The smoke runs outside the home directory. The gate always deletes its temporary output directory. On failure, it copies the evidence into one Scratch entry of kind `maintain` and prints that path in the smoke stage output. It does not run the live Addon judge. |

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

`prepare` validates decisions before its first checkout write. It reads bookkeeping from HEAD, not from earlier uncommitted bookkeeping. Its version exceeds HEAD's version, with at most one major bump per branch. Hold preserves the old contribution while current Pins and item identities move. The grill records moved refs and confirmed decisions. implement reruns `plan` at those refs and stops with a report if the row set differs.

`prepare` uses the `yaml` package's Document and source-token APIs to keep comments, quoting, flow style, key order, and untouched text. It changes only the version value in `plugin/package.json`.

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

Run `bun run test` for the full suite. It limits discovery to `tests/` through `bunfig.toml` and sets a 30-second timeout because suites launch real `git`, `omp`, and `bun` processes. A preload's `setDefaultTimeout` applies to only one test file, so keep the timeout in the package script.

Tests use temporary repos, homes, fixture Upstreams, and process boundaries. Machine setup tests need `omp` and skip without it. Never use real credentials or the user's omp home in a fixture.

Flow-page tests assert receipts, refusals, `show` snapshots, stored bytes, and element ids, never page wording or markup. Prove browser and native omp behavior through the linked Verify recipes.

The extension tests use `tests/support/extension-host.ts` and `extension-mocks.ts` for controlled host and judge boundaries. They do not replace a fresh omp session. Use the [Verify skill](../.omp/skills/verify-vstack/SKILL.md) and its [feature map](../.omp/skills/verify-vstack/features/README.md) for live proof.

## Versions and CHANGELOG

Every change under `plugin/` raises the version in `plugin/package.json`: patch for a hand edit, minor for an Update, major when a shipped skill, agent, or command name is removed or renamed. Add a line under `## [Unreleased]` in `CHANGELOG.md` with each change, and when you raise the version, move those lines under a new `## [x.y.z] - <date>` heading.
