# Upstream inventory

Research for the ticket [Inventory both Upstreams and how they are versioned](https://github.com/daandden/vstack/issues/27). Observed 2026-09-24, read-only.

# 1. Canonical pstack, provenance, and versions

**Canonical source: [`cursor/plugins`, directory `pstack/`](https://github.com/cursor/plugins/tree/main/pstack), authored by Lauren Tan / poteto.** Its own README introduces poteto as the author; its manifest identifies Lauren Tan and points back to that repository. The public GitHub API returned 404 for [`poteto/pstack`](https://api.github.com/repos/poteto/pstack), so that is not the currently accessible canonical repository. Sources: [canonical README](https://github.com/cursor/plugins/blob/main/pstack/README.md), [manifest](https://github.com/cursor/plugins/blob/main/pstack/.cursor-plugin/plugin.json).

| Source | Status and evidence |
|---|---|
| `cursor/plugins/pstack` | Original Cursor plugin; install in Cursor with `/add-plugin pstack`. [README](https://github.com/cursor/plugins/blob/main/pstack/README.md) |
| `backnotprop/pstack` | Calls itself a **standalone mirror** of `cursor/plugins/pstack`; adds installation guidance and says Cursor-specific skills were rewritten for other harnesses. Its README is not byte-identical to current canonical content: model defaults already differ. [README](https://github.com/backnotprop/pstack/blob/main/README.md) |
| `finografic/pstack` | Explicitly an extraction/portable derivative of poteto’s work; 18 skills and 21 principles, removes the orchestrator and named multi-vendor fan-out skills, consolidates principles into references. [README](https://github.com/finografic/pstack/blob/master/README.md) |

Both derivative repositories have GitHub API `fork: false`; “fork” here describes provenance, not GitHub’s fork-network metadata. [backnotprop metadata](https://api.github.com/repos/backnotprop/pstack), [finografic metadata](https://api.github.com/repos/finografic/pstack).

**Latest canonical commit observed:** `12d587dfb20741cafc376c42c696c5f6e2a64487`, **2026-09-23 20:03:21 UTC**. Both the repository HEAD query and latest commit filtered to `pstack` returned this commit. Message: `fix(pstack): resolve rule conflicts and read the model rule the same way (#422)`. [Commit](https://github.com/cursor/plugins/commit/12d587dfb20741cafc376c42c696c5f6e2a64487), [path-filtered API](https://api.github.com/repos/cursor/plugins/commits?path=pstack&per_page=1).

**Version:** `0.15.5` in `pstack/.cursor-plugin/plugin.json`. The canonical repository has **no tags or GitHub releases** in the queried API responses; the GitHub tags page also says there are no releases. Therefore pin the commit, not an assumed `v0.15.5` tag. [Manifest](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/.cursor-plugin/plugin.json), [tags API](https://api.github.com/repos/cursor/plugins/tags?per_page=100), [releases API](https://api.github.com/repos/cursor/plugins/releases?per_page=1), [tags page](https://github.com/cursor/plugins/tags).

Finografic records an older import: `60c641e4fad674784b30abcf9f8915dea39df38d`, `2026-08-18T20:07:46-07:00`; everything after its `as-is-import` tag is local divergence. It documents manually applying the delta between old/new upstream `pstack/` snapshots. [UPSTREAM.md](https://github.com/finografic/pstack/blob/master/UPSTREAM.md).

# 2. pstack contents, parallelism, and dependencies

## Complete workflow-skill inventory

Canonical current inventory is **24 workflow skills + 23 principle skills = 47 `SKILL.md` files under `pstack/skills/`**. The following names are directory/slash-command names; notably `poteto-mode/SKILL.md` has frontmatter `name: Poteto Mode`, not `poteto-mode`. Sources: [complete tree API](https://api.github.com/repos/cursor/plugins/git/trees/12d587dfb20741cafc376c42c696c5f6e2a64487?recursive=1), [canonical catalog](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/README.md#skills), [Poteto Mode frontmatter](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md).

Every workflow below lives at `pstack/skills/<name>/SKILL.md`; purposes are condensed from the linked canonical catalog and skill bodies.

| Skill | Purpose |
|---|---|
| `poteto-mode` | Sticky engineering mode routing tasks through 23 playbooks and other skills. |
| `how` | Trace and explain actual subsystem behavior from source. |
| `why` | Reconstruct rationale and tradeoffs across history and available evidence systems. |
| `recall` | Recover recent topic context from chat history and the shared project record. |
| `blast-radius` | Find downstream breakage and execute a proof of the key safety assumption. |
| `architect` | Ground a change, compare type/interface/module sketches, then implement the chosen design. |
| `arena` | Produce competing attempts at the same task, choose a base, graft the strongest ideas. |
| `swarm` | Distribute slices or races among workers and aggregate one result. |
| `interrogate` | Conduct multi-model adversarial review of code changes; synthesize a verdict, not automatic edits. |
| `automate-me` | Mine working habits from transcripts into a personalized mode skill. |
| `make-bot-ui` | Build a page/dashboard that triggers a Grok Bot through a webhook. |
| `setup-pstack` | Detect/select models and write per-role model configuration. |
| `reflect` | Review a completed session and turn lessons into concrete edits to existing skills. |
| `teach` | Combine behavior and rationale into a plain, progressively illustrated explanation. |
| `tdd` | Prove a bug with a focused failing test before fixing it when a practical local test path exists. |
| `no-comments` | Dispatch Comment Sicko and address accepted comment/root-cause findings. |
| `typescript-best-practices` | Apply concrete TypeScript rules supporting type-system discipline. |
| `figure-it-out` | Design and execute a bespoke auditable playbook when standard routing is insufficient. |
| `show-me-your-work` | Maintain a TSV decision trail and independently audit it. |
| `create-verification-skill` | Generate and execute a project-local real-app verification skill and feature map. |
| `maintain-verification-skill` | Compare the feature map with source and real behavior, correcting proven drift. |
| `unslop` | Remove AI-writing tells and unnecessary prose. |
| `bro` | Restate the previous message in plain human language. |
| `technical-writing` | Apply layered documentation/style rules, including unslop. |

[Source for every row: canonical skill catalog, with individual `SKILL.md` links](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/README.md#skills).

## Complete principle inventory and file locations

Canonical principles are **standalone skills**, each at `pstack/skills/principle-<name>/SKILL.md`; `poteto-mode/SKILL.md` also carries an inline principle index. They are not one top-level `PRINCIPLES.md`. All rows below are supported by the [canonical principle catalog and its individual file links](https://github.com/cursor/plugins/blob/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack/README.md#principles).

| Principle, without `principle-` prefix | Rule in one line |
|---|---|
| `laziness-protocol` | Prefer deletion and the smallest sufficient change. |
| `foundational-thinking` | Choose core data structures and ownership so later logic becomes obvious. |
| `redesign-from-first-principles` | Treat a new requirement as foundational rather than bolting it on. |
| `attack-the-premise` | After repeated fixes fail the same gate, question the shared premise. |
| `subtract-before-you-add` | Remove dead weight and redundant structure before adding more. |
| `minimize-reader-load` | Reduce indirection, hidden state, wrappers, and mutable scope. |
| `outcome-oriented-execution` | Converge on the target design without throwaway compatibility scaffolding. |
| `experience-first` | Prefer polished user experience over implementation convenience. |
| `exhaust-the-design-space` | Compare two or three competing prototypes before committing. |
| `build-the-lever` | Build a rerunnable tool that performs or proves nontrivial work. |
| `model-the-domain` | Encode the domain structurally rather than in scattered conditionals. |
| `boundary-discipline` | Validate at system boundaries; trust internal types and keep business logic pure. |
| `type-system-discipline` | Make invalid states unrepresentable and derive types from authoritative schemas. |
| `make-operations-idempotent` | Converge correctly despite partial previous runs. |
| `migrate-callers-then-delete-legacy-apis` | Migrate all callers and delete the old API together. |
| `separate-before-serializing-shared-state` | Remove unnecessary sharing before introducing serialization. |
| `prove-it-works` | Exercise the actual artifact; compilation or self-report is not proof. |
| `fix-root-causes` | Reproduce and fix the underlying cause instead of suppressing symptoms. |
| `sequence-verifiable-units` | Order changes, commits, and PRs as small independently verifiable units. |
| `test-behavior-not-implementation` | Assert consumer-visible behavior against independent literal expectations. |
| `guard-the-context-window` | Route bulk work to subagents and retain summaries in the main context. |
| `never-block-on-the-human` | Proceed on reversible work; reserve confirmation for irreversible actions. |
| `encode-lessons-in-structure` | Encode lessons as checks, metadata, scripts, or lint rather than more prose. |

Finografic’s different layout is `skills/foundations/principles/SKILL.md` plus `references/<name>.md`. It has 21 principles, lacking canonical’s newer `attack-the-premise` and `test-behavior-not-implementation`. Its reduction in skill count does **not** mean it removed all parallelism. [Fork principle catalog and differences](https://github.com/finografic/pstack/blob/master/README.md#principles).

## Direct and indirect multi-agent instructions

These are the material fan-out sites in canonical workflow skill bodies. Quotes are brief exact excerpts; indirect calls are distinguished from direct spawning.

| Skill | Relevant instruction / condition |
|---|---|
| [`arena`](https://github.com/cursor/plugins/blob/main/pstack/skills/arena/SKILL.md) | “Spawn all N subagents in one message with `run_in_background: true`”; later adds a cross-judge. |
| [`swarm`](https://github.com/cursor/plugins/blob/main/pstack/skills/swarm/SKILL.md) | “Spawn all N workers in one message” with `environment: "cloud"` and background execution. |
| [`interrogate`](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/SKILL.md) | “Launch all reviewers in a single message using the Task tool.” One reviewer per configured model. |
| [`how`](https://github.com/cursor/plugins/blob/main/pstack/skills/how/SKILL.md) | Complex questions: “Decompose the question into 2 to 4 exploration angles” and “Spawn all explorers in a single message”; then a synthesizer. Simple questions use one explainer instead. |
| [`why`](https://github.com/cursor/plugins/blob/main/pstack/skills/why/SKILL.md) | “Default to the full parallel investigation”; “Spawn one investigator per category that has a matching MCP.” Source control always runs; synthesis is another agent. |
| [`recall`](https://github.com/cursor/plugins/blob/main/pstack/skills/recall/SKILL.md) | “Spawn parallel subagents on a fast, cheap model, each taking a slice of the corpus”; runs `why` investigators alongside transcript mining. |
| [`automate-me`](https://github.com/cursor/plugins/blob/main/pstack/skills/automate-me/SKILL.md) | “Run multiple parallel subagents across slices of history”. |
| [`reflect`](https://github.com/cursor/plugins/blob/main/pstack/skills/reflect/SKILL.md) | “Spawn three reviewers in parallel”; then one synthesizer. |
| [`maintain-verification-skill`](https://github.com/cursor/plugins/blob/main/pstack/skills/maintain-verification-skill/SKILL.md) | “One read-only subagent per feature file, launched concurrently.” Live app verification is then a single session. |
| [`teach`](https://github.com/cursor/plugins/blob/main/pstack/skills/teach/SKILL.md) | Calls `how` and `why`: “Run them in parallel and combine the results.” |
| [`architect`](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/SKILL.md) | Indirect fan-out: “Run the **arena** skill”; requires “at least two structurally distinct candidates”. Also runs `how`, conditionally `why`, optionally `interrogate`. |
| [`blast-radius`](https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md) | Conditional indirect fan-out: “For a big or wide change, run it as an `arena`.” |
| [`figure-it-out`](https://github.com/cursor/plugins/blob/main/pstack/skills/figure-it-out/SKILL.md) | “Parallelize only across seams, and give each worker its own worktree or branch”; invokes `architect` for one-way-door design decisions. |
| [`poteto-mode`](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md) | Routes fan-out to `swarm`, bakeoffs to `arena`, review to `interrogate`; playbook subagents use `poteto-agent`. Its Orchestrate route explicitly covers “dozens to hundreds of subagents”. |

Additional delegation that is **not inherently a parallel swarm**: [`show-me-your-work`](https://github.com/cursor/plugins/blob/main/pstack/skills/show-me-your-work/SKILL.md) says “spawn a subagent on a different model family” for the final audit. [`no-comments`](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md) spawns one `Comment Sicko`, but conditionally invokes `architect`, which reintroduces arena fan-out. [`guard-the-context-window`](https://github.com/cursor/plugins/blob/main/pstack/skills/principle-guard-the-context-window/SKILL.md) also makes delegation a principle, not merely a workflow detail.

**Implication [INFERENCE]:** removing `arena`, `swarm`, and `interrogate` alone is insufficient for a low-parallelism vstack; their callers and direct fan-out instructions above must be rewritten too. Finografic explicitly retains inline fan-out in `architect` and `blast-radius`. [Fork differences](https://github.com/finografic/pstack/blob/master/README.md#what-this-fork-does-differently).

## Skill dependencies

- `poteto-mode` → principle index, `how`, `why`, `architect`, `arena`, `swarm`, `interrogate`, `unslop`, `no-comments`, `technical-writing`, `tdd`, and conditional `figure-it-out`; it also uses bundled `playbooks/*.md` and the `poteto-agent` wrapper. [Mode](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/SKILL.md), [catalog](https://github.com/cursor/plugins/blob/main/pstack/README.md).
- `architect` → `how`, `arena`; conditional `why`; optional `interrogate`; supporting principle skills and design references. [Source](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/SKILL.md).
- `teach` → `how` + `why`; `recall` → `why` source investigators. [teach](https://github.com/cursor/plugins/blob/main/pstack/skills/teach/SKILL.md), [recall](https://github.com/cursor/plugins/blob/main/pstack/skills/recall/SKILL.md).
- `blast-radius` → `why`’s evidence procedure, `unslop`, and conditional `arena`; `how` is described as a companion, not an unconditional step. [Source](https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md).
- `technical-writing` → `unslop`; `typescript-best-practices` → `type-system-discipline` and `boundary-discipline`. [writing](https://github.com/cursor/plugins/blob/main/pstack/skills/technical-writing/SKILL.md), [TypeScript](https://github.com/cursor/plugins/blob/main/pstack/skills/typescript-best-practices/SKILL.md).
- `no-comments` → `Comment Sicko` subagent, conditional `architect`, root-cause/redesign principles. [Source](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md).
- `create-verification-skill` → **recommends**, rather than executes, `maintain-verification-skill` after generating and proving the project-local verifier. Do not treat this recommendation as a hard runtime dependency. [Source](https://github.com/cursor/plugins/blob/main/pstack/skills/create-verification-skill/SKILL.md).
- External dependencies explicitly not bundled: `deslop`, `control-cli`, `control-ui` from `cursor-team-kit`; Cursor’s built-in `create-skill`. [Canonical “not shipped here”](https://github.com/cursor/plugins/blob/main/pstack/README.md#not-shipped-here).

# 3. mattpocock/skills layout, releases, installation, and setup

**Layout:** `skills/<bucket>/<skill>/SKILL.md`, with optional companion Markdown, scripts, and `agents/openai.yaml`. Current buckets are `engineering`, `productivity`, `misc`, `in-progress`, and `deprecated`; human-facing documentation is under `docs/engineering/` and `docs/productivity/`. [Complete tree](https://api.github.com/repos/mattpocock/skills/git/trees/c55ee46073ed923f86ce59a5eb3b6d895095d1b7?recursive=1).

**Main snapshot:** `c55ee46073ed923f86ce59a5eb3b6d895095d1b7`, commit dated **2026-09-18 10:12:29 UTC**. Repository `pushed_at` is later and should not be substituted for this commit date. [Commit](https://github.com/mattpocock/skills/commit/c55ee46073ed923f86ce59a5eb3b6d895095d1b7), [metadata](https://api.github.com/repos/mattpocock/skills).

**Latest release:** `v1.2.3`, published **2026-08-06 14:05:28 UTC**, resolves to commit **`6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`**. Annotated tag object is `835450ef244ab7335f75d95b83e7d979eae22a6d`—that is not the commit SHA. [Release](https://github.com/mattpocock/skills/releases/tag/v1.2.3), [tag object](https://api.github.com/repos/mattpocock/skills/git/tags/835450ef244ab7335f75d95b83e7d979eae22a6d).

Versioning uses Changesets: `.changeset/`, root `CHANGELOG.md`, and `package.json` version `1.2.3`. The package is `private: true`; it is not the `skills` CLI package. `npm run version` runs `changeset version` then `scripts/sync-plugin-version.mjs`; the main-branch release workflow opens a version PR and runs `npx changeset tag`. Plugin version is also `1.2.3`. [package.json](https://github.com/mattpocock/skills/blob/main/package.json), [changelog](https://github.com/mattpocock/skills/blob/main/CHANGELOG.md), [release workflow](https://github.com/mattpocock/skills/blob/main/.github/workflows/release.yml), [plugin](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json).

**Installation:** README specifies `npx skills@latest add mattpocock/skills`; `npx skills add mattpocock/skills` is the same source selection without an explicit latest CLI request. The installer lets the user select skills and agents. README recommends including `setup-matt-pocock-skills`, then running it once per target repository. `npx skills update` is the opt-in update route for editable copies. Claude Code also has `claude plugins install mattpocock-skills` / `/plugin install mattpocock-skills`; README warns against installing both forms because skills become duplicated. [Installation docs](https://github.com/mattpocock/skills/blob/main/README.md#installation-30-second-setup).

**Plugin manifests:** `.claude-plugin/plugin.json` defines `mattpocock-skills`, version, author/license and an explicit list of **25** engineering/productivity skill directories. `.claude-plugin/marketplace.json` names marketplace `mattpocock` and plugin source `./`. The manifest does not list misc or in-progress skills. [plugin.json](https://github.com/mattpocock/skills/blob/main/.claude-plugin/plugin.json), [marketplace.json](https://github.com/mattpocock/skills/blob/main/.claude-plugin/marketplace.json).

## What setup actually writes

`setup-matt-pocock-skills` is **prompt-driven, not a deterministic install script**. It explores existing remotes/configuration, shows findings and drafts, gets confirmation, then writes:

1. `docs/agents/issue-tracker.md`: GitHub, GitLab, local Markdown under `.scratch/<feature>/`, or a user-described tracker. GitHub/GitLab seed templates default the external-PR request surface off.
2. `docs/agents/domain.md`: domain-document layout and consumer rules.
3. `docs/agents/triage-labels.md` **only if `triage` is installed**. Default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
4. An `## Agent skills` block in **`CLAUDE.md` if present; otherwise `AGENTS.md` if present; otherwise asks which to create**. The block has Issue tracker, conditional Triage labels, and Domain docs subsections pointing to the files above. An existing block is updated in place; surrounding user content is preserved.

Source for all steps: [setup SKILL.md](https://github.com/mattpocock/skills/blob/c55ee46073ed923f86ce59a5eb3b6d895095d1b7/skills/engineering/setup-matt-pocock-skills/SKILL.md).

**Important distinction:** setup configures where domain docs belong; it does not require creating empty `CONTEXT.md`, `CONTEXT-MAP.md`, or ADRs immediately. Its template says missing domain docs are silently acceptable and `domain-modeling` creates them lazily. Default layout is root `CONTEXT.md` + `docs/adr/`; a genuine monorepo may use a root `CONTEXT-MAP.md` and per-context files. [domain.md template](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/domain.md).

# 4. skills CLI: custom sources, pins, and the local lock

**Custom repositories: yes.** Public/private GitHub shorthand, HTTPS URLs, generic Git URLs, and local directories are supported. Examples: `npx skills add YOUR_ACCOUNT/vstack`, or `npx skills add https://github.com/YOUR_ACCOUNT/vstack`. `-g` selects global scope; `--skill` selects skills; `--agent` selects agents. [CLI README](https://github.com/vercel-labs/skills/blob/main/README.md#source-formats).

**Explicit refs and full commit SHAs: yes in current upstream source**, checked at CLI commit `7407f3893ad4dceab546ac002c3ef806e4000c73`. Parser supports `#ref` and GitHub `/tree/<ref>/<path>` URLs. Git transport contains a fallback that fetches a **full 40-character SHA** after `clone --branch <sha>` fails because it is not a branch/tag. Short SHAs do not match that fallback. [parser](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/source-parser.ts), [Git transport](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/git.ts), [SHA tests](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/git.test.ts).

Source-supported command forms, **not executed in this read-only investigation**:

```sh
npx skills add 'YOUR_ACCOUNT/vstack#v1.0.0'
npx skills add 'mattpocock/skills#6acc160e4e0cd062dbbbd7a1b26ae92855edf07e'
npx skills add https://github.com/cursor/plugins/tree/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack
```

**Do not use `owner/repo@v1.2.3` to mean a Git tag:** `@...` is a **skill filter**. The parser also supports combining `#ref@skill-name`. Use `#ref` or an explicit tree URL. [Source parser](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/source-parser.ts).

**Observed local file:** `/Users/vanguyen/.agents/.skill-lock.json`, schema `version: 3`. One full entry, unchanged:

```json
{
  "ask-matt": {
    "source": "mattpocock/skills",
    "sourceType": "github",
    "sourceUrl": "https://github.com/mattpocock/skills.git",
    "skillPath": "skills/engineering/ask-matt/SKILL.md",
    "skillFolderHash": "85f3ba59f22c16de988e36b781ae46d0d9098f94",
    "pluginName": "mattpocock-skills",
    "installedAt": "2026-08-27T08:30:08.647Z",
    "updatedAt": "2026-08-27T08:30:08.647Z"
  }
}
```

This is an entry within the top-level `skills` object, not the entire lock. **There is no `ref` in this observed entry.** Its `skillFolderHash` is a GitHub **directory tree SHA**, not the repository commit SHA. The current global-lock interface permits optional `ref`; the update-source builder carries that value back into the install source as `#ref`. [Local path above], [global lock schema](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts), [update reconstruction](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update-source.ts).

**Planning implication [INFERENCE]:** vstack should keep its own upstream provenance manifest containing source repository, source subdirectory, full commit SHA, and transformed-file mapping. The installer lock describes installed skills; it does not describe how a merged skill combines Matt and pstack. A fixed commit ref is reproducible; branch refs remain moving targets. The CLI source evidence above establishes current-main behavior, not the version of an already-installed local CLI or a particular npm release.

# 5. Overlap map and merge implications

These are semantic comparisons **[INFERENCE]**, grounded in both sides’ linked contracts rather than name matching.

| pstack | Matt base | Actual overlap / distinction |
|---|---|---|
| [`tdd`](https://github.com/cursor/plugins/blob/main/pstack/skills/tdd/SKILL.md) | [`tdd`](https://github.com/mattpocock/skills/blob/main/skills/engineering/tdd/SKILL.md) | Direct overlap: failing-before/passing-after behavioral checks. pstack is narrowly pragmatic for bug regression paths; Matt also covers test-first features, requires agreed seams, and excludes refactoring from the red/green loop. |
| [`interrogate`](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/SKILL.md) | [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) | Strong overlap in reviewing a diff. pstack relies on diverse models and one synthesized verdict; Matt separates Standards and Spec findings and deliberately avoids merging/reranking those axes. |
| [`interrogate`](https://github.com/cursor/plugins/blob/main/pstack/skills/interrogate/SKILL.md) | [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) | Only partial overlap in adversarial thinking. `interrogate` reviews artifacts; `grilling` interviews the human through unresolved decisions. They are not interchangeable. |
| [`architect`](https://github.com/cursor/plugins/blob/main/pstack/skills/architect/SKILL.md) | [`codebase-design`](https://github.com/mattpocock/skills/blob/main/skills/engineering/codebase-design/SKILL.md) | Strong overlap in deep interfaces and module shape. Matt is shared design vocabulary/reference; pstack is an executable ground → competing sketches → implementation workflow. Import caller-first sketches and design screening without arena machinery. |
| [`how`](https://github.com/cursor/plugins/blob/main/pstack/skills/how/SKILL.md), [`why`](https://github.com/cursor/plugins/blob/main/pstack/skills/why/SKILL.md) | [`research`](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md) | Related evidence-gathering work, not exact duplicates: how traces runtime behavior; why reconstructs project rationale; Matt research gathers cited primary-source facts into a Markdown artifact. Canonical pstack has no standalone `research` skill. |
| [`poteto-mode/playbooks/prototype.md`](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/prototype.md), `exhaust-the-design-space` | [`prototype`](https://github.com/mattpocock/skills/blob/main/skills/engineering/prototype/SKILL.md) | Strong overlap in throwaway experiments and visible alternatives. pstack puts code in isolated scratch space; Matt locates it near its use, then captures it on a throwaway branch with issue context. Canonical pstack has no standalone `prototype` skill. |
| [`blast-radius`](https://github.com/cursor/plugins/blob/main/pstack/skills/blast-radius/SKILL.md) | [`code-review`](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md) | Complementary enhancement: trace downstream effects beyond the diff and execute proof of the one key safety assumption. |
| `model-the-domain`, `type-system-discipline`, `boundary-discipline` | `domain-modeling`, `codebase-design`, `tdd` | Cross-cutting principles overlap design and testability; Matt’s domain documentation is not equivalent to pstack’s structural domain types. [pstack principle catalog](https://github.com/cursor/plugins/blob/main/pstack/README.md#principles), [Matt domain skill](https://github.com/mattpocock/skills/blob/main/skills/engineering/domain-modeling/SKILL.md) |
| `fix-root-causes`, `prove-it-works`, verification skills | `diagnosing-bugs`, `tdd` | Complementary runtime-proof and root-cause discipline; generated per-project verification recipes are an additional pstack capability. [pstack catalog](https://github.com/cursor/plugins/blob/main/pstack/README.md), [Matt diagnosing-bugs](https://github.com/mattpocock/skills/blob/main/skills/engineering/diagnosing-bugs/SKILL.md) |
| `teach`, `recall`, `bro`, `technical-writing`, `reflect` | `teach`, `handoff`/`wait-what`, `writing-for-agents`, in-progress `retro` | Partial purpose-level overlap; retain distinct contracts instead of blindly combining same/similar names. [pstack catalog](https://github.com/cursor/plugins/blob/main/pstack/README.md#skills), [Matt productivity tree](https://github.com/mattpocock/skills/tree/main/skills/productivity), [retro](https://github.com/mattpocock/skills/blob/main/skills/in-progress/retro/SKILL.md) |

**The base itself has parallelism.** Matt `code-review` explicitly runs two parallel subagents; `research` mandates a background agent; `grilling` dispatches fact-finding subagents. Therefore “minus pstack’s heavy multi-agent parallelism” needs a deliberate policy: removing pstack orchestration does not make the merged pack single-agent. [code-review](https://github.com/mattpocock/skills/blob/main/skills/engineering/code-review/SKILL.md), [research](https://github.com/mattpocock/skills/blob/main/skills/engineering/research/SKILL.md), [grilling](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md).

**Recommended planning boundary [INFERENCE]:** retain Matt’s skill identities and composable workflows; import selected pstack principles, caller-first design, blast-radius proof, and practical regression-test constraints. Do not import `poteto-mode`, model routing, or arena/swarm orchestration unchanged. Track source SHAs independently of install locks and review upstream diffs against the exact recorded snapshots. This follows the verified dependency graph above and the derivative’s own documented manual-delta update model.

Verification scope: read-only GitHub API/raw source and the requested local lock inspection; no installs, edits, builds, or tests were executed.
