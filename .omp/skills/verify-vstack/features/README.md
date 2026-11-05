# vstack verification map

This directory maps the user-facing features of the vstack omp plugin. Read this index before you drive, then use the matching feature file as the recipe. `../SKILL.md` defines `SKILL_DIR`, `CHECKOUT`, `VERIFY_RUN_DIR`, Launch, Doctor, and Cleanup.

## Baseline preconditions

- `VERIFY_RUN_DIR` is a new run entry under `<Scratch dir>/verify/`, made as `../SKILL.md` Evidence step 1 says. Proof and notes go at its top level, and throwaway data goes in `data/`.
- `CHECKOUT` is the vstack checkout or worktree under test, and `$CHECKOUT/plugin/package.json` names `vstack`.
- `omp`, `bun`, `jq`, and `git` are on `PATH`.
- `bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"` prints no `FAIL` line.
- Never drive your already-running omp session. Stub session drives run on `$VERIFY_RUN_DIR/data/home`. The real-model enrollment recipe in `flow-page.md` uses a fresh native process and its documented real-HOME exception.

## Driving conventions

- Start every recipe from the baseline. A recipe that needs earlier state names it under `Preconditions:`.
- Run scripted session behavior through `scripts/drive.ts`. Use the feature ID as `--name`, so each drive has its own evidence dir. drive.ts refuses a name that the run already used. Retry with a new name such as `<feature>-retry1`, and read the proof from that new dir. For model instruction following, use `flow-page.md`'s real-model enrollment recipe instead of the stub.
- Run a skill's Bun CLI from `$CHECKOUT/plugin/skills/<skill>/scripts/`, not through `skill://...`.
- Pass `--home "$VERIFY_RUN_DIR/data/<name>"` to direct isolated CLI fixtures. In a native enrollment run, keep the model's CLI and the extension in the same normal HOME namespace, as `flow-page.md` specifies.
- In the browser, open tabs with a name, `app: { tern: false }`, and a 1280 by 900 `viewport`. Apply the parent skill's browser policy on every open, including diagnostics, retries, recovery, and delegated verification. Act by ARIA role and name.
- Treat every command as literal. Keep quoted names and flags as they are.

## Proof and skip reporting

- Capture the user action and the state after it, not only the last screen or the last line.
- Session proof is the drive's `summary.json`, the matching frames in `rpc.jsonl`, and the matching request in `model-requests.jsonl`.
- CLI proof is the command, stdout, stderr, the exit code, and a separate listing of the files it wrote or deleted.
- Page proof is an ARIA snapshot and a full-resolution lossless WebP screenshot, made as `../SKILL.md` Evidence step 5 says.
- Record the feature ID and the entry point with every proof file in `$VERIFY_RUN_DIR/notes.md`.
- Report an entry point you did not drive as skipped, with the command you tried and the precondition that was missing. Never report it as verified through another entry point.
- Record the actual browser backend and engine. Required coverage for an unavailable engine stays unavailable or unmet, never verified through another engine.

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
- [Frontend guidance](./frontend-guidance.md): fresh native main and delegated frontend builds apply conditional UI knowledge, native motion review preserves evidence-backed blocking decisions and browser-qualified exceptions, an unrelated task leaves guidance unloaded, and public maintenance and packaging interfaces retain source accounting and notices.
- [Mobile-web guidance](./frontend-mobile.md): Apple-derived web feedback and mobile touch, viewport, safe-area, hover, and input behavior through the existing native main and worker paths, with actual browser and dependency limits.
- [Motion audit and selected subtraction](./frontend-motion-audit.md): existing main and delegated audits preserve read-only source until explicit selection, then the implementation and review owners carry a scoped lifecycle-safe removal.
- [Scratch dir](./scratch-dir.md): the vstack-tmp scripts make and list Scratch entries. The `/vstack-clean` Command previews expired entries and deletes only confirmed choices.
- [Flow page](./flow-page.md): the flow-page script takes typed contributions for a bound Stage, numbers and links them, refuses bad input without writing, and commits them to the Flow. The Local Flow host serves the Flow page as a prebuilt reader: a sticky header with Overview, Stage, and Topics tabs and the selected tab's Jump row, each Stage tab in first-publication order, in Catppuccin Mocha or Latte. A Flow closes and reopens, and Scratch cleanup never removes an open Flow. Native omp sessions retain hidden authoring identity without automatic post-reply cards. Each ordinary question round uses complete CLI publication, verified live content, exactly one visible chat link, ordinary `ask`, and separate answer records. Result-only completions and `/vstack-clean` outcomes have no Flow link. The combined-product proof drives every T4 case in one run.
- [Figure render](./figure-render.md): the caller writes Mermaid. The Flow captures the source and the reader draws it with Pele in Catppuccin Latte or Mocha, safely, with reader needs and Visual kinds. For exports, the render script writes literal Mocha SVG with fixed roles, keyed source bindings, intrinsic kinds, native C4, source-selected Sankey endpoint and gradient paints, and fill-preserving Mauve focus. Refusals preserve old output without publishing it. Standalone and shared-id inline proof inspect actual computed paints, while the Flow captures exact SVG bytes and displays an isolated image.
- [Clean worktrees](./clean-wt.md): `/skill:clean-wt` checks ownership before inactive contents, removes unused clean checkouts and verified integrated drafts, keeps their branches, and protects stale, unique, unverified, or unapproved unresolved work.
- [Isolated-worker lifecycle](./worker-lifecycle.md): a parent preserves useful work, retains workers with unresolved needs, releases settled children through omp, and proves clone disappearance without deleting unrelated owned work.

## Not mapped yet

- The maintainer CLIs `scripts/check-register.ts`, `scripts/vstack-maintain.ts`, and the by-hand jev check `scripts/addon-judge-check.ts`. `docs/maintainer.md` documents their commands and exit codes.
- The setup-vstack scripts (`machine.ts`, `project.ts`, and the Migration helper `migrate.ts`). They change omp configuration and git state, so a recipe needs a throwaway `HOME` and a throwaway repo.
