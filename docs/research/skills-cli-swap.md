# How the skills CLI swaps Matt-installed skills for vstack

Research for [#30](https://github.com/daandden/vstack/issues/30), part of map [#26](https://github.com/daandden/vstack/issues/26). This note reports facts only. Decisions belong to later grilling tickets.

## Scope and method

- **CLI version:** `skills@1.7.0` from npm. The latest release, [`v1.7.0`](https://github.com/vercel-labs/skills/releases/tag/v1.7.0), and current `main` point to the same commit, `7407f3893ad4dceab546ac002c3ef806e4000c73`, verified with `git rev-list -n1 v1.7.0` and `git rev-parse HEAD` on 2026-09-24. Every source link below uses that SHA; `S` stands for `https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73`.
- **Throwaway homes:** all runs used `HOME=/tmp/skills-home.xiLk` (scenario A) or `HOME=/tmp/skills-home2.ms8f` (scenario B), with `npm_config_cache=$HOME/.npm-cache`, `DISABLE_TELEMETRY=1`, and `XDG_STATE_HOME`/`XDG_CONFIG_HOME` unset. The real `~/.agents/.skill-lock.json` still has mtime `2026-09-16 17:36`, so the runs did not touch it.
- **Harness:** each command below was run as `npx -y skills@1.7.0 <args>`. The ANSI color codes have been removed from the output shown here. `GITHUB_TOKEN` was set from `gh auth token`.
- **Agent environment:** omp exports `CLAUDECODE=1`, `AGENT=1`, and `OMPCODE=1` to its shell. Scenario A kept those variables. Scenario B unset them to match a plain user terminal. The difference matters; see [the section on agent detection](#running-inside-omp-agent-detection).
- **Fake vstack:** `/tmp/skills-lab/fake-vstack`, a local git repo with `skills/{tdd,wizard,vstack-grilling}/SKILL.md`. Each file has frontmatter `name: <dir>` and `description: FAKE vstack version of <dir> ...`. For a real same-named GitHub source, the tests use pstack `tdd` from `cursor/plugins@12d587d…/pstack`. It collides with Matt's `tdd` ([inventory overlap map](https://github.com/daandden/vstack/blob/research/upstream-inventory/docs/research/upstream-inventory.md#5-overlap-map-and-merge-implications)).
- **vstack visibility:** `daandden/vstack` is currently **private** (`gh repo view --json visibility` returned `PRIVATE`). `npx skills add daandden/vstack --list` cloned it successfully and then reported `No valid skills found`, because neither branch has a `SKILL.md` yet.

## 1. omp is not an `--agent` target, but omp reads where the CLI installs

**Observed:** `npx skills add 'mattpocock/skills#v1.2.3' -g -a omp -s tdd -y` failed:

```
■  Invalid agents: omp
●  Valid agents: aider-desk, amp, ..., opencode, openhands, ona, pi, ..., adal, universal
[exit 1]
```

The agent registry has no `omp` key; the closest entry is `pi` (`.pi/skills`, `~/.pi/agent/skills`) ([S/src/agents.ts#L579-L587](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/agents.ts#L579-L587)).

**Where the CLI installs:**

- Any agent whose `skillsDir` is `.agents/skills` counts as *universal* ([S/src/agents.ts#L910-L911](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/agents.ts#L910-L911)).
- A universal agent always installs to the canonical directory: `<cwd>/.agents/skills` for a project install, or `~/.agents/skills` with `-g` ([S/src/installer.ts#L128-L159](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/installer.ts#L128-L159)).
- Observed: `-g -a universal` and `-g -a amp` both wrote to `~/.agents/skills/<name>` as a copy (`copy → Universal`, `copy → Amp`).
- The README lists the Universal global path as `~/.config/agents/skills/` ([S/README.md#L284](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/README.md#L284)). That matches `globalSkillsDir: join(configHome, 'agents/skills')` in [agents.ts#L815-L821](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/agents.ts#L815-L821). No run placed files there.

**omp's side:**

- omp's `agents` provider loads `.agent[s]/skills` at both levels: project walk-up and user home. It is described as "the canonical OMP-native location" ([omp skills doc](omp://skills.md), "Source toggles and filtering").
- In omp 18.3.0, `loadSkills` puts project scans before user scans (`[...projectScans, ...userScans]`, `packages/coding-agent/src/discovery/agents.ts` in [can1357/oh-my-pi](https://github.com/can1357/oh-my-pi); read from the installed copy at `~/.bun/install/global/node_modules/@oh-my-pi/pi-coding-agent/src/discovery/agents.ts`).
- Skill dedup keeps the first skill with a given name ([omp skills doc](omp://skills.md), "Dedup key is skill name. First item with a given name wins").
- Result: a project `.agents/skills/tdd` shadows `~/.agents/skills/tdd`. [INFERENCE from the ordering plus first-wins; not run inside omp.]

## 2. Name collision from a different source: silent wholesale overwrite, keyed by name only

**Mechanics:**

- Before copying, the installer calls `cleanAndCreateDirectory(path)`, which runs `rm(path, { recursive: true, force: true })` ([S/src/installer.ts#L193-L195](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/installer.ts#L193-L195)).
- The lock is a map keyed by skill name ([S/src/skill-lock.ts#L51-L60](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L51-L60)).
- Nothing compares the old source with the new one.

**Observed with a GitHub source (scenario B, clean env):**

```
$ npx -y skills@1.7.0 add mattpocock/skills#v1.2.3 -g -a universal -s tdd -s grilling -s handoff -y
$ npx -y skills@1.7.0 add https://github.com/cursor/plugins/tree/12d587dfb20741cafc376c42c696c5f6e2a64487/pstack -g -a universal -s tdd -y
◇  Installation Summary ─╮
│  ~/.agents/skills/tdd  │
│    copy → Universal    │
[exit 0]
```

`diff` of `~/.agents/.skill-lock.json` before and after:

```
<       "source": "mattpocock/skills",
>       "source": "cursor/plugins",
<       "sourceUrl": "https://github.com/mattpocock/skills.git",
<       "ref": "v1.2.3",
<       "skillPath": "skills/engineering/tdd/SKILL.md",
<       "skillFolderHash": "423f3cc2bccf3b0ed426fb35eeb4b38d9188a343",
<       "pluginName": "mattpocock-skills",
>       "sourceUrl": "https://github.com/cursor/plugins.git",
>       "ref": "12d587dfb20741cafc376c42c696c5f6e2a64487",
>       "skillPath": "pstack/skills/tdd/SKILL.md",
>       "skillFolderHash": "1064da72ceca07bf7f36bddebada585bb59da7bc",
<       "updatedAt": "2026-09-24T10:06:56.619Z"
>       "updatedAt": "2026-09-24T10:07:00.956Z"
```

- `installedAt` is kept from the Matt install; every other field is replaced ([`addSkillToLock`, S/src/skill-lock.ts#L177-L193](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L177-L193)).
- The directory is replaced whole. In scenario A, Matt's `tdd/` had 4 entries; after a local-source collision it held only `SKILL.md`.

**No overwrite warning for global universal installs:**

- The summary prints `overwrites:` only when `isSkillInstalled` finds the skill ([S/src/add.ts#L1818-L1878](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L1818-L1878)).
- For `-g`, `isSkillInstalled` checks `agent.globalSkillsDir` ([S/src/installer.ts#L570-L600](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/installer.ts#L570-L600)). For `universal`, that path is `~/.config/agents/skills`, not the directory actually written.
- Observed: the global `-a universal` collision printed no `overwrites:` line.
- The global `-a amp` collision also printed none. [INFERENCE: cause not traced; amp's `globalSkillsDir` is `~/.agents/skills` ([S/src/agents.ts#L90-L98](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/agents.ts#L90-L98)).]
- The project-scope collision did print a warning:

```
$ (cwd=proj) npx -y skills@1.7.0 add https://github.com/cursor/plugins/tree/12d587…/pstack -a universal -s tdd -y
│  ./.agents/skills/tdd     │
│    overwrites: Universal  │
```

**Local and `file://` sources overwrite files but leave the global lock alone:**

- A global lock entry is written only when `normalizedSource` is set ([S/src/add.ts#L2025-L2027](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L2025-L2027), [#L2086-L2128](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L2086-L2128)).
- `getOwnerRepo` returns `null` for `local` sources ([S/src/source-parser.ts#L11-L14](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/source-parser.ts#L11-L14)).
- Observed (scenario A):

```
$ npx -y skills@1.7.0 add /tmp/skills-lab/fake-vstack -g -a universal -s tdd -y
✓ tdd (copied) → ~/.agents/skills/tdd
```

`~/.agents/skills/tdd/SKILL.md` now said `description: FAKE vstack version of tdd…`. The lock entry `tdd` still read `"source": "mattpocock/skills", "ref": "v1.2.3", "skillFolderHash": "423f3cc2…"`.

- The same happened with `file:///tmp/skills-lab/fake-vstack`.
- `file:///…#v0.1.0` failed: `fatal: '/tmp/skills-lab/fake-vstack#v0.1.0' does not appear to be a git repository`. A `#ref` is not stripped from `file://` URLs.
- `npx skills list -g` then reported the vstack-content `wizard` as `Source: mattpocock/skills`, because `list` reads the stale lock entry.

**The stale entry later reverts the swap:**

- An unchanged upstream causes no action: `update -g -y` printed `✓ All global skills are up to date` and the fake content stayed.
- To simulate an upstream change, the lock's `tdd.skillFolderHash` was set to `0000…`:

```
$ npx -y skills@1.7.0 update -g -y
Found 1 global update(s)
Updating tdd…
  ✓ Updated tdd
```

`~/.agents/skills/tdd/SKILL.md` was back to Matt's `description: Test-driven development. …`. The locally installed vstack copy was silently replaced.

## 3. Removing Matt entries: by name only; removes files, agent links, and the lock entry

- `remove` takes skill names or `--all`. It has no source filter ([S/src/remove.ts#L210-L216](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/remove.ts#L210-L216)).
- Without `-a`, it targets every known agent, "to ensure ghost symlinks are cleaned up".
- It deletes each agent path and the canonical path. With `-g` it calls `removeSkillFromLock`; in project scope it calls `removeSkillFromLocalLock` ([S/src/remove.ts#L247-L333](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/remove.ts#L247-L333)).
- The canonical directory and lock entry are kept only while another *detected* agent still links the skill.

Observed (scenario B):

```
$ npx -y skills@1.7.0 remove -g grilling handoff -y
◇  Found 3 unique installed skill(s)
◆  Successfully removed 2 skill(s)
```

The lock afterwards held only `tdd`, the pstack entry. After `remove -g tdd -y`, `find $HOME -name tdd` returned 0 hits (the 55 agent symlinks described in section 5 were removed too), and the lock was `"skills": {}`.

- Removal is name-based. Running `remove tdd` after a same-named vstack install deletes the vstack copy, not a "Matt copy".
- To identify Matt entries, read `source == "mattpocock/skills"` in `~/.agents/.skill-lock.json` or use `npx skills list -g`, which groups skills by `pluginName` such as `Mattpocock Skills`. As section 2 showed, entries written by local or `file://` installs can be stale.
- A renamed vstack skill, such as `vstack-grilling` next to Matt's `grilling`, does not collide. Both stay installed until the Matt one is removed explicitly.

## 4. Lock files: global and project

**Global lock (`~/.agents/.skill-lock.json`):**

- Path: `$XDG_STATE_HOME/skills/.skill-lock.json` if set, otherwise `~/.agents/.skill-lock.json` ([S/src/skill-lock.ts#L67-L73](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L67-L73)).
- `version: 3`. A lock with a lower version is **wiped** on read ([#L80-L103](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L80-L103)).
- Entry fields: `source`, `sourceType`, `sourceUrl`, optional `ref`, `skillPath`, `skillFolderHash`, `installedAt`, `updatedAt`, and optional `pluginName` ([#L13-L38](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L13-L38)).
- For GitHub sources, `skillFolderHash` is the GitHub tree SHA of the skill folder at the given ref ([S/src/add.ts#L2086-L2112](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L2086-L2112)).

Observed first-install entries (scenario A):

```json
"tdd":    { "source": "mattpocock/skills", "sourceType": "github", "sourceUrl": "https://github.com/mattpocock/skills.git",
            "ref": "v1.2.3", "skillPath": "skills/engineering/tdd/SKILL.md",
            "skillFolderHash": "423f3cc2bccf3b0ed426fb35eeb4b38d9188a343", "pluginName": "mattpocock-skills", ... },
"wizard": { "source": "mattpocock/skills", ..., "skillPath": "skills/engineering/wizard/SKILL.md",
            "skillFolderHash": "0a163daf092c6f361158ca9627e81f2cb5230574", "pluginName": "mattpocock-skills", ... }
```

`wizard` was installed without `#ref` and has **no** `ref` key.

- Re-adding a skill with a different ref rewrites `ref`. `add 'mattpocock/skills#6acc160e…' -s tdd` changed `tdd.ref` from `v1.2.3` to `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e` and kept `installedAt`.
- Entries rewritten by `update` lost `pluginName`: in scenario A, `tdd` and `wizard` had no `pluginName` after the update. [INFERENCE: the update child re-installs with `--skill <name>` from a URL, and the resulting entry omitted it.]

**Project lock (`./skills-lock.json`, `version: 1`):**

Written for project-scope installs, including local sources, with `source`, `ref`, `sourceType`, `skillPath`, and `computedHash`, a sha256 of the content ([S/src/add.ts#L2130-L2166](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L2130-L2166)). Observed after the Matt project install followed by the pstack `tdd` collision:

```json
"handoff": { "source": "mattpocock/skills", "ref": "v1.2.3", "sourceType": "github", "skillPath": "skills/productivity/handoff/SKILL.md", "computedHash": "ad03e8d4…" },
"tdd":     { "source": "cursor/plugins", "ref": "12d587dfb20741cafc376c42c696c5f6e2a64487", "sourceType": "github", "skillPath": "pstack/skills/tdd/SKILL.md", "computedHash": "d3316fbb…" },
"wizard":  { "source": "../../../../tmp/skills-lab/fake-vstack", "sourceType": "local", "computedHash": "10100253…" }
```

Unlike the global lock, the project lock records local sources. It stores them as a path relative to the project.

## 5. Pinning `owner/repo#<ref>` and `update` behavior

**Pinning works for tags, full SHAs, and branches:**

- For git-like sources, `#ref` or `#ref@skill` is parsed from the fragment ([S/src/source-parser.ts#L284-L313](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/source-parser.ts#L284-L313)). A `…/tree/<ref>/<path>` URL is also accepted.
- Observed sources: `@ v1.2.3`, `@ 6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`, `@ main`, and `@ 12d587df… (pstack)`. The lock stored each ref verbatim.

**Global update (`update -g`):**

- Skills are grouped by `source + ref`. For GitHub sources, the tree is fetched **at the stored ref**, and `update` reinstalls only skills whose folder tree SHA differs from `skillFolderHash` ([S/src/update.ts#L549-L599](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L549-L599)).
- The tree lookup tries `[ref]` when a ref is set and `['HEAD','main','master']` otherwise ([S/src/blob.ts#L235-L275](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/blob.ts#L235-L275)).
- The reinstall spawns `skills add <sourceUrl>#<ref> --skill <name> -g -y` **without `--agent`** ([#L689-L724](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L689-L724)).
- Consequence: a tag or SHA pin never moves. A branch pin (`#main`) follows the branch. An unpinned entry follows the default branch.
- Entries with `sourceType` `local` or `git`, or with no `skillFolderHash`/`skillPath` (for example a private repo without API access), are skipped with a reason ([#L186-L203](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L186-L203)).
- Skills with no lock entry, such as local-path global installs, are invisible to `update`.

Observed (scenario A). Right after install:

```
$ npx -y skills@1.7.0 update -g -y
Checking skills from source: mattpocock/skills      # group ref=v1.2.3
Checking skills from source: mattpocock/skills      # group ref=<none>
✓ All global skills are up to date
```

After setting `skillFolderHash` to `0000…` for `tdd` (`#v1.2.3`) and `wizard` (unpinned):

```
Found 2 global update(s)
Updating tdd…     ✓ Updated tdd
Updating wizard…  ✓ Updated wizard
```

After the update, `tdd` had `ref v1.2.3` and hash `423f3cc2bccf`, identical to the tag. `wizard` had no ref and hash `0a163daf092c`, the default-branch tree.

After setting `teach` (`#6acc160e…`) and `wait-what` (`#main`) stale, one run checked three `mattpocock/skills` groups and printed `Found 2 global update(s)`. Afterwards `teach` still had `ref 6acc160e…` and `wait-what` still had `ref main`. `update` never rewrites a ref; only a new `add …#<newref>` moves a pin.

**Private repos:**

- Tree lookups try anonymous access first, then `GITHUB_TOKEN`/`GH_TOKEN`, then `gh api`. If API access still fails, update checks fall back to an authenticated git clone ([S/README.md#L79-L81](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/README.md#L79-L81), [S/src/skill-lock.ts#L139-L148](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/skill-lock.ts#L139-L148)).
- The private-repo install path was not run end to end, because vstack has no skills yet.

**Project update (`update -p`):**

- Every non-local entry in `skills-lock.json` is re-cloned at its stored ref and **reinstalled unconditionally**; `update -p` does not compare hashes ([S/src/update.ts#L845-L960](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L845-L960)).
- `local` and `node_modules` entries are skipped ([#L243-L258](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L243-L258)).

Observed:

```
$ (cwd=proj) npx -y skills@1.7.0 update -p -y
Updating for: Universal
Refreshing 2 skill(s)…
Updating handoff…  ✓ Updated handoff
Updating tdd…      ✓ Updated tdd
✓ Updated 2 skill(s)
```

Afterwards the refs were unchanged (`handoff v1.2.3`, `tdd 12d587df…`), and the local-source `wizard` was left alone.

**The update child picks agents afresh:**

- Because `--agent` is not passed, the child picks target agents again. With `-y`, it uses the detected agents plus all universal agents. If no agent is detected, it uses **all agents** ([S/src/add.ts#L1613-L1697](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L1613-L1697)).
- Observed in scenario B, where the clean HOME had no agent directories: one `update -g -y` that refreshed `tdd` created 52 new top-level dot-directories in `$HOME` (`.claude`, `.pi`, `.roo`, `.trae`, `.config`, …) holding 55 `…/skills/tdd` symlinks to `~/.agents/skills/tdd`. `find $HOME -name tdd` returned 56 hits, counting the canonical copy.
- On a machine where only some agents are installed, updates add symlinks for every detected agent. The original `-a` choice is not recorded. [INFERENCE from the code path; the real HOME was not used.]

## 6. Global versus project scope

- Without `-g`, installs go to `<cwd>/.agents/skills` and `./skills-lock.json`. With `-g`, they go to `~/.agents/skills` and `~/.agents/.skill-lock.json` ([S/src/installer.ts#L128-L131](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/installer.ts#L128-L131)).
- The two scopes are independent. `remove` and `update` act on one scope at a time: `-g` for global, `-p` or no flag for project.
- `update -y` without `-g` or `-p` picks **project** whenever the cwd has `skills-lock.json` or any `.agents/skills/*/SKILL.md`, and global otherwise. It does not do both ([S/src/update.ts#L91-L141](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/update.ts#L91-L141); README [#L201-L209](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/README.md#L185-L210)). An interactive `update` with no flags prompts for Project, Global, or Both.
- Global skills are recorded with `skillFolderHash` (a git tree SHA) and updated only when that hash changes. Project skills are recorded with `computedHash` (sha256 of content) and refreshed on every `update -p`.
- In omp, project `.agents/skills` beats user `~/.agents/skills` for the same name (section 1).

## Running inside omp: agent detection

- `@vercel/detect-agent` maps `claude` to `claude-code` ([S/src/detect-agent.ts#L41-L54](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/detect-agent.ts#L41-L54)).
- omp's shell exports `CLAUDECODE=1`, so every run in scenario A printed `●   claude  Agent detected — installing non-interactively`.
- In agent mode the CLI forces `-y`. When no `-a` is given, it targets `claude-code` plus the universal agents ([S/src/add.ts#L1214-L1225](https://github.com/vercel-labs/skills/blob/7407f3893ad4dceab546ac002c3ef806e4000c73/src/add.ts#L1214-L1225)).
- Observed: the scenario A `update -g -y` created `~/.claude/skills/{tdd,wizard}` symlinks, and `update -p -y` created `proj/.claude/skills/{handoff,tdd}` symlinks, although every install had used `-a universal`.
- The symlinks resolve to the same real path. omp dedups identical files by `realpath` ([omp skills doc](omp://skills.md), "Collision and duplicate handling"), and it loads foreign user-level providers such as `~/.claude` only on opt-in.

## Summary of facts

1. omp is not a valid `--agent`. `-a universal` (or any `.agents/skills` agent) installs to `~/.agents/skills` or `./.agents/skills`, which omp's `agents` provider reads.
2. A same-named install from another source overwrites the directory wholesale, without a warning in global scope. For GitHub sources it replaces the lock entry by name and keeps `installedAt`.
3. Local-path and `file://` installs overwrite files but leave the global Matt lock entry untouched. A later `update -g` that sees an upstream change silently restores Matt's copy.
4. `remove [-g] <names…> -y` deletes files, agent links, and the lock entry by name. It has no filter by source.
5. `#tag`, `#sha`, and `#branch` pins are stored as `ref`. `update` checks and reinstalls at that ref and never moves it; unpinned entries follow the default branch. Moving a pin requires re-running `add …#<newref>`.
6. `update -g` compares tree SHAs. `update -p` reinstalls everything unconditionally. `update -y` without a flag picks project scope if the cwd has project skills.
7. The update child reinstalls without `--agent`, so it adds symlinks for detected agents (or all agents when none are detected). Inside omp, `CLAUDECODE=1` makes the CLI treat itself as running under Claude Code.
