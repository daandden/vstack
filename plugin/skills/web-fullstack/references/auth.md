# Add sign-in with Better Auth

Read this reference only when the task needs sign-in. Use Better Auth through `@nuxtjs/better-auth` on NuxtHub's database for every curated sign-in app. Apps without sign-in get no auth library. Apply [server and data setup](server-data.md) and [the local Cloudflare boundary](cloudflare-deploy.md#keep-setup-local). Advice remains read-only under [the shared rules](../SKILL.md).

## Check versions and install

The module is pre-1.0. Check its installed peers and current [installation](https://better-auth.nuxt.dev/getting-started/installation), [NuxtHub integration](https://better-auth.nuxt.dev/integrations/nuxthub), and [configuration](https://better-auth.nuxt.dev/getting-started/configuration) docs before wiring. NuxtHub must be at least 0.10.5. Install the module and `better-auth`, plus the development CLI package `auth`. Keep `auth` and `better-auth` on exactly the same version, within the module's peer constraints. Module 0.3.16 pins its optional `auth` peer to 1.7.18, so the compatible pair for that module is `auth@1.7.18` and `better-auth@1.7.18`, not latest-of-each.

Use the selected manager's equivalent of `nuxi module add @nuxtjs/better-auth`, or register the installed module yourself. Keep `@nuxthub/core` before `@nuxtjs/better-auth` in `modules`. Retain the explicit local D1 driver and simulated identifier from the server/data recipe. The module supplies its managed Drizzle adapter. Do not wire a second database adapter.

## Configure server and client

Create `server/auth.config.ts` for the requested sign-in method. For email and password:

```ts
import { defineServerAuth } from '@nuxtjs/better-auth/config'

export default defineServerAuth({
	emailAndPassword: { enabled: true },
	advanced: {
		ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
	},
})
```

Cloudflare replaces `CF-Connecting-IP` at its proxy. List only that trusted header, not client-spoofable fallbacks. Local workerd does not prove the real proxy's behavior. Better Auth enables HTTP rate limits in production by default, but counters default to process-local memory. Those counters are not shared across Worker isolates. If the task needs shared limits, configure supported database or custom storage and migrate its required schema. Do not add KV by default. The current NuxtHub integration cannot use KV for Better Auth 1.7's atomic secondary-storage operations.

Create `<srcDir>/auth.config.ts`, normally `app/auth.config.ts`:

```ts
import { defineClientAuth } from '@nuxtjs/better-auth/config'

export default defineClientAuth({})
```

Wire the actual form with the installed module's [client actions](https://better-auth.nuxt.dev/api/composables). The current actions are `useSignUp('email').execute({ name, email, password })` and `useSignIn('email').execute({ email, password })`. Render pending and error states. `useUserSession()` supplies `user`, `session`, `loggedIn`, `ready`, and `signOut`, not `signIn` or `signUp`. Await `signOut()` to clear client session state. Raw `useAuthClient()` methods are browser-only and can resolve before reactive session updates finish.

Protect private server handlers with [requireUserSession](https://better-auth.nuxt.dev/api/server-utils#requireusersession), before reading or returning private data:

```ts
export default defineEventHandler(async (event) => {
	const { user } = await requireUserSession(event)
	return { userId: user.id }
})
```

A client route guard alone does not protect an API. Add the task's authorization checks after authentication.

## Keep secrets private and origins explicit

The module injects Better Auth's `secret` and `baseURL`. Do not set either by hand. Generate a high-entropy local secret of at least 32 characters directly into a git-ignored env file, without printing or capturing its value. Use an accepted name, such as `NUXT_BETTER_AUTH_SECRET` or `BETTER_AUTH_SECRET`. On Nuxt 4.6+, `NUXT_APP_SECRET` also works when no dedicated auth secret is configured. Preserve an existing secret instead of regenerating it and invalidating sessions.

Choose one local env source that both development modes read. A root `.env` works with Nuxt dev and current Wrangler when no `.dev.vars` shadows it. Wrangler normally looks beside its config. With generated `.output/server/wrangler.json`, select the root file explicitly using the installed Wrangler's `--env-file <absolute-root-env-path>`, or another documented path proven in both runtimes. Ignore `.env*` and `.dev.vars*`, keep values out of RPC results and screenshots, and report only file and variable names. Do not run `cat`, broad file captures, or secret-printing generators against that file.

Declare `runtimeConfig.public.siteUrl` in Nuxt config. Put `NUXT_PUBLIC_SITE_URL` in the root Worker configuration's `vars` and confirm it survives the production build. Its production value must be the actual live origin, including on `workers.dev`. Workers supplies no `CF_PAGES_URL`, and the module fails production initialization without an explicit supported URL. During account-free setup, mark any prospective production origin as unresolved and require replacement before deploy.

A built Worker is a production auth runtime even under local `wrangler dev`. Supply the actual loopback origin through the ignored local env source for that run, overriding the prospective production variable. Use the matching origin for Nuxt dev too. A listener host or request Host header does not replace production URL configuration. Do not embed a local URL in Better Auth `baseURL` or commit a secret in Wrangler `vars`.

## Generate migrations and prove the flow

The module generates dialect-specific auth schemas at build time and extends NuxtHub through `hub:db:schema:extend`. Restart after schema-affecting auth configuration changes. Do not hand-create duplicate auth tables. Use the stable `schema` export from `#auth/schema` when application tables need auth foreign keys.

After module schema generation, run `nuxt db generate`, review the auth SQL, and retain the migration in the app. Apply it through [the local D1 procedure](server-data.md#generate-and-apply-local-migrations). Nuxt dev's plugin handles its local migrations. Built workerd needs explicit Wrangler `--local` migrations with the same persistence directory as `wrangler dev`. The integration docs' generic `nuxt db migrate` example is not local D1 proof.

In a browser against the generated app, prove signed-out server refusal, sign-up, signed-in server access, sign-out, explicit sign-in, and signed-in access again. Repeat signed-out refusal after sign-out, and reload while signed in to check persisted sessions. Run this in Nuxt dev and built `wrangler dev` with local D1. A successful build or an `auth.api` helper call does not prove the browser HTTP flow or its rate limits. Retain sanitized action, status, and screenshot evidence without secret values or session tokens.

Finish with [the deploy checklist](cloudflare-deploy.md#write-the-deploy-checklist). Include the accepted auth-secret name and nonsecret runtime `NUXT_PUBLIC_SITE_URL`, its required live origin, and the unrun remote auth check. Local success does not prove account bindings, remote migrations, or production sign-in.
