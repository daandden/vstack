# Changelog

Versions of the vstack plugin (`plugin/package.json`). See the README for when to raise each part of the version.

## [Unreleased]

## [1.0.4] - 2026-10-14

- migrate-to-vstack first asks what the Migration covers. Inside a git repo, Only this project is the first and recommended answer. It skips Machine Migration and changes only the current checkout and the repo's shared Private-mode store.

## [1.0.3] - 2026-10-14

- A Matt run starts only when the skill header opens the prompt. A skill prompt pasted lower in a message no longer starts Addon selection.
- The extension and check-register share one Matt skill rule, and the check reads only valid register rows.
- vstack-maintain `prepare` raises the major version whenever a shipped skill or agent name disappears, including when an Update rejects or renames a shipped row.

## [1.0.2] - 2026-10-13

- compare-attempts and vstack-maintain follow the Session model rule too: a user override wins, and the cross-judge's model is named in the synthesis note.

## [1.0.1] - 2026-10-13

- A `task.agentModelOverrides` key for a vstack agent now wins over the Session model. setup-vstack check 3 prints it as a `NOTE` line, not a warning, and decision-trail counts a review on that model, naming both models in the Attention line.
- session-lessons also skips END-STATE step 4 for in-place edits. Validation and the in-place gates are the proof.
- Use "Session model" for the model the user's session runs on, in place of "parent's model" and "run's model".

## [1.0.0] - 2026-10-12

- Matt skills are the core, Addons supplement them, and Utility skills work outside a Matt run.
- Addons load only through the jev judge during a Matt run or a `skill://` pointer.
- code-review runs the blast-radius Safety proof only in a user-started Matt run and otherwise reports each trigger with `/skill:code-review` for the proof.
- Principles follow the Addon rule, and the steps of the running Matt skill and its Addons win over conflicting principles.
- Remove architect in favor of grill-with-docs and DESIGN-IT-TWICE.
- Remove refactor in favor of implement, tdd, and code-review.
- Remove ask-vstack in favor of grill-with-docs and grill-me.
- Replace vstack-update and vstack-edit with the vstack-maintain Addon, with implement owning changes and bookkeeping.
- Replace the vstack-clean skill and `/skill:vstack-clean` with the model-free `/vstack-clean` Command.
- Merge unslop, simple-english, and technical-writing into the vstack-prose Utility skill.
- Rename the vstack-prose rule to vstack-writing, which also loads writing-for-agents for agent-facing text.
- Remove principle-test-behavior-not-implementation in favor of tdd.
- Remove principle-fix-root-causes in favor of diagnosing-bugs.
- Remove principle-exhaust-the-design-space in favor of prototype and DESIGN-IT-TWICE.
- Remove the vstack-worktrees rule in favor of Matt flow worktree steps and the vstack-worktree Utility skill.
- Rename `principle-questions.json` to `addon-questions.json`, with full skill names and one question per Addon.
- Add the by-hand `scripts/addon-judge-check.ts` corpus check in place of the Update sample rerun.
- Add check-register classes `invalid-utility`, `addon-slash-route`, and `addon-question-mismatch`, and remove `unrouted-skill`.
- Fix the extension's saved-message scan so that an Addon gets no second pick after a restart.

## [0.1.55] - 2026-10-11

- Separate Matt Pocock Migration into migrate-to-vstack; setup-vstack now runs configuration and fresh setup without Migration scans.
- Route old diagram markers to migrate-to-vstack and move the Migration scripts and House style data into that skill.
- Link diagram-design's existing Environment doctor for diagnostics.

## [0.1.54] - 2026-10-11

- Chat replies and `ask` text follow simple-english's Reply rules again, not its Document rules. A reply can use a list, a table, a heading, or a code block when it carries structure. The Document rules no longer have the heading, list, and paragraph thresholds or the forced words `make sure that` and `configuration`, and the 20-word and 25-word limits become targets. should and would stay banned, and may, might, and could are allowed for a fact that the writer is not sure of. simple-english also loses CHECK mode and its rule catalog, and no skill or rule names a mode, so explain and the rule point at the skill alone. The vstack-prose rule allows parentheses for a short definition, an example, or an aside, and ADR 0012 records the change.

## [0.1.53] - 2026-10-11

- vstack-edit renames or removes a skill, agent, or rule. `check --rename <artifact>=<new artifact>` and `check --remove <artifact>` list every caller of the old name, including an Upstream form such as `/<name>` in an adopt item, and the adopt callers that need a confirmed flip. prepare moves or drops the artifact in the register and turns a row with no artifact left reject. For a rename, it adds a required House style row and checks the new name for an Upstream clash. It raises the major version for a skill or agent and refuses while a plugin file still names the old name. gates runs quick_validate only at the final paths (#110).

## [0.1.52] - 2026-10-11

- The Grilling page keeps the line breaks and leading spaces of a question's `example`. Before, the page joined an example that shows rows on screen into one line.

## [0.1.51] - 2026-10-11

- skill-creator's trigger-evals reference no longer refuses an adopt item for an accepted description. It applies the description by the home rules in step 2 of SKILL.md, so a vstack description goes to vstack-edit, as #112 intended.

## [0.1.50] - 2026-10-11

- The Grilling page drops the extra bottom padding of one screen height. At the end of the page, a question that `j`, `k`, or a Q row link picked stays current in the Q row while it is on screen, and a click on a Q row link marks its question. A `round` record no longer takes a `note`.

## [0.1.49] - 2026-10-11

- skill-creator and session-lessons hand a vstack change to vstack-edit, for an adopt item too. They no longer refuse an adopt edit, list it in Backlog, or restate the branch, version bump, CHANGELOG, register check, and PR steps. Inside an active vstack-edit run, skill-creator writes only the draft and does not hand the work back (#112).

## [0.1.48] - 2026-10-11

- A vstack-edit take of a reject row that is on Hold now removes the row's `held_at` and `held_path`. The take ships the bytes at the current Pin, but check-register compared the adopt row against the older held ref and failed when the bytes differed (#109).

## [0.1.47] - 2026-10-11

- vstack-edit takes an Upstream item at the current Pin without a full Update: an item that the register rejects, or one that has no row yet. `check --take <upstream>:<path>` prints the artifact that the item ships as and its Disposition. The take is adopt when no House style row with scope required matches the item, and adapt otherwise. prepare writes the item from the Pin, sets the reject row or adds a new row, and check-register passes in the gates. A name clash for a new item now offers to take the Upstream item in its place or to pick another name (ADR 0014, #109).

## [0.1.46] - 2026-10-11

- A bookkeeping-only change in a vstack-edit run needs a new prepare and nothing more. prepare writes a receipt of the files it left. The gates receipt and the review receipt now hold a hash of the skill, agent, and rule text only. finish refuses files that changed after the last prepare, and text that changed after the last gates pass or review. A new CHANGELOG line, commit message, or flip reason no longer reruns the gates (#111).

## [0.1.45] - 2026-10-11

- `scripts/vstack-edit.ts` no longer clones a missing Upstream in full. check, prepare, and gates fetch only the current Pins and the `held_at` refs of held rows that the clone cache lacks, with no branch and no other tag. A cold cache no longer gains refs newer than the Pin (ADR 0014, #107).
- vstack-edit reviews the final files with three reviewers behind one Fan-out gate. They check description overlap with neighbor skills (trigger evals only on an overlap), conflicts with the ADRs and GLOSSARY.md, and subagents that overlap outside a Fan-out block or asking wording that the lint misses. Each finding is a Grilling page question with Fix and Accept options. A target question gets a before-and-after flow figure when a step or a branch moves (#111).
- `scripts/vstack-edit.ts reviewed` records a hash of the skill, agent, and rule text that the reviewers read, after passed gates. finish refuses when that text changed after the last review. A change to only the version, the CHANGELOG, or the register keeps the review (#111).

## [0.1.44] - 2026-10-11

- vstack-edit adds a new original skill, agent, or rule. check compares each new name with the Upstream items at the current Pins and never fetches a newer ref. A clash exits with code 2 before anything is written, and the skill asks for another name. prepare lists the new item under `originals:`, the skill writes a new skill's route in ask-vstack in the same run, and gates runs quick_validate on each skill directory the run added or changed (#107).

## [0.1.43] - 2026-10-11

- explain, how, teach, and improve-codebase-architecture print the plain absolute path of the page they write, not a `file://` URL. The Tern Reader makes a plain path a link that opens on Cmd-click, but it shows a `file://` URL as plain text (#102).

## [0.1.42] - 2026-10-11

- `scripts/vstack-edit.ts finish` takes the closing gate from the latest close on the Grilling page, with records replaced by id in their first-seen place. Re-appending an older confirmed close no longer passes over a newer Not yet.
- vstack-edit edits an adopt item after the user confirms the flip to adapt and gives the new reason. `scripts/vstack-edit.ts prepare` sets the item's register rows to adapt with that reason and changes only those two lines. It refuses an adopt target without the confirmation, exits with code 2, and writes nothing (#108).

## [0.1.41] - 2026-10-11

- The Grilling page separates whole question sections and summaries. Each question, its options, and its answer stay together without internal separator lines.
- New hidden skill vstack-edit makes a Hand edit to an existing original, adapt, or merge skill, agent, or rule. It asks once for the End state and works in an omp worktree on `edit/<name>`. `scripts/vstack-edit.ts` raises the patch version, writes the CHANGELOG entry, and runs quick_validate, check-register, the test suite, and the load smoke. After the user confirms on a Grilling page, the script makes one local commit. For a later End state, open-pr pushes and opens the PR. The script refuses other actions and adopt items for now (#106).
- ask-vstack routes to vstack-edit in its Maintain vstack section (#106).
- Inside an active vstack-edit run, skill-creator writes only the draft. It makes no branch, version bump, CHANGELOG entry, or PR of its own (#106).

## [0.1.40] - 2026-10-11

- `check-register` fails `unrouted-skill` when ask-vstack names no `/skill:<name>` route for a shipped skill. The principle-* skills need no route (#105).
- ask-vstack has a Maintain vstack section that routes to vstack-update, and its grilling entry names grilling-page (#105).
- vstack-update says how an Update that adds or renames a skill routes it in ask-vstack, including a plan that does not select matt (#105).

## [0.1.39] - 2026-10-11

- The Grilling page is Catppuccin Mocha only (ADR 0013). Question titles and their Q numbers are Mauve, and option labels are Blue. The recommended option ends with a Yellow `*`, and your pick is a bold Yellow label. In the Q row, answered dots are Yellow, unanswered dots are Red, and open dots are grey. j or Down moves to the next question or summary, k or Up to the previous one, and the Q row highlights where you are.
- A question record has a title written as a question and a `description` under it, in paragraphs and `- ` bullet lists. The In plain words, Why it is open, and Already settled blocks are gone, and the script refuses a question that still has `plain`, `why`, or `settled`. An option `label` is the `ask` label with its letter; the script checks the letter and the page hides it, so the page no longer shows "A. A.".
- Each round, `scripts/visual_judge.py` asks the jev judge which visual each question needs, from the rubric in `references/visual-judge.json`. Under 0.7 confidence the question gets no visual. Every diagram comes from diagram-design, drawn dark. `scripts/visual-judge-check.ts` checks the rubric against `visual-judge-cases.json` with live jev.

## [0.1.38] - 2026-10-09

- grilling renders the Grilling page with `scripts/grilling-page.ts` from a JSONL state file (ADR 0013). The agent appends records, and the script checks them, refuses unsafe previews, and renders the whole page. The page is minimal and light only: Catppuccin Latte with a blue primary color, JetBrainsMono Nerd Font Mono at 13px with Tern's line height, options as headings with no cards (recommended is underlined, your answer is blue), a slim Q-number row, a visual only when the words are not enough, and a bullet summary that says what each decision made true. Every command prints the page's plain absolute path.
- The page steps move from grilling into a new hidden skill, grilling-page, so grilling stays close to its upstream. grilling still says when each page step happens. The glossary term Grilling HTML is now Grilling page.

## [0.1.37] - 2026-10-08

- Re-ask timed-out End state and seam gates once, then stop without authorization; keep Headless defaults separate (#63).
- Review caller-supplied uncommitted work and named untracked files on every code-review axis (#63).
- Resolve diagram profiles from the parent's supplied vstack root and mode (#63).
- Reject linked Scratch roots and ancestor components before cleanup can delete outside entries (#63).
## [0.1.36] - 2026-10-08

- Add ask-vstack routing across the shipped catalog, correct omp phase boundaries, and reject non-reject register rows with no artifacts (#100).

## [0.1.35] - 2026-10-08

- Add hidden architect with gated grounding, alternative design sketches, named stops, implement handover with proposed seams, and Scrap before review or commit (#96).

## [0.1.34] - 2026-10-08

- Add model-invocable hillclimb with frozen-harness hypothesis waves, isolated unapplied workers, best-only measured wins, every-attempt decision trails, and shared live proof and End-state chaining (#95).

## [0.1.33] - 2026-10-08

- Add model-invocable perf-issue with measured strategy attempts and before → after proof, and refactor with behavior pins, subtraction, caller migration, and equivalence proof. Both run the shared End state block and Verify skills (#93).

## [0.1.32] - 2026-10-08

- vstack-update carries hand edits through per-row three-way merges, proposes held catch-ups, and checks ADRs and Fan-out callers. Removed and renamed items get full choices without defaults. Shared Holds omit only their own steps, and removed or renamed names get major bumps (#99).

## [0.1.31] - 2026-10-08

- implement settles the End state and design seams once, keeps unproven tdd slices out of commits and PRs, and shares cleanup, live proof, review, commit, and the one-run PR chain through END-STATE.md (#92).

## [0.1.30] - 2026-10-08

- Add hidden session-lessons with current-session scope, gated lenses, fresh synthesis, approved edits by skill home, and a listed-only Backlog (#88).

## [0.1.29] - 2026-10-08

- Add model-invocable forensics with live instrumentation and captured-artifact branches. It returns a cited diagnosis, preserves tracked files, and requires paired captures for confirmation (#94).

## [0.1.28] - 2026-10-08

- vstack-update plans in its own worktree, presents gated row decisions, applies adopt, reject, and new items, and opens an Update PR. Changed adapt and merge rows and all moved or removed rows stay Hold-only until #99. Scripts own the writes, direct jev re-run, report, version bump, and publication (#98).

## [0.1.27] - 2026-10-08

- improve-codebase-architecture and Matt teach write one-file Scratch pages from linted templates, draw inline SVG figures through diagram-design, and print file URLs. Architecture exploration uses a vstack explorer; session questions go through `ask`, while lesson quizzes remain interactive (#82).

## [0.1.26] - 2026-10-08

- wayfinder adapts Matt v1.2.3 with isolated research runners, parent-only tracker writes, research-branch landing through omp worktrees, Private findings, and session renames after every claim (#78).

## [0.1.25] - 2026-10-08

- Add model-invocable skill-creator with Bun initialization and validation, same-model Headless evals, load-event trigger scores, and blind comparisons (#87).

## [0.1.24] - 2026-10-08

- open-pr cleans and orders unpushed commits before the final push, opens a ready PR through gh, and cites Safety findings and the proof that ran in its Markdown body (#89).

## [0.1.23] - 2026-10-08

- Add hidden how, why, and explain skills for cited code explanations. Gate investigation batches, profile repository evidence sources, and inline diagram-design figures on Scratch pages (#81).

## [0.1.22] - 2026-10-08

- setup-vstack confirms project Migration before fresh setup: move edited Matt config or keep tracked team files with a Private copy, resolve old storage, convert diagram markers, and rename domain files and map links. Changes remain uncommitted (#76).

## [0.1.21] - 2026-10-08

- grilling keeps an append-only Grilling HTML in Scratch, puts each frontier through one `ask`, and records answers and the shared-understanding gate. Its shipped template follows good-css; figures come through diagram-design (#73).

## [0.1.20] - 2026-10-08

- code-review reviews Standards, Spec, and conditional Safety through the Fan-out gate. Safety runs blast-radius without step 6, and reports stay separate. Spec reads Standard or Private vstack configuration (#84).
- blast-radius is model-invocable, writes proof evidence in Scratch under `blast-radius/`, and compares reply attempts only on an explicit request (#84).

## [0.1.19] - 2026-10-08

- babysit drives a PR to merge-ready without merging, with check, threads-only, and isolated background modes (#90).


## [0.1.18] - 2026-10-08

- ship verifies each PR through an isolated run-only verifier and lands only the contiguous verified run bottom-up. Patch changes require new proof; FAIL and DRIFT cap the run (#91).

## [0.1.17] - 2026-10-08

- Select hidden principles per main-session prompt through native jev, with cleaned request-only state, a four-second budget, one retry, and persisted once-per-session pointers. Ship the four adapted principles and the calibrated 23 questions and 72 sample prompts (#71).

## [0.1.16] - 2026-10-08

- compare-attempts ships as a hidden adapt of pstack arena. It runs three isolated workers by default, keeps the rubric with the parent, cross-judges with one explorer, and grafts the best parts into a tree change or reply. The parent reads patch paths from omp completion text, applies only the base tree patch, and cites untouched losing patches. The fixed batch stops without isolation and asks before overriding sequential words or re-running (#83).

## [0.1.15] - 2026-10-08

- decision-trail logs unattended runs in Scratch through its append-only TSV helper, audits only the current session and referenced children, and requires a same-model fresh-context review or an explicit not-reviewed result (#86).

## [0.1.14] - 2026-10-08

- prune-comments uses one fresh `vstack-comment-critic`, accepts scoped fixes, and leaves commits to its caller. The critic edits comments only (#85).
- setup-app-verification creates and proves a visible `verify-<app>` skill. Standard mode commits it; Private mode links one shared copy and commits nothing (#85).
- maintain-app-verification supports one-feature Drift repair and a full source and serial live pass. Proof, notes, and disposable app data use the run's Scratch entry (#85).
- `spawn-vocab` ignores skill descriptions in frontmatter while still rejecting off-form delegation in the body (#85).

## [0.1.13] - 2026-10-08

- setup-vstack check 6 finds Matt machine leftovers and confirms one Migration plan through `ask`. Private moves are mandatory, cover every git common-dir layout, and keep the old rule on failure. It also removes CLI skills, rewrites user rules, moves profiles, and calls for a new session (#75).
- setup-vstack ships the Migration House style rows. `check-register` validates their schema and exact agreement with the root rows (#75).
## [0.1.12] - 2026-10-08

- The agents `vstack-explorer` (read-only), `vstack-worker` (writes only in its given tree, under the vstack root, and as appended rows of a named decision-trail log), and `vstack-verifier` (run-only, returns a PASS, PASS+NOTES, FAIL, or DRIFT verdict with head and base SHA, patch id, and evidence) ship with no `model`, `thinking-level`, or `tools`. Each passes the user's override words, the vstack root, and the Scratch dir to its subagents and never asks the user (#68).
- The hidden skill vstack-fan-out holds the Fan-out rubric, the order of checks (the user's words, then no eval tool or no way to start subagents, then the judge at confidence 0.7), and the eval `judge()` cell. Its `FORMS.md` is the single source of the Fan-out block, single-subagent, and fixed Fan-out lines (#68).
- research (Matt `v1.2.3`) ships as adapt: its background agent is one `vstack-worker`. codebase-design (Matt `v1.2.3`) ships as adapt: DESIGN-IT-TWICE step 2 is a Fan-out block of 3–4 `vstack-explorer` designers, and step 3 screens every design against the new `RED-FLAGS.md` (#68).
- `check-register` fails a spawn site that names no vstack agent, an incomplete Fan-out block, the fixed or headless form outside its allowlist, and a `spawns:` list with an agent the plugin does not ship. The spawn lints skip code fences, and diagram-design leaves the `spawn-vocab` allowlist (#68).

## [0.1.11] - 2026-10-08

- prototype (Matt `v1.2.3`) ships as merge with pstack's prototype Playbook. It gains a BEHAVIOR.md branch (the smallest script that prints the output or timing), rule 7 "observe before handover" for all three branches, and the reply shape (variants, evidence, tradeoffs, recommendation, throwaway notice). In Private mode every prototype lives under `<vstack root>/artifacts/<topic>/`; an app-bound one runs in a detached omp worktree clone through vstack-worktree with a session dev server, is captured (variants, switcher, `mount.diff`, base SHA, verdict note) at handover and at the verdict, and is removed at the verdict. A plain checkout stops the app-bound flow (#80).

## [0.1.10] - 2026-10-08

- The `vstack-private-mode` rule opens with how the top-level agent finds the vstack root: `<git common dir>/vstack` when its `config/` exists, else the main checkout's root. It resolves the root once and passes it as an absolute path in every subagent prompt (#74).

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
