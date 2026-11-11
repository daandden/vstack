# vstack verification map

This directory maps the user-facing features of the vstack omp plugin. Read this index before you drive, then use the matching feature file as the recipe. `../SKILL.md` defines `SKILL_DIR`, `CHECKOUT`, `VERIFY_RUN_DIR`, Launch, Doctor, and Cleanup.

## Baseline preconditions

- `VERIFY_RUN_DIR` is a new run entry under `<Scratch dir>/verify/`, made as `../SKILL.md` Evidence step 1 says. Proof and notes go at its top level, and throwaway data goes in `data/`.
- `CHECKOUT` is the vstack checkout or worktree under test, and `$CHECKOUT/plugin/package.json` names `vstack`.
- `omp`, `bun`, `jq`, and `git` are on `PATH`.
- For stub-driver recipes, `bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"` prints no `FAIL` line.
- Never drive your already-running omp session. Stub session drives run on `$VERIFY_RUN_DIR/data/home`. Actual reasoning evaluations use skill-creator's Session model and real-credential isolation. The real-model enrollment and architecture recipes document their fresh-process real-HOME exceptions.

For the Tern plugin recipe, use `scripts/tern-verify` instead of the omp stub driver. Set `V="$SKILL_DIR/scripts/tern-verify"` and `RUN="$VERIFY_RUN_DIR"`. The helper links only `$CHECKOUT/plugin/tern/vstack-flow`, with `VSTACK_CHECKOUT="$CHECKOUT"` overriding its checkout. Every Tern command goes through `"$V"` so the user's working Tern window stays untouched.

`"$V" start "$RUN"` creates its own config directory, daemon socket, and control socket under `RUN/data`. It copies the user's settings and uses `/opt/homebrew/bin/fish`. Wait for `ready`, then require `"$V" doctor "$RUN"` to exit 0. The baseline is one Default session, one tab, and a focused fish pane in `RUN/data`. Doctor checks plugin readiness and link destinations, both owned processes, the Stencil account, and native alerts.

By default Tern shares the Mac's Stencil account and the real omp configuration. The link recipe runs no omp session. The following recipe instead sets `TERN_VERIFY_HOME="$RUN/data/home"` to isolate omp and Flow state, and skips Doctor's account check because local plugin behavior needs no account. `start` opens a separate native window and can take keyboard focus. Use only its control socket for input. Get stable pane ids from `"$V" tern "$RUN" ls`, and wait on `ctl state` or `browser '{"op":"blocks"}'` with a bounded poll after mutations.

Use `"$V" shot "$RUN" <name>` for full-resolution lossless WebP and layout evidence. Preserve each action's before and after pane list, URLs, focus, and screenshot. Run `"$V" stop "$RUN"` after success or failure to close only the owned window and daemon and remove their data. If `start` refuses because `RUN/data` already exists, choose a new run and leave the existing one alone.

## Driving conventions

- Start every recipe from the baseline. A recipe that needs earlier state names it under `Preconditions:`.
- Run scripted session behavior through `scripts/drive.ts`. Use the feature ID as `--name`, so each drive has its own evidence dir. drive.ts refuses a name that the run already used. Retry with a new name such as `<feature>-retry1`, and read the proof from that new dir. For model instruction following, use the real-model enrollment or architecture-agreement recipe rather than the stub.
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
- [Ticket publication](./ticket-publication.md): the public publisher API validates approved MCP bindings, publishes and resumes a directed graph, preserves labels and custom readiness, and refuses duplicate or changed content using provider fixtures only.
- [Addon tools](./addon-tools.md): typed Matt runs display intent-gathering instructions, and agent-called tools select Addons. The stub proves tool completion without a native judge, not native selection.
- [Frontend guidance](./frontend-guidance.md): recipes for visible UI Utility selection and instruction following in fresh main and delegated runs, native motion review, an unrelated-task control, and source accounting and packaging. Native behavioral proof remains pending explicit remote-evaluation approval.
- [Frontend stack selection](./frontend-stack.md): visible Utility discovery, read-only package reuse, native Nuxt and Vue with Vite setup, copied controls adapted to UnoCSS, and TanStack Form with omptype under a recorded policy.
- [Mobile-web guidance](./frontend-mobile.md): Apple-derived web feedback and mobile touch, viewport, safe-area, hover, and input behavior through the existing native main and worker paths, with actual browser and dependency limits.
- [Motion audit and selected subtraction](./frontend-motion-audit.md): existing main and delegated audits preserve read-only source until explicit selection, then the implementation and review owners carry a scoped lifecycle-safe removal.
- [Scratch dir](./scratch-dir.md): the vstack-tmp scripts make and list Scratch entries. The `/vstack-clean` Command previews expired entries and deletes only confirmed choices.
- [Flow page](./flow-page.md): the flow-page script takes typed contributions for a bound Stage, numbers and links them, refuses bad input without writing, and commits them to the Flow. The Local Flow host serves the Flow page as a prebuilt reader: a sticky header with Overview, Stage, and Topics tabs and the selected tab's Jump row, each Stage tab in first-publication order, in Catppuccin Mocha or Latte. A Flow closes and reopens, and Scratch cleanup never removes an open Flow. Native omp sessions retain hidden authoring identity without automatic post-reply cards. Complete CLI publication precedes ordinary `ask` and separate answer recording. A UI-only Flow panel sits above the composer while each bound main-agent native picker is open, including Ratchet's host gate, and host errors show there without blocking questions. Result-only completions and `/vstack-clean` outcomes have no Flow link. The combined-product proof drives every T4 case in one run.
- [Figure render](./figure-render.md): the caller writes Mermaid. The Flow captures the source and the reader draws it with Pele in Catppuccin Latte or Mocha, safely, with reader needs and Visual kinds. For exports, the render script writes literal Mocha SVG with fixed roles, keyed source bindings, intrinsic kinds, native C4, source-selected Sankey endpoint and gradient paints, and fill-preserving Mauve focus. Refusals preserve old output without publishing it. Standalone and shared-id inline proof inspect actual computed paints, while the Flow captures exact SVG bytes and displays an isolated image.
- [Clean worktrees](./clean-wt.md): `/skill:clean-wt` checks ownership before inactive contents, removes unused clean checkouts and verified integrated drafts, keeps their branches, and protects stale, unique, unverified, or unapproved unresolved work.
- [Isolated-worker lifecycle](./worker-lifecycle.md): a parent preserves useful work, retains workers with unresolved needs, releases settled children through omp, and proves clone disappearance without deleting unrelated owned work.
- [Architecture agreement](./architecture-agreement.md): actual isolated grill evaluations cover assessment, grounding, visual alternatives, agreement provenance, the brief, and the stop. A separate live human checkpoint proves consent. Whole-feature evaluation consumes the other Matt entry points' separate proof.
- [Tern Flow links and following](./vstack-flow.md): the packaged `vstack-flow` plugin loads as ready, preserves Cmd-click routing, and follows each tab's selected native omp session to its Stage or newly asked question. The isolated two-session, two-tab recipe covers typing holds, unrelated sessions, picker closure and expiry, and tab isolation.

## Not mapped yet

- The maintainer CLIs `scripts/check-register.ts`, `scripts/vstack-maintain.ts`, and the by-hand jev check `scripts/addon-judge-check.ts`. `docs/maintainer.md` documents their commands and exit codes.
- The setup-vstack scripts (`machine.ts`, `project.ts`, and the Migration helper `migrate.ts`). They change omp configuration and git state, so a recipe needs a throwaway `HOME` and a throwaway repo.
