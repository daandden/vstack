# Changelog

Versions of the vstack plugin (`plugin/package.json`). See the README for when to raise each part of the version.

## [Unreleased]

## [0.1.10] - 2026-10-08

- prototype (Matt `v1.2.3`) ships as merge with pstack's prototype Playbook. It gains a BEHAVIOR.md branch (the smallest script that prints the output or timing), rule 7 "observe before handover" for all three branches, and the reply shape (variants, evidence, tradeoffs, recommendation, throwaway notice). In Private mode every prototype lives under `<vstack root>/artifacts/<topic>/`; an app-bound one runs in a detached omp worktree clone through vstack-worktree with a session dev server, is captured (variants, switcher, `mount.diff`, base SHA, verdict note) at handover and at the verdict, and is removed at the verdict. A plain checkout stops the app-bound flow (#80).

## [0.1.9] - 2026-10-08

- setup-vstack (Matt's setup-matt-pocock-skills at `v1.2.3`, hidden as Matt ships it) ships as adapt. Its machine section runs checks 1–5, 7, and 8 through `scripts/machine.ts` and prints one OK line, or one line per failing check with its remedy: TypeSafe credentials, the `typesafe/jev-latest` judge role, model overrides on vstack agents, the extension enabled and loaded, eval Python, `task.isolation.enabled`, and `worktree.clone`. It sets the judge role, isolation, and clones only after the user approves through `ask` (#74).
- setup-vstack's project section stops in a repo that still has `<git common dir>/matt-pocock/`. Otherwise it asks Standard or Private (a re-run reports the mode), then the issue tracker, the triage labels, and the domain docs. Standard writes `docs/vstack/{issue-tracker,triage-labels,domain}.md` and the `## vstack` block and commits only those paths (`scripts/project.ts commit`) with the repo's title convention; Private writes under `<git common dir>/vstack/config/` and commits nothing. Done lists the skills that read the config and points at `/skill:setup-app-verification` in a new session (#74).
- The always-apply rule `vstack-private-mode` describes the vstack root: `config/` turns Private mode on, `domain/`, `artifacts/`, and `skills/` with the absolute `.omp/skills/verify-<app>` link excluded through `info/exclude`, and subagents take the vstack root from their prompt (#74).

## [0.1.8] - 2026-10-08

- to-spec, to-tickets, and triage (Matt `v1.2.3`) ship as adapt. They name `/skill:setup-vstack` for the tracker and label config in `docs/vstack/` or the Private config, refer to skills as `/skill:<name>` or `skill://<name>`, and put their user questions through `ask` (#77).
- handoff (Matt `v1.2.3`) ships as adapt. It saves its file as `<ts>-<slug>.md` in the Scratch `handoff/` dir that vstack-tmp's path script prints, and prints the file path (#77).

## [0.1.7] - 2026-10-08

- `scripts/update-plan.ts` builds the Update's JSON plan. It clones or fetches each Upstream, finds its newest Pin, and stops at once when nothing moved. Otherwise it makes the `update/<matt-tag>+<pstack-sha7>` worktree with `omp wt add`, installing deps on a plain checkout. It classifies every row from its own baseline (`held_at` on a held row), maps files to rows by longest path, pairs moves, stages adopt copies without `agents/openai.yaml`, and writes both Upstream sides of adapt and merge rows with the `uses: update` House style rows applied. The README documents the plan (#97).
- `pins.yaml` `pin_kind` is `tag` or `commit`, so scripts can find the next Pin (#97).

## [0.1.6] - 2026-10-08

- diagram-design (Diagram upstream, `d1376371`) ships as adapt, all 279 files and model-invocable. Onboarding always saves a profile under `~/.vstack/diagram-design/profiles/` and never writes the shipped `references/style-guide.md`. A project picks its profile with a `diagram-profile:` line in its vstack config (`docs/vstack/diagram.md`, or `<git common dir>/vstack/config/diagram.md` in Private mode). Every question goes through `ask`: the style gate once per project, confirm-before-drawing only when the caller left the plan open. The bundled scripts run as eval cells with `runpy`, and Playwright is installed with `%pip` only after approval (#72).
- good-css (CSS upstream, `6d16d2fd`) ships as adapt and model-invocable, without its Motion section, the motion hand-off bullet, and the mobile-native credit (#72).
- `check-register` runs good-css's `scripts/check-css.mjs` at the CSS Pin over every page template (`plugin/skills/<name>/templates/*.html|css`) and fails `page-css` on a violation. No template exists yet, so it passes (#72).

## [0.1.5] - 2026-10-08

- Scratch has one home, `~/.vstack/tmp/<repo-key>/<kind>/<entry>`. The hidden skill vstack-tmp's `scripts/path.ts` prints the project Scratch dir or one kind dir, and `/skill:vstack-clean [age]` shows a dry run of entries older than 14 days and deletes them only after the user confirms through `ask` (#67).
- The always-apply rule `vstack-worktrees` and the hidden skill vstack-worktree create every worktree with `omp wt add`, tell a clone from a plain checkout by the `Cloned from … via` line, and remove it with `git worktree remove --force` (#67).

## [0.1.4] - 2026-10-08

- tdd ships as one merge of Matt's tdd (the base text and frontmatter) and pstack's tdd. It adds the "wants a regression test" trigger and a rule that tests follow intended behavior. A new "Fixing a bug" section sends a bug with a known cause to the new `BUG-FIX.md` and a bug with an unknown cause to `skill://diagnosing-bugs`. A slice with no failing test at an agreed seam stops uncommitted, and its End state is capped at commit (#79).

## [0.1.3] - 2026-10-08

- The always-apply rule `vstack-prose` (`plugin/rules/vstack-prose.md`) loads in every agent. It points every text at unslop and simple-english in Plain mode, and agent-facing text also at writing-for-agents, with the Document register everywhere and no bold (#66).
- simple-english (Prose upstream, `v2.1.1`) ships hidden without Strict mode, and writing-for-agents ships hidden. The rule is the only trigger for both (#66).

## [0.1.2] - 2026-10-08

- wait-what, diagnosing-bugs, domain-modeling, wizard, and to-questionnaire ship as adapt: Upstream text at the Pin with the House style rows applied, so they name `GLOSSARY.md` and `GLOSSARY-MAP.md`, plus hand edits that put every question to the user through `ask`, never take a timed-out answer as the user's, and name skills with `skill://` (#65).
- `house-style.yaml` holds the House style rows and rules. `check-register` fails on a leftover Upstream phrase, a bare `/<skill>` token, Cursor spawn wording, `git worktree add`, a `/tmp/` output path, and, in every artifact including adopt ones, an asking phrase that does not name `ask` (#65).

## [0.1.1] - 2026-10-08

- The vstack extension (`plugin/extensions/vstack.ts`, listed in the manifest's `omp` field) registers `vstack_rename_session(name)` in every session. It sets a user-sourced session name, so omp's auto title never replaces it (#69).

## [0.1.0] - 2026-10-08

- First linkable plugin: `omp plugin link <clone>/plugin` loads vstack with the 24 adopt items, grill-me, grill-with-docs, resolving-merge-conflicts, unslop, technical-writing, and 19 `principle-*` skills, copied byte for byte from their Pins without `agents/openai.yaml` (#64).
- `pins.yaml` holds the five Pins, and `decision-register.yaml` holds a row for each of the 111 Upstream items (#64).
- `check-register` checks the register against the plugin and the Upstreams locally and in GitHub Actions (#64).
