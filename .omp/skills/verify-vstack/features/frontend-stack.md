# Frontend stack selection and setup

The visible `pick-frontend-stack` Utility recommends task-specific Vue and Nuxt libraries without changing an advice-only app. Explicit setup produces a real project with task-required integrations, not a dependency bundle.

## Sub-features

- `stack-discovery`: public packaging and fresh native inventory expose the Utility by name and description, outside the Addon catalog.
- `stack-advice`: task-specific advice reuses suitable installed packages, keeps state and query optional, and preserves files and lockfiles.
- `stack-nuxt`: an explicit new-application request defaults to a runnable Nuxt project with Bun only when no manager is declared.
- `stack-vite`: an explicit Vue with Vite request stays standalone Vue and produces runnable production assets.
- `stack-controls`: copied shadcn-vue controls use UnoCSS and UnoCSS icons without a parallel Tailwind pipeline.
- `stack-form`: TanStack Form and omptype show nested errors, transformed submission output, and repeated validation under a recorded policy.
- `stack-tooling`: existing lint and format tooling stays intact. Absent tooling uses antfu with appropriate Nuxt ESLint composition.

## How to get to it (user POV)

- Ask which library fits a Vue or Nuxt task, or type `/skill:pick-frontend-stack` with that task.
- Explicitly request a new application or an existing app's scoped setup. Advice alone authorizes no installation.
- Use ordinary conditional references from the skill when controls, schemas, or setup are needed.

## Driving it with native omp, the browser, and public CLIs

Preconditions:

- Follow `../SKILL.md`, this feature map, and `frontend-guidance.md`'s native real-model isolation procedure. Run Doctor.
- Obtain authorization for real-model sessions and fixture dependency installation. Keep the invocation's session allowance, including independent verification, in the run record. A multi-turn session is one fresh process, not a reason to hide failed turns.
- Keep real HOME and credentials, clear inherited `PI_*` and `OMP_*`, set `PI_CONFIG_FILES` and `--config` to the same overlay, and use the recorded Session model and thinking level. Load the checkout package, not the installed plugin. Capture effective inventory and actual dependency read paths. For explicit name access, retain the expanded invocation, including omp's `custom_message` with `customType: skill-prompt` when that is its saved format. Save raw RPC with a line limit of at least 32 MiB, stderr, launch arguments, prompts, session histories, exit state, and file hashes.
- Keep fixture apps under `$VERIFY_RUN_DIR/data/`. Read good-css and its applicable references before creating or reviewing UI, and break-ui for rendered data. Use no real user information or external submission.

### Bracket recommendation behavior

Step `frontend-stack-baseline`: Before drafting, create an existing Vue app fixture with a real manifest, manager declaration, lockfile, suitable competing form and schema packages, framework config, and lint conventions. Hash every input. Start a fresh native session on a normal read-only library-choice task without naming the new skill. Record its actual advice and missing discovery. Good baseline advice is not a regression.

Step `frontend-stack-consumption`: After drafting, give a fresh process the same starting app and task. Explicitly read the checkout skill for consumption proof. Capture its immediate recommendation, short reason, existing-package reuse, and built-in state and fetching choices. Require unchanged hashes after the task. In distinct turns, ask for a covered chart task, an uncovered non-frontend task, and a fresh ordinary Vue library-selection task without the explicit skill path. Retain actual reads to distinguish natural discovery from explicit consumption. The non-frontend task must not load the picker anew or modify the app. A skill mention alone proves no discovery.

Prose skill instructions have no meaningful failing unit test. Do not add prompt-wording or source-string assertions. The failing baseline is missing shipped knowledge and discovery; behavioral proof comes from real consumers.

### Build both framework branches

Step `frontend-stack-build`: Use native consumers to create a default Nuxt app and an explicitly requested Vue with Vite app from empty directories. Supply rendering requirements so a headless assumption cannot stand in for consent. Authorize only local setup and scoped dependency installs, not deployment or migration. The consumer must make the actual app. A manually substituted expected app is supplemental integration work, not native output.

Step `frontend-stack-combination`: Exercise the critical combination in those apps: official copied shadcn-vue controls adapted to UnoCSS, local UnoCSS icon data, TanStack Form, and omptype. Require a real dialog and menu, nested form paths, invalid field messages, valid local submission, and explicit transformed-output parsing. Keep optional Pinia, Query, and unrelated modules absent. Inspect dependency versions, copied-source provenance, extraction paths, CSS tokens, data variants, animation handling, and adapted icon code. Verify that no Tailwind plugin or stylesheet runs alongside UnoCSS.

Step `frontend-stack-scripts`: Run each generated app's actual package scripts, for example `bun run build`, `bun run typecheck`, and `bun run lint` when those are its configured scripts. Keep full stdout, stderr, exit code, and generated production assets. Check Nuxt's generated ESLint composition and formatting ownership. A command failure remains unmet until repaired and rerun in that same recorded app.

### Observe the actual applications

Step `frontend-stack-launch`: Launch each app's documented production preview with a uniquely named owned server. Open each browser with `app: "chromium"` and an explicit viewport. Record the returned backend, engine, policy, and actual app URL.

1. Step `frontend-stack-dialog`: Open the dialog with Enter, press Escape, and confirm focus returns to its trigger. Open the menu by keyboard, move through items, choose a theme, and repeat Escape and focus return.
2. Step `frontend-stack-form`: Submit invalid nested values and read actual field-level messages and ARIA associations. Correct the focused field, then press Enter before blurring it to expose stale validation-timing errors. Submit valid input with padded name text and observe trimmed output at the local submission consumer. Repeat the invalid and valid cycle.
3. Step `frontend-stack-layout`: Test at 1280px and 320px in both themes. Include realistic long names, emails, text enlargement as a labelled proxy, and markup-looking input rendered as text. Capture portalled content, icon paint, visible focus, and page overflow. Use only applicable collection cases when a collection is rendered.
4. Step `frontend-stack-csp`: Repeat schema validation beyond the compiler threshold under the actual target CSP. If no deployment policy was specified, use a separately labelled production-asset CSP fixture with self-only scripts and no `unsafe-eval`. Keep policy, repeated results, error paths, transformed output, browser errors, and CSP diagnostics. omptype can catch a CSP-blocked code-generation `EvalError` and interpret successfully. Report that diagnostic separately from functional failure. Never loosen policy.
5. Step `frontend-stack-capture`: Retain ARIA, actions, computed evidence, and full-resolution lossless WebP using `../SKILL.md`'s PNG conversion procedure. Close only owned tabs and stop only owned named servers.

### Package and finish

Step `frontend-stack-package`: From `$CHECKOUT/plugin`, run:

```sh
npm pack --ignore-scripts --json --pack-destination "$VERIFY_RUN_DIR" --cache "$VERIFY_RUN_DIR/data/npm-cache"
```

Step `frontend-stack-finish`: Read the actual tarball inventory and the new skill and references in it. Inspect fresh native discovery and the final load-smoke inventory for visible `pick-frontend-stack`, with no Addon catalog key. Preserve Pins and the rejected Emil picker row. Run maintenance `prepare` with only the confirmed add target and normal patch Change-note entry. Run `gates --scratch <Scratch dir>` last after every final edit and scoped proof. Keep every stage name, `ok`, exit state, and output. A passing maintenance gate does not replace a failed native or browser criterion.

## Gotchas

- Existing suitable dependencies override curated defaults. A recommendation for a second form manager is not a reuse pass.
- Nuxt-specific modules stay conditional and absent in standalone Vue. Built-in DevTools needs no duplicate install. Test utilities are development dependencies.
- shadcn-vue assumes Tailwind. Copied controls require actual UnoCSS adaptation and popup proof, not a renamed CSS package.
- TanStack Form validates Standard Schema input but does not hand transformed output to submission automatically.
- A first schema validation does not exercise lazy compilation. Source inspection alone proves neither CSP operation nor frontend bundling.
- Failed model processes, missing credentials, session-cap exhaustion, and unsupported browser routes remain explicit unmet proof, not permission to use a stub or another model.
