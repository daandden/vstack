# vstack verification map

This directory maps the user-facing features of the vstack omp plugin. Read this index before you drive, then use the matching feature file as the recipe. `../SKILL.md` defines `SKILL_DIR`, `CHECKOUT`, `VERIFY_RUN_DIR`, Launch, Doctor, and Cleanup.

## Baseline preconditions

- `VERIFY_RUN_DIR` is a new run entry under `<Scratch dir>/verify/`, made as `../SKILL.md` Evidence step 1 says. Proof and notes go at its top level, and throwaway data goes in `data/`.
- `CHECKOUT` is the vstack checkout or worktree under test, and `$CHECKOUT/plugin/package.json` names `vstack`.
- `omp`, `bun`, `jq`, and `git` are on `PATH`.
- `bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"` prints no `FAIL` line.
- Never drive your own omp session or the real `~/.omp`. Every session drive runs on `$VERIFY_RUN_DIR/data/home`.

## Driving conventions

- Start every recipe from the baseline. A recipe that needs earlier state names it under `Preconditions:`.
- Run session behavior through `scripts/drive.ts`. Use the feature ID as `--name`, so each drive has its own evidence dir. drive.ts refuses a name that the run already used. Retry with a new name such as `<feature>-retry1`, and read the proof from that new dir.
- Run a skill's Bun CLI or Python script from `$CHECKOUT/plugin/skills/<skill>/scripts/`, not through `skill://...`.
- Pass `--home "$VERIFY_RUN_DIR/data/<name>"` to every script that takes `--home`. Never let a script write to the real `~/.vstack/`.
- In the browser, open tabs with a name, `app: { tern: false }`, and a 1280 by 900 `viewport`. Act by ARIA role and name.
- Treat every command as literal. Keep quoted names and flags as they are.

## Proof and skip reporting

- Capture the user action and the state after it, not only the last screen or the last line.
- Session proof is the drive's `summary.json`, the matching frames in `rpc.jsonl`, and the matching request in `model-requests.jsonl`.
- CLI proof is the command, stdout, stderr, the exit code, and a separate listing of the files it wrote or deleted.
- Page proof is an ARIA snapshot and a full-resolution lossless WebP screenshot, made as `../SKILL.md` Evidence step 5 says.
- Record the feature ID and the entry point with every proof file in `$VERIFY_RUN_DIR/notes.md`.
- Report an entry point you did not drive as skipped, with the command you tried and the precondition that was missing. Never report it as verified through another entry point.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph on the user-visible behavior. Then it has these four H2 sections, in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` starts with `Preconditions:` and pairs each user action with an exact command and the observable result.
4. `Gotchas` lists traps that waste or invalidate a run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Plugin load](./plugin-load.md): a new omp session loads every skill, agent, and rule from the checkout, and the extension's `/vstack-clean` Command.
- [Skill commands](./skill-command.md): `/skill:<name>` puts that skill's text from the checkout into the prompt the model gets.
- [Addon tools](./addon-tools.md): typed Matt runs display intent-gathering instructions, and agent-called tools select Addons. The stub proves tool completion without a native judge, not native selection.
- [Scratch dir](./scratch-dir.md): the vstack-tmp scripts make and list Scratch entries. The `/vstack-clean` Command previews expired entries and deletes only confirmed choices.
- [Grilling page](./grilling-page.md): the grilling-page script renders a flow's Grilling page from the state file in its flow folder and renames the folder. The page opens on an Overview tab, has one tab per Stage with its Background, Report blocks, questions, answers, and summary, and links between tabs. A Stage that settled every decision as Assumed shows its count on Overview.
- [Figure render](./figure-render.md): the vstack-figures render script turns Mermaid into a Catppuccin Mocha SVG with Pele, marks focal ids in mauve, refuses bad Mermaid with Pele's parse error, and the Grilling page accepts the SVG.
- [Clean worktrees](./clean-wt.md): `/skill:clean-wt` inventories the omp worktree base from a session with a held lease, removes unused clean checkouts, keeps their branches, and skips stale, unique, or unapproved dirty checkouts.

## Not mapped yet

- The maintainer CLIs `scripts/check-register.ts`, `scripts/vstack-maintain.ts`, and the by-hand jev check `scripts/addon-judge-check.ts`. `README.md` documents their commands and exit codes.
- The by-hand visual judge check `scripts/visual_judge_check.py`. It runs in omp's Python eval, calls the judge through the `judge_batch` global, and refuses an answer from any model but `typesafe/jev`. The stub home has no judge model, so a drive cannot grade a case.
- The grilling-page visual judge (`plugin/skills/grilling-page/scripts/visual_judge.py`). It runs in omp's Python eval and calls the configured judge through the `judge_batch` global. The stub home has no judge model, so a drive cannot reach a pick.
- The setup-vstack scripts (`machine.ts`, `project.ts`, and the Migration helper `migrate.ts`). They change omp configuration and git state, so a recipe needs a throwaway `HOME` and a throwaway repo.
