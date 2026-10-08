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
| `plugin/` | yes | The omp plugin. `package.json` (`name: vstack`, the version, the `omp` field), `skills/<name>/` (flat, one level deep), `agents/`, `rules/`, and `extensions/vstack.ts`, the one extension, listed in the `omp` field. A skill's Bun scripts ship in its `scripts/` dir. The agent runs them with the bash tool as `bun "$(realpath skill://<name>/scripts/<script>.ts)"`: external programs never see `skill://` paths, and omp's in-process `realpath` turns the URL into the file path. |
| `pins.yaml` | no | One entry per Upstream: repo, Pin, and which tree entries count as Upstream items. |
| `decision-register.yaml` | no | One row per Upstream item, plus `originals:` for vstack-only artifacts. |
| `house-style.yaml` | no | The House style: replacement rows and rules that turn Upstream text into vstack text. |
| `scripts/` | no | Bun scripts. `check-register.ts` is the CLI; `lib/` holds the modules other scripts reuse. |
| `tests/` | no | `bun test` suites. Each script is run as a process over temp-dir fixtures (`tests/support/`). |
| `.github/workflows/` | no | CI: the tests and `check-register` on every push and pull request. |
| `CHANGELOG.md` | no | Unreleased section plus one entry per plugin version. |
| `docs/adr/`, `GLOSSARY.md` | no | Decisions and vocabulary. |

Only `plugin/` ships. Upstreams are fetched when needed, never stored in this repo.

### Pins and Upstream clones

`pins.yaml` keys (`matt`, `pstack`, `diagram`, `css`, `prose`) are also the register's `upstream` values and the names of the local clones under `~/.cache/vstack/upstreams/<key>`. Set `VSTACK_UPSTREAMS` (or pass `--upstreams`) to use another directory. Blobless clones are enough; the scripts read trees with `git ls-tree` and never fetch, check out, or move HEAD:

```sh
git clone --filter=blob:none https://github.com/mattpocock/skills.git ~/.cache/vstack/upstreams/matt
git -C ~/.cache/vstack/upstreams/matt fetch --tags origin   # when a Pin is missing from the clone
```

Each entry's `items:` list says which tree entries at the Pin are Upstream items. `match` is a path glob from the repo root where `*` stays inside one path segment, `type` is `tree` or `blob`, and the first matching pattern sets the `kind`. For example, pstack's automations are one item each, so their nested skills get no rows.

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

The `github` source reads the same trees through the GitHub REST API (`commits/<ref>`, then `git/trees/<sha>?recursive=1`). It uses `GITHUB_TOKEN` (or `GH_TOKEN`) when set and `GITHUB_API_URL` as the API base. Both sources live in `scripts/lib/upstreams.ts`, which `update-plan` reuses. Byte identity is checked by comparing git blob SHAs, so neither source downloads file contents.

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
| `skill-ref` | adapt, merge, or original markdown holds a bare `/<name>` token for a vstack skill |
| `spawn-vocab` | adapt, merge, or original markdown holds `subagent_type`, `generalPurpose`, or `` `Task` ``, or says spawn, dispatch, or spin up outside a `Spawn one` or `Fan-out gate (` line |
| `worktree-cmd` | adapt, merge, or original text runs `git worktree add` |
| `tmp-path` | adapt, merge, or original text names `$TMPDIR/`, `/tmp/`, or the OS temp directory, outside a `mktemp` line |
| `ask-tool` | any markdown artifact, adopt included, has a sentence with an `ask-tool` phrase that does not name `` `ask` `` |

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

### House style

`house-style.yaml` (ADR 0008) has two lists. Its header comment documents every field.

- `replacements:` are blind substitutions, applied in list order. `match` is `literal` (an exact substring), `name` (no `[\w-]` character on either side, so the `glossary` row rewrites `CONTEXT.md` and leaves `CONTEXT-FORMAT.md` alone), or `ref` (only `/x`, `` `x` ``, `**x**`, and `skill://x`). `upstream` picks the artifacts a row applies to. `scope: required` binds every artifact, adopt included; `scope: adapted` binds adapt, merge, and original text. `uses` says whether the Update (`update`), setup-vstack's Migration (`migration`), or both apply the row. A row that an earlier row rewrites fails `invalid-house-style`, so put the longer phrase first.
- `rules:` are what the agent applies by hand: the fixed spawn and Fan-out wording, skill references, worktrees, Scratch paths, eval for Python, and asking through `ask`. Each has `text`, a `scope`, and a `lint` line that says what `check-register` enforces. `allowlist` names the skills where a rule's form is allowed, and `check-register` skips that rule's lint in them: it limits `fixed-fan-out` to compare-attempts and `headless-run` to skill-creator, and lets writing-for-agents describe a subagent dispatch under `spawn-vocab`. `ask-tool` holds `phrases`, the list its lint matches as whole words in any case. Add a phrase when an asking sentence slipped past the list, and run `bun scripts/check-register.ts` to see which adopt items it would flip.

`scripts/lib/house-style.ts` is the one module that reads both lists and applies rows. It has no file access: `parseHouseStyle(doc, upstreamKeys)` validates a parsed file, `selectRows(rows, { use, upstreams, disposition, shippedNames })` picks the rows for one text, `applyRows(text, rows)` rewrites it, and `findRow(text, row)` finds leftovers. `loadHouseStyle(root, upstreamKeys)` in `scripts/lib/vstack-repo.ts` reads the file from a checkout.

To write an adapt item, start from the Upstream text at the Pin with the rows applied, then make the hand edits its contract needs:

```sh
bun -e 'import { applyRows, parseHouseStyle, selectRows } from "./scripts/lib/house-style.ts";
const { houseStyle } = parseHouseStyle(Bun.YAML.parse(await Bun.file("house-style.yaml").text()), new Set(["matt", "pstack", "diagram", "css", "prose"]));
const rows = selectRows(houseStyle.replacements, { use: "update", upstreams: ["matt"], disposition: "adapt" });
process.stdout.write(applyRows(await Bun.stdin.text(), rows));' \
  < <(git -C ~/.cache/vstack/upstreams/matt show v1.2.3:skills/engineering/wizard/SKILL.md) > plugin/skills/wizard/SKILL.md
```

### Tests

`bun test` runs `tests/` only (`bunfig.toml`). The check-register tests build fixture Upstream git repos with tags, a moved item, and a removed item, then a vstack checkout committed as the version base. They run the script as a process and assert its exit code and its failures by class and item. One case serves a local stand-in for the GitHub API, so the `github` source is tested too.

`tests/extension.test.ts` tests the extension through a fake omp host (`tests/support/extension-host.ts`, after omp-tools' advisor-concern-wake tests). `fakeHost(options)` runs the extension factory against a partial ExtensionAPI and ctx and returns the registered tools, the event handlers, `emit(name, event)` (awaits every handler and returns their results), `callTool(name, params)`, and the session name with its source. Options set `ctx.agent` (main or sub), the models `ctx.modelRegistry.find` returns, and their API keys. The fake `setSessionName` stores a `user` name, as every omp mode does, and `autoTitle(name)` is refused after one. Stub TypeSafe's endpoint with `spyOn(globalThis, "fetch")`. The repo has no omp SDK dependency, so the extension imports omp types only (`import type`), and the fake `pi.arktype` only records the schema.

`tests/vstack-tmp.test.ts` and `tests/vstack-clean.test.ts` run the two Scratch scripts, `plugin/skills/vstack-tmp/scripts/path.ts` and `plugin/skills/vstack-clean/scripts/clean.ts`, as processes. Both scripts take `--home <dir>`, and the tests pass a temp dir there, so they never write to the real `~/.vstack/`. Never redirect `HOME` for them; omp's own home stays where it is. The path tests cover the repo key (linked worktrees share it, `_global` outside a repo), and the clean tests cover the TTL by the newest mtime anywhere in an entry, symlinks that are never followed, and pruning of empty kind and key dirs.

### Versions and CHANGELOG

Every change under `plugin/` raises the version in `plugin/package.json`: patch for a hand edit, minor for an Update, major when a shipped skill, agent, or command name is removed or renamed. Add a line under `## [Unreleased]` in `CHANGELOG.md` with each change, and when you raise the version, move those lines under a new `## [x.y.z] - <date>` heading.
