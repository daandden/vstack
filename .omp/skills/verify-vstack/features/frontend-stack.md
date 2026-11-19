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
- `stack-tests`: an explicit testing request adds the curated component test stack to a fresh Nuxt app and a fresh Vue with Vite app without breaking build or typecheck.
- `stack-fullstack`: a fresh native consumer creates a Nuxt app with SSR pages and server routes, NuxtHub D1, reviewed migrations, and a deploy checklist.
- `stack-local-d1`: the generated app writes and reads local D1 through a browser in both Nuxt dev and built workerd.
- `stack-cloudflare-boundary`: setup makes no remote Cloudflare request. Static-only output uses assets without server Worker code. Other hosts and fullstack Vite stay uncurated.
- `stack-auth`: a sign-in task uses the Better Auth Nuxt module and generated NuxtHub schema, with private local env loading and browser authorization proof in Nuxt dev and built workerd.
- `stack-deploy-stop`: an explicit deploy request stops for account confirmation before any remote command, while a plain setup request stays account-free.
- `stack-deploy-live`: only with approval for that verification, a throwaway sign-in Worker and D1 prove bindings, remote migrations, private secret input, live-origin auth, and confirmed teardown.

## How to get to it (user POV)

- Ask which library fits a Vue or Nuxt task, or type `/skill:web-fullstack` with that task.
- Explicitly request a new application or an existing app's scoped setup. Advice alone authorizes no installation.
- Use ordinary conditional references from the skill when controls, schemas, or setup are needed.
- Request a fullstack Nuxt site on Cloudflare with the desired page, server behavior, and data. A build request is not a deploy request.
- Explicitly request deployment to enter account and per-step confirmation. A setup checklist authorizes no remote action.

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

### Add component tests in both framework branches

Step `frontend-stack-tests`: Follow the native preconditions above and the [behavioral proof rule](#bracket-recommendation-behavior). Scaffold a fresh `create-vite` `vue-ts` app and a fresh Nuxt app under `$VERIFY_RUN_DIR/data/`. Before starting the consumers, record passing baselines:

- Vite: `bun run build` runs `vue-tsc -b && vite build` for both typecheck and build.
- Nuxt: Add `typescript` and `vue-tsc` as development dependencies and set `"typecheck": "nuxt typecheck"`. Choose a TypeScript version supported by `vue-tsc`. TypeScript 7.0.2 fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Run `bun run build` (`nuxt build`) and `bun run typecheck` (`nuxt typecheck`).

Use a fresh consumer for each app. Request component tests without prescribing the packages or script.

Inspect each resulting `package.json`. Require the [curated packages](../../../../plugin/skills/web-fullstack/references/choices.md) for that framework in `devDependencies` only, no Nuxt packages in the Vite manifest, and a `scripts.test` that runs Vitest without watching. Inspect the generated config and test file. Require the Vite test to use `happy-dom` and the Nuxt test to use `nuxt`. If the Nuxt component uses auto-imports, require `mountSuspended`.

Run `bun run test` in each fixture and require at least one passing test of a real app component. Rerun the same baseline commands and require them to pass. Capture the command, stdout, stderr, and exit code for every script run, including the baselines.

Step `frontend-stack-tests-parent-vs-head`: Set `BASE` to the recorded base revision. Read its references without checking out that revision:

```sh
git show "${BASE}:plugin/skills/web-fullstack/references/choices.md"
git show "${BASE}:plugin/skills/web-fullstack/references/setup.md"
```

Record that the parent has no curated Vue with Vite test row, no component-test setup, and no `vitest run` script guidance. Compare that with the curated packages, test environments, and exiting test script observed in `frontend-stack-tests`. Use the existing head evidence without starting another native session.

### Observe the actual applications

Step `frontend-stack-launch`: Launch each app's documented production preview with a uniquely named owned server. Open each browser with `app: "chromium"` and an explicit viewport. Record the returned backend, engine, policy, and actual app URL.

1. Step `frontend-stack-dialog`: Open the dialog with Enter, press Escape, and confirm focus returns to its trigger. Open the menu by keyboard, move through items, choose a theme, and repeat Escape and focus return.
2. Step `frontend-stack-form`: Submit invalid nested values and read actual field-level messages and ARIA associations. Correct the focused field, then press Enter before blurring it to expose stale validation-timing errors. Submit valid input with padded name text and observe trimmed output at the local submission consumer. Repeat the invalid and valid cycle.
3. Step `frontend-stack-layout`: Test at 1280px and 320px in both themes. Include realistic long names, emails, text enlargement as a labelled proxy, and markup-looking input rendered as text. Capture portalled content, icon paint, visible focus, and page overflow. Use only applicable collection cases when a collection is rendered.
4. Step `frontend-stack-csp`: Repeat schema validation beyond the compiler threshold under the actual target CSP. If no deployment policy was specified, use a separately labelled production-asset CSP fixture with self-only scripts and no `unsafe-eval`. Keep policy, repeated results, error paths, transformed output, browser errors, and CSP diagnostics. omptype can catch a CSP-blocked code-generation `EvalError` and interpret successfully. Report that diagnostic separately from functional failure. Never loosen policy.
5. Step `frontend-stack-capture`: Retain ARIA, actions, computed evidence, and full-resolution lossless WebP using `../SKILL.md`'s PNG conversion procedure. Close only owned tabs and stop only owned named servers.

### Build and observe the fullstack branch

Use the same native isolation procedure and recorded authorization as the frontend cases. Keep the existing frontend proof above. This branch adds local fullstack proof, not remote deployment.

1. Step `frontend-stack-fullstack-baseline`: Before drafting, retain the current skill and reference inventory and fresh native read-only advice for the same fullstack task. Missing shipped server and data knowledge is the prose baseline, not a meaningful failing unit test. Do not add source-string assertions.
2. Step `frontend-stack-fullstack-generate`: After drafting, start a fresh native consumer on an empty app directory under `$VERIFY_RUN_DIR/data/`. Request a Nuxt SSR page and a server route that creates and lists records through NuxtHub D1. Require local setup only, no sign-in, no KV or R2 unless the task needs them, and a written deploy checklist. Capture actual description discovery separately from explicit skill consumption. A manually authored replacement app does not prove native output.
3. Step `frontend-stack-fullstack-inspect`: Inspect the generated manifest, lockfile, schema, reviewed migration SQL, Nuxt config, and Wrangler output. Record actual Node, Nuxt, Nitro, NuxtHub, Drizzle, and Wrangler versions. Require explicit `driver: 'd1'`, `cloudflare_module`, and a simulated local `DB` identifier rather than a created Cloudflare resource. A local libsql database is not a D1 pass.
4. Step `frontend-stack-fullstack-egress`: Before development, apply the skill's process-scoped telemetry, error-reporting, and metadata-fetch settings. Inspect the effective config for remote bindings and proxies. Retain sanitized command traces and network evidence covering the actual setup processes, including child workerd. Use a local egress guard where available and retain both its policy and any denied attempts. A missing deploy command does not prove absence of account requests. Keep fixture package downloads separate from the no-Cloudflare-account runtime proof.
5. Step `frontend-stack-fullstack-nuxt-dev`: Start the generated app's Nuxt dev command with an owned named server. Record Nitro's Cloudflare emulation and the local D1 state directory. In a browser, create a record through the page, observe the server response and list, and reload to verify persistence. Save ARIA, actions, requests, console errors, and full-resolution lossless WebP. Exercise empty input, a realistic long record, and markup-looking text through the real form, plus narrow-layout and collection cases applicable under skill://break-ui.
6. Step `frontend-stack-fullstack-build-migrate`: Stop only that owned server. Run the generated app's production build, typecheck, and configured lint. Inspect `.output/server/wrangler.json` for `DB`, `_hub_migrations`, and a migration path containing the reviewed SQL. With D1, do not run `nuxt db migrate`, which uses an HTTP client. Apply migrations with the chosen manager's equivalent of `wrangler d1 migrations apply DB --local --config .output/server/wrangler.json --persist-to <absolute-local-state>`.
7. Step `frontend-stack-fullstack-wrangler-dev`: Start `wrangler dev --local --config .output/server/wrangler.json --persist-to <same-absolute-local-state>` with an owned named server. Repeat the browser create/list/reload proof against this built Worker. Do not assume Nuxt dev shares this state directory. Keep the actual backend and engine on every browser open, using `app: "chromium"` and an explicit viewport as above.
8. Step `frontend-stack-fullstack-checklist`: Read the generated checklist. It must name login, each required resource, runtime variables and secret names if any, the separate remote D1 migration, and deployment, all not run. Minimal D1 alone requires a binding, not a Cloudflare API token. Confirm setup made no account-discovery, login, creation, secret-write, remote-migration, or deploy request. Report denied or unexpected network attempts rather than hiding them.
9. Step `frontend-stack-fullstack-advice`: In read-only native turns, check that fullstack Vite gets the Nuxt recommendation and is uncurated if retained, other hosts are uncurated, and a static-only Nuxt target uses `nuxt generate` with assets and no server Worker code. Retain unchanged file hashes. Do not rebuild unrelated frontend fixtures for an advice-only branch.

The seam catches generated server/data wiring, local migration errors, and Workers runtime incompatibility. It misses real account binding IDs, remote migration behavior, secrets, and the live URL. No Cloudflare account, deployment, resource creation, or secret write belongs in this branch. An unavailable native session, browser, or network observation remains an explicit proof gap. Local success does not establish account-side compatibility.

### Add sign-in to the fullstack branch

Run this branch when the changed task includes auth, retaining the no-sign-in case above as the conditional control. Use a fresh native consumer with an empty app directory and the same approved Session model, install allowance, checkout overlay, and captures. Request an SSR app with email/password sign-up, sign-in, sign-out, and a protected server route on NuxtHub D1. The consumer must generate the actual app. Keep the same local-only process and network guard, including loopback and Unix-domain IPC needed by Nuxt development forwarding.

1. Step `frontend-stack-auth-baseline`: Retain the pre-edit auth-knowledge inventory and read-only native baseline. Prose has no meaningful failing unit test.
2. Step `frontend-stack-auth-versions`: Inspect installed module and peer versions against current docs. Require `@nuxthub/core >= 0.10.5`, matching `auth` and `better-auth`, and NuxtHub before the auth module. Inspect generated schema and reviewed SQL rather than accepting manually created duplicate auth tables. Confirm `CF-Connecting-IP` is the configured trusted client-IP header. Shared rate-limit storage, when requested, needs its generated migration too.
3. Step `frontend-stack-auth-secret`: Have the consumer generate the local secret directly into a git-ignored env file without printing it. Capture only its name, accepted variable name, ignore result, and successful runtime loading, never its contents. Keep that file out of RPC read results, broad snapshots, screenshots, and packaged evidence. Confirm Nuxt dev and built Wrangler read the same source. For generated Wrangler config, inspect the explicit env-file selection and any `.dev.vars` shadowing.
4. Step `frontend-stack-auth-site-url`: Confirm Nuxt declares `runtimeConfig.public.siteUrl` and the root and built Worker configuration contain nonsecret `NUXT_PUBLIC_SITE_URL`. The checklist must require replacement of an unresolved prospective origin with the actual production origin before deploy, including for `workers.dev`. Local workerd must use its actual loopback origin through the ignored local env source. Confirm Better Auth's `secret` and `baseURL` are module-injected, not hand-set.
5. Step `frontend-stack-auth-nuxt-dev`: Generate and review auth migrations, build, and exercise Nuxt dev with local D1. In the browser, request the protected route while signed out and observe 401. Sign up, observe session state and private server data, reload, sign out, and observe 401 again. Explicitly sign in with the same account and observe private server data again. Use real forms and keyboard submission, not only helper calls.
6. Step `frontend-stack-auth-wrangler-dev`: Stop that owned server, run the generated app's production build, typecheck, and configured lint, then apply the reviewed auth migrations with explicit Wrangler `--local` and the built runtime's absolute persistence directory. Start built `wrangler dev --local` with that same directory and its explicit local env source. Repeat the full browser sequence, including explicit sign-in after sign-out, persisted sessions, and signed-out server refusal.
7. Step `frontend-stack-auth-capture`: Save sanitized request methods, paths, response statuses, session-state observations, ARIA, console errors, and full-resolution lossless WebP. Keep cookie values, session tokens, passwords, and the auth-secret value out of evidence. Observe realistic long names and emails, invalid credentials, keyboard use, and 320px layout under skill://break-ui. Local proof does not establish Cloudflare proxy header replacement or distributed rate-limit enforcement.
8. Step `frontend-stack-auth-checklist`: Read the final checklist for the secret name, required live-origin runtime variable, separate remote migrations, and read-only live auth check. Mark production sign-in unrun and separately confirmed. Confirm no Cloudflare account request, resource creation, deployment, remote migration, or remote secret write occurred.

This seam catches auth schema integration, local env loading, production-mode origin initialization, HTTP session flows, and server authorization in workerd. It misses account-side bindings, remote secrets and migrations, and live-origin behavior. Those remain outside this local branch.

### Prove the accountless deploy boundary

Use fresh native processes under the same Session-model isolation above. This branch needs no Cloudflare account. Keep real-model credentials only for the model process, not application commands. Preserve the local-only telemetry settings and the outbound-IP guard, allowing loopback and Unix-domain IPC for local development.

1. Step `frontend-stack-deploy-stop-baseline`: Before drafting, retain the shipped deploy reference and a fresh read-only native account of missing execution guidance. This prose baseline has no meaningful failing unit test.
2. Step `frontend-stack-deploy-stop-request-stop`: After drafting, give a fresh consumer an explicit request to deploy a local app to Cloudflare. Supply no confirmed account and answer no account question. Capture its actual checkout reference read, open account-confirmation question, and all tool calls. It must stop before any Cloudflare command, including `wrangler whoami` or login. Headless non-consent cannot fill in the account. No live account command belongs in this proof.
3. Step `frontend-stack-deploy-stop-setup-no-remote`: In another fresh process, request plain local Cloudflare setup without a deploy request. Let the consumer do the actual scoped setup. Run its application commands through the outbound-IP guard and record builds, local migrations, runtime launch, and resulting configuration. Separate approved package downloads and public documentation reads from runtime proof. Inspect command traces for account discovery, login, remote binding use, resource creation, secret writes, remote migrations, and deployment. None may run. Retain the guard policy, a denied non-loopback negative control, actual commands, and any unexpected denied attempts.
4. Step `frontend-stack-deploy-stop-checklist`: Check its project-specific checklist for the account, separately confirmed resource creation, each secret write's immediate deployment effect, required runtime variables, the independent remote D1 migration, final deploy, and live checks. For sign-in, require the actual production origin before deploy, not a loopback or unresolved origin. Values of secrets remain absent.
5. Step `frontend-stack-deploy-stop-capture`: Retain native RPC, persisted model and thinking records, effective inventory, actual checkout read paths, prompts, command results, file hashes, and exit state. Browser evidence for the generated local app follows the applicable fullstack or auth branch above. A stopped deploy session has no live site to open.

This seam catches an account lookup before confirmation and implicit remote work during setup. It misses all account-side compatibility, real secret-input ownership, remote migrations, and the live URL. A command log alone is not complete network proof. Name any unavailable guard or native observation.

### Prove a throwaway live deploy only with approval

This is a Costly seam. Obtain explicit approval for this verification, its account actions, real-model use, disposable production sign-up and sign-in, and teardown. An earlier setup approval or another run's deployment approval does not cover it. Without approval, run no Cloudflare account command and report the unrun deploy, binding, secret, remote-migration, live-origin auth, and teardown checks as a non-gating proof gap permitted by the ticket.

1. Step `frontend-stack-live-fixture`: Use the native-generated sign-in app already proven locally, with distinct throwaway Worker and D1 names. Retain its source and local proof. Follow the skill's confirmed deployment procedure from the user's machine, not a manually substituted deployment. The verification approval does not replace account and per-action confirmations.
2. Step `frontend-stack-live-account`: Confirm the exact account before lookup or login. Record account ID, Worker name, D1 name and returned ID, and the actual `workers.dev` or existing custom-domain origin. Retain creation receipts establishing ownership. Add KV or R2 only if the fixture requires them, with separate confirmed names and teardown.
3. Step `frontend-stack-live-origin-migrate`: Set the actual origin as nonsecret runtime `NUXT_PUBLIC_SITE_URL`, rebuild, and inspect root and generated Worker config. Check the account-side binding IDs against the owned creation receipts. Review SQL and retain the separately confirmed `wrangler d1 migrations apply DB --remote --config .output/server/wrangler.json` result before final deploy.
4. Step `frontend-stack-live-secrets`: For each required secret, capture the confirmation's secret name and immediate deployment or Worker-creation effects. Hand the prompt to the user in an unrecorded terminal. Keep secret values, terminal input, passwords, cookies, tokens, and raw auth bodies out of RPC, screenshots, and evidence. Record only nonsecret outcomes and version receipts. If private input ownership is unavailable, stop and name that gap.
5. Step `frontend-stack-live-deploy`: Confirm and run the final `wrangler deploy` with exact account, Worker, bindings, and live origin. Retain the deployment receipt. Check the currently live response after any secret-write deployment, distinguishing a new placeholder Worker from an existing app, and check the complete site after the final app deploy. A failed or refused step stops the sequence and reports partial state. Migration and deployment retries require new confirmation.
6. Step `frontend-stack-live-browser`: Open the live app with `app: "chromium"` and an explicit viewport. Record backend and engine. Exercise its pages and public server route. For sign-in, check the read-only session endpoint against that exact origin, then perform the separately approved throwaway sign-up, sign-out, and explicit sign-in. Verify protected server refusal while signed out, successful access while signed in, and persistence after reload. Capture sanitized statuses, ARIA, actions, and full-resolution lossless WebP. Treat automated-client access rejection as an observed failure, not an inferred auth defect.
7. Step `frontend-stack-live-teardown`: Confirm teardown for the exact resources proven owned by this verification. Run the manager's equivalent of `wrangler delete --name <owned-worker>` and `wrangler d1 delete <owned-database>` as separate confirmed actions, with the account pinned. Check absence through separately confirmed read-only resource lookups. Worker deletion alone does not prove that the separately created D1 database is gone. Delete any owned conditional KV or R2 resource separately as well. Retain deletion receipts and final absence checks. Never delete an existing user's resource.
8. Step `frontend-stack-live-failure`: On failure, still report every created resource and its observed cleanup state. Attempt only authorized owned-resource cleanup, not a deployment retry. Missing teardown approval leaves the named resource and its cleanup question open. Close only owned browser tabs and stop only owned local processes.

This seam establishes behavior on the recorded account and origin, not other accounts or environments. Keep account-side proof separate from local workerd proof and maintenance gates.


### Package and finish

Step `frontend-stack-package`: From `$CHECKOUT/plugin`, run:

```sh
npm pack --ignore-scripts --json --pack-destination "$VERIFY_RUN_DIR" --cache "$VERIFY_RUN_DIR/data/npm-cache"
```

Step `frontend-stack-finish`: Read the actual tarball inventory and the skill and references in it. Inspect fresh native discovery and the final load-smoke inventory for visible `web-fullstack`, with no Addon catalog key. Preserve Pins and the rejected Emil picker row. Run maintenance `prepare` with the confirmed Hand edit targets and their Change-note entries. A rename uses a `rename` target and a major Change note. Run `gates --scratch <Scratch dir>` last after every final edit and scoped proof. Keep every stage name, `ok`, exit state, and output. A passing maintenance gate does not replace a failed native or browser criterion.

## Gotchas

- Existing suitable dependencies override curated defaults. A recommendation for a second form manager is not a reuse pass.
- Nuxt-specific modules stay conditional and absent in standalone Vue. Built-in DevTools needs no duplicate install.
- shadcn-vue assumes Tailwind. Copied controls require actual UnoCSS adaptation and popup proof, not a renamed CSS package.
- TanStack Form validates Standard Schema input but does not hand transformed output to submission automatically.
- A first schema validation does not exercise lazy compilation. Source inspection alone proves neither CSP operation nor frontend bundling.
- Failed model processes, missing credentials, session-cap exhaustion, and unsupported browser routes remain explicit unmet proof, not permission to use a stub or another model.
