# Set up locally or deploy to one Cloudflare Worker

Read this reference for Cloudflare hosting or explicit deploy requests. Cloudflare Workers with Static Assets is the curated host. Fullstack Nuxt uses [the server and data recipe](server-data.md). Setup ends with local proof and a checklist. Only an explicit deploy request enters [the remote procedure](#deploy-only-on-explicit-request).

## Keep setup local

A request to build a site on Cloudflare is a setup request, not permission to touch an account. During setup, make no remote Cloudflare request, including account discovery. Do not run login, `whoami`, resource creation, remote migrations, secret writes, or deployment. Keep every binding local. `wrangler dev --local` disables remote bindings. Never use `--remote` for local proof.

Wrangler telemetry, error reporting, and Miniflare's default Cloudflare metadata fetch can make requests even during local development. Set these process-scoped values before starting Nuxt dev, local migrations, builds, and Wrangler. Do not change the user's global settings:

```sh
export WRANGLER_SEND_METRICS=false
export WRANGLER_SEND_ERROR_REPORTS=false
export CLOUDFLARE_CF_FETCH_ENABLED=false
export NUXT_TELEMETRY_DISABLED=1
```

Inspect configuration for remote bindings or proxies before launch. Retain command and network evidence for the actual processes when proving the no-remote-request boundary. Disabled telemetry and a command log alone are not complete network proof. Keep credentials out of logs and account-specific values out of an account-free fixture.

## Preview static-only output

If the task needs no request-time server behavior, run `nuxt generate` instead of adding server Worker code or D1. The deployable assets are `.output/public`. Use an assets-only Wrangler configuration with `assets.directory: '.output/public'` and no `main`, then run `wrangler dev --local` against that configuration. Inspect output and route fallback behavior. Static generation cannot provide request-time server routes or database mutations. It still does not authorize an assets deployment.

## Write the deploy checklist

Write a project-specific checklist in the generated app. Name the actual local commands and observed results first. Mark remote work as not run. List every required runtime variable, its purpose, and whether it is secret, without secret values. For a minimal D1-only app there may be no additional runtime variables. D1 is a `DB` binding, not an API token to put in the browser.

For an app with sign-in, list the accepted auth-secret name and nonsecret `NUXT_PUBLIC_SITE_URL`. Require the Worker's live origin as that runtime variable, including on `workers.dev`, because Workers supplies no `CF_PAGES_URL`. Confirm it is in the root and generated Worker configuration. The module injects `baseURL`. Follow [the auth recipe](auth.md#keep-secrets-private-and-origins-explicit) for local env loading instead of setting `baseURL` by hand.

List the actions in [the remote procedure](#deploy-only-on-explicit-request), including each secret write's immediate deployment effect. Mark all remote actions not run. A checklist supplies neither an explicit deploy request nor confirmation for an action.

## Deploy only on explicit request

Run from the user's machine to one production Worker. Use the app's declared manager and installed Wrangler, not a global substitute. Check current [Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/), [NuxtHub deployment](https://hub.nuxt.com/docs/getting-started/deploy#cloudflare), and [secret semantics](https://developers.cloudflare.com/workers/configuration/secrets/) against installed versions before execution.

Apply the [Settle-or-ask test](../../../rules/vstack-settle-or-ask.md) and [the shared question contract](../SKILL.md#flow-and-questions). Preserve ADR 20261113-web-fullstack-curates-nuxt-on-cloudflare's explicit account and production-action confirmations. Show the exact command, account ID, Worker or resource name, and account effect. Run only that confirmed action. A deploy request, checklist, shell prompt, or approval for another step grants no blanket permission.

A refused or failed remote step stops the deploy. Report completed, failed, refused, and not-run steps with nonsecret receipts. Previously successful migrations or secret deployments may remain live. Every remote migration or deploy retry, including a secret write's immediate deployment, needs new confirmation. Missing login, account access, credentials, or private terminal input is a reported prerequisite, never a reason to switch host. Workers Builds, CI pipelines, staging, preview environments, Cloudflare Pages, and other hosts are outside this procedure.

### Confirm the account before account discovery

Get the intended account name and ID from the user or existing local project configuration. Confirm that target before any Cloudflare command, including read-only `wrangler whoami`. If the account is unknown, stop with that open question. Do not discover accounts remotely to fill the question.

After the account confirmation, run `wrangler whoami --json` to verify access. Do not print tokens. If authentication is absent, separately confirm `wrangler login`, explaining that it authorizes Wrangler through the user's browser. The user completes login. Repeat the identity lookup and require membership in the approved account. A mismatch stops work.

Pin `account_id` in the project's Wrangler configuration or `CLOUDFLARE_ACCOUNT_ID` for every remote command. Resolve conflicting local or environment account settings before continuing. Read the production Worker name and live origin from the selected target's config. Ask only if a material target choice remains. For `workers.dev`, use the verified account subdomain, not the account name or ID. The origin is `https://<worker-name>.<account-subdomain>.workers.dev`. Use an existing selected custom-domain origin instead when applicable. Domain provisioning is outside this procedure.

### Resolve resources and build the production configuration

For each missing task-required resource, obtain separate confirmation before its creation. For example, `wrangler d1 create <database-name>`, `wrangler kv namespace create <namespace-name>`, or `wrangler r2 bucket create <bucket-name>`. Show that each command creates an account resource and can incur charges. Reuse only explicitly selected existing resources. Record returned IDs and names without credentials.

Replace the simulated D1 identifier with the selected database ID under `hub.db.connection.databaseId`. Set task-required KV `namespaceId` and R2 `bucketName` through NuxtHub. Do not add unused services. Resolve every binding explicitly so Wrangler cannot automatically provision resources during deployment.

For sign-in, set nonsecret Worker runtime `vars.NUXT_PUBLIC_SITE_URL` to the exact confirmed live origin before the production build. Keep it in the root configuration, not only a dashboard variable or a build-time define:

```jsonc
{
	"name": "<confirmed-worker-name>",
	"account_id": "<confirmed-account-id>",
	"vars": {
		"NUXT_PUBLIC_SITE_URL": "https://<worker-name>.<account-subdomain>.workers.dev"
	}
}
```

Workers supplies no `CF_PAGES_URL`. Keep the module-injected Better Auth `baseURL` rather than setting it by hand. List only secret names in configuration and evidence. Do not carry the local loopback origin or local secret into production.

Rebuild with the app's production command. Inspect `.output/server/wrangler.json` for the account, Worker name, actual resource bindings, assets, runtime variables, and migration metadata. Confirm `DB`, `_hub_migrations`, and the reviewed SQL under the generated `migrations_dir`. Static-only apps use the assets-only configuration and skip D1 and auth steps.

### Apply the remote D1 migration

Show the selected database, reviewed migrations, and exact remote command. Obtain separate confirmation, then run the manager's equivalent of:

```sh
bunx wrangler d1 migrations apply DB --remote --config .output/server/wrangler.json
```

This changes production data. It is separate from deployment, which does not apply D1 migrations. Wrangler may skip its own prompt in noninteractive execution. That does not replace the skill's confirmation. If a migration fails, report applied migrations and the failure, then stop. Earlier successful migrations remain applied.

### Hand each secret prompt to the user

For each required secret, use an accepted name from [the auth recipe](auth.md#keep-secrets-private-and-origins-explicit). Preserve an existing suitable secret unless replacement is requested. Before `wrangler secret put`, explain that it creates and immediately deploys a Worker version. It is not passive storage before the final deploy. On an existing Worker, the currently deployed code receives the changed secret immediately. Changing an auth secret can invalidate sessions. On a new target, Wrangler may create the Worker before the app upload. Include that creation in this step's confirmation.

Confirm the exact account, Worker name, secret name, and those immediate effects. Then hand this command to the user in their own unrecorded terminal on their machine, with the confirmed account pinned and the app directory selected:

```sh
CLOUDFLARE_ACCOUNT_ID=<confirmed-account-id> bunx wrangler secret put <accepted-secret-name> --name <confirmed-worker-name> --config .output/server/wrangler.json
```

The user types the value directly into Wrangler's hidden prompt. Do not collect it through chat, `ask`, the Flow, agent shell arguments, pipes, files, recorded PTYs, RPC, or evidence. Pause any terminal recording before entry. If private interactive input cannot be handed to the user, stop this step instead of substituting bulk secrets or a versions workflow.

Resume only after the user reports the nonsecret command outcome. Record the secret name, success or failure, and any nonsecret version receipt, never the entered value. An unexpected creation or other account-action prompt outside the confirmed effects requires a new confirmation before proceeding.

### Confirm and deploy the app

Show the final command, pinned account, production Worker name, bindings, and exact live origin. For sign-in apps, show `NUXT_PUBLIC_SITE_URL` and its value in this confirmation. State that this uploads and deploys the app, configuration, and assets, and preserves previously written secrets. Any earlier secret write already deployed its own version.

After separate confirmation, run the app's manager equivalent of:

```sh
bunx wrangler deploy --config .output/server/wrangler.json
```

For static-only output, select its assets-only config instead. Do not chain migration, secret writes, and deploy in one shell command. An unexpected automatic-provisioning request means the resource plan is incomplete. Stop rather than approve it as part of deployment.

### Check the live result

After every deployment, load the reported live origin and verify the requested pages and server behavior. After a secret-write deployment, check the currently live site if an app already exists. For a newly created placeholder Worker, report its response and that the app is not live yet. A failed check stops the remaining work.

Once an app is live, for sign-in make a read-only `GET /api/auth/get-session` against that live origin, including any `app.baseURL` prefix. Require a successful response with the expected session shape or a signed-out null result, not an initialization error. Check the live app again after the final deploy. Apps without sign-in get no auth probe. A `workers.dev` Browser Integrity Check rejection is an observed access failure, not proof of an auth defect. Use the intended browser and retain the actual outcome.

A real production sign-up or sign-in creates or uses an account. Run it only after separate confirmation. Otherwise report production sign-in as unchecked. Finish with the live URL, nonsecret step outcomes, observed checks, and anything not run.
