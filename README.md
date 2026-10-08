# vstack

vstack is a personal omp plugin. It takes Matt Pocock's skills as the base, adds selected skills, principles, and Playbooks from poteto's pstack, and takes single skills from three more Upstreams (diagram-design, good-css, SimpleEnglish). `GLOSSARY.md` defines the words this README uses, and `docs/adr/` records the decisions.

## Install

You need omp and git with working HTTPS credentials for github.com (the repo is private).

1. Clone the repo: `git clone https://github.com/daandden/vstack.git`
2. Link its plugin directory: `omp plugin link <clone>/plugin`
3. Start a new omp session.
4. Run `/skill:setup-vstack` in that session before any other vstack skill. It checks the machine, moves any Matt Pocock setup over to vstack, and writes the project config.

To refresh, run `git pull` in the clone and start a new omp session. The link points at the working tree, so there is nothing else to update.

## Maintainer guide

### Layout

The repo scripts need Bun. Run `bun test` and `bun scripts/check-register.ts` before every commit that touches `plugin/`, the register, or the Pins.

| Path | Ships | What it holds |
|---|---|---|
| `plugin/` | yes | The omp plugin. `package.json` (`name: vstack`, the version, the `omp` field), `skills/<name>/` (flat, one level deep; a skill's page templates sit in its `templates/`), `agents/`, `rules/`, and `extensions/vstack.ts`, the one extension, listed in the `omp` field. A skill's Bun scripts ship in its `scripts/` dir. The agent runs them with the bash tool as `bun "$(realpath skill://<name>/scripts/<script>.ts)"`: external programs never see `skill://` paths, and omp's in-process `realpath` turns the URL into the file path. |
| `pins.yaml` | no | One entry per Upstream: repo, Pin, how the next Pin is found, and which tree entries count as Upstream items. |
| `decision-register.yaml` | no | One row per Upstream item, plus `originals:` for vstack-only artifacts. |
| `house-style.yaml` | no | The House style: replacement rows and rules that turn Upstream text into vstack text. |
| `scripts/` | no | Bun scripts. `check-register.ts` and `update-plan.ts` are CLIs; `lib/` holds the modules other scripts reuse. |
| `tests/` | no | `bun test` suites. Each script is run as a process over temp-dir fixtures (`tests/support/`). |
| `.github/workflows/` | no | CI: the tests and `check-register` on every push and pull request. |
| `CHANGELOG.md` | no | Unreleased section plus one entry per plugin version. |
| `docs/adr/`, `GLOSSARY.md` | no | Decisions and vocabulary. |

Only `plugin/` ships. Upstreams are fetched when needed, never stored in this repo.

### Principle selection

`principle-questions.json` and `sample-prompts.json` at the repo root are the settled #70 question set and 72-prompt calibration corpus. The extension imports the root questions from the linked clone; the Update re-run reads these same files, never a second question copy. POST directly to TypeSafe `/v1/systemone` with `state: { request: preprocessTinyMessage(prompt) }`; the cleaner lives in `plugin/extensions/prompt-cleaner.ts`. The corpus stores expected and allowed picks, baseline probabilities, and the Update drift thresholds.

The extension selects every score at least 0.75 in main sessions with native TypeSafe jev and credentials. Each pointer appears once per session, including resume on the active branch. It returns one hidden message, not system-prompt text. Child sessions receive no selection. A missing native judge or key, request error, or four-second deadline skips silently; one retry shares that deadline. `tests/principle-selection.test.ts` uses the #69 fake host and a stubbed fetch endpoint, including a fetch that ignores abort.


### Pins and Upstream clones

`pins.yaml` keys (`matt`, `pstack`, `diagram`, `css`, `prose`) are also the register's `upstream` values and the names of the local clones under `~/.cache/vstack/upstreams/<key>`. Set `VSTACK_UPSTREAMS` (or pass `--upstreams`) to use another directory. Blobless clones are enough. `check-register` reads trees with `git ls-tree` and never fetches, checks out, or moves HEAD. `update-plan` makes a missing clone and fetches the others, and it never moves HEAD either. To make a clone by hand:

```sh
git clone --filter=blob:none https://github.com/mattpocock/skills.git ~/.cache/vstack/upstreams/matt
git -C ~/.cache/vstack/upstreams/matt fetch --tags origin   # when a Pin is missing from the clone
```

`pin_kind` says how the Update finds the next Pin. `tag` (Base, Prose): the highest `v<major>.<minor>.<patch>` tag; pre-release tags such as `v1.3.0-beta.1` and other tags such as `mattpocock-skills@1.0.0` never count. `commit` (Enhancement, Diagram, CSS): the newest commit on the default branch that touches the entry's `path`. `pin` is the tag name or the full commit SHA.

Each entry's `items:` list says which tree entries at the Pin are Upstream items. `match` is a path glob from the repo root where `*` stays inside one path segment, `type` is `tree` or `blob`, and the first matching pattern sets the `kind`. For example, pstack's automations are one item each, so their nested skills get no rows.

One entry, the CSS upstream, also has `page_lint: scripts/check-css.mjs`: the script `check-register` runs at that Pin over vstack's page templates (see "Page templates" below).

### Decision register

Every row has `id`, `upstream`, `kind` (skill, principle, playbook, agent), `path` and `tree` (the item at the current Pin; `tree` is the git object SHA, a blob SHA for a single file), `disposition` (adopt, adapt, merge, reject), `artifacts` (paths under `plugin/`), and a one-line `reason`. `adr` is optional. A held row also has `held_at` (the Upstream ref its artifact is reconciled with) and `held_path` (the item's path at that ref); the two are set and cleared together, and `path` may be absent only on a held row whose item Upstream removed.

An artifact is one unit under `plugin/`: a skill directory (`plugin/skills/<name>`), an agent or rule file, or any other child of a top-level plugin directory. Several rows may name one artifact (merge rows, and the two forensics Playbooks). Artifacts that come from no Upstream item go under `originals:`. A row whose artifact lands in a later change lists `artifacts: []` until then.

An adopt artifact is the Upstream item copied byte for byte, minus `agents/openai.yaml`, under the Upstream name. To copy one from its Pin:

```sh
mkdir -p /tmp/adopt
git -C ~/.cache/vstack/upstreams/matt archive v1.2.3 skills/productivity/grill-me | tar -x -C /tmp/adopt
mv /tmp/adopt/skills/productivity/grill-me plugin/skills/grill-me
rm plugin/skills/grill-me/agents/openai.yaml && rmdir plugin/skills/grill-me/agents
```

### check-register

```sh
bun scripts/check-register.ts            # or: bun run check-register
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

The `github` source reads the same trees through the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`). It uses `GITHUB_TOKEN` (or `GH_TOKEN`) when set and `GITHUB_API_URL` as the API base. Both sources live in `scripts/lib/upstreams.ts`, which `update-plan` reuses. Byte identity is checked by comparing git blob SHAs, so neither source downloads file contents for it. The one file a source reads is the CSS upstream's `page_lint` script, and only when a page template exists: the `clones` source with `git cat-file` (a blobless clone fetches that one blob on first read), the `github` source through `contents/<path>?ref=<pin>`.

Exit codes: 0 pass, 1 register failures, 2 the check could not run (bad arguments, unreadable `pins.yaml` or register, a missing clone or ref, an API error). Exit 2 prints the remedy, such as the clone or fetch command.

Text output prints one line per failure, `FAIL <class> <item>: <message>`, after `check-register:` note lines, and ends with `check-register: OK` or `check-register: <n> failure(s)`. `--json` prints `{"ok", "notes", "failures": [{"class", "item", "message"}]}`. The item is a row `id`, an artifact path, `plugin/package.json`, or `<upstream>:<path>` for an Upstream item with no row.

| Class | Fails when |
|---|---|
| `invalid-row` | a row lacks a field or has a bad one: duplicate or missing `id`, `upstream` not in `pins.yaml`, unknown `kind`, no `reason`, an artifact outside `plugin/`, `tree` not a full SHA, `held_at` without `held_path` or the reverse |
| `invalid-disposition` | `disposition` is not adopt, adapt, merge, or reject |
| `reject-with-artifacts` | a reject row lists artifacts |
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
| `skill-ref` | adapt, merge, or original markdown holds a bare `/<name>` token for a vstack skill |
| `spawn-vocab` | adapt, merge, or original markdown outside code fences holds `subagent_type`, `generalPurpose`, or `` `Task` ``, or says spawn or spin up outside inline code and outside a fixed subagent line; dispatch fails only in a sentence naming an agent or role, not for reducer or request dispatch |
| `fan-out-block` | adapt, merge, or original markdown holds an incomplete Fan-out block: a gate line that does not cite `skill://vstack-fan-out` with `parts:` and `size:`, a missing or extra fan-out or inline line, a batch that is neither one `task` call with `tasks[]` nor one isolated eval `agent()` cell, a batch naming an agent the plugin does not ship or leaving out the user's override words or the vstack root, or a fan-out or inline line with no gate |
| `single-spawn` | adapt, merge, or original markdown holds a spawn site that names no vstack agent: a `Spawn one` line off the form in `plugin/skills/vstack-fan-out/FORMS.md`, a line naming another agent through `agent: "…"` or `agent="…"`, or a `task` call or eval `agent()` call that names no agent |
| `agent-spawns` | an adapt, merge, or original agent's `spawns:` lists `*` or an agent the plugin does not ship |
| `fixed-fan-out` | adapt, merge, or original markdown outside the rule's allowlist (compare-attempts) holds the fixed `Fan-out (always` form |
| `headless-run` | adapt, merge, or original markdown outside the rule's allowlist (skill-creator) holds a `Headless batch (` line or an `omp -p` command |
| `worktree-cmd` | adapt, merge, or original text runs `git worktree add` |
| `tmp-path` | adapt, merge, or original text names `$TMPDIR/`, `/tmp/`, or the OS temp directory, outside a `mktemp` line |
| `ask-tool` | any markdown artifact, adopt included, has a sentence with an `ask-tool` phrase that does not name `` `ask` `` |
| `page-css` | a page template breaks the CSS upstream's `check-css.mjs` at its Pin; the item is the template and the message holds the script's `path:line` lines |

Rows with an `invalid-row` or `invalid-disposition` failure are skipped by the checks that read their fields, so one bad row reports once. House style rows and rules with an `invalid-house-style` failure are skipped the same way.

A House style failure names the register row behind the artifact, or the artifact path when several rows or `originals:` name it. Its message lists the first file lines that break the row or rule.

#### Version base

The version-bump check compares `plugin/` in the working tree, tracked and untracked files, with one commit:

1. `--base <ref>` or `VSTACK_BASE_REF`, when set. An all-zero SHA, which GitHub sends for a new branch, counts as unset.
2. Else the merge base of `HEAD` and `origin/HEAD`. On a branch this covers every change the branch makes; on the default branch it covers unpushed and uncommitted changes.
3. Else `HEAD`, so only uncommitted changes count.

The note line `version base: <sha> <how it was chosen>` shows the choice. When the base has no `plugin/package.json`, the plugin is new and needs no bump. A branch that is not based on `origin/HEAD` passes its own base, for example `--base feat/vstack-build`. CI passes the pull request's base on a pull request and the push's `before` commit on a push, falling back to the merge base with the default branch.

#### Adding a failure class

Each check is a module in `scripts/lib/checks/` that exports a `Check`: the list of classes it reports and a `run(ctx)` that returns `{ class, item, message }` failures. `ctx` holds the root, the Pins, the register (`rows`, and `validRows` that passed the row checks), the plugin artifacts, the House style, the Upstream source, and the version base. To add a class, emit it from the check it belongs to and add it to that check's `classes`, or write a new module and append it to the list in `scripts/lib/checks/index.ts`. Then add a row to the class table above and a failing fixture to `tests/check-register.test.ts`. A test fails when `--list-classes` prints a class that has no fixture.

A lint over shipped text starts from `lintTargets(ctx)` in `scripts/lib/checks/scope.ts`: every registered artifact with its Disposition (adopt, adapt, merge, or original), its Upstreams, and its text files. Whether a lint covers a Disposition comes from the `scope` of its row or rule in `house-style.yaml`, through `inScope` in `scripts/lib/house-style.ts`; do not test Dispositions anywhere else.

#### Page templates

Every page vstack writes for the user (the Grilling HTML, explain's pages, the how and teach pages, the Update report, the architecture-review report) starts from a page template, and every template follows good-css (#61). A page template is any `*.html` or `*.css` file under `plugin/skills/<name>/templates/`, in the skill that writes the page. `scripts/lib/checks/pages.ts` finds them, reads the Upstream script named by `page_lint:` in `pins.yaml` at that Upstream's Pin, writes it to a temp dir, and runs it with Bun over every template. Each template it flags is one `page-css` failure. With no template the check prints `page templates: none` and reads nothing. Templates never hold a figure: a skill draws its figure through diagram-design, exports it, and inlines the `<svg>` in the page it builds from the template, so the figure's own `<style>` never reaches the lint. diagram-design's own pages under its `assets/` are not templates.

### House style

`house-style.yaml` (ADR 0008) has two lists. Its header comment documents every field.

- `replacements:` are blind substitutions, applied in list order. `match` is `literal` (an exact substring), `name` (no `[\w-]` character on either side, so the `glossary` row rewrites `CONTEXT.md` and leaves `CONTEXT-FORMAT.md` alone), or `ref` (only `/x`, `` `x` ``, `**x**`, and `skill://x`). `upstream` picks the artifacts a row applies to. `scope: required` binds every artifact, adopt included; `scope: adapted` binds adapt, merge, and original text. `uses` says whether the Update (`update`), setup-vstack's Migration (`migration`), or both apply the row. A row that an earlier row rewrites fails `invalid-house-style`, so put the longer phrase first.
- `rules:` are what the agent applies by hand: the fixed spawn and Fan-out wording, skill references, worktrees, Scratch paths, eval for Python, and asking through `ask`. Each has `text`, a `scope`, and a `lint` line that says what `check-register` enforces. `allowlist` names the skills where a rule's form is allowed, and `check-register` skips that rule's lint in them: it limits `fixed-fan-out` to compare-attempts and `headless-run` to skill-creator, and lets writing-for-agents describe a subagent dispatch under `spawn-vocab`. `ask-tool` holds `phrases`, the list its lint matches as whole words in any case. Add a phrase when an asking sentence slipped past the list, and run `bun scripts/check-register.ts` to see which adopt items it would flip.
- The spawn and Fan-out lines themselves live in one place, `plugin/skills/vstack-fan-out/FORMS.md`: the Fan-out block (the `task` batch, the isolated eval batch, and the inline line for a skill that forbids doing the work itself), the single-subagent lines, and the fixed Fan-out line. Copy a form from there, fill its slots, and keep it on one line. A vstack agent is an agent the plugin ships under `plugin/agents/`. The spawn lints read markdown outside frontmatter and code fences, so quoting a form in a fence is safe.

`scripts/lib/house-style.ts` is the one module that reads both lists and applies rows. It has no file access: `parseHouseStyle(doc, upstreamKeys)` validates a parsed file, `selectRows(rows, { use, upstreams, disposition, shippedNames })` picks the rows for one text, `applyRows(text, rows)` rewrites it, and `findRow(text, row)` finds leftovers. `loadHouseStyle(root, upstreamKeys)` in `scripts/lib/vstack-repo.ts` reads the file from a checkout.

To write an adapt item, start from the Upstream text at the Pin with the rows applied, then make the hand edits its contract needs:

```sh
bun -e 'import { applyRows, parseHouseStyle, selectRows } from "./scripts/lib/house-style.ts";
const { houseStyle } = parseHouseStyle(Bun.YAML.parse(await Bun.file("house-style.yaml").text()), new Set(["matt", "pstack", "diagram", "css", "prose"]));
const rows = selectRows(houseStyle.replacements, { use: "update", upstreams: ["matt"], disposition: "adapt" });
process.stdout.write(applyRows(await Bun.stdin.text(), rows));' \
  < <(git -C ~/.cache/vstack/upstreams/matt show v1.2.3:skills/engineering/wizard/SKILL.md) > plugin/skills/wizard/SKILL.md
```

setup-vstack ships exactly the root `uses: migration` rows under `references/house-style.yaml`, with no `rules` list. Generate the copy with `selectRows(rows, {use: "migration"})` and `Bun.YAML.stringify({replacements: rows})`. `migration-house-style` validates its row schema and compares every field in order. The leftover scan skips this copy because its `from` phrases are data.

### Machine Migration

setup-vstack confirms scan roots through `ask` before check 6 runs. `machine.ts --extension-loaded yes|no --scan-root <dir>...` includes Matt leftovers between checks 5 and 7. The default root is `$HOME`. The scan prunes `node_modules`, `.venv`, and `Library`, resolves each `.git` entry with git, and deduplicates common dirs. Directory symlinks are not followed.

`migrate.ts plan --scan-root <dir>...` prints a read-only JSON plan. It lists roots, scan errors, Standard projects, notices, and item ids. Items contain mandatory and destructive flags, source and destination paths, full-file proposed diffs, and manual hits. Private and profile moves and removal of the old private rule are mandatory. Standard projects are listed but not edited. The plan states the downgrade from Matt `main` to `v1.2.3` and that outside links to old private files break.

After the machine plan's Apply all / Choose items / Cancel `ask`, save its original JSON in Scratch. Run `migrate.ts apply --plan <file>`, with `--skip <id>` for each declined optional item. Application refuses changed machine state and skipped mandatory items. `migrate.ts cancel` changes nothing. Exit 0 means complete, 1 means remaining items or a scan error, and 2 means refusal or inability to run. Apply prints applied and skipped ids, failures, warnings, remaining ids, and the new-session instruction.

Removal uses `npx --yes skills@1.7.0 remove -g <names> -y` so that the skills CLI deletes its agent links and lock entries. Detection reads `$XDG_STATE_HOME/skills/.skill-lock.json` when set, else `$HOME/.agents/.skill-lock.json`. `VSTACK_SKILLS_CLI` replaces this command with one executable for process tests. Removal failures warn. A failed private or profile move keeps the old rule and check 6 failing. Private move rollback restores the old store, text, directory name, links, and exclude content when possible. A destination conflict never merges files. The existing vstack copy wins and the project plan resolves the old copy.

The runtime reads the shipped row copy and reuses `scripts/lib/house-style.ts` for parsing and matching. This import requires the full clone that ADR 0005 already requires. Exact absolute prefixes come from each common dir. Relative private rows run only for an ordinary `.git` common dir. Remaining bare words and non-ordinary relative paths need proposed manual diffs in the same `ask`. Remaining mentions in moved stores still fail check 6. Domain filename changes belong to the project Migration.


### update-plan

```sh
bun scripts/update-plan.ts [<upstream>|<upstream>@<ref> ...]
```

`update-plan` is the mechanical part of the Update, which `/skill:vstack-update` runs. It works from `main`: the Pins in `pins.yaml` on `main` are the old Pins, and the Update branch starts there. A run does these steps:

1. For each named Upstream (default: every key in `pins.yaml`), it makes a blobless clone in the clone cache or fetches the one there.
2. It finds the new Pin per `pin_kind` (see "Pins and Upstream clones"). `<upstream>@<ref>` takes that tag or commit instead, and naming Upstreams leaves the others out of the run. On its own, a Pin never moves backwards.
3. When no Pin moved, it prints `{"schema": 1, "moved": false, "upstreams": [...]}` and exits 0. It makes no worktree.
4. Otherwise it makes the Update worktree with `omp wt add -b update/<matt-tag>+<pstack-sha7> <base>/vstack-<repo>-update-<matt-tag>+<pstack-sha7> main`, never with `-q`. The tag and SHA are the new Pins; an Upstream left out of the run gives its current Pin. `<base>` is `$OMP_WORKTREE_DIR`, else `omp config get worktree.base`, else `~/.omp/wt`, and `<repo>` is the basename of the main checkout. When stdout has no `Cloned from … via` line, omp made a plain checkout of tracked files. The run continues there and runs `bun install --frozen-lockfile` when `node_modules` is missing.
5. It reads the register and the House style from the worktree, builds the plan, writes `plan.json`, the staged adopt copies, and the sides under `--out`, and prints the plan.

| Option | Env | Default |
|---|---|---|
| `--root <dir>` | | the repo that holds the script |
| `--upstreams <dir>` | `VSTACK_UPSTREAMS` | `~/.cache/vstack/upstreams` |
| `--remote <url>` | `VSTACK_UPSTREAM_REMOTE` | `https://github.com`; a clone comes from `<url>/<owner>/<name>.git` |
| `--omp <cmd>` | `VSTACK_OMP` | `omp` |
| `--out <dir>` | | `vstack-update/` in the worktree's own git dir (`.git/worktrees/<name>/`), outside the tree |

Exit codes: 0 when it prints a plan, either kind; 2 when it cannot run (bad arguments, an unknown ref, a fetch or `omp wt add` failure, an invalid register or House style on `main`). A run that exits 2 after making the worktree removes the worktree and its branch again. To drop an Update later, run `git worktree remove --force <worktree.path>` and `git branch -D <branch>`; that also deletes the default `--out`.

#### Plan JSON

`/skill:vstack-update` works from this plan. `schema` changes only when a field changes meaning. All paths in it are absolute.

| Field | Holds |
|---|---|
| `schema` | `1` |
| `moved` | `true` (a no-op run prints `false`, `upstreams`, and nothing else) |
| `root` | the checkout the run started from |
| `branch` | `update/<matt-tag>+<pstack-sha7>` |
| `worktree` | `path`, `base`, `cloned` (stdout had `Cloned from … via`), and `deps`: `cloned` (the clone carried what the checkout had), `present`, `installed` (it ran `bun install --frozen-lockfile`), or `none` (no `package.json`) |
| `out` | the directory with `plan.json`, `adopt/`, and `sides/` |
| `upstreams[]` | per Upstream in the run: `key`, `repo`, `pin_kind`, `clone` (its path), `old` and `new` (Pins), `old_commit` and `new_commit` (full SHAs), `moved` |
| `rows[]` | one entry per register row of those Upstreams, in register order (below) |
| `artifacts[]` | one group per artifact the rows name: `artifact`, `rows` (every contributing row id), `shared` (two or more rows), `needs_work` (a row's class is not `unchanged`). Reject rows and rows with `artifacts: []` are in no group. |
| `new[]` | Upstream items at the new Pin that no row names and no move took: `upstream`, `path`, `kind`, `type`, `tree` |
| `counts` | how many rows have each class, plus `new` |

Each `rows[]` entry has the row's `id`, `upstream`, `kind`, `disposition`, and `artifacts`, and these fields:

| Field | Holds |
|---|---|
| `class` | `unchanged`, `changed`, `moved`, or `removed` (see below) |
| `held` | `{at, path}` from `held_at` and `held_path`, or `null` |
| `effective_old` | `{ref, commit, path}`: the baseline, `(held_at, held_path)` on a held row and `(old Pin, path)` otherwise. `path` is `null` only on a row with neither. |
| `new` | `{ref, commit, path, tree}`: the item at the new Pin, the values `path` and `tree` take when the row is accepted. `null` when `removed`. |
| `move` | `{from, to, by, similarity, renamed}` on a `moved` row, else `null`. `by` is `tree` (same tree SHA, similarity 100) or `similarity` (git rename detection). `renamed` is true when the item's name changed. |
| `files` | the item's files that differ between `effective_old` and `new`: `{path, status, same_after_house_style}`. `path` is inside the item (the file name for a single-file item); `status` is `added`, `modified`, or `deleted`. `same_after_house_style` is set on a modified text file of an adapt or merge row: true when the two sides are equal once the House style rows ran. Otherwise it is `null`. |
| `house_style_rows` | ids of the House style rows run over the sides, in order: the `uses: update` rows for the row's Upstream and Disposition |
| `sides` | adapt and merge rows with `files`: `{old, new}`, two directories holding each listed file at `effective_old` and at `new`, with those rows applied. A file is missing from the side where it does not exist. Binary files are copied as they are. They are the base and the Upstream side for `git merge-file <artifact file> <old>/<path> <new>/<path>`. |
| `staged` | adopt rows that are `changed` or `moved`: `{path, files, dropped}`. `path` is the copy of the item at the new Pin, named as the item is named there. `files` lists each file with the blob SHA it was checked against after writing. `dropped` is `["agents/openai.yaml"]` when the item had one. |

The classes:

- `unchanged`: none of the row's files differ between `effective_old` and the new Pin.
- `changed`: some do. A held row is compared from `(held_at, held_path)`, so it is `changed` whenever it differs from the new Pin, even when the item did not change between the two Pins.
- `moved`: the row's `path` is gone at the new Pin, and the item was paired with an item the new Pin adds: the same tree, or `SKILL.md` (the file itself for a single-file item) at 50% or more similarity in git rename detection. The user confirms each move. `files` holds the content changes.
- `removed`: the row's `path` is gone and nothing was paired with it.
- `new`: in `new[]`, not in `rows[]`.

A row owns the files under its path except those under a longer path that is another row or another Upstream item, so a changed Playbook file counts for its Playbook row and not for `poteto-mode`. `agents/openai.yaml` never counts, because vstack never ships it.

### Tests

`bun test` runs `tests/` only (`bunfig.toml`). The check-register tests build fixture Upstream git repos with tags, a moved item, and a removed item, then a vstack checkout committed as the version base. They run the script as a process and assert its exit code and its failures by class and item. One case serves a local stand-in for the GitHub API, so the `github` source is tested too.

`tests/update-plan.test.ts` runs update-plan as a process. `tests/support/update-fixture.ts` serves two fixture Upstreams over `file://` (`matt` with release, pre-release, and stray tags; `pstack` with commits inside and outside `pstack/`), gives the script an empty clone cache, and passes `--omp` a stand-in (`tests/support/fake-omp.ts`). The stand-in answers `omp config get worktree.base` and makes `omp wt add` worktrees with git, printing the `Cloned from … via` line only when `FAKE_OMP_CLONE=1`, so both the clone and the plain-checkout paths run without an omp home. The tests assert the plan JSON and the files it names.

`tests/extension.test.ts` tests the extension through a fake omp host (`tests/support/extension-host.ts`, after omp-tools' advisor-concern-wake tests). `fakeHost(options)` runs the extension factory against a partial ExtensionAPI and ctx and returns the registered tools, the event handlers, `emit(name, event)` (awaits every handler and returns their results), `callTool(name, params)`, and the session name with its source. Options set `ctx.agent` (main or sub), the models `ctx.modelRegistry.find` returns, and their API keys. The fake `setSessionName` stores a `user` name, as every omp mode does, and `autoTitle(name)` is refused after one. Stub TypeSafe's endpoint with `spyOn(globalThis, "fetch")`. The repo has no omp SDK dependency, so the extension imports omp types only (`import type`), and the fake `pi.arktype` only records the schema.

`tests/vstack-tmp.test.ts` and `tests/vstack-clean.test.ts` run the two Scratch scripts, `plugin/skills/vstack-tmp/scripts/path.ts` and `plugin/skills/vstack-clean/scripts/clean.ts`, as processes. Both scripts take `--home <dir>`, and the tests pass a temp dir there, so they never write to the real `~/.vstack/`. Never redirect `HOME` for them; omp's own home stays where it is. The path tests cover the repo key (linked worktrees share it, `_global` outside a repo), and the clean tests cover the TTL by the newest mtime anywhere in an entry, symlinks that are never followed, and pruning of empty kind and key dirs.

`tests/setup-vstack-machine.test.ts` and `tests/setup-vstack-project.test.ts` run setup-vstack's two scripts as processes. `machine.ts` asks the real `omp` for every fact (`omp config list --json`, `omp token typesafe`, `omp setup python --check --json`) and writes settings only through `omp config set`, so its tests give it a throwaway `HOME` whose `.omp/agent/config.yml` they write, an env of only `PATH`, `HOME`, and `TERM`, a cwd outside the real home, and `TYPESAFE_API_KEY` as the stand-in credential. They need omp on `PATH` and skip without it (CI); the case for a missing omp runs everywhere. `project.ts` needs only git: its tests build temp repos and linked worktrees and assert the state JSON and the files in the Standard setup commit.

`tests/setup-vstack-migration.test.ts` runs the Migration and machine scripts as processes over fake homes. Its smoke has all 25 Matt lock entries, diagram-design and good-css copies, CLI-style agent links, a private repo, a linked checkout, a submodule, a separate git dir, rules, and profiles. A stand-in skills CLI implements removal at that external boundary. A stand-in omp supplies the other machine facts. Git and filesystem moves are real. Other cases cover Cancel, mandatory choices, stale plans, pruning, manual hits, destination conflicts, warning-only removal, and filesystem rename rollback.


### Versions and CHANGELOG

Every change under `plugin/` raises the version in `plugin/package.json`: patch for a hand edit, minor for an Update, major when a shipped skill, agent, or command name is removed or renamed. Add a line under `## [Unreleased]` in `CHANGELOG.md` with each change, and when you raise the version, move those lines under a new `## [x.y.z] - <date>` heading.
