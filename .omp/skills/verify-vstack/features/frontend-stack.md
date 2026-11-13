# Web stack selection and setup

The visible `web-fullstack` Utility recommends task-specific Vue and Nuxt libraries without changing an advice-only app. Explicit setup produces a real frontend or fullstack Nuxt project. Cloudflare setup proves local execution without account requests.

## Sub-features

- `stack-discovery`: public packaging and fresh native inventory expose the Utility by name and description, outside the Addon catalog.
- `stack-advice`: task-specific advice reuses suitable installed packages, keeps state and query optional, and preserves files and lockfiles.
- `stack-nuxt`: an explicit new-application request defaults to a runnable Nuxt project with Bun only when no manager is declared.
- `stack-vite`: an explicit Vue with Vite request stays standalone Vue and produces runnable production assets.
- `stack-controls`: copied shadcn-vue controls use UnoCSS and UnoCSS icons without a parallel Tailwind pipeline.
- `stack-form`: TanStack Form and omptype show nested errors, transformed submission output, and repeated validation under a recorded policy.
- `stack-tooling`: existing lint and format tooling stays intact. Absent tooling uses antfu with appropriate Nuxt ESLint composition.
- `stack-fullstack`: a fresh native consumer creates a Nuxt app with SSR pages and server routes, NuxtHub D1, reviewed migrations, and a deploy checklist.
- `stack-local-d1`: the generated app writes and reads local D1 through a browser in both Nuxt dev and built workerd.
- `stack-cloudflare-boundary`: setup makes no remote Cloudflare request. Static-only output uses assets without server Worker code. Other hosts and fullstack Vite stay uncurated.

## How to get to it (user POV)

- Ask which library fits a Vue or Nuxt task, or type `/skill:web-fullstack` with that task.
- Explicitly request a new application or an existing app's scoped setup. Advice alone authorizes no installation.
- Use ordinary conditional references from the skill when controls, schemas, or setup are needed.
- Request a fullstack Nuxt site on Cloudflare with the desired page, server behavior, and data. A build request is not a deploy request.

## Driving it with native omp, the browser, and public CLIs

Preconditions:

- Follow `../SKILL.md`, this feature map, and `frontend-guidance.md`'s native real-model isolation procedure. Run Doctor.
- Obtain authorization for real-model sessions and fixture dependency installation. Keep the invocation's session allowance, including independent verification, in the run record. A multi-turn session is one fresh process, not a reason to hide failed turns.
- Keep real HOME and credentials, clear inherited `PI_*` and `OMP_*`, set `PI_CONFIG_FILES` and `--config` to the same overlay, and use the recorded Session model and thinking level. Load the checkout package, not the installed plugin. Capture effective inventory and actual dependency read paths. For explicit name access, retain the expanded invocation, including omp's `custom_message` with `customType: skill-prompt` when that is its saved format. Save raw RPC with a line limit of at least 32 MiB, stderr, launch arguments, prompts, session histories, exit state, and file hashes.
- Keep fixture apps under `$VERIFY_RUN_DIR/data/`. Read good-css and its applicable references before creating or reviewing UI, and break-ui for rendered data. Use no real user information or external submission.

### Bracket recommendation behavior

Before drafting, create an existing Vue app fixture with a real manifest, manager declaration, lockfile, suitable competing form and schema packages, framework config, and lint conventions. Hash every input. Start a fresh native session on a normal read-only library-choice task without naming the new skill. Record its actual advice and missing discovery. Good baseline advice is not a regression.

After drafting, give a fresh process the same starting app and task. Explicitly read the checkout skill for consumption proof. Capture its immediate recommendation, short reason, existing-package reuse, and built-in state and fetching choices. Require unchanged hashes after the task. In distinct turns, ask for a covered chart task, an uncovered non-frontend task, and a fresh ordinary Vue library-selection task without the explicit skill path. Retain actual reads to distinguish natural discovery from explicit consumption. The non-frontend task must not load the picker anew or modify the app. A skill mention alone proves no discovery.

Prose skill instructions have no meaningful failing unit test. Do not add prompt-wording or source-string assertions. The failing baseline is missing shipped knowledge and discovery; behavioral proof comes from real consumers.

### Build both framework branches

Use native consumers to create a default Nuxt app and an explicitly requested Vue with Vite app from empty directories. Supply rendering requirements so a headless assumption cannot stand in for consent. Authorize only local setup and scoped dependency installs, not deployment or migration. The consumer must make the actual app. A manually substituted expected app is supplemental integration work, not native output.

Exercise the critical combination in those apps: official copied shadcn-vue controls adapted to UnoCSS, local UnoCSS icon data, TanStack Form, and omptype. Require a real dialog and menu, nested form paths, invalid field messages, valid local submission, and explicit transformed-output parsing. Keep optional Pinia, Query, and unrelated modules absent. Inspect dependency versions, copied-source provenance, extraction paths, CSS tokens, data variants, animation handling, and adapted icon code. Verify that no Tailwind plugin or stylesheet runs alongside UnoCSS.

Run each generated app's actual package scripts, for example `bun run build`, `bun run typecheck`, and `bun run lint` when those are its configured scripts. Keep full stdout, stderr, exit code, and generated production assets. Check Nuxt's generated ESLint composition and formatting ownership. A command failure remains unmet until repaired and rerun in that same recorded app.

### Observe the actual applications

Launch each app's documented production preview with a uniquely named owned server. Open each browser with `app: "own"` and an explicit viewport, keeping it outside Tern. Record the returned backend, engine, policy, and actual app URL. Current browser tools take a string, not the older `app: { tern: false }` form in the shared baseline.

1. Open the dialog with Enter, press Escape, and confirm focus returns to its trigger. Open the menu by keyboard, move through items, choose a theme, and repeat Escape and focus return.
2. Submit invalid nested values and read actual field-level messages and ARIA associations. Correct the focused field, then press Enter before blurring it to expose stale validation-timing errors. Submit valid input with padded name text and observe trimmed output at the local submission consumer. Repeat the invalid and valid cycle.
3. Test at 1280px and 320px in both themes. Include realistic long names, emails, text enlargement as a labelled proxy, and markup-looking input rendered as text. Capture portalled content, icon paint, visible focus, and page overflow. Use only applicable collection cases when a collection is rendered.
4. Repeat schema validation beyond the compiler threshold under the actual target CSP. If no deployment policy was specified, use a separately labelled production-asset CSP fixture with self-only scripts and no `unsafe-eval`. Keep policy, repeated results, error paths, transformed output, browser errors, and CSP diagnostics. omptype can catch a CSP-blocked code-generation `EvalError` and interpret successfully. Report that diagnostic separately from functional failure. Never loosen policy.
5. Retain ARIA, actions, computed evidence, and full-resolution lossless WebP using `../SKILL.md`'s PNG conversion procedure. Close only owned tabs and stop only owned named servers.

### Build and observe the fullstack branch

Use the same native isolation procedure and recorded authorization as the frontend cases. Keep the existing frontend proof above. This branch adds local fullstack proof, not remote deployment.

1. Before drafting, retain the current skill and reference inventory and fresh native read-only advice for the same fullstack task. Missing shipped server and data knowledge is the prose baseline, not a meaningful failing unit test. Do not add source-string assertions.
2. After drafting, start a fresh native consumer on an empty app directory under `$VERIFY_RUN_DIR/data/`. Request a Nuxt SSR page and a server route that creates and lists records through NuxtHub D1. Require local setup only, no sign-in, no KV or R2 unless the task needs them, and a written deploy checklist. Capture actual description discovery separately from explicit skill consumption. A manually authored replacement app does not prove native output.
3. Inspect the generated manifest, lockfile, schema, reviewed migration SQL, Nuxt config, and Wrangler output. Record actual Node, Nuxt, Nitro, NuxtHub, Drizzle, and Wrangler versions. Require explicit `driver: 'd1'`, `cloudflare_module`, and a simulated local `DB` identifier rather than a created Cloudflare resource. A local libsql database is not a D1 pass.
4. Before development, apply the skill's process-scoped telemetry, error-reporting, and metadata-fetch settings. Inspect the effective config for remote bindings and proxies. Retain sanitized command traces and network evidence covering the actual setup processes, including child workerd. Use a local egress guard where available and retain both its policy and any denied attempts. A missing deploy command does not prove absence of account requests. Keep fixture package downloads separate from the no-Cloudflare-account runtime proof.
5. Start the generated app's Nuxt dev command with an owned named server. Record Nitro's Cloudflare emulation and the local D1 state directory. In a browser, create a record through the page, observe the server response and list, and reload to verify persistence. Save ARIA, actions, requests, console errors, and full-resolution lossless WebP. Exercise empty input, a realistic long record, and markup-looking text through the real form, plus narrow-layout and collection cases applicable under skill://break-ui.
6. Stop only that owned server. Run the generated app's production build, typecheck, and configured lint. Inspect `.output/server/wrangler.json` for `DB`, `_hub_migrations`, and a migration path containing the reviewed SQL. With D1, do not run `nuxt db migrate`, which uses an HTTP client. Apply migrations with the chosen manager's equivalent of `wrangler d1 migrations apply DB --local --config .output/server/wrangler.json --persist-to <absolute-local-state>`.
7. Start `wrangler dev --local --config .output/server/wrangler.json --persist-to <same-absolute-local-state>` with an owned named server. Repeat the browser create/list/reload proof against this built Worker. Do not assume Nuxt dev shares this state directory. Keep the actual backend and engine on every browser open, using `app: "own"` and an explicit viewport as above.
8. Read the generated checklist. It must name login, each required resource, runtime variables and secret names if any, the separate remote D1 migration, and deployment, all not run. Minimal D1 alone requires a binding, not a Cloudflare API token. Confirm setup made no account-discovery, login, creation, secret-write, remote-migration, or deploy request. Report denied or unexpected network attempts rather than hiding them.
9. In read-only native turns, check that fullstack Vite gets the Nuxt recommendation and is uncurated if retained, other hosts are uncurated, and a static-only Nuxt target uses `nuxt generate` with assets and no server Worker code. Retain unchanged file hashes. Do not rebuild unrelated frontend fixtures for an advice-only branch.

The seam catches generated server/data wiring, local migration errors, and Workers runtime incompatibility. It misses real account binding IDs, remote migration behavior, secrets, and the live URL. No Cloudflare account, deployment, resource creation, or secret write belongs in this branch. An unavailable native session, browser, or network observation remains an explicit proof gap. Local success does not establish account-side compatibility.

### Package and finish

From `$CHECKOUT/plugin`, run:

```sh
npm pack --ignore-scripts --json --pack-destination "$VERIFY_RUN_DIR" --cache "$VERIFY_RUN_DIR/data/npm-cache"
```

Read the actual tarball inventory and the skill and references in it. Inspect fresh native discovery and the final load-smoke inventory for visible `web-fullstack`, with no Addon catalog key. Preserve Pins and the rejected Emil picker row. Run maintenance `prepare` with the confirmed Hand edit targets and their Change-note entries. A rename uses a `rename` target and a major Change note. Run `gates --scratch <Scratch dir>` last after every final edit and scoped proof. Keep every stage name, `ok`, exit state, and output. A passing maintenance gate does not replace a failed native or browser criterion.

## Gotchas

- Existing suitable dependencies override curated defaults. A recommendation for a second form manager is not a reuse pass.
- Nuxt-specific modules stay conditional and absent in standalone Vue. Built-in DevTools needs no duplicate install. Test utilities are development dependencies.
- shadcn-vue assumes Tailwind. Copied controls require actual UnoCSS adaptation and popup proof, not a renamed CSS package.
- TanStack Form validates Standard Schema input but does not hand transformed output to submission automatically.
- A first schema validation does not exercise lazy compilation. Source inspection alone proves neither CSP operation nor frontend bundling.
- Failed model processes, missing credentials, session-cap exhaustion, and unsupported browser routes remain explicit unmet proof, not permission to use a stub or another model.
