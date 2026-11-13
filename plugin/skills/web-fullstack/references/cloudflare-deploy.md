# Keep Cloudflare setup local and write the deploy checklist

Read this reference for Cloudflare hosting tasks. Cloudflare Workers with Static Assets is the curated host. Fullstack Nuxt uses [the server and data recipe](server-data.md). Setup ends with local proof and a checklist. This reference does not authorize or execute remote deploy steps.

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

The checklist covers these later actions, each outside setup:

- Identify and confirm the target Cloudflare account, production Worker name, and live origin. Missing credentials are a prerequisite, not a reason to change host.
- Log in through `wrangler login` when needed, with the user completing authentication.
- Create D1 and only task-required KV namespaces or R2 buckets. Record each returned resource ID and replace simulated local configuration before a production build.
- Set any required nonsecret Worker runtime variables. Arrange each required secret through `wrangler secret put` with user-owned terminal input. Keep secret values out of chat, the Flow, and evidence.
- Rebuild and inspect the generated Worker configuration, bindings, assets, runtime variables, and migration paths. Resolve resource IDs explicitly. Wrangler deployment must not silently provision missing resources.
- Apply reviewed D1 migrations with `wrangler d1 migrations apply DB --remote --config .output/server/wrangler.json` as its own confirmed step. `wrangler deploy` does not apply them.
- Run `wrangler deploy` from the user's machine to one production Worker only after a separate deploy confirmation. Report the resulting live URL and which checks remain.

An explicit deploy request is required before any account work, followed by confirmation through [the shared question contract](../SKILL.md#flow-and-questions) for the account and each remote action. A refused or failed remote step stops that work. A retry of a remote migration or deploy needs new confirmation. The checklist is not that confirmation. This setup reference does not supply the remote execution procedure. CI deployment, Workers Builds, staging, preview environments, Cloudflare Pages, and other hosts are outside this curated path.
