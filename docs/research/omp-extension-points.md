# omp extension points vstack can use

Research for [#29](https://github.com/daandden/vstack/issues/29), part of map [#26](https://github.com/daandden/vstack/issues/26). This file reports facts only. Decisions belong to later grilling tickets.

## Sources and version

- The local install reports `omp/18.3.0` (`omp --version`).
- Source checkout: `can1357/oh-my-pi`, tag `v18.3.0`, commit `62bc57be1b03ef0802a33cf7f5f530e534527531`. In this file, `src/…` means `packages/coding-agent/src/…` at that tag, and `docs/…` means the repository `docs/` directory (the same files omp serves as `omp://…`).
- Source link base: <https://github.com/can1357/oh-my-pi/blob/v18.3.0/>
- The local install was inspected under `~/.omp/agent/`, `~/.agents/`, and `~/.omp/plugins/` on 2026-09-24.

Notation: **[INFERENCE]** marks a conclusion drawn from the cited sources, not directly observed. **Unknown** marks a question that remains unanswered after the listed attempts.

---

## 1. Skill discovery

### Layout and frontmatter

- A skill is `<skills-root>/<name>/SKILL.md`. Discovery goes **one level deep only**, so `skills/group/name/SKILL.md` is not found. This also applies to `skills.customDirectories`. ([docs/skills.md § Required layout](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md))
- `name` defaults to the directory name. `description` is **required** for native `.omp` skills, `omp-plugins` skills, `.github/skills`, and `skills.customDirectories`. The `agents` (`.agents/skills`), claude, codex, opencode, and claude-plugins providers load skills without a description. (same doc, § `SKILL.md` frontmatter)
- Recognized frontmatter: `name`, `description`, `globs`, `alwaysApply`, `hide`, and `disable-model-invocation` (normalized to `disableModelInvocation`, which is equivalent to `hide`). Unknown keys are preserved as metadata. `hide: true` removes the skill from the system-prompt list, but the skill stays readable through `skill://<name>` and `/skill:<name>`. (docs/skills.md § System prompt exposure)
- The system prompt lists skill names and descriptions only when the `read` tool is available. Bodies are loaded on demand through `read skill://…`. (docs/skills.md § Runtime usage behavior)

### Directories and precedence

Providers are ordered by priority (higher wins). Ties keep registration order. **Deduplication is by skill name, and the first item wins.** ([docs/skills.md § Built-in skill providers and precedence](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md))

| Priority | Provider | Paths (project first unless noted) |
|---|---|---|
| 100 | `native` | `.omp/skills/` in cwd and each ancestor, closest first; then user `~/.omp/agent/skills/` ([src/discovery/builtin.ts L279-292](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/discovery/builtin.ts#L279-L292)) |
| 90 | `omp-plugins` | `skills/` beside extension packages loaded through `extensions:`, `-e`, or `~/.omp/plugins/node_modules` |
| 80 | `claude` | `.claude/skills` (the user root requires `enabledProviders`) |
| 70 | `claude-plugins`, then `agents`, then `codex` | `agents`: `.agent/skills` and `.agents/skills` at each ancestor from cwd up to the repo root, then `~/.agent/skills` and `~/.agents/skills` ([src/discovery/agents.ts L140-172](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/discovery/agents.ts#L140-L172)) |
| 55 | `opencode` | |
| 30 | `github` | `.github/skills/` (project only) |
| 5 | `omp-managed` | `~/.omp/agent/managed-skills` (auto-learn); always yields to an authored skill with the same name |

- The docs describe the `agents` provider (`.agent[s]/skills`) as "the canonical OMP-native location". Its own toggles are `skills.enableAgentsUser` and `skills.enableAgentsProject`, both default `true`. ([docs/skills.md § Source toggles](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md); [src/config/settings-schema.ts L5318-5349](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/settings-schema.ts#L5318-L5349))
- Foreign **user-level** roots (Claude, Codex, Cursor, and similar) load only when `enabledProviders` lists them. Their project roots load by default. Native OMP roots and plugins under `~/.omp/plugins` need no opt-in. ([docs/settings.md § enabledProviders](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/settings.md))
- Marketplace-plugin skills keep their plain names without a `plugin:` prefix, because a colon would break `skill://` parsing. They therefore collide by name like any other skill. ([src/discovery/claude-plugins.ts L249-253](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/discovery/claude-plugins.ts#L249-L253))

### Custom directories

- `skills.customDirectories` (array, default `[]`) is scanned after providers and does not require a description.
- A **custom-directory skill overrides a provider skill with the same name**. Among custom directories, the first one wins. ([docs/skills.md § Discovery pipeline, § Collision and duplicate handling](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md))
- Scanning is non-recursive, so vstack would list one directory per grouping, for example `.../vstack/skills`.

### Collisions and filtering

- The same file reached through a symlink is deduplicated by `realpath`. A second, different skill with the same name raises a collision warning, and the higher-precedence skill is kept. (docs/skills.md § Collision and duplicate handling)
- Filter controls: `disabledExtensions: [skill:<name>]`, `skills.ignoredSkills` (globs), `skills.includeSkills` (allowlist globs), the CLI flag `--skills <globs>`, and `--no-skills`. They are applied in the order disabled → source enabled → ignored → included. (docs/skills.md; [docs/cli-reference.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/cli-reference.md))
- Subagents receive the parent session's discovered skills. There is no per-task way to pin skills, but agent frontmatter `autoloadSkills` injects named skills before the child's first prompt. (docs/skills.md; [docs/task-agent-discovery.md § Agent definition shape](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md))

### Observed locally

- `~/.agents/skills/` holds 41 skills, including Matt's (`grilling`, `tdd`, `wayfinder`, `setup-matt-pocock-skills`, and others). They were installed by the external `skills` CLI, whose lock file is `~/.agents/.skill-lock.json`: version 3, with per-skill `source`, `sourceUrl`, `skillPath`, and `skillFolderHash`.
- `~/.omp/agent/skills/` does not exist. The vstack repository has no `.omp/`.

Therefore **[INFERENCE]**: if vstack installs a skill with the same name into `~/.agents/skills`, it replaces the existing Matt copy there. Installing it into `~/.omp/agent/skills` or a `customDirectories` entry would shadow the `~/.agents` copy without deleting it.

---

## 2. Slash commands and a possible `vstack update` entry point

### File-based commands

- A command is one Markdown file. The name is the filename, except for the codex and opencode providers, where frontmatter `name` can override it. Frontmatter `description` is shown in autocomplete; without it, the first body line is used (60 characters maximum). The body is a prompt template. ([docs/slash-command-internals.md §§ 2-3](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/slash-command-internals.md))
- Argument placeholders: `$1`, `$2`, …; `$@[start:length]`; `$ARGUMENTS` / `$@`. If the template uses no placeholder, the arguments are appended. Quote-aware splitting is supported, but backslash escapes are not. (same doc, § 6)
- Command locations and precedence (same doc, § 1-2):
  - `native` (100): `<cwd>/.omp/commands/*.md`, then `~/.omp/agent/commands/*.md`. **The project copy beats the user copy.**
  - `omp-plugins` (90): `commands/*.md` in extension packages.
  - `claude` (80): recursive; `foo/bar.md` also registers `foo:bar`.
  - `claude-plugins` (70): plugin commands are **prefixed** as `<plugin>:<command>`.
  - `agents` (70): `.agent/commands` and `.agents/commands`, walking up to the repo root, then `~/.agent/commands` and `~/.agents/commands`. Non-recursive. The project copy beats the user copy.
  - `codex` (70) and `opencode` (55).
- Built-in commands are dispatched before file commands and reserve their names. Unknown `/x` text is not rejected; it is sent to the model as ordinary text. (same doc, § 1, § 5, § 7)
- Scanning does not skip hidden files or ignored paths. There is **no file watcher**: new commands appear after interactive start-up, `/move`, or `/reload-plugins`. (same doc, § 1, § 4)
- Local example: `~/.agents/commands/ompl-update.md` is an update command written as a prompt that tells the model to run a pinned bash script and report the result. It is loaded by the `agents` provider.

### How `vstack update` could be exposed

Options, with the facts that constrain each:

1. **File command** `vstack-update.md` in `~/.agents/commands/` or `~/.omp/agent/commands/`. Its body is plain prompt text, so it can say "Read `skill://<update-skill>` and follow it" and pass `$ARGUMENTS` along. A file command cannot run code itself; the model does all the work. (slash-command-internals § 6)
2. **`/skill:<name> [args]`**, available when `skills.enableSkillCommands` is `true` (the default). It injects the skill body, the skill's base directory, and the user's arguments as a user-invoked message. An update *skill* is therefore already callable as `/skill:vstack-update` without a separate command file. ([docs/skills.md § Interactive `/skill:<name>` commands](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md); [settings-schema.ts L5320](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/settings-schema.ts#L5320))
3. **Plugin command**: a marketplace plugin's `commands/update.md` would surface as `/vstack:update`, because plugin commands get the `<plugin>:` prefix. ([docs/slash-command-internals.md § claude-plugins](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/slash-command-internals.md); [docs/marketplace.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/marketplace.md))
4. **Extension command** `pi.registerCommand(name, { handler })`, written in TypeScript. The handler runs code directly, can call `ctx.ui.confirm` or `ctx.ui.select`, and can hand work to the model through `pi.sendUserMessage`. Extension commands take precedence over file commands, and they run immediately even while the model is streaming. ([docs/extensions.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/extensions.md); slash-command-internals § 5, § 8)

Name facts:

- `omp update` is omp's own CLI subcommand for updating omp itself (`omp --help`).
- `omp skill` is a separate Skillshare registry CLI (`install`, `update`, …, registry `skills.omp.sh`; `omp skill --help`). It was not investigated further.
- No built-in slash command named `update` or `vstack…` was found in `src/slash-commands/builtin-registry.ts` (searched for `"update"`).

### Distribution packaging (related)

- A marketplace plugin (`.omp-plugin/marketplace.json` or the Claude-compatible `.claude-plugin/marketplace.json`) can ship skills, commands, agents, rules, hooks, tools, and MCP. It can be installed at user or project scope, pinned by `sha`, and upgraded with `omp plugin upgrade`.
- `/marketplace update` refreshes only the catalog. After changes, `/reload-plugins` refreshes skills and commands; a restart is needed for tools, hooks, and extensions. ([docs/marketplace.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/marketplace.md))
- Local state: two local marketplaces (`osb`, `atlas`) are registered in `~/.omp/marketplaces.json`, and both installed plugins are disabled (`~/.omp/plugins/installed_plugins.json`).

---

## 3. Rules

([docs/rulebook-matching-pipeline.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/rulebook-matching-pipeline.md) for all bullets unless noted)

- **Format**: `*.md` or `*.mdc` with optional frontmatter. The name is the filename without its extension.
- **Frontmatter fields**:
  - `description`
  - `alwaysApply`
  - `globs`
  - `condition` (regex; legacy name `ttsr_trigger`)
  - `astCondition`
  - `question` (a judged yes/no question)
  - `scope` (`text`, `thinking`, `tool`, `tool:<name>(<glob>)`)
  - `agents` (glob list; `main` means the top-level session only)
  - `interruptMode`
- **Locations and precedence** (first name wins):
  - `native` (100):
    - `.omp/rules/` (cwd only, and only when `.omp/` is non-empty)
    - `~/.omp/agent/rules/`
    - sticky `~/.omp/agent/RULES.md`
    - the nearest project `.omp/RULES.md`, synthesized as rule `RULES` with `alwaysApply: true`
  - `omp-plugins` (90): `rules/`.
  - `agents` (70): `.agent/rules` and `.agents/rules`, walking up to the repo root, then `~/.agent/rules` and `~/.agents/rules`.
  - Lower priorities: `cursor`, `windsurf`, `cline`, `github`, `builtin-defaults` (priority 1).
- **When they load**: at session creation, `bucketRules` does the following, in order:
  1. Drops disabled rules and rules whose `agents` patterns do not match.
  2. Sends any rule with `condition`, `astCondition`, or `question` to **TTSR**. TTSR rules are injected only when their trigger matches the output stream.
  3. Injects **`alwaysApply: true`** rules in full into the system prompt, inside `<generic-rules>`.
  4. Lists any remaining rule with a `description` in the **rulebook**: name, globs, and description appear in `<domain-rules>`, and the body is read on demand through `rule://<name>`.
  5. Excludes a rule that has none of these; it is also not addressable through `rule://`. (§ 5-8)
- `globs` on rulebook rules are advisory only; code does not enforce them. (§ 9)
- Subagents re-evaluate `agents` patterns under their own agent name. (§ 6)
- Local examples: `~/.agents/rules/caveman.md` and `~/.omp/agent/rules/use-ask-for-user-input.md` use `alwaysApply: true`. The local config sets `disabledProviders: [builtin-defaults]`.

---

## 4. Custom agents and the `task` tool

### Defining agents

- Locations: project `.omp/agents/*.md` (nearest), user `~/.omp/agent/agents/*.md`, `agents/` in extension packages, then Claude marketplace plugin `agents/`, then the bundled agents. First name wins, and names are case-sensitive.
- **`.agents/agents`, `.claude/agents`, `.codex/agents`, and `.gemini/agents` are not discovered.** Only `.omp` sources count, because `TASK_AGENT_CONFIG_SOURCE = ".omp"`. ([docs/task-agent-discovery.md § Filesystem and plugin discovery](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md); [src/task/discovery.ts L34, L91-99](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/task/discovery.ts#L34))
- Frontmatter: `name` and `description` are required, and the Markdown body becomes the system prompt. Optional fields:
  - `tools`
  - `spawns` (`*`, a list, or empty)
  - `model` (a selector, a list, or a role alias such as `@role`)
  - `thinking-level`
  - `output` (schema)
  - `blocking`
  - `autoloadSkills`
  - `read-summarize`
  - `prewalk`
  - `advisor`

  The names `main` and `sub` are reserved. ([docs/task-agent-discovery.md § Agent definition shape](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md); [docs/rulebook-matching-pipeline.md § agents](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/rulebook-matching-pipeline.md))

### Do subagents inherit the parent's model?

**Not always.** The model is resolved in this order ([src/config/model-resolver.ts L1224-1256](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/model-resolver.ts#L1224-L1256); [docs/task-agent-discovery.md § Model and structured-output precedence](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md)):

1. `task.agentModelOverrides[agentName]` from settings.
2. The agent frontmatter `model`, with role aliases expanded through `modelRoles`.
3. Otherwise, the **parent's active model** (`session.getActiveModelString()`), then the fallback model, then `modelRoles.default`.

Bundled agents ([src/task/agents.ts L44-72](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/task/agents.ts#L44-L72); `src/prompts/agents/*.md` frontmatter):

| Agent | `model` | Effect |
|---|---|---|
| `task` (default) | `@task` | Uses `modelRoles.task` **if it is set**. If not, it falls through to the parent's active model, because `task` has no built-in priority list (`src/priority.json` keys: smol, slow, image, web, speech, dictation, judge). |
| `sonic` | `@smol` | Cheap model, not the parent's. |
| `scout` | `@smol` | Cheap model, not the parent's. |
| `reviewer` | `@slow` | Slow role model. |
| `security-reviewer` | (none) | Parent's active model. |

- Selectors `default`, `@default`, `*`, and `@task` are treated as "inherit the session model". When the agent's `model` is one of these, the resolver falls through to the parent's active model (the `isSessionInheritedAgentPattern` check, [model-resolver.ts L1042-1051](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/model-resolver.ts#L1042-L1051)). The exception is `@task`: it returns early when `modelRoles.task` resolves (L1243-1249).
- On this machine, `modelRoles.task` is `anthropic/claude-opus-5-5:medium` and `modelRoles.default` is `…:high` (`~/.omp/agent/config.yml`). Default `task` spawns here therefore use the task role, not the live parent selection. If the user switched the parent with `/model`, `task` children would not follow. **[INFERENCE]**
- The UI comment in `src/modes/controllers/selector-controller.ts` L972 confirms the intended default: "the bundled task agent inherits it by default".

### How to force the parent's model

Facts to choose from:

- A **custom vstack agent** that omits `model`, or sets `model: default`, resolves to the parent's live active model. The exception is when the user has set `task.agentModelOverrides[<that name>]`, which always wins. (model-resolver L1224-1256)
- Leaving **`modelRoles.task` unset** makes the bundled `task` agent inherit the parent's model. vstack cannot control a user's setting from skill text.
- **Per-call model overrides are not exposed.** The `task` wire schema has no model field, and eval `agent()` has "no per-call `model`". ([docs/task-agent-discovery.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md); [docs/tools/eval.md L169](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/eval.md))
- Users with a `task.enableEffort` opt-in can pass a per-item `effort` (`lo`, `med`, `hi`). This changes the thinking level, not the model. ([docs/tools/task.md § Inputs](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/task.md))
- User-tagged `^model` pseudonyms (`m1`, …) pin a model, but only the user can create them from the composer. (docs/task-agent-discovery.md § User-tagged model agents)

### Per-agent model overrides

- `task.agentModelOverrides: { <agent>: <selector | @role | list> }` in user or project `config.yml` overrides agent frontmatter. The `/agents` hub edits it, and `/model` can set a session-only override for `task`. Role aliases resolve through `modelRoles`. ([docs/task-agent-discovery.md § Role-backed custom agents, § vibe_spawn tier routing](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/task-agent-discovery.md); selector-controller.ts L973-1023)
- Related per-agent records: `task.agentServiceTierOverrides`, `task.agentPrewalk`, `task.agentAdvisor`, and `task.disabledAgents`. (docs/settings.md; settings-schema.ts L5253-5270)

### Limiting parallel spawning

- `task.maxConcurrency` sets a session-wide semaphore over all concurrent subagents. The default is `32`; `0` means unlimited and `1` effectively serializes spawns. It is re-read before every acquire and release. ([settings-schema.ts L5127-5146](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/config/settings-schema.ts#L5127-L5146); [docs/tools/task.md § Limits & Caps](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/task.md))
- `task.batch` defaults to `true`. With `false`, each call spawns one agent, but parallel calls are still possible. `async.enabled` defaults to `true`; with `false`, calls block. (settings-schema.ts L4734, L5103; docs/tools/task.md § Modes)
- `task.maxRecursionDepth` (default 2) limits nesting depth, not width. Agent `spawns:` limits which agents a given agent may spawn; an empty value blocks all. `task.disabledAgents` removes agents. (docs/task-agent-discovery.md § Availability constraints)
- The local config sets `maxConcurrency: 0`, which means unlimited, and `maxRecursionDepth: -1`, which means no depth cap.
- **No per-skill or per-call parallelism limit was found.** Opt-in Fan-out from skill text is therefore enforced by instructions, not by the runtime. **[INFERENCE]**

---

## 5. `ask` and other confirmation primitives

- **`ask` tool** ([docs/tools/ask.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/ask.md)):
  - Accepts `questions[]`, each with `id`, `question`, `options[{label, description?, preview?}]`, `header?`, `multi?`, and `recommended?`.
  - Returns plain text plus structured `details`. It is exclusive: it never runs in parallel with other tools.
  - The runtime adds "Other (type your own)" and "Chat about this"; those labels are reserved.
  - A user cancel throws `ToolAbortError`.
  - `ask.timeout` defaults to `0` (off). On timeout, it auto-selects the recommended option, or the first option.
  - `ask.enabled` gates the tool ([src/tools/index.ts L705](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/tools/index.ts#L705)).
- **The tool exists only in sessions that can prompt the user**: `createIf` requires `canPromptUser ?? hasUI` ([src/tools/ask.ts L782-783](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/tools/ask.ts#L782-L783)). Subagent sessions are created with `hasUI: false` ([src/task/executor.ts L3829](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/task/executor.ts#L3829)).
  - **[INFERENCE]** Confirmation belongs in the main session, not in a subagent.
  - Caveat, not resolved: this research subagent's own tool list showed an `ask` entry. It was not called, so whether it would work was not verified.
- **Tool approval** ([docs/approval-mode.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/approval-mode.md)):
  - `tools.approvalMode` is `always-ask`, `write`, or `yolo` (default `yolo`).
  - `tools.approval.<tool>` can be `allow`, `deny`, or `prompt`.
  - `bash.patterns` can prompt or deny specific commands.
  - Subagents are forced to `yolo`. A user `prompt` policy cannot be satisfied in a subagent, so the call is rejected.
  - These are user or config controls, not something skill text can invoke.
- **Extension UI**: `ctx.ui.confirm`, `select`, `input`, and `editor` are available inside extension command or tool handlers. They are no-ops or return defaults when `hasUI` is false. ACP routes them as elicitations. ([docs/extensions.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/extensions.md) L629-666)
- **Plan mode**: `xd://propose` submits a plan for user approval. ([docs/resolve-tool-runtime.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/resolve-tool-runtime.md))
- Local policy: `~/.omp/agent/rules/use-ask-for-user-input.md` (always-apply) already requires all user input to go through `ask`, falling back to a conservative default when `ask` is unavailable.

---

## 6. Internal URLs skill text can reference

The `read` router's built-in schemes are `agent://`, `artifact://`, `history://`, `issue://`, `local://`, `mcp://`, `memory://`, `omp://`, `pr://`, `proc://`, `rule://`, `security://`, `skill://`, `ssh://`, `vault://`, and `xd://`. ([docs/tools/read.md L230](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/read.md))

| URL | Resolves to | Notes |
|---|---|---|
| `skill://<name>` | That skill's `SKILL.md` | Exact name. `skill://<name>/<rel>` reads files inside the skill directory. Absolute paths, `..`, and paths escaping the directory are rejected. No fallback search. `read` does not apply its default line limit to skills. ([docs/skills.md § skill:// URL behavior](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/skills.md); read.md L243) |
| `rule://<name>` | Rule body, frontmatter stripped | Only rulebook, always-apply, and registered TTSR rules. Exact name. ([rulebook-matching-pipeline.md § 8](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/rulebook-matching-pipeline.md)) |
| `local://<path>` | Session-scoped scratch files at `<session artifacts dir>/local/`, falling back to `$TMPDIR/omp-local/<sessionId>` | Readable and writable. **Subagents share the parent's `local://` root.** `bash` expands it to a real path. Paths escaping the root are rejected. It does not persist beyond the session's artifacts. ([src/internal-urls/local-protocol.ts L243-254](https://github.com/can1357/oh-my-pi/blob/v18.3.0/packages/coding-agent/src/internal-urls/local-protocol.ts#L243-L254); [docs/tools/task.md § Notes](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/task.md); [docs/tools/bash.md](https://github.com/can1357/oh-my-pi/blob/v18.3.0/docs/tools/bash.md)) |
| `agent://<id>` / `history://<id>` | Subagent output / transcript | `agent://<id>/<json path>` extracts a field. Writing `agent://<id>` messages the agent. (docs/tools/task.md § Outputs) |
| `omp://<doc>.md` | omp's bundled docs | Useful for pointing to authoritative behavior. |
| `memory://`, `artifact://`, `proc://`, `xd://`, `issue://`, `pr://`, `mcp://` | Various | Session or tool specific. Not needed for skill-to-skill references. |

A skill that references a sibling skill by `skill://other-name` resolves whichever copy wins the name-collision rules in § 1. **[INFERENCE]**

---

## Unknowns

- **Is `ask` usable inside a subagent?** Source says no (`hasUI: false` makes `createIf` return null). This subagent's tool list nonetheless contained `ask`. Not exercised, so unresolved.
- **Do the `globs` and `alwaysApply` skill frontmatter fields change runtime behavior?** They are listed as parsed skill fields (docs/skills.md), but no runtime effect is documented. Not traced further in source.
- **Where does `omp skill install` put skills, and how does it interact with `~/.agents/skills`?** Not investigated beyond `omp skill --help`.
