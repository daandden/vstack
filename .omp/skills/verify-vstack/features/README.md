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
- Run session behavior through `scripts/drive.ts`. Use the feature ID as `--name`, so each drive has its own evidence dir.
- Run a skill's Bun CLI from `$CHECKOUT/plugin/skills/<skill>/scripts/`, not through `realpath skill://...`.
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

- [Plugin load](./plugin-load.md): a new omp session loads every skill, agent, rule, and the extension tool from the checkout.
- [Skill commands](./skill-command.md): `/skill:<name>` puts that skill's text from the checkout into the prompt the model gets.
- [Rename session](./rename-session.md): the `vstack_rename_session` tool sets the session name.
- [Scratch dir](./scratch-dir.md): the vstack-tmp path script and the vstack-clean script make, list, and delete Scratch entries.
- [Grilling page](./grilling-page.md): the grilling-page script renders a Grilling page from a state file, and the page shows the questions and answers.

## Not mapped yet

- The principle selection hook in the extension needs a TypeSafe `jev-latest` model and key. A drive cannot reach it.
- The maintainer CLIs `scripts/check-register.ts`, `scripts/update-plan.ts`, and `scripts/vstack-update.ts`. `README.md` documents their commands and exit codes.
- The setup-vstack scripts (`machine.ts`, `migrate.ts`, `migrate-project.ts`, `project.ts`). They change omp configuration and git state, so a recipe needs a throwaway `HOME` and a throwaway repo.
