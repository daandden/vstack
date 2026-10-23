# vstack

vstack is a personal omp plugin. Matt Pocock's skills are its core. Addons supplement those skills, and Utility skills provide shared tools and writing rules. It also takes selected items from poteto's pstack, diagram-design, and good-css. `GLOSSARY.md` defines the terms, and `docs/adr/` records decisions.

## Skill kinds and the Matt flow

- A Matt skill has a non-reject Base upstream row in the Decision register and no key in the `questions` map of `addon-questions.json`. A Matt skill that you type hosts Addons.
- An Addon is a hidden skill that supplies knowledge to a running Matt skill. Addons load only through the Addon judge during that run, or through a `skill://<addon>` pointer. A key in the `questions` map of `addon-questions.json` makes a skill an Addon, even when it carries Base upstream text, as `session` does (ADR 0019). Addons do not own a separate workflow.
- A Utility skill works outside a Matt run. The register's `utility:` list names these skills, including explain and hidden helpers such as vstack-tmp.
- A Command runs in the extension without a model. `/vstack-clean` is the Scratch cleanup Command, not a skill.

Every change starts with the grill (`/skill:grill-with-docs` or `/skill:grill-me`). The grill closes with its summary and asks nothing. Your next prompt confirms the summary or pushes back, and a pushback reopens the grill. grill-with-docs ends with a line that names the skill to type next. For a change that fits one session, type `/skill:implement`. For a bigger change, continue through `/skill:to-spec` and `/skill:to-tickets`, then type `/skill:implement-spec`. implement and implement-spec own the changes and the settled End state. Specs and tickets carry the `skill://` pointers that later sessions need.

## Install

You need omp and git with working HTTPS credentials for github.com (the repo is private).

1. Clone the repo: `git clone https://github.com/daandden/vstack.git`
2. Link its plugin directory: `omp plugin link <clone>/plugin`
3. Start a new omp session.
4. Run `/skill:setup-vstack` to configure the machine and project. When the repo is set up for Matt Pocock's skills, its project section offers a Migration of that repo first and then goes on with setup in the same run. Migration changes only this repo and its shared private store, never machine state such as global skills or diagram profiles. The Code host section writes `code-host.md`, which implement needs for End states past commit. For GitHub and GitLab it uses a `gh` or `glab` template. For any other host, such as Bitbucket, it maps the MCP server or CLI that you already set up for the project. A re-run asks only the sections whose config files are missing.

The CI section writes `ci.md` independently of the Code host. For GitHub Actions and GitLab CI it uses a `gh` or `glab` template. For any other CI service, such as Jenkins, it maps the MCP server or CLI that you already set up for the project. For a CLI, it drafts command rows from the CLI's help. For an MCP server, it records the server, project facts such as the Jenkins URL, and two pinned tools: a read-only check and a full rerun of a failed build. Setup recommends a service from the repo's CI files, shows the draft for confirmation, then runs its read-only check once. The GitLab CI template marks build reruns unsupported, because GitLab cannot rerun a whole existing pipeline, so babysit reports a flaky build to you instead of rerunning it. Migration leaves `ci.md` for setup's CI section in the same run. implement requires both `code-host.md` and `ci.md` for End states past commit. CI logs, build reruns, secrets, and variables use `ci.md`. Required PR checks stay in `code-host.md`. Existing projects without `ci.md` get only commit and a prompt to run `/skill:setup-vstack`. That re-run moves the CI log, rerun, secret, and variable rows from `code-host.md` into a new `ci.md`, reduces an MCP Code host to its server, facts, and check, and shows both files for one confirmation before it writes them.

To refresh, run `git pull` in the clone and start a new omp session. The link points at the working tree, so there is nothing else to update.

## /vstack-clean Command

Type `/vstack-clean [age]` to preview expired Scratch entries across repos. The default age is `90d`. The extension runs `plugin/skills/vstack-tmp/scripts/clean.ts` without a model.

The dry-run table shows repo key, kind, entry, age in days, size in bytes, and totals. It also reports kept entries. After the table, the UI offers:

- Apply all: delete every listed expired entry.
- Choose items: mark entries in a checklist, then select Done to delete only those entries.
- Cancel: delete nothing. Cancel in the checklist also deletes nothing.

With no expired entries, it reports that nothing was deleted. Without an interactive UI, it refuses before running the cleanup script and says why. No deletion occurs without a UI confirmation.

## Maintainer guide

### Layout

The repo scripts need Bun. Run `bun run test` and `bun scripts/check-register.ts` before every commit that touches `plugin/`, the register, or the Pins.

| Path | Ships | What it holds |
|---|---|---|
| `plugin/` | yes | The omp plugin. `package.json` (`name: vstack`, the version, the `omp` field), `skills/<name>/` (flat, one level deep; a skill's page templates sit in its `templates/`), `agents/`, `rules/`, and `extensions/vstack.ts`, the one extension, listed in the `omp` field. A skill's Bun scripts ship in its `scripts/` dir. The agent runs them with the bash tool as `bun "$(realpath skill://<name>/scripts/<script>.ts)"`: external programs never see `skill://` paths, and omp's in-process `realpath` turns the URL into the file path. |
| `pins.yaml` | no | One entry per Upstream: repo, Pin, how the next Pin is found, and which tree entries count as Upstream items. |
| `decision-register.yaml` | no | One row per Upstream item, `originals:` for vstack-only artifacts, and `utility:` for Utility skills. |
| `house-style.yaml` | no | The House style: replacement rows and rules that turn Upstream text into vstack text. |
| `scripts/` | no | Bun CLIs: `check-register.ts`, `vstack-maintain.ts`, and `addon-judge-check.ts`. `visual_judge_check.py` runs in omp's Python eval. `lib/` holds shared modules. `load-smoke.sh` checks a fresh omp load. |
| `addon-questions.json`, `sample-prompts.json`, `sample-briefs.json` | no | The Addon judge catalog and its two sample corpora, read from the linked clone. |
| `.omp/skills/verify-vstack/` | no | The Verify skill, feature recipes, and omp driver. |
| `tests/` | no | Test suites, run with `bun run test`. Each script is run as a process over temp-dir fixtures (`tests/support/`). |
| `.github/workflows/` | no | CI: the tests and `check-register` on every push and pull request. |
| `CHANGELOG.md` | no | Unreleased section plus one entry per plugin version. |
| `docs/adr/`, `GLOSSARY.md` | no | Decisions and vocabulary. |

Only `plugin/` ships. Upstreams are fetched when needed, never stored in this repo.

### Run-gated Addon judge

`addon-questions.json` holds a `preamble`, a `brief_preamble`, and a `questions` map. The map holds one `noul` question per Addon, keyed by its full skill name, such as `principle-prove-it-works` or `open-pr`. Each question holds only its situation and its criteria. The preamble says how to judge `request` for every question, so the Addon judge reads it once in the state (ADR 0024). The `brief_preamble` takes its place when `request` is a subagent brief, and tells the Addon judge to read "the user" in a question as the brief's author (ADR 0025). `sample-prompts.json` holds the sample corpus, expected and allowed picks, baseline probabilities, and the selection threshold. `sample-briefs.json` holds the same for subagent briefs.

Send every question about one state in one judgment. jev reads the state once per request and bills input tokens only, so separate requests pay for the state again.

The extension reads the Matt skill set from the register and Pins when it loads, and leaves out every skill with a key in the `questions` map of `addon-questions.json`. A typed Matt skill starts a run. Later prompts count as part of that run when the active branch holds its saved `skill-prompt` entry. Reading a Matt skill through `skill://` does not start a run. Plain chat outside a run receives no judge selection. Subagent sessions follow their own rules, described below.

On the skill-start prompt, the extension takes only the user's words after `User:`, never the skill text. With no user words and no earlier talk, it makes no request. The extension decides this from the raw words, so words that the cleaner removes, such as XML tags, still count. Later prompts in the run use the current prompt. `plugin/extensions/prompt-cleaner.ts` cleans the words of a later prompt before the Addon judge reads them, and the words of a fresh start when its restatement fails. The request's state holds `request`, the restatement or the cleaned words, and then the catalog's `preamble`.

Every run start gets its picks from a restatement (ADR 0021, ADR 0026). The extension first asks the `smol` role model, at its configured effort, to restate the user's goal. The instruction is the body of `plugin/skills/in-your-own-words/SKILL.md`, and the extension adds a short frame. On a fresh start, the model reads only the user's words after `User:`. A start is mid-session when the active branch holds user or assistant messages, a visible skill start, or a compaction before the start prompt. On a mid-session start, the model also reads the user and assistant text since the last compaction and the compaction summary. It gets no tool output, thinking, or hidden messages, and no skill text from earlier skill starts. A bare skill start after earlier talk also gets a restatement. The Addon judge reads the restatement as it is, cut to 10,000 characters. Later prompts in the run call no smol.

If smol fails on a fresh start, the Addon judge reads the cleaned words instead. The reasons are an unreadable instruction, no `smol` model, no key, an error, or an empty reply. With a UI, the extension then shows `vstack: Addon picks from your words, restatement failed (<reason>)`. If smol fails on a mid-session start, or on a fresh start whose cleaned words are empty, the prompt gets no picks. A mid-session start's words can miss the goal from the earlier talk. With a UI, the extension then shows `vstack: no Addon picks for this run start (<reason>)`. One 25-second cap covers smol and the Addon judge together on every restated start. At the cap, the start gets no picks and no fallback request. With a UI, the extension then shows `vstack: no Addon picks for this run start (timed out)`. These warnings are omp warnings, which are not stored in the session.

The Addon judge is the model that omp's `judge` role names (ADR 0036). The extension resolves it with `resolveJudge` from `@oh-my-pi/pi-coding-agent/judgment` and asks it through `withCandidate`. It selects every score at least 0.70, and only when the role's first candidate is native. A chat model answers only 0 or 1, so a chat or local candidate gives no picks. Each judgment passes `journalJudgmentUsage` and `sharedJudgmentCache()`, so its cost shows in the session's cost ledger under the purpose `vstack-addons`, and the shared cache answers an identical state. The 0.70 threshold and the sample corpora are jev measurements, so picks from another native judge are not calibrated. The extension sends one hidden message with `customType: "vstack-addons"` and `display: false`:

> Addons selected for this task: skill://<name>, skill://<name>. Ignore any that do not fit. When a principle conflicts with the steps of the running Matt skill or its Addons, those steps win.

Each pointer appears once per session, including after a resume and on other branches. The extension reads the saved `vstack-addons` messages in the whole session and keeps no list of its own. The request leaves out every Addon that these messages name. When they name every Addon, the extension makes no request and calls no smol. omp saves a hook message only when it accepts the prompt, so a pick from a cancelled prompt can return on the retry. A missing Matt skill set or native judge skips silently. A prompt that is not restated has a four-second deadline. Judge errors, a missing key, and that deadline skip silently. vstack makes one judge call per pick and does not retry. omp's native client retries inside it, within the deadline or the 25-second cap on a restated start. The deadline holds even when omp's call ignores the abort, so a late request can finish in the background after the prompt has gone on with no picks.

#### Subagent briefs

During a Matt run, the extension also judges the brief of a `vstack-explorer`, `vstack-worker`, or `vstack-verifier` subagent (ADR 0025). A constant in `plugin/extensions/vstack.ts` lists these three agents, matched against the session's agent name. Every other subagent gets no picks: `vstack-diagram-drawer`, `vstack-comment-critic`, omp's own agents such as `task` and `scout`, and `/tan` clones.

omp loads the extension module once and rebinds it to every subagent session. When a session's `before_agent_start` fires for the first time, the extension records the session under its agent id. For a top-level session, the record keeps a way to read the active branch. For a subagent, the record links to the record of its parent, which the extension finds through `parentId`. A subagent follows these links to the top-level session that started it, also through a nested subagent. It gets a request only when that session's active branch holds a Matt run.

When a session shuts down (`session_shutdown`), the extension drops the session's record. A dropped top-level record no longer reads the branch. A top-level record also stops reading the branch when its session switches to another session file (`session_switch`), or when a new session takes its agent id. A subagent below such a record gets no request. A subagent whose parent's record the extension dropped gets none either.

Only the subagent's first prompt, the brief, gets a request. A later prompt, or a revived subagent, finds earlier user or assistant messages on its own branch and gets none. The Addon judge reads the brief without omp's `Complete assignment thoroughly:` line. The brief goes through the same cleaner stages, but the cleaner squeezes it to 10,000 characters, not 2,000. The request asks the 20 principle questions, every principle except never-block-on-the-human, and the state holds `request` and then `brief_preamble`. The deadline and the silent skips are the same as above. The hidden message has no sentence about which rule wins:

> Addons selected for this task: skill://<name>, skill://<name>. Ignore any that do not fit.

#### By-hand judge check

After any change to the catalog or a corpus, run the check for each corpus:

```sh
TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts
TYPESAFE_API_KEY=$(omp token typesafe) bun scripts/addon-judge-check.ts sample-briefs.json
```

CI does not run this check. The script reads the corpus at the path in its argument, `sample-prompts.json` by default. It sends every sample against its questions to live jev, in the state shape that the extension sends. A sample with `restated: true` holds a stored smol restatement, and the script sends it as it is, cut to 10,000 characters. The six `restated-<name>` samples restate a synthetic mid-session talk. Each `fresh-<id>` sample restates only the words of the plain sample `<id>`, as a fresh run start does (ADR 0026). It keeps that sample's `expected` and `allowed` lists, so the check flags a pick that the restatement adds or loses. Two of these samples also allow a pick that the restatement added and the user accepted: `fresh-cart-off-by-cent` and `fresh-h-legacy-config-api`. Never label such a sample afresh. A sample with `brief: true` holds a real subagent brief from a past Matt run. The script cleans it with the brief cleaner, puts `brief_preamble` in the state, and asks the 20 principle questions. It cleans every other sample as the extension cleans a prompt and asks every question. It flags an expected pick below 0.65 and an unexpected, non-allowed pick above 0.85. Scores from 0.65 through 0.85 are borderline. It prints flags, borderline picks, the pass count, question count, run count, and returned model. Exit codes are 0 with no flags, 1 with flags, and 2 for a missing key, bad arguments, or a failed or invalid response.

To record fresh baselines, run with `--runs 3 --print-means`. `--runs <n>` averages that many direct requests per prompt (default 1). `--print-means` prints a `MEANS` JSON line per prompt with `means`, `baseline_selected` (means at or above the `threshold` in the corpus), and `baseline_borderline` (means from 0.65 through 0.85). Copy the matching baseline maps into the corpus. Keep the returned model in the check evidence. After the corpus edit, run the check. A change to a preamble, to the state shape, or to the threshold needs fresh baselines. The script prints the maps but does not rewrite the corpus.
### Visual judge calibration

`visual-judge-cases.json` at the repo root is the calibration set for grilling-page's visual judge. Each judge request asks four questions about one page question. Two are the yes-or-no diagram questions, with their thresholds from `plugin/skills/grilling-page/references/visual-judge.json`. The other two rank the diagram type for each kind and name the types only. The state holds the page question as `question` and the visual-type guide in diagram-design's `SKILL.md` as `visual_types`, a map from each type name to what it shows. jev reads the guide once per request this way, not once per type question (ADR 0024). Diagram cases are real Grilling page questions from vstack and Tern pages, labeled by gpt-6.1-sol at high thinking. A diagram case passes when each kind's yes probability reaches its threshold exactly when the case labels that kind true. Type cases are one hand-written question per guide type. A type case passes when its expected type, or an allowed one, is among the top three types of either type question.

After a change to the rubric or to the guide, run the check in one omp Python eval cell, with the checkout root as the working directory:

```python
import runpy
check = runpy.run_path("scripts/visual_judge_check.py")["check"]
await check(judge_batch)
```

`scripts/visual_judge_check.py` builds each request with `judge_request()` from `plugin/skills/grilling-page/scripts/visual_judge.py`. It sends every case through eval's `judge_batch` global, as the helper does. It prints one `MISS` line per missed case, then the pass count and the judge model. It returns `True` when every case passes and `False` when a case misses. If `judge_batch` did not use a TypeSafe jev model, the check raises `RuntimeError` and grades nothing, because `judge_batch` falls back to a chat model without TypeSafe credentials. It also raises when a case gets no answer.


### Pins and Upstream clones

`pins.yaml` keys (`matt`, `pstack`, `diagram`, `css`) are the register's `upstream` values and local clone names under `~/.cache/vstack/upstreams/<key>`. Set `VSTACK_UPSTREAMS` or pass `--upstreams` for another directory. Blobless clones are enough. check-register never fetches, checks out, or moves HEAD. vstack-maintain plan clones or fetches selected Upstreams without moving HEAD. Target checks and takes fetch only missing Pins and held refs. Keep the cache outside every checkout. To make a clone by hand:

```sh
git clone --filter=blob:none https://github.com/mattpocock/skills.git ~/.cache/vstack/upstreams/matt
git -C ~/.cache/vstack/upstreams/matt fetch --tags origin   # when a Pin is missing from the clone
```

`pin_kind` says how the Update finds the next Pin. `tag` (Base): the highest `v<major>.<minor>.<patch>` tag; pre-release tags such as `v1.3.0-beta.1` and other tags such as `mattpocock-skills@1.0.0` never count. `commit` (Enhancement, Diagram, CSS): the newest commit on the default branch that touches the entry's `path`. `pin` is the tag name or the full commit SHA.

Each entry's `items:` list says which tree entries at the Pin are Upstream items. `match` is a path glob from the repo root where `*` stays inside one path segment, `type` is `tree` or `blob`, and the first matching pattern sets the `kind`. For example, pstack's automations are one item each, so their nested skills get no rows.

One entry, the CSS upstream, also has `page_lint: scripts/check-css.mjs`: the script `check-register` runs at that Pin over vstack's page templates (see "Page templates" below).

### Decision register

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
| `ask-tool` | any markdown artifact, adopt included, has a sentence with an `ask-tool` phrase that does not name `` `ask` `` |
| `page-css` | a page template breaks the CSS upstream's `check-css.mjs` at its Pin; the item is the template and the message holds the script's `path:line` lines |
| `invalid-utility` | a `utility:` entry names no shipped skill, or names a skill with a non-reject Base upstream row |
| `addon-slash-route` | text under `plugin/` or in `README.md` contains `/skill:<addon>`. Use `skill://<addon>` instead |
| `addon-question-mismatch` | a key in the `questions` map of `addon-questions.json` names no shipped skill or names a Utility skill, or a shipped Addon has no such key |
| `brief-sample-mismatch` | a sample in `sample-briefs.json` has an empty `prompt`, or an `expected` or `allowed` label that is not a subagent question (a principle in `addon-questions.json` other than `principle-never-block-on-the-human`). The item is `sample-briefs.json:<id>` |

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

Every page vstack writes for the user (the Grilling page, explain's pages, and the how and teach pages) starts from a page template. Every template follows good-css (#61). A page template is any `*.html` or `*.css` file under `plugin/skills/<name>/templates/`. `scripts/lib/checks/pages.ts` finds these files and runs the CSS Upstream's `page_lint:` script at its Pin over them. Each flagged template reports one `page-css` failure. With no template, the check prints `page templates: none` and reads nothing. Templates hold no figure. The skill draws its figure through diagram-design, exports it, and inlines the export in the rendered page.

### House style

`house-style.yaml` (ADR 0008) has two lists. Its header comment documents every field.

- `replacements:` are blind substitutions, applied in list order. `match` is `literal` (an exact substring), `name` (no `[\w-]` character on either side), or `ref` (only `/x`, `` `x` ``, `**x**`, and `skill://x`). The `glossary` row rewrites `CONTEXT.md` and leaves `CONTEXT-FORMAT.md` alone. `upstream` picks the artifacts a row applies to. `scope: required` binds every artifact, adopt included. `scope: adapted` binds adapt, merge, and original text. `uses` selects the Update (`update`), setup-vstack's Migration (`migration`), or both. A row that an earlier row rewrites fails `invalid-house-style`, so put the longer phrase first.
- `rules:` are what the agent applies by hand: the fixed spawn and Fan-out wording, skill references, worktrees, Scratch paths, eval for Python, and asking through `ask`. Each has `text`, a `scope`, and a `lint` line that says what `check-register` enforces. `allowlist` names the skills where a rule's form is allowed, and `check-register` skips that rule's lint in them. It limits `headless-run` to skill-creator and lets writing-for-agents describe a subagent dispatch under `spawn-vocab`. `ask-tool` holds `phrases`, the list its lint matches as whole words in any case. Add a phrase when an asking sentence slipped past the list, and run `bun scripts/check-register.ts` to see which adopt items it would flip.
- The spawn and Fan-out lines themselves live in one place, `plugin/skills/vstack-fan-out/FORMS.md`: the Fan-out line (the `task` batch or the isolated eval batch) and the single-subagent lines. Copy a form from there, fill its slots, and keep it on one line. A vstack agent is an agent the plugin ships under `plugin/agents/`. The spawn lints read markdown outside frontmatter and code fences, so quoting a form in a fence is safe.

`scripts/lib/house-style.ts` is the one module that reads both lists and applies rows. It has no file access: `parseHouseStyle(doc, upstreamKeys)` validates a parsed file, `selectRows(rows, { use, upstreams, disposition, shippedNames })` picks the rows for one text, `applyRows(text, rows)` rewrites it, and `findRow(text, row)` finds leftovers. `loadHouseStyle(root, upstreamKeys)` in `scripts/lib/vstack-repo.ts` reads the file from a checkout.

To write an adapt item, start from the Upstream text at the Pin with the rows applied, then make the hand edits its contract needs:

```sh
bun -e 'import { applyRows, parseHouseStyle, selectRows } from "./scripts/lib/house-style.ts";
const { houseStyle } = parseHouseStyle(Bun.YAML.parse(await Bun.file("house-style.yaml").text()), new Set(["matt", "pstack", "diagram", "css"]));
const rows = selectRows(houseStyle.replacements, { use: "update", upstreams: ["matt"], disposition: "adapt" });
process.stdout.write(applyRows(await Bun.stdin.text(), rows));' \
  < <(git -C ~/.cache/vstack/upstreams/matt show v1.2.3:skills/engineering/wizard/SKILL.md) > plugin/skills/wizard/SKILL.md
```

setup-vstack ships the root `uses: migration` rows under `plugin/skills/setup-vstack/references/house-style.yaml`, with no `rules` list. Generate the copy with `selectRows(rows, {use: "migration"})` and `Bun.YAML.stringify({replacements: rows})`. `migration-house-style` checks its row schema and compares every field in order. The old-phrase scan skips this copy because its `from` phrases are data.

### Migration

setup-vstack's project section runs `migrate.ts plan [--mode move|private]` after the machine section (ADR 0028). The scripts live under `plugin/skills/setup-vstack/scripts/`, and `references/migration.md` holds the steps that SKILL.md reads only when the plan has items. The plan reads only this repo and its git common dir. It detects Matt config, instruction blocks, rule hits, old domain filenames, the old private store, and old paths in `.md`, `.html`, and `.json` files under `<common dir>/vstack/`. Move is the default mode. `private_available` signals tracked Matt config. Private mode leaves tracked Matt config and instructions alone, so a Private-migrated repo plans no items for them later.

The old private store moves to `<common dir>/vstack/` as one mandatory item for every registered worktree of this repo. The move rewrites old paths, removes old-store symlinks and their exclude line, keeps unknown directories, and rolls back the store, text, directory name, links, and exclude content when a step fails. A destination conflict never merges files. The existing vstack copy wins, and an optional deletion item resolves the old copy. Old private storage keeps Migration incomplete until it is moved or deleted against an existing winning config. The runtime reads the shipped row copy and reuses `scripts/lib/house-style.ts`, which requires the full clone of ADR 0005. Relative private rows run only for an ordinary `.git` common dir. Remaining bare words need proposed manual diffs in the same `ask`.

`migrate.ts apply --plan <file> [--skip <id>...]` rejects stale state and skipped mandatory items before writing. It moves tracked files with git and untracked files with filesystem rename, copies Private config with private artifact and domain paths, rewrites rule and store hits, and renames old domain files and their map links. It leaves a `.diagram-design` marker in place. Failures stop later actions. Exit codes are 0 applied, 1 incomplete, and 2 refusal or inability to run. The report lists `paths`: every repo-relative path that it moved from, wrote, or deleted, and none under the git common dir. setup-vstack passes them to `project.ts commit --migration-path <path>...`, which stages them with the config files and the block file, deletions and both sides of a move included, and commits only those paths. In Standard mode one setup commit holds the whole Migration. Private mode commits nothing. Migration never touches machine state: Matt's global skills, global rules, the old private rule, and diagram profiles stay where they are.

Each setup run keeps its plan JSON in its own Scratch entry, `setup-vstack/run-XXXXXX/` from `mktemp -d`, because every worktree of a repo shares the Scratch dir. `migrate.ts apply` also refuses a plan whose `root` is not the checkout it runs in, so a plan from another worktree never applies there.

### vstack-maintain

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

#### Decisions JSON

One file holds Update rows and Hand edit targets together: `{ "decisions": [...], "targets": [...], "changelog": [...] }`. At least one row or target and one nonempty, one-line CHANGELOG entry are required. The file does not carry a commit message. implement owns the commit.

Each Update decision has a unique `id` and an `action` (`accept`, `hold`, or `defer`). Optional `disposition`, `artifacts`, and `reason` change the register row. A Disposition change needs a one-line reason. A deferred item needs `gist` and becomes reject with `Deferred at <pin>: <gist>`. Each changed row and new item needs a decision. New items also need `upstream` and `path`, and cannot Hold. Removed rows need `removal`: `drop` or `original` for an unshared artifact, `remove-contribution` or `keep-contribution` for a shared artifact. A renamed adopt item needs `rename: follow|keep`. Keeping its old name requires adapt and a reason.

Each Hand edit target has `action` (`add`, `edit`, `take`, `rename`, or `remove`), `kind` (`skill`, `agent`, or `rule`), and `artifact`. Artifact paths use `plugin/skills/<name>`, `plugin/agents/<name>.md`, or `plugin/rules/<name>.md`. A take adds `upstream`, `path`, and `reason`. A rename adds `to`. An adopt edit or rename needs `flip: { "confirmed": true, "reason": "..." }`. A removal that leaves a register row with no artifacts needs a reason. Each target appears once.

An `edit` target can also carry an optional, nonempty, one-line `reason`. `prepare` applies it to every adapt row that lists the artifact. Other Dispositions keep their reasons, and an adopt flip still uses `flip.reason`.

`prepare` validates decisions before its first checkout write. It reads bookkeeping from HEAD, not from earlier uncommitted bookkeeping. Its version exceeds HEAD's version, with at most one major bump per branch. Hold preserves the old contribution while current Pins and item identities move. The grill records moved refs and confirmed decisions. implement reruns `plan` at those refs and stops with a report if the row set differs.

`prepare` uses the `yaml` package's Document and source-token APIs to keep comments, quoting, flow style, key order, and untouched text. It changes only the version value in `plugin/package.json`.

#### Plan JSON

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
### Existing-code explanations

how, why, and explain are Utility skills adapted from pstack. how and why stay hidden and callers read them through `skill://`. explain can start from its description. how traces mechanisms and writes its cited page under Scratch `how/`. why profiles git, the remote code host, the configured tracker, and reachable MCP tools before investigation. Its synthesizer always gets a fresh context. Both return their output unedited to callers.

explain combines how and why through a Fan-out line. It keeps one conversation page under Scratch `explain/`, with a series of exported, inlined SVG figures from diagram-design. Templates live in each page-producing skill's `templates/` directory, where `check-register` runs the pinned CSS lint. Matt's teach stays a separate skill. The pstack `teach` reference row applies only to pstack items.

### Session

`skill://session` is the Addon that merges Matt's retro with pstack's reflect and correct. It reads one session: the current JSONL from `PI_SESSION_FILE`, or a session that the user names, found through `archive`, plus the children that the session references. Four lenses (judgment, tooling, divergent, and environment) run as one Fan-out. The synthesizer gets a fresh context. A missing current transcript uses a labeled digest. A named session has no digest, and the skill never guesses a session.

The grill resolves skill targets with `omp skill list --json` and asks one question per finding on the Grilling page. implement edits only approved lessons. Own skills tracked by the session's checkout use its normal branch, commit, and End state. Other own skills get in-place, uncommitted edits with a Scratch snapshot and a no-index diff in the shared code-review pass. An approved environment finding is fixed at the highest level that works (architecture, types, a lint or CI check, a test, then docs), with one commit per mistake class.

Inside a vstack clone, approved vstack lessons use `skill://vstack-maintain` for a normal Hand edit. From another project, implement files one issue in the vstack repo's tracker for each approved vstack lesson, or comments on a matching open issue, and leaves the linked clone unchanged. An adopt item's issue names the flip to adapt, and a new skill's issue carries its draft and confirmed home. Others' installs stay Backlog, which the reply only lists. Substantive edits, descriptions, and new skills use skill-creator. When no row is tracked, the reply states that nothing was committed. The reviewer references belong to the session artifact and its Upstream rows, not `originals:`.

### Tests

`tests/skill-creator.test.ts` runs the bundled Bun initializer and validator as processes over temp skill folders. skill-creator evaluation uses separate omp processes on the Session model, not task runners; its references define per-run overlays and transcript evidence.

`bun run test` runs `tests/` only (`bunfig.toml`) with a 30 s test timeout, because the suites start real `git`, `omp`, and `bun` processes. Bun applies a `setDefaultTimeout` from a preload to one test file only, so the timeout is the `--timeout` flag in the `test` script. The check-register tests build fixture Upstream git repos with tags, a moved item, and a removed item, then a vstack checkout committed as the version base. They run the script as a process and assert its exit code and its failures by class and item. One case serves a local stand-in for the GitHub API, so the `github` source is tested too.

`tests/vstack-maintain.test.ts` runs the maintainer CLI over fixture repos and Upstreams. It covers read-only planning, overlap previews and target checks, combined Update and Hand edit preparation, version bookkeeping, and gates. Injected commands replace external validation and load boundaries. The tests inspect process output, exit codes, and resulting files. `tests/addon-selection.test.ts` drives the fake host with a fake omp judge chain and a stubbed `smol` completion. It covers the Matt run gate, the native-judge rule, the judgment deps, full-name picks, saved-message deduplication, the hidden pointer message, the restated input of a fresh and a mid-session run start, the fresh-start fallback to the cleaned words, and the 25-second cap. The cap tests run on bun:test's fake timers.

`tests/extension.test.ts` tests the extension through a fake omp host (`tests/support/extension-host.ts`, after omp-tools' advisor-concern-wake tests). `fakeHost(options)` runs the extension factory against a partial ExtensionAPI and ctx and returns the registered Commands, the event handlers, `emit(name, event)` (awaits every handler and returns their results), and `callCommand(name, args)`. Options set `ctx.agent` (main or sub), whether the judge role is native, the models `ctx.modelRegistry.find` returns, and their API keys. The repo has no omp SDK dependency. `tests/support/extension-mocks.ts` replaces the omp modules that the extension imports at runtime. Its `smol` object sets the `smol` role and completion for a test. Its `judge` object stands in for omp's judge chain: `judgeAnswers(scores)` sets the scores, `judge.kind` sets the candidate's backend kind, and `judge.calls` and `judge.resolved` record each judgment with its signal and the deps passed to `resolveJudge`.

`tests/vstack-tmp.test.ts` and `tests/vstack-clean.test.ts` run the Scratch scripts, `plugin/skills/vstack-tmp/scripts/path.ts` and `plugin/skills/vstack-tmp/scripts/clean.ts`, as processes. Both accept `--home <dir>`. Tests use a temp home and never write to the real `~/.vstack/`. The path tests cover shared worktree keys and `_global` outside a repo. The cleanup tests cover the 90-day default, expiry by the newest mtime, a flow folder that expires and goes as one entry, symlinks that are never followed, and pruning of empty kind and key directories. `tests/vstack-clean-command.test.ts` covers the Command through the fake host: the 90-day default, the dry-run table, Apply all, Choose items, Cancel, and refusal without a UI.

`tests/setup-vstack-machine.test.ts` and `tests/setup-vstack-project.test.ts` run setup-vstack's two scripts as processes. `machine.ts` asks the real `omp` for every fact (`omp config list --json`, `omp token typesafe` when the judge role names `typesafe` or is not set, `omp setup python --check --json`) and writes settings only through `omp config set`, so its tests give it a throwaway `HOME` whose `.omp/agent/config.yml` they write, an env of only `PATH`, `HOME`, and `TERM`, a cwd outside the real home, and `TYPESAFE_API_KEY` as the stand-in credential. They need omp on `PATH` and skip without it (CI); the case for a missing omp runs everywhere. `project.ts` needs only git: its tests build temp repos and linked worktrees and assert the state JSON and the files in the Standard setup commit.

`tests/setup-app-verification-commit.test.ts` runs setup-app-verification's `commit.ts` as a process over temp repos. It asserts that the Standard commit holds only `.omp/skills/verify-<app>/`, deletions included, and leaves other staged and unstaged work in place. It also covers the refusals (Private mode, a missing title, directory, or SKILL.md, a symlinked directory, and a `--target` that is not `.omp/skills/verify-<app>/`) and the `dirty` fact from `state`.

`tests/setup-vstack-migration.test.ts` runs `migrate.ts` over throwaway repos. It covers Move, Private copies, domain files, old markers that get no config line, conflicts, approval snapshots, the `code-host.md` seed from a GitHub or GitLab remote, the private move and store rewrites from a linked worktree with machine state ignored, the store rewrite, a declined manual hit that comes back in moved config, and the report's repo paths. `tests/setup-vstack-project.test.ts` checks that Migration leaves `ci.md` missing until setup writes it, then commits both outputs with the Migration's `git mv` deletions. It also checks CI-only re-run state in both modes, refusal to commit without `ci.md`, refusal of a Migration path outside the repo, and that a bracketed path commits no other staged file.


### Versions and CHANGELOG

Every change under `plugin/` raises the version in `plugin/package.json`: patch for a hand edit, minor for an Update, major when a shipped skill, agent, or command name is removed or renamed. Add a line under `## [Unreleased]` in `CHANGELOG.md` with each change, and when you raise the version, move those lines under a new `## [x.y.z] - <date>` heading.
