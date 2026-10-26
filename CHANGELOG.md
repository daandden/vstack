# Changelog

Versions of the vstack plugin (`plugin/package.json`). See the README for when to raise each part of the version.

## [Unreleased]

## [5.0.20] - 2026-10-26

- Main sessions select Addons through `inject_addons` and `inject_principles` after the agent gathers intent from real task context. Typed Matt runs display the shared tool instruction, and no main prompt calls `smol` or the Addon judge automatically. Tool picks remain session-wide, use the native judge role and 0.70 threshold, and keep the four-second deadline. Subagent Brief picks stay automatic (ADR 0039).
- to-spec and to-tickets preserve only non-principle Addon pointers in specs and tickets, including inherited context. Build sessions select principles fresh. The Verify feature map covers the displayed instructions and executable unavailable-native-judge tool path.
- Main sessions select Addons through `inject_addons` and `inject_principles` after the agent gathers intent from real task context. Typed Matt runs display the shared tool instruction, and no main prompt calls `smol` or the Addon judge automatically. Tool picks remain session-wide, use the native judge role and 0.70 threshold, and keep the four-second deadline. Subagent Brief picks stay automatic (ADR 0039).
- to-spec and to-tickets preserve only non-principle Addon pointers in specs and tickets, including inherited context. Build sessions select principles fresh. The Verify feature map covers the displayed instructions and executable unavailable-native-judge tool path.

## [5.0.19] - 2026-10-26

- Tune three Addon questions for jev-1.14.0. `principle-guard-the-context-window` distinguishes bulk reading from editing many files. `principle-minimize-reader-load` distinguishes readability work from routine cleanup. `principle-boundary-discipline` distinguishes boundary implementation from diagnosis and research. The gated catalog improved test exact-pick rate from 69.7% to 80.8% on 87 task families. The eval includes 75 real-session prompts and labels from Opus 5.5 high, GPT-6.1 sol high, and GPT-6.1 sol xhigh (#235).
- `scripts/addon-judge-check.ts` flags an unexpected pick above 0.95, not 0.85. The runtime selection threshold remains 0.70. Both sample corpora are re-recorded on jev-1.14.0. Three expected-pick flags remain among 250 prompts, and one among 16 briefs. Follow-up question rewordings did not clear the eval gate and were reverted (#235).
- `scripts/addon-judge-ratchet.ts` scores a catalog edit on a case file of tasks, each with its raw and restated forms, for omp's eval `ratchet` flows (#235).
- Draft implement-spec review fixes in isolated workers. Land their patches through the merger for ordinary work. When vstack-maintain is loaded, follow its review-fix-wave rule and apply gated patches atomically. Resolve conflicts in a fresh isolated worker before rerunning the gates.
- Require regression coverage of the counterpart ordering that a race or ordering fix must preserve before publication.
- Allow the same session's advisor transcript for advisor notes, model calls, tokens, or cost findings across session's four reviewers and synthesizer.

## [5.0.18] - 2026-10-24

- implement reuses a seam from the flow's Grilling page only when the user picked it through `ask`. A headless answer, an unanswered or timed-out question, and a no-test pick leave the seam open, so the run asks again or builds the slice without a test (#183).

## [5.0.17] - 2026-10-24

- implement settles the test seams before the first code change. Its steps are now 1. Settle the seams, 2. Red then green per slice, and 3. Run checks, so the todo list no longer puts code before tdd. It reuses a seam that the spec's testing decisions, the ticket's text, or an answered seam question on the flow's Grilling page names, and asks one seam question for every other slice. tdd does not change (#183).

## [5.0.16] - 2026-10-24

- Every Figure brief has a layout field: the figure's direction and where each part sits. A figure with zones, lanes, or rows also gets a groups field, with each group's name and nodes. `vstack-figures` is the one list of the brief's fields, and explain, how, grilling-page, improve-codebase-architecture, teach, and ketchup write briefs with them. GLOSSARY.md defines Figure brief (#239).
- `plugin/skills/vstack-figures/evals/` holds 18 real Figure briefs (3 simple, 5 normal, 10 complex), the judge rubric, and the run procedure for comparing two versions of the drawer text. Drawers run on `openai-codex/gpt-6.1-sol:high`, and Opus 5.5 (high) judges each pair blind twice, once in each A/B order. A pair counts as a win only when both verdicts agree, and a change is kept when it wins at least 11 of 18 pairs. Runs write under the new `vstack-figures` Scratch kind. The first comparison tested removing diagram-design's complexity budget together with a shorter drawer reading list. It lost every run, ending at 5 candidate wins, 10 baseline wins, and 3 splits, so diagram-design keeps its budget (#242, #245).

## [5.0.15] - 2026-10-24

- implement, implement-spec, and the shared End state block take the project's default End state from the `- Default End state:` line in `code-host.md` when the user's words and the ticket name none, with no question. The configs still cap it, and the run says which End state it took and where it came from. A project without the line still gets the End state question with commit recommended, and a Headless run with no `ask` still takes commit unless its prompt names an End state (ADR 0038).
- setup-vstack's Code host section asks the project's default End state, with shipped recommended in Standard mode and commit in Private mode, and writes it as one line in `code-host.md`. `project.ts state` reports `missing_default_end_state`, so a re-run asks only that question and adds the line to the existing `code-host.md` after confirmation (ADR 0038).

## [5.0.14] - 2026-10-24

- code-review's third review axis is now called Blast radius, so it no longer reads as a security review. Its chat lines say `Blast radius: not triggered`, `Blast radius: skipped by request`, and `Blast radius: triggered, no proof (not in a run)`, and its ledger is titled Blast radius. implement's and implement-spec's closing summaries, open-pr, and blast-radius use the same name. The trigger list does not change. code-review accepts "check blast radius" and "skip blast radius", and still accepts "check safety" and "skip safety". GLOSSARY.md defines Blast radius (#229).
- When a change spans more than one module, to-spec drafts a capability map in codebase-design's vocabulary before it writes the spec, and shows it on its Stage as a table Report block with the columns Module, Responsibility, Depends on, and Build order. A real fork between two module splits joins the seams `ask`, so to-spec still asks one round. A change inside one module gets no map (#230).
- to-tickets drops the vertical-slice rule that sized each slice to one fresh context window, and the breakdown's Size column says small, medium, or large with no context-window comparison. The ticket body template is unchanged (#227).
- A code-review finding's impact opens with what a user or caller sees, then the decision you face, and names no file path. The Grilling page shows each card's Impact and Action first and folds its Evidence, the file and line for whoever fixes it, into a block that one click opens (#228).
- to-spec and to-tickets check their draft against what the user decided before they publish. A fresh `vstack-explorer` compares the draft with every `close` decision on the flow's Grilling page and with the source issue (for to-tickets, the spec). The agent fixes each miss or contradiction, shows the coverage table as a table Report block on its Stage, and asks a conflict between decisions on the page. If the checker cannot start, nothing is published (#226).
- grilling settles a decision itself only when a later edit can undo it with no migration or change to published text, it is not a matter of the user's taste (names, wording, looks), and a cited repo fact, ADR, or convention gives its pick. It asks every other decision. Settled decisions appear before the round's `ask` in an Assumed table Report block with the columns Decision, Pick, and Why. A note or pushback that names one reopens it as a question, and the close lists each Assumed pick that still stands. ADR 0037 records the rule (#225).
- A Stage that settles every decision as Assumed now closes on the Grilling page: its close has an empty `decisions` list and its Assumed picks as `extra` bullets, and needs no round. Overview links a finished Stage with no questions to its summary and shows its Assumed decision count. The drift check of to-spec and to-tickets also covers each close's Assumed picks, and both skills follow one shared drift-check reference, to-spec's DRIFT-CHECK.md. A card's Evidence label shows a pressed color when clicked (#223).

## [5.0.13] - 2026-10-23

- The extension picks Addons through omp's `judge` role with `resolveJudge`, not its own TypeSafe `/v1/systemone` call, and only when the role's first candidate is native. Each pick goes into the session's cost ledger as `vstack-addons` and through omp's shared judgment cache, and vstack's own retry is gone. setup-vstack fails the judge role check only when no role is set, prints a note for another role, and checks TypeSafe credentials only when the role's provider is `typesafe`. `sample-briefs.json` is re-recorded on jev-1.14.0 with no flags. `sample-prompts.json` keeps its jev-1.13.0 baselines, because jev-1.14.0 gives 5 flags there (#235) (ADR 0036).

## [5.0.12] - 2026-10-23

- vstack-fan-out now says what goes in a Fan-out's Shared context and what goes in each Brief, and that an isolated eval spawn carries both in its prompt.

## [5.0.11] - 2026-10-23

- A Term note name written as inline code or a link is teal too, like a plain term name. A linked term keeps its underline and its hover color.

## [5.0.10] - 2026-10-23

- Grilling page Term notes make each term stand out: the term name is teal, bold, and body size, still on its own line above its explanation. Every block label under a question (Today, Term notes, Topic notes, Example, and From the report) is pink, so the labels read apart from blue option headings. Report card and ledger field labels keep their gray. GLOSSARY.md now defines Term note.

## [5.0.9] - 2026-10-23

- A Grilling page round lists its questions in Q-number order, and grilling-page tells the agent to append and ask each round in that order, so the page and the `ask` agree. A decision asked again no longer shows after newer Q numbers.
- The row of links under the Stage tabs is now the Jump row (GLOSSARY.md). It links the Background and each Report block before the questions, and j/k stop at them. Their link text is the record's optional `jump` field, or else Background, Report, Report 2.
- Opening a tab measures the bar again before it scrolls, so a link like `page.html#q-q13b` or an Overview link no longer hides its heading under the bar.

## [5.0.8] - 2026-10-22

- tdd is Matt's tdd plus the omp edits: the seam question goes through one `ask` on the flow's Grilling page, and the pointers name `skill://codebase-design` and `skill://code-review`. It drops pstack's regression-test trigger, its "Tests follow intended behavior" and "No red, no commit" rules, its "Fixing a bug" section, and `BUG-FIX.md`. `matt/tdd` is adapt and `pstack/tdd` is reject (#209).
- implement, implement-spec, and the shared End state block drop stopped slices. Missing red evidence no longer caps the End state or keeps work out of a commit. implement-spec's merger commits the ticket's whole patch and writes no held deltas or `stopped.patch`, and ADR 0022 marks its held-patch consequence superseded (#209).

## [5.0.7] - 2026-10-22

- improve-codebase-architecture puts the comparison of the designs with the recommendation in the design report's summary, as the grill decided, and the design question no longer repeats it.

## [5.0.6] - 2026-10-22

- Preserve hand-edited CI settings when setup re-runs, confirm the CI and Code host drafts together, and reduce existing MCP Code hosts to server, facts, and Check.
- Mark GitLab CI's `rerun-ci` unsupported, because GitLab cannot rerun a whole existing pipeline, so babysit reports a GitLab flake for a human. Setup's re-run drafts an old GitLab rerun row as unsupported, and setup defines MCP discovery once for the tracker, Code host, and CI sections.
- Set up Other issue trackers such as Jira through the named MCP server's project facts and read-only Check pin, while keeping the no-tool prose workflow.
- Draft Other MCP Code hosts as server, project facts, and a read-only Check pin; resolve Code host operations by live descriptions across PR review, history, and the PR chain while keeping CLI command rows (#204).
- Set up Other CI services through MCP facts and check/rerun pins, discover End state capabilities live for MCP CI and Code hosts, and select CI log tools from server descriptions (#203).
- Make babysit read logs and rerun only the exact build linked by a failed required check, including GitHub Actions. Report missing links without build lookup, log reads, or reruns, and constrain reruns to the CI command row or MCP pin (#202).
- Move PR-chain CI logs and reruns, and wizard secrets and variables, to ci.md. Missing CI config limits implement to commit (#201).
- Add setup's CI service section and GitHub Actions and GitLab CI templates, and require ci.md for complete project setup (#200).

## [5.0.5] - 2026-10-22

- improve-codebase-architecture runs Design It Twice after every pick. 3–4 vstack-explorer designs, screened against RED-FLAGS.md, show as a cards Report block with the recommendation in its summary line, and grilling's first question asks which design or hybrid to keep. DESIGN-IT-TWICE.md no longer waits for the user to ask for it.

## [5.0.4] - 2026-10-22

- clean-wt keeps a task sandbox that holds both an `m` and a `merged` checkout as uncertain. Removing either one deleted the whole sandbox after checking only the selected checkout, so a clean `m` could take unique commits in `merged` with it.

## [5.0.3] - 2026-10-22

- Add `/skill:clean-wt`, a Utility skill that removes leftover omp checkouts under the worktree base: linked worktrees, standalone clones, and task-isolation sandboxes. Its script `clean-wt.ts` inspects only the entries that `omp worktree list --json` reports. It keeps every checkout that a live session lease, a live task (pid and start time from omp's owner marker), or a running process's working directory points to. It keeps a checkout as uncertain when evidence is missing: no omp listing, no visible lease for the running session, a held lease with no readable session file, or a sandbox with no owner marker. An ignored or excluded file counts as clean only when the source checkout holds the same bytes or link target. Commits and stashes that only a checkout holds count as unique history, and the script never removes such a checkout. The script removes unused clean checkouts at once and keeps each branch. The skill investigates each unused checkout with work against its sessions and the default branch, and removes one only after the user picks it through `ask`. `remove` rechecks owners and a state fingerprint right before each removal (#210).
- vstack-worktree points at `/skill:clean-wt` for checkouts that runs left behind.

## [5.0.2] - 2026-10-22

- Remove decision-trail. hillclimb keeps its own attempt log at `<Scratch dir>/hillclimb/<run-id>/attempts.tsv` through `hillclimb/scripts/log.sh`, and only the parent writes it. No run audits a trail or ends with an Attention section.
- implement's END-STATE drops step 0c. merge-ready and shipped no longer start a log or a trail reviewer.
- prune-comments never asks. It deletes constraint comments with no encoding and no report, and END-STATE step 3b runs it at every End state, commit included.
- vstack-worker loses its decision-trail log permission, and the `decision-trail` Scratch kind is gone.
- grilling-page drops the `decision-trail` Stage tab label, because no skill of that name can add a Stage.

## [4.0.9] - 2026-10-22

- The vstack extension no longer registers `vstack_rename_session`, and wayfinder no longer renames the session after a claim. The load gate now proves the extension loaded through the `/vstack-clean` Command, which the load smoke reports in `extensionCommands`. setup-vstack's `machine.ts` no longer accepts `--extension-loaded`. Check 4 fails only when `disabledExtensions` lists vstack. Otherwise, check 4 prints a note to start a new session with `/new` after linking or pulling.

## [4.0.8] - 2026-10-22

- Grilling pages use Iosevka Term Slab headings, Iosevka Term content with JetBrains Mono fallback, and a 100rem content column. Cards, ledger claims, and Term notes put labels above full-width text. Stage tabs use fixed short labels, repeated labels get numbers, option headings retain their letters, and the tab bar drops its key hint.
- Overview lists the latest ask of each Q number with picked labels, Other text, or Open instead of summary prose. Press n to reach the first open question across all Stages and stay there until it is answered. Append assigns record ids, Stage order, session and round numbers, timestamps, and Q numbers. Replacements preserve their assigned values, and again keeps an earlier decision's Q number. Wayfinder uses its skill name for charting and ticket Stages.
- Grilling-page commands serialize each state transaction, so concurrent appends keep unique assigned ids and Q numbers. Rename reserves both paths, and process termination releases the advisory lock. Successful append prints a compact metadata array to stderr with assigned ids and numbers, while stdout remains only the absolute page path. Report Question labels now sit above their navigation links.

## [4.0.7] - 2026-10-22

- The End state chain keeps every pushed commit as it is. The Conflict owner in END-STATE step 7 resolves a conflict, a stale base, or ship's step 2 move by merging the target branch into the reported branch, resolving each conflict once, and pushing a fast-forward. It can update any branch of the run's stack, not only the run's own branch, and records the merged target tip as the new base SHA of the run's branch. For a step 2 move it first retargets the PR to the default branch. Step 0b reads the remote tip before any history edit and before the first push. open-pr rebases only the commits after that tip, and a stack child with pushed commits merges its parent's tip. The Owned branch rule, its absent-ref lease and porcelain check, the force-push lease, and the Owned flag in the chain facts and hand-backs are gone. babysit and ship report a branch that needs an update instead of one that needs a rebase. ADR 0033 records the decision (#176).

## [4.0.6] - 2026-10-21

- grilling closes with its summary and no `ask` (ADR 0032). It adds the summary to the Grilling page, prints the page path, marks its Stage finished, and ends the turn. The user's next prompt confirms the summary or pushes back, and a pushback reopens the decisions it names. A caller that acts after the grill, such as triage or wayfinder with a tracker write, acts only after that prompt confirms. A headless close adds the `extra` bullet "Headless, not user-confirmed", and its caller takes no action that needs the user's confirmation and reports the summary and the actions it did not take. grill-with-docs offers no next-step options and ends with one line that names `/skill:to-spec` or `/skill:implement`. grill-me and improve-codebase-architecture mark their Stage finished when grilling closes. The extension no longer registers `vstack_pick_addons`, so every Matt run start is typed again and the `before_agent_start` hook picks its Addons. The Grilling page's `close` record drops `gate`, `answer`, and `note`, and the summary drops its Closing gate row. Older state files with these fields still render, without the row.

## [4.0.5] - 2026-10-21

- ship accepts omp's clean isolation notice without a patch path and rejects tracked edits in root or nested-repository patches. It checks the plain JSON verdict separately from the runtime notice, reports capture errors or missing notices as unavailable, and no longer relies on the verifier's output schema, which hid the notice (#182).

## [4.0.4] - 2026-10-21

- implement, implement-spec, hillclimb, and forensics open their todo list with one short item per step instead of a verbatim copy of each step and its paragraphs. An item holds the step's id, its heading, its status, with `skip: <reason>` for an unfinished step, and any blocker. In a list that mixes END-STATE's steps with the caller's own, each id carries its source, `shared` or `local`, so implement-spec's `shared 5` (Review the whole diff) and `local 5` (Merge each result) stay apart. END-STATE.md states this item rule once, implement and implement-spec point to it, and END-STATE.md stays the only full text of the shared steps (#184).

## [4.0.3] - 2026-10-21

- grill-with-docs's closing ask offers `Shared understanding, then to-spec` (recommended) and `Shared understanding, then implement` before Shared understanding and Not yet. A next-step pick confirms the shared understanding, and the agent then runs that skill in the same session, inside the grill's Matt run. grilling's close lets a calling skill add these next-step options, and its other callers keep the two-option close. A headless close takes plain Shared understanding and runs no next skill. After a next-step pick, grilling calls the new extension tool `vstack_pick_addons` with the closing summary. jev judges only the Addons that the session did not receive yet, at 0.70 and with no smol call. The tool returns the `skill://` pointers and saves them as a `vstack-addons` session entry, so a later prompt or call does not send them again. The tool runs its calls one at a time, so each call sees the picks that the call before it saved (ADR 0031).

## [4.0.2] - 2026-10-21

- grilling-page's `rename` to the flow's current key now succeeds without changing anything. It exits 0, prints the page path, and writes nothing: no folder move, no state line, no new `old_keys` entry, and no fresh `page.html` or `flow.json`. It used to exit 1 with "already exists", so to-spec failed after it published a local-markdown spec whose slug was already the flow's key. A rename to a different key whose folder exists still refuses and writes nothing (#193).

## [4.0.1] - 2026-10-20

- diagram-design ships no license text. Its SKILL.md drops the `license: MIT` frontmatter line, and its icon reference and icon page drop each MIT and CC0 tag and the "verify license before use" notes. The icon reference's License attribution section becomes a Sources list with the four icon libraries, their links, and the trademark sentence.

## [4.0.0] - 2026-10-20

- SimpleEnglish (`AminBlg/SimpleEnglish`) is no longer an Upstream. Its `prose` Pin and its `prose/simple-english` row are gone, no SimpleEnglish text or MIT notice ships, and the Upstream key lists in the scripts, the tests, and setup-vstack's Migration script drop `prose` (ADR 0030, #191).
- The vstack-prose skill is removed, with its plain-English rules and its `word-swaps.md` and `use-cases.md` references. skill-creator's description no longer points at it (#191).
- pstack's unslop and technical-writing ship again as hidden adopt Utility skills, byte-identical to the pstack Pin (#191).
- The vstack-writing rule points every text at unslop. Docs, RFCs, READMEs, PR text, and commit text also follow technical-writing, and agent-facing text also follows writing-for-agents, which wins where it and unslop differ. vstack-maintain's drafting brief reads the rule and the skills that it names instead of vstack-prose (#191).

## [3.0.2] - 2026-10-20

- Scratch is kept for 90 days instead of 14. The vstack-tmp clean script and the `/vstack-clean` Command with no age now list only entries older than 90 days, for every Scratch kind, so a paused flow keeps its Grilling page. A flow folder is one Scratch entry, so its page, state file, figures, and `flow.json` expire and go together (#164).
- grilling-page keeps each flow's page in one flow folder, `<Scratch dir>/grilling/<project>-<key>/`, with `page.jsonl`, `page.html`, `flow.json`, and `figures/`. A new `flow` record holds the flow's first slug, current key, spec issue, ticket ids, branch, run ids, and open or closed state, and every command writes `flow.json` from it. Its key must end the folder name. The new `rename <state.jsonl> <new-key>` command moves the folder to `<project>-<new-key>/`, keeps the old key in `old_keys`, renders again, and prints the new page path. Before the move, it stores each absolute SVG path into the folder again as a relative path. It refuses and writes nothing when the target folder exists or an SVG visual does not resolve after the move. Figures go to the flow folder's `figures/`, stored relative to the folder (#161).
- grilling-page's page opens on an Overview tab, then has one tab per Stage in `order`. The page script takes a new `stage` record (`skill`, `title`, `state` as `not-started`, `in-progress`, or `finished`, and `order`), and a `round` names its Stage in a new `stage` field. `append` refuses a bad `stage` record or a round that names an unknown Stage, names the record, and writes nothing. A later `stage` line with the same id replaces the earlier one. The Overview lists each Stage with its state color (green finished, peach in progress, grey not started), the decisions of its latest summary in each session, and its open questions, each linked into its tab. h/l or the left and right arrow keys switch tabs, j/k or the up and down arrow keys move between the questions and summaries of the open tab, and a link into another tab opens that tab. A state file from before Stages renders its rounds in one implicit Grilling tab (#160).
- Every `ask` in a flow is now a question on the flow's Grilling page. grilling-page states this rule, says how a skill finds or starts the flow's page and adds its own Stage (one session per Stage, a re-asked decision keeps its Q number, and a `close` lists the Stage's decisions), and says that a subagent returns its questions for the top-level agent to put on the page and ask. grill-me and grill-with-docs add their own Stage, grilling adds one for a caller that added none, and domain-modeling's glossary and ADR challenges join the running Stage or add a domain-modeling Stage. grilling's `ask` options now carry only their labels, and the page question carries the description, trade-offs, and context (#165).
- grilling-page's page script takes a new `report` record, so a Stage tab shows a Report block before the questions that it leads to. A report has `stage`, `title`, `shape` (`cards`, `ledger`, or `table`), and an optional `summary`. A card has `title`, `label`, `blocking`, `impact`, `evidence`, `action`, and an optional `visual`. A ledger entry has `claim`, `status` (`confirmed`, `cleared`, or `unproven`), `evidence`, `missing_proof`, and `consequence`. A table has `columns` and `rows` of `cells`. Each entry and row can link its question through `question`, and a question links back through a new `report_entries` field, also across tabs. Inside a tab, Report blocks render before the rounds, whatever the append order. `append` refuses a bad report, such as an unknown shape, a missing field, or a link to an unknown question or entry, names it, and writes nothing. A later `report` line with the same id replaces the earlier one (#162).
- A Grilling page Stage tab can open with a Background, and a concept that several questions share gets one Topic note. The page script takes a new `background` record (`stage`, `title`, a one-line `summary`, `sections` of `{ heading, body }`, `sources`, and an optional `visual`), which renders at the top of its Stage tab, before its Report blocks and rounds, whatever the append order, and a new `topic` record (`title`, a one-line `summary`, `body`, and `sources`), which renders once in a Topics tab after the Stage tabs. A question lists the topics it builds on in a new optional `topics` field and links to each one with its summary, from any tab. `append` refuses a bad `background` or `topic` record, a second Background for one Stage, a Background for an unknown Stage, and a question that names an unknown topic, names the record, and writes nothing. A later record with the same id replaces the earlier one. grilling-page documents both records and when to use the description, the Background, a Topic note, or a Term note (#163).
- triage keeps one Grilling page per issue or PR, keyed by its number, with a triage Stage. The discovery item pick stays a plain `ask` on no page, every later `ask` about the item is a question on its page, and the flow stays open so that a later to-spec on the same issue continues the page (#170).
- to-spec and to-tickets continue the flow's Grilling page, each as its own Stage. to-spec finds the page from this session or from the issue it starts from, puts its testing-seam confirmation on the page, and, after it publishes, records the spec in the `flow` record and runs `rename` to the spec issue number. to-tickets finds the page from the spec issue, also in a new omp session, writes the proposed breakdown as a table Report block (Ticket, Blocked by, Size) before one approval question, keeps that question's Q number across revisions, and records the published ticket ids in the `flow` record (#166).
- wayfinder keeps one Grilling page per map. Charting adds a charting Stage and renames the page's flow folder after the map, so a later session finds the page from the map's `flow.json`. Each ticket that a session claims adds its own Stage, titled with the ticket's name, and its id joins the `flow` record's `tickets`. The skills that resolve the ticket ask inside that Stage, and the session marks the Stage finished when it closes the ticket. Research runners' open questions go on the map's page before the parent asks them. A prototype detour continues the page of the flow that it left as a prototype Stage, and takes the page path from the handoff document in a new session. handoff puts the session's Grilling page path in its document (#171).
- to-questionnaire and teach add their own Stage to the flow's Grilling page and write each `ask` as a question in it. The session Addon writes its session pick and its findings round in a session Stage on the page that the grill writes to. Inside a flow, that is the flow's page, and a retro on its own keeps its own page. diagram-design's questions, such as its plan confirmation, import, and export asks, go on the flow's page when it runs inside a flow, in the running Stage or in a diagram-design Stage (#172).
- code-review now runs as its own Stage on the flow's Grilling page and shows its report before any question. Standards and Spec findings are cards Report blocks (id, title, label, blocking flag, impact, evidence, and suggested action), and Safety is a ledger Report block of claims (confirmed, cleared, or unproven, with evidence, missing proof, and consequence). The axes stay separate. code-review decides each finding that its evidence settles and asks one question per other finding, linked both ways with its card or claim. Its chat report prints the page path and one line per axis instead of the findings (#168).
- improve-codebase-architecture shows its candidates on the flow's Grilling page in its own Stage. Each candidate is a card in a cards Report block, with its recommendation strength as the label, the files and problem as evidence, the solution as the action, the benefits as the impact, and its before and after figures as visuals in the flow folder's `figures/`. The report's summary names the top recommendation. The candidate pick is the Stage's first question, linked both ways with the cards, and grilling's rounds continue in the same Stage. The separate HTML report is gone: HTML-REPORT.md, its template, and the `architecture-review` Scratch kind are removed (#169).
- implement and implement-spec continue the flow's Grilling page as their own Stage. Before the End state, the shared END-STATE step 0a finds the page from the spec issue, a ticket also through its parent spec, so implement-spec in a new omp session finds the page that to-spec renamed. With no spec and no ticket, implement continues only a page whose path this session printed, and a new session starts a new page. The End state, the Verify skill choice, implement-spec's seam confirmations, and the implementer questions that it relays are questions in that Stage. tdd's interface and seam `ask` and its substitute-check `ask`, and decision-trail's publish approval, are page questions that join the running Stage, or get their own Stage outside one. When the run stops, the Stage shows the run results as a table Report block (Ticket, Status, Commit, Proof), the Stage is marked finished, and the `flow` record is closed when no ticket stayed open. Step 0b records the branch in the `flow` record, and implement-spec records its run id. END-STATE step 5 now reads code-review's result as the findings that it decided plus the answer to each question, and the review fixes are the changes that this result calls for (#167).
- A `close` record takes an optional `gate` field, and a summary shows its Closing gate row only for a closing gate: `gate` set, or an `answer` or `note`. A Stage's summary with no gate no longer shows "Waiting for your answer.", and a gate that stopped with no answer shows "No answer." and its note. A question can have one option, so one architecture candidate can still get its pick question. `rename` renders from the moved folder before it writes. If an SVG does not resolve there, or a write fails, it moves the folder back with its state file unchanged and exits 1. vstack-maintain and hillclimb name code-review's result and the review fixes as END-STATE step 5 defines them (#151).

## [3.0.1] - 2026-10-20

- setup-vstack gives each run its own Scratch entry, `setup-vstack/run-XXXXXX/`, for its Migration plans. Every worktree of a repo shares the Scratch dir, so two setup runs at once could overwrite each other's `plan-1.json`. `migrate.ts apply` now refuses, with exit 2 and no writes, a plan whose `root` is not the checkout it runs in, so a plan from another worktree never migrates that worktree.

## [3.0.0] - 2026-10-20

- migrate-to-vstack is removed, and setup-vstack is the one entry point (ADR 0028, #185). Its project section runs a read-only Migration plan of this repo after the machine checks. When the plan finds Matt config, it asks whether to migrate first, asks Standard or Private once, shows the plan with its Apply all, Choose items, and Cancel gate, and then goes on with setup in the same run, with no `/new`. A no or Cancel sets up beside the Matt files, and Done names them. An incomplete Migration stops the run. In Standard mode one setup commit holds the Migration and setup changes. `project.ts commit` takes `--migration-path` for each path that the Migration moved from, wrote, or deleted, treats each as a literal file name, refuses a path outside the repo, and leaves other staged work alone. The dirty-block-file gate ignores edits that this run's Migration made. A Migration that fills every config file still reaches Write and the commit. A manual hit that the user declined comes back on the next run, also in moved Standard config.
- Migration covers only this repo and its shared private store. The machine scan with its CLI, and the removal of Matt's global skills, the old private rule, and other repos' stores, are gone. Global skills, global rules, and diagram profiles stay where they are. The project plan builds this repo's private-store move itself, for every worktree of the repo, and it rewrites old Matt paths in tickets, specs, and maps under the repo's vstack store. The Migration helper is `plugin/skills/setup-vstack/scripts/migrate.ts`, and the House style copy moved to `plugin/skills/setup-vstack/references/house-style.yaml`. Users of the old skill need a new session after updating the plugin.

## [2.0.37] - 2026-10-18

- diagram-design keeps one palette, Catppuccin Mocha, and the light variant (Catppuccin Latte) is gone. Light pages and print get no matching light figure. `references/style-guide.md` has one Mocha column in its role, flavor, and contrast tables and no inversion rule. `assets/template.html` (the 960×600 doc-inline minimal template) and `assets/icons.html` are Mocha, and the type references drop every Latte value, light/dark table, and `dark:` input. `assets/template-dark.html` is gone, and `assets/template.html` is the one minimal template, for the default figure and the consultant 2×2. A vstack-figures brief and grilling-page name no variant, and ADR 0027 records Mocha only.
- diagram-design's style checker `scripts/lint-skin.py` checks a figure against one palette, the Mocha tables or the terminal skin table, so white and Latte colors fail in a Mocha figure. It also accepts the generic families `sans-serif`, `serif`, and `system-ui` and eight CJK system faces. The data-flow and process chips take the Mocha series tokens with `paper` text, `icons.html` cells take `paper-2`, the Dagster eye takes Mocha base, and the Inkscape metadata is gone from `icons.html` and `references/primitive-icons.md`.

## [2.0.36] - 2026-10-18

- diagram-design's style checker `scripts/lint-skin.py` now also fails a CSS named color such as `red`, an `rgb()` color outside the figure's flavor, any `hsl()`, `hwb()`, `lab()`, `lch()`, or `color()` value, and a font family set through the `font` shorthand. `none`, `transparent`, `currentColor`, and the CSS-wide keywords pass. A dark figure swaps a custom component or chevron color to the Mocha color of the same Catppuccin name, as the style guide's inversion rule says, instead of reusing the Latte hex or lightening it. This applies in the high-level, data-flow, security-matrix, medallion, and IT-state references. The architecture-delta reference names the shipped static checks and leaves the accessible title and description optional.
- grilling-page refuses an SVG visual whose styles hold any `@import`, a Google Fonts import included, and its SKILL.md no longer says that diagram-design exports carry one.
- diagram-design's style checker `scripts/lint-skin.py` now also checks the custom properties that a `font-family` or `font` declaration reads through `var()`. A figure whose `--font-slab` or `--font-term` names Geist or another family outside the two Iosevka faces and their generic fallbacks fails.

## [2.0.35] - 2026-10-18

- diagram-design ships the Upstream style checker as `scripts/lint-skin.py`, imported at the current Pin with its paths made relative to the skill. A drawer runs it from the installed plugin on explicit figure paths in eval's Python, with the standard library only. It reads the palette and typography tables of `references/style-guide.md`: a color outside the figure's Catppuccin flavor fails (Latte or Mocha, from the role and flavor palette tables plus the terminal skin, `rgba()` at any opacity), and so does a font family other than the two Iosevka faces and `ui-monospace, monospace`, pure black, a font `<link>` or `@import`, any other remote resource, and an executable attribute or URL. It skips HTML comments. It drops the Upstream accessible-SVG checks, motion-controller checks, Google Fonts allowance, downloaded-family allowlist, white allowance, baseline file, and `--all` flag. SKILL.md, the §9 taste gate, `references/animation.md`, the doctor's shipped-script list, and vstack-figures name the style checker. `references/type-high-level.md` gives the phase bands Latte values in a light figure, with their measured contrast, so a light high-level figure passes the style checker. The style guide's terminal skin adds the dot-grid white `terminal-grid`, and `references/primitive-icons.md` tells the drawer to recolor a copied brand icon's own colors to palette roles. Upstream tracking adds the blob matcher `scripts/lint-skin.py` to pins.yaml and the adapt row `diagram/lint-skin` that shares the diagram-design artifact. The Pin does not move. New bun tests run the checker under eval's Python.

## [2.0.34] - 2026-10-18

- diagram-design ships the Upstream geometry checker as `scripts/verify-geometry.py`, imported at the current Pin with its paths made relative to the skill. A drawer runs it from the installed plugin on an explicit figure path in eval's Python, with the standard library only. It reports diagonal connectors, segments along a node border, ports near a corner or too close together, stacked connectors, and label masks under a later node. SKILL.md §6, the §9 taste gate, and `references/primitives-core.md` tell the drawer to run it, and no skill text sends a drawer to a repository checkout: `references/animation.md` drops the Upstream motion and style scripts, the doctor checks the shipped scripts, and every reference that names an Upstream-only script (the type references, `references/export-registry.md`, `references/output-spec.md`, and `references/animation.md`) says that the script does not ship and that the drawer checks its rules by hand. vstack-figures tells each drawer to run the eval cell for the geometry checker on its figure, beside the taste gate and `scripts/self_check.py`. The checker is the new adapt row `diagram/verify-geometry`, and commit discovery for the Diagram upstream now covers the whole repository, so a script-only Upstream commit moves the Pin. New bun tests run the checker on Mocha and Latte figure files under eval's Python (ADR 0027, #157).

## [2.0.33] - 2026-10-18

- diagram-design's `scripts/self_check.py` runs static checks only. It keeps resource safety, the canonical-controller rule for any script, and the viewBox bounds check. It no longer checks the accessible-SVG contract or motion structure, so a figure with no title, description, or ARIA attributes passes, and so does motion markup with no controls. A Google Fonts link now always fails like any other remote asset, and the `--offline` flag is gone. The §9 taste gate and the import output checklist drop their accessibility and motion items, and the accessible-SVG contract in SKILL.md §12 and `references/primitives-core.md` is optional guidance. New bun tests run self_check.py and export_svg.py on Mocha and Latte figure files under the Python interpreter that `omp setup python --check` reports, and skip when there is none (#156).

## [2.0.32] - 2026-10-18

- diagram-design draws in one built-in Catppuccin style. `references/style-guide.md` is the one guide: a palette table with the Latte light column, the Mocha dark column, the mauve accent, and Catppuccin series colors, a flavor table of all 26 Latte and Mocha colors that counts every color of a figure's flavor as on-palette, and a typography table with IosevkaTermSlab Nerd Font Mono for the title and italic callouts and IosevkaTerm Nerd Font Mono for every other role, each stack ending in `ui-monospace, monospace`. Dark (Mocha) is the default variant, and the full editorial and motion templates use Mocha too. Light (Latte) stays. The width budget is the measured 0.50em IosevkaTerm advance, and the guide records the measured contrast, including the 4.34:1 Latte link. Figures load fonts from installed faces only: the Google Fonts link, the `web`/`system` font-source choice, and `export_svg.py`'s font `@import` and `--system-fonts` flag are gone, and a CJK label keeps its role's stack, which ends in the generic families, and sets `lang` so the system picks the CJK face. SKILL.md, the references, and the light, dark, full, motion, terminal, and icon pages no longer name Geist, Instrument Serif, coral, or the old palette, and the anti-pattern table accepts a Mocha figure in the two faces (ADR 0027, #155).

## [2.0.31] - 2026-10-17

- diagram-design no longer ships its example gallery. The 210 `assets/example-*.html` files and the `assets/index.html` gallery page are gone, and so is every pointer to them in SKILL.md, the type references, the import, export, style-guide, and output-spec references, and the gallery refusal in `scripts/export_svg.py`. Worked cases keep their rules, worked YAML, and fidelity ledgers. The five templates and the `assets/icons.html` icon gallery still ship (ADR 0027, #154).

## [2.0.30] - 2026-10-17

- diagram-design draws in any project without a skin question. The style gate, the onboarding and profiles references, and the profile verbs are gone, and the skill never reads or writes a project config for diagrams. Drawers read the shipped `references/style-guide.md`. A vstack-figures brief names light or dark and no profile, a caller that runs as a subagent returns no skin question, grilling-page asks for the dark variant only, and vstack-diagram-drawer drops its style-gate wording. The `diagram-profiles` House style row and this repo's `docs/vstack/diagram.md` are removed. Files in `~/.vstack/diagram-design/profiles/` stay where they are, and nothing reads them (ADR 0027, supersedes parts of ADR 0011 and 0023, #152).

## [2.0.29] - 2026-10-17

- migrate-to-vstack no longer turns an old `.diagram-design` marker into a `diagram-profile:` line, in Standard or Private mode, and no longer moves `~/.diagram-design/profiles/` to `~/.vstack/diagram-design/profiles/`. The marker and every home profile file stay where they are, and vstack does not read them. Migration has no cleanup step for them. A failed profile move can no longer keep the old private rule, because no profile move runs (#153).

## [2.0.28] - 2026-10-18

- The End state chain states each chain rule once. implement's shared End state block owns each rule in one step. Step 0a holds Code host routing, the reuse of the vstack root and Scratch dir, and the run record with its list of chain facts. Step 0b holds branch ownership and the force-push lease. Step 0c holds logging to the decision-trail log. Step 4 holds Verify discovery and link repair, step 5 holds the Safety hand-off to open-pr, and step 7 holds the Conflict owner, which rebases under the step 0b rule. open-pr, babysit, and ship accept the chain facts and name the owning step for each rule in place of their own copies. When no Verify skill exists, open-pr, ship, and hillclimb follow step 4, which runs setup-app-verification in the same run, in place of a fallback to tests. babysit and ship still never rebase or force-push, and the caller owns each conflict through step 7. The checks in the chain and their order do not change (#173).
- A run rewrites pushed commits only on an Owned branch: a branch whose remote branch did not exist until the run's first push created it. The run record and the chain facts carry the remote branch name and whether the branch is Owned, in place of whether the run created the branch. In an omp worktree, the run stays on its `wt/<time>` branch and pushes it to a new `<type>/<slug>` remote branch. Other branches push to their own name, and the local branch keeps its name. Before the first push, END-STATE step 0b reads the remote ref with `git ls-remote`. An absent ref is created with `git push --porcelain --force-with-lease=<remote branch>:`. The branch is Owned only when that push prints a `*` (new ref) status for the remote branch. Any other result stops the run with the branch unowned, also when another pusher created the ref at the same SHA and git reports it up to date. An existing ref gets fast-forward pushes, and the branch stays unowned. Each rewrite pushes with `--force-with-lease=<remote branch>:<last pushed SHA>`.
- The Conflict owner in END-STATE step 7 runs `git rebase --onto <remote>/<default branch> <base SHA>` on an Owned branch, pushes with the step 0b lease, and records the new pushed SHA and the new base SHA. On an unowned branch, a moved remote tip, a failed lease, or a branch other than the run's remote branch, it stops and names the branch that needs the rebase. open-pr still orders unpushed commits on any branch, pushes to the remote branch, and opens the PR from it. babysit pushes its fix waves to the remote branch and returns the last pushed SHA. ship never rebases or force-pushes. It brings a behind bottom PR up to date through `update-branch`, and reports a bottom PR that needs a rebase, or a PR that must move onto the default branch, to the caller's Conflict owner (#174).

## [2.0.27] - 2026-10-18

- Every Matt run start gets its Addon picks from a `smol` restatement, also the first prompt of a session (ADR 0026, amends ADR 0018 and 0021). On a fresh start, smol reads only the user's words after `User:`, with the in-your-own-words instruction and the frame of ADR 0021. Later prompts in a run still send the cleaned prompt and call no smol, and a fresh bare `/skill:<name>` with no words still makes no request. For the 125 fresh-start restatements in the corpus, `openai-codex/gpt-6.1-sol` at high effort took 1.5 to 14.8 seconds each, with a median of 4.8 seconds.
- One 25-second vstack cap covers smol and jev together on every restated start, in place of omp's 30-second hook cap. At the cap, the start gets no picks and no fallback request, and with a UI the extension shows `vstack: no Addon picks for this run start (timed out)`. omp's own handler timeout error no longer shows. Prompts that are not restated keep the silent 4-second deadline.
- When smol fails on a fresh start (an unreadable instruction, no `smol` model, no key, an error, or an empty reply), jev reads the cleaned words, and with a UI the extension shows `vstack: Addon picks from your words, restatement failed (<reason>)`. If the cleaned words are empty, the start gets no picks and no request, and with a UI the extension shows `vstack: no Addon picks for this run start (<reason>)`. A mid-session start still gets no picks when smol fails.
- A run start skips smol only when its raw words after `User:` and its earlier talk are both empty. Words that the cleaner removes, such as `<request>Fix README typo</request>`, still go to smol.
- `sample-prompts.json` adds a `fresh-<id>` twin of each of its 125 plain samples. Each twin holds smol's stored restatement of that sample's words alone and keeps the sample's `expected` and `allowed` lists, so the check flags a pick that the restatement adds or loses. The twins have baselines from 3 runs on jev-1.13.0. In these baselines, 95 of the 98 expected twin picks score 0.70 or more, against 98 of 98 on the plain samples. The first check found that the restatement adds `principle-encode-lessons-in-structure` on `fresh-cart-off-by-cent` (0.900) and `principle-outcome-oriented-execution` on `fresh-h-legacy-config-api` (0.920). These two picks are now allowed on their twins. The two lost picks stay flagged on purpose: `session` on `fresh-session-correct-1` and `principle-encode-lessons-in-structure` on `fresh-g-graphql-codegen`. The check now passes 254/256 prompts with 2 flags, both lost picks (0.170 and 0.140), on jev-1.13.0.

## [2.0.26] - 2026-10-17

- maintain-app-verification passes the directory it read its Verify skill from to `commit.ts state` and `commit.ts commit` as `--target <dir>`. Both refuse with exit 2, before any staging, when that directory is not `.omp/skills/verify-<app>/`, such as a Verify skill under `.claude/skills/`. Such a run is not a committing run. Maintenance tells the user that vstack commits only `.omp/skills/verify-<app>/`, continues, and leaves its corrections uncommitted.

## [2.0.25] - 2026-10-17

- setup-app-verification and maintain-app-verification commit their Standard-mode output when they run on their own: setup when it finishes, and maintenance on a `changed` outcome. Under implement or open-pr, they hand the output back, and implement reviews and commits it in step 6 as before. Private mode commits nothing. The new `setup-app-verification/scripts/commit.ts` refuses in Private mode, for a missing directory or SKILL.md, and for a symlinked Verify skill. It stages only `.omp/skills/verify-<app>/`, deletions included, and commits it alone on the current branch. Its `state` subcommand reports uncommitted changes in that directory, so the run can ask before it starts. setup-vstack is unchanged.

## [2.0.24] - 2026-10-17

- skill-creator's new `scripts/trigger-evals.ts` launches and scores selection-only trigger evals, so agents no longer write their own eval cell. It reads the Session model and thinking level from the last records in `$PI_SESSION_FILE`, writes each run's `trigger.yml` overlay (memory off, the origin project's skill dirs, and a `--candidate` dir first with `*/<name>` ignored), and starts every query × 3 runs at once. Each run keeps the real `HOME`, credentials, and PATH, without inherited `PI_*` and `OMP_*` variables. The last acceptance batch gave each of its 120 runs its own HOME, and each HOME unpacked a 93 MiB copy of omp's native addon into Scratch. After every run exits, the script counts only successful `skill://<name>` or `SKILL.md` reads, and writes `commands.json`, `results.json`, and `scores.json`. An eval `tool.read` counts only when the eval result's `details.statusEvents` records that read as successful. `scores.json` leaves out a selection-only run with a nonzero exit code. The script exits before it writes anything when the run dir exists, or when a query id is a duplicate or holds a character other than lowercase letters, digits, and hyphens. `--full` sends the raw request for a full run. Replayed on the last batch's 120 transcripts, it reproduces that batch's scores. trigger-evals.md now points at the script instead of a hand-written eval cell. The House style `headless-run` rule now also accepts a bundled launcher script that starts every run at once.
- `scripts/load-smoke.sh` deletes its throwaway home's `.omp/natives` when it exits, and `vstack-maintain.ts gates` leaves `.omp/natives` out when it keeps a failed smoke in Scratch. omp unpacks its 93 MiB native addon into every fresh home. That cache is not evidence, but each kept smoke home kept a copy in Scratch.

## [2.0.23] - 2026-10-17

- vstack-maintain prepare preserves comments, quoting, flow style, key order, and untouched YAML text through the yaml Document and source-token APIs. The plugin manifest changes only at its version value. An edit target can set every matching adapt row's one-line reason without an Update plan. Clones and CI install the locked yaml dependency before running maintainer commands (#146).

## [2.0.22] - 2026-10-16

- During a Matt run, the jev judge also picks principles for the brief of a `vstack-explorer`, `vstack-worker`, or `vstack-verifier` subagent. It reads the subagent's first prompt without omp's `Complete assignment thoroughly:` line, through the same cleaner stages but squeezed to 10,000 characters, and asks the 20 principle questions, every principle except never-block-on-the-human. The state holds the new `brief_preamble` from `addon-questions.json`, which tells jev to read "the user" as the brief's author. A subagent finds the top-level session that started it through the `parentId` chain, also from a nested subagent, and gets picks only when that session is in a Matt run. Later prompts in the subagent session, the diagram drawer, the comment critic, omp's own agents, and `/tan` clones get none. The deadline, the retry, and the silent skips match the main session, and the hidden message has no sentence about which rule wins. `scripts/addon-judge-check.ts` takes a corpus path, and the new `sample-briefs.json` holds 17 real briefs from past Matt runs, with private paths and names replaced, and baselines from 3 runs per brief. The check now flags an unexpected, non-allowed pick over 0.85, not 0.80, in both corpora, because `verifier-ship-pr` scores `principle-encode-the-domain` at 0.81 on a brief that does not fit it. With fresh baselines, 17/17 briefs and 131/131 prompts pass with 0 flags. check-register's new `brief-sample-mismatch` class fails a brief sample with an empty `prompt` or a label that is not one of the 20 subagent questions (ADR 0025, amends ADR 0002, 0018, and 0024).

## [2.0.21] - 2026-10-16

- grilling reads text with no pick as a reply. A picked option settles its decision, and notes or Other text beside a pick never reopen it. Other text and notes on options that were not picked reopen the decision unless they plainly name a choice. The grill then replies on the page and asks the decision again next round with the same Q number, with revised options when the reply calls for them. A note-only answer from the Flexible Ask picker (`Unanswered` followed by `Note (<option>, not picked)`) counts as text with no pick, and grilling-page records it with its text as `other:<text>`. An empty, cancelled, or timed-out answer stays unanswered, as before. The `matt/grilling` reason in the Decision register adds that pushback reopens its decision (#145).
- A Grilling page question can carry two new optional parts, each rendered as its own block under the description: `today`, a list of `{ text, source }` facts about how things work now, each with its file and line, and `terms`, a list of `{ term, text }` Term notes. The template styles both blocks in the page's palette. The render script refuses a malformed entry (a missing or empty field, an entry that is not an object, an empty list, or a value that is not a list), names the record, and writes nothing. It escapes the new text like other text fields and keeps `code` and links. A question without them, and a state file from before this change, render as before (#143).
- A Grilling page description reads like a chat answer to "explain Qxx", so the user rarely needs Picker btw. It says first what is being decided and why it matters to the user, in short chat sentences, and no longer lists the earlier decisions it builds on. Evidence goes in Today, and names that a newcomer does not know go in Term notes. grilling-page requires Today whenever a decision changes something that already exists, and no Today for something new. It requires a Term note for each glossary term, each unfamiliar skill, tool, and file name, and each ADR number with what that ADR decided. The `ask` question stays one line. The visual judge's question state now holds Today and Term notes, and its context rubric judges the description together with Today. A round whose flow is explained only in Today now gets `draw it` for the context kind (0.88, up from 0.43), and the calibration set still passes 75/75. After a diagram is drawn, the step that cuts logic it shows covers Today too, and keeps each Today fact with its source. The glossary's Context diagram entry names Today (#144).

## [2.0.20] - 2026-10-15

- implement-spec's merger takes stopped-slice hunks out of the index before the ticket commit. `git apply --3way` stages every hunk it applies, so the old order (stage the proven hunks, commit, then remove the stopped hunks) committed the stopped slice too. The merger now records the full tree with `git write-tree` after the apply. It takes out each stopped slice as its own delta patch under `held/` with `git apply -R --index`. After each removal, it regenerates `stopped.patch` as the diff from the current tree to the full tree, so that one file holds every held hunk. `stopped.patch` applies only on the ticket commit. It can change a file that only the ticket adds, so it never applies on the tip, and a failed merge returns the original ticket patch instead. The merger then runs typechecking and the ticket's tests on that final tree on every merge, not only after a conflict. A kept hunk that fails without its stopped slice comes out as one more delta and joins `stopped.patch`. Any other failure commits nothing. The merger confirms that `git diff --cached` holds only the checked hunks before it commits. A stopped hunk found there comes out as one more delta, so `stopped.patch` stays current.

## [2.0.19] - 2026-10-15

- The Addon judge sends its shared preamble once per request, in the jev state, and not in each of its 35 questions. `addon-questions.json` is now `{ "preamble": ..., "questions": { <addon name>: question } }`, and the state is `{ request, preamble }`. jev bills input tokens only and reads the state once, so the corpus costs 27.5% fewer input tokens. The new state put two expected picks just under 0.75, so the extension now selects every score at 0.70 or more. `scripts/addon-judge-check.ts` flags an expected pick under 0.65, not 0.70, and an unexpected, non-allowed pick over 0.80, as before. With 3 runs per prompt, the check passes 131/131 prompts with 0 flags, and `sample-prompts.json` holds fresh baselines (ADR 0024, amends ADR 0002, 0018, 0019, and 0021).
- The extension leaves out every Addon already delivered in the session before it asks jev, instead of dropping it after the answer. When every Addon was delivered, it sends no request and calls no smol. Delivered Addons stay the same.
- grilling-page's visual judge puts diagram-design's visual-type guide in the judge state once, as `visual_types`, and its two type questions name the types only. The 75 calibration cases cost 18.0% fewer input tokens and still all pass (ADR 0024).
- `scripts/visual_judge_check.py` replaces `scripts/visual-judge-check.ts` and needs no `python3`. It runs in omp's Python eval, builds every case's request with `judge_request()` in `visual_judge.py`, and sends all 75 cases through `judge_batch`, as the helper does. It refuses to grade unless `judge_batch` used a TypeSafe jev model. A type case passes when its type is in the top three of either type question.
- check-register, the extension, and `scripts/addon-judge-check.ts` parse `addon-questions.json` through one typed parser in `plugin/extensions/addon-catalog.ts`. A key in the `questions` map makes a skill an Addon, and the `addon-question-mismatch` message names that map.

## [2.0.18] - 2026-10-15

- From another project, skill://session files one vstack issue for each approved lesson on an existing vstack row that is not adopt, an adopt item, or a new vstack skill. An open issue that already covers the lesson gets a comment instead. The issue has only the `needs-triage` label, a Problem and a Proposal section, and no transcript excerpts or paths from the other project. A failed filing goes to Backlog with the `gh` error. The run no longer edits the linked clone, so `vstack-maintain.ts gates` drops `--in-place` and its `pending` field, and vstack-maintain and skill-creator drop their in-place session-lesson routes (#140).

## [2.0.17] - 2026-10-15

- code-review and blast-radius review a supplied PR at its target and source commits from `read-pr`, in a detached worktree made through vstack-worktree, and leave the user's checkout unchanged. A scope that the caller pins still comes first. Without `code-host.md` or its `read-pr` row, they stop and point to `/skill:setup-vstack` (#139).

## [2.0.16] - 2026-10-15

- grilling no longer asks about the next step when the user's own grill closes. The user types the next skill: implement for a change that fits one session, or to-spec, to-tickets, and implement-spec for a bigger one.

## [2.0.15] - 2026-10-15

- vstack-explorer, vstack-worker, vstack-verifier, vstack-diagram-drawer, and vstack-comment-critic treat their last reply as their result. If a message reaches one of them after its report, it ends that turn with one reply that repeats its complete report, verdict, or slug lines and then answers the message. Before, the owner's newest result held only the answer (#138).

## [2.0.14] - 2026-10-15

- skill-creator again lets implement edit a vstack skill in place for an approved session lesson. That route is skill://session's in-place edit, from another project, of an existing vstack row that is not adopt. vstack-maintain's drafting worker still edits its own clone, and every other caller still stops.

## [2.0.13] - 2026-10-15

- `plan` and `gates` take a new `--scratch <dir>` option, the absolute Scratch dir for their entry. The script refuses a `--scratch` dir inside a checkout, as it already does for the Upstream cache. The drafting brief passes the project's Scratch dir, so a worker's Scratch entries land there and not under its clone's own repo key. A wave of review fixes whose commit is pushed after an earlier push now runs `prepare`, because CI's push check needs a raised version on each push that changes `plugin/`.

## [2.0.12] - 2026-10-15

- vstack-maintain drafts every Update and Hand edit in one isolated vstack-worker that runs `prepare` and `gates` in its own clone. implement applies the gated patch on its branch in the main checkout, and each wave of review fixes gets a fresh worker. forensics runs the app, every probe, the paired capture, and instrumentation cleanup in one isolated live-run worker, and never applies its patch. Both skills stop when isolation is off, and neither uses a worktree or a Scratch source copy anymore (amends ADR 0007).

## [2.0.11] - 2026-10-15

- Only compare-attempts' cross-judge may end a single-subagent line with `skip it:`. check-register's `single-spawn` lint now fails that ending anywhere else, so every other single subagent stops when it cannot start.

## [2.0.10] - 2026-10-15

- Every Fan-out step now always starts one subagent per part. The Fan-out gate, the jev judge cell, and the inline line are gone, and every multi-part step uses one `Fan-out (skill://vstack-fan-out)` line from FORMS.md (ADR 0004).
- "sequential", "no fan-out", and "inline" no longer change how a step runs. The agent says in one line that vstack always fans out, then runs the step. compare-attempts no longer asks Go ahead / Cancel, and Headless eval runs always start at once (ADR 0010).
- A step stops when its subagents cannot start and names the parts left undone. Single-subagent lines stop instead of doing the work in the caller, and a depth-limit stop names `task.maxRecursionDepth`. compare-attempts' cross-judge is skipped with `cross-judge: not run`.
- vstack-figures never draws a figure in the caller. If the drawers cannot start, or one figure fails, the caller names the figures that were not drawn and why (ADR 0023).
- Subagent prompts no longer carry the user's override words. check-register's `fan-out-block` and `fixed-fan-out` lints merge into one `fan-out` lint that fails the old gate, fixed, and branch lines.
- ADR 0004 is now "Fan-out always uses subagents", and ADR 0022 is now "implement-spec's main agent only orchestrates". Both files are renamed.

## [2.0.9] - 2026-10-15

- A new agent, `vstack-diagram-drawer`, draws diagram-design figures. It has no `model` field, so it runs on the Session model until you set its `vstack-diagram-drawer` key in `/agents` (`task.agentModelOverrides`). Then every figure runs on the model you picked.
- A new hidden helper, vstack-figures, holds the figure steps for explain, how, grilling-page, improve-codebase-architecture, teach, and ketchup. The caller settles the skin and fixes each figure's type, size, and content. It then starts one drawer per figure at once, with no Fan-out judge (ADR 0023). It keeps writing while the drawers run and collects the SVGs where it places them. If you say "sequential" or "no fan-out", one drawer draws every figure in order. If no drawer can start, the caller draws the figures itself and says why.
- explain and how no longer pause to confirm a figure's plan. how's explainer returns figure briefs, and how draws them.
- vstack-explorer and vstack-worker can start drawers, so how under explain draws its own figures. In a project with no diagram profile, those figures use the default skin and the skin question goes back to the top-level agent.

## [2.0.8] - 2026-10-15

- implement-spec follows Matt's nine steps. Its main agent only orchestrates and never builds or merges a ticket itself. Implementers always run as isolated vstack-workers, with no Fan-out gate and no inline fallback, and the run stops if isolation is off (ADR 0022, amends ADR 0004). The orchestrator acts on each implementer's result as it arrives and starts newly ready tickets at once, with no barrier per wave.
- A merger vstack-worker lands each patch on the integration branch with `git apply --3way` and commits each ticket. On a conflict, it resolves the conflict against the ticket and the spec and reruns the ticket's tests. A ticket whose merge fails goes back once for a fresh implementer from the current tip. Accepted review fixes get a later commit in shared step 6.
- The fixed Fan-out form in vstack-fan-out takes a slot for how the parent collects results, so a parent can act on each result as it arrives. The `fixed-fan-out` allowlist adds implement-spec.

## [2.0.7] - 2026-10-15

- The Addon judge takes the pointers it already sent only from the saved `vstack-addons` messages in the session, across all branches, so each pointer still appears once per session. Before this, it also kept a per-session list that recorded picks before omp accepted them. A prompt cancelled during the up to 30-second restatement then lost its picks for the rest of the session.

## [2.0.6] - 2026-10-15

- When a Matt run starts after earlier talk in the session, the Addon judge reads a restatement of the user's goal, not only the words after `User:` (ADR 0021). The extension asks the `smol` role model, at its configured effort, with the in-your-own-words instruction. The model reads the user and agent text since the last compaction, the compaction summary, and the new words, and jev reads its reply, cut to 10,000 characters. A bare skill start after earlier talk also gets picks now. A fresh run start and later prompts keep the cleaned words.
- A failed restatement gives that prompt no picks and, with a UI, an omp warning that is not stored in the session. A restated prompt waits up to omp's 30-second hook limit. Measured smol calls took 7 to 17 seconds.
- `sample-prompts.json` adds six `restated` samples with stored smol restatements. `scripts/addon-judge-check.ts` sends them as they are.

## [2.0.5] - 2026-10-15

- grilling-page's visual judge now decides diagrams only, and it draws more of them. For each question, one yes-or-no question asks for a context diagram (the logic the description explains, threshold 0.7), and another asks for an option diagram (how the options differ, threshold 0.6). For each yes, the judge ranks all 45 visual types in diagram-design's guide, read at run time, and the agent draws one of the top three. Over 500 past questions, the old rubric gave 59 a visual, and the new one gives 404 at least one diagram. Agreement with gpt-6.1-sol labels is F1 0.87 for context diagrams and 0.82 for option diagrams.
- The agent adds option previews, tables, and samples by its own call. After it draws a diagram, it cuts from the description the logic that the diagram shows.
- A question's `visual` can be a list. The render script shows each visual in order.
- `visual-judge-cases.json` holds 30 real questions for the diagram questions and one hand-written case per visual type. `scripts/visual-judge-check.ts` checks both against live jev.

## [2.0.4] - 2026-10-14

- The End states are now commit, merge-ready, and shipped. PR opened is gone. Merge-ready opens the PR and babysits it, and words that only ask to open a PR settle merge-ready.
- The Code host gets its own config file, code-host.md, beside issue-tracker.md (ADR 0020). It names the host, the repo, the tool, and one row per PR operation. implement's End state step, open-pr, babysit, ship, why, session's environment reviewer, and wizard run every Code host operation through it instead of calling gh. implement offers only the End states whose needed operations the file supports, and only commit when the file is missing.
- setup-vstack adds a Code host section. It seeds code-host.md from a gh or glab template, or maps the MCP server or CLI that the user already set up for any other host, such as Bitbucket Cloud or Data Center. It checks the tool with one read-only call. On a set-up repo, a re-run asks only the sections whose config files are missing, which `project.ts state` reports as `missing_config`.
- migrate-to-vstack adds code-host.md to the project plan from the GitHub or GitLab template when the remote is on github.com or gitlab.com, and a setup-vstack notice for any other remote. It never seeds over a code-host.md that the Migration moves or copies from the old config or private store.
- wizard's template sets CI secrets and variables through the CLI rows of code-host.md, and lists a value as a hand step in the Code host's web page when its row is an MCP tool or unsupported.

## [2.0.3] - 2026-10-14

- implement-spec holds a worker's patch while the worker's question is unanswered, and only a complete ticket unblocks other tickets, counts toward the spec, or closes. A ticket is complete when its work is on the integration branch, with no stopped slice and no unanswered question. Before this, a partial patch with an open seam question merged and counted as done.

## [2.0.2] - 2026-10-14

- implement-spec closes the spec only when every one of its tickets is closed. Before this, a PR with a failed ticket still listed the spec as a closing reference and closed unfinished work.

## [2.0.1] - 2026-10-14

- session's reviewer and synthesizer references split a semicolon sentence in two, as vstack-prose requires. The code review of 2.0.0 found this, and that release missed the fix.

## [2.0.0] - 2026-10-14

- Update: matt v1.2.3 to v1.3.1, pstack 12d587d to ce649c0, diagram-design d137637 to 0482b93, good-css 6d16d2f to 92d436b. 76 rows take their Upstream changes with their Disposition. pstack's per-subagent effort lines stay out, so the Session model stays the only model rule.
- implement-spec (Matt) joins. It builds a whole spec on one branch with isolated vstack-worker implementers behind the Fan-out gate, runs implement's END-STATE steps, and opens one PR at the end.
- session replaces session-lessons. It merges pstack's reflect with Matt's retro and pstack's correct. It adds a fourth environment lens that also reads repo history, asks one question per finding on the Grilling page, and makes one commit per approved environment class. It stays an Addon that jev selects (ADR 0019).
- A skill with a key in addon-questions.json is an Addon even when it has a Base upstream row. check-register and the extension use this rule (ADR 0019, amends ADR 0015).
- grilling ends the user's own grill by recommending the next step through ask (implement, or to-spec, to-tickets, and implement-spec) and tells the user what to type.
- pr (Matt) ships as adopt, and open-pr writes its PR body with it. The door call and Blast Radius go under Merge Danger, and proof paths and numbers go under Evidence. open-pr also takes closing references, which implement-spec uses for the spec and its tickets.
- New: benchmark-checklist (Addon for perf-issue and hillclimb), principle-explain-the-number (principle Addon), in-your-own-words and ketchup (Utility skills). poteto-help is Deferred.
- grill-me and grill-with-docs become adapt and name skill:// references. wait-what and principle-guard-the-context-window go back to adopt.
- perf-issue takes seven ordered strategies and benchmark vetting. diagnosing-bugs drops the post-mortem hand-off. diagram-design's onboarding source-trust and output-verification gates go through ask.
- resolving-merge-conflicts is removed, as Matt removed it.
- check-register's skill-ref lint no longer flags a skill name right after a placeholder, such as `<run dir>/session`.

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
