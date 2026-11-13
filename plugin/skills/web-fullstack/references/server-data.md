# Set up Nuxt server routes and local data

Use this reference for server or persistent-data tasks. Apply the shared rules in [web-fullstack](../SKILL.md) and [project setup](setup.md). The curated fullstack target is one Nuxt Worker serving SSR pages and server routes on Workers with Static Assets, not Cloudflare Pages.

## Check Worker compatibility

Before wiring, check installed Nuxt, Nitro, NuxtHub, Wrangler, Drizzle, and Node versions against current compatible documentation. Use the [Nitro v2 Cloudflare guide](https://v2.nitro.build/deploy/providers/cloudflare) for Nuxt versions using nitropack v2, and [NuxtHub's Cloudflare binding guide](https://hub.nuxt.com/docs/getting-started/deploy#cloudflare). NuxtHub must be 0.10 or later. Its current API uses `hub.db` and `@nuxthub/db`, not the older `hubDatabase()` API.

When processing images, select a provider that runs on Workers. Do not use a `sharp`-dependent IPX provider in the Worker. Nuxt Image's Cloudflare provider uses Image Transformations on an enabled Cloudflare zone. A `workers.dev` origin alone does not provide that service. Serve ordinary images without transformation if processing is unnecessary. Report a missing provider or zone prerequisite instead of enabling a service during setup.

## Configure the local Worker and D1

Install compatible `@nuxthub/core` and `drizzle-orm`, plus development dependencies `drizzle-kit` and `wrangler`, using the chosen manager. Register the module and configure Nitro and NuxtHub together. This example uses a simulated D1 identifier for account-free setup. Replace it only with an approved real resource ID in a later deploy task.

```ts
export default defineNuxtConfig({
	compatibilityDate: '2026-11-13',
	modules: ['@nuxthub/core'],
	nitro: {
		preset: 'cloudflare_module',
		cloudflare: {
			deployConfig: true,
			nodeCompat: true,
			dev: {
				configPath: '.output/server/wrangler.json',
				persistDir: '.data/wrangler-nuxt',
			},
			wrangler: {
				name: 'local-app',
				compatibility_date: '2026-11-13',
			},
		},
	},
	hub: {
		db: {
			dialect: 'sqlite',
			driver: 'd1',
			connection: { databaseId: '00000000-0000-0000-0000-000000000000' },
		},
	},
})
```

Choose a compatibility date supported by the installed integration. Workers Static Assets needs at least `2024-09-19`, and Nitro's development emulation needs a later compatible date. Nuxt's `compatibilityDate` and Wrangler's `compatibility_date` are separate settings. Inspect the generated config rather than overwriting generated compatibility flags blindly.

Keep `driver: 'd1'` explicit. SQLite shorthand can select local libsql in Nuxt dev, which does not prove local D1. NuxtHub generates the `DB` binding when `connection.databaseId` is present. Check that both Nuxt dev's emulated binding and the built config use local D1. Do not create a remote database to get an identifier. Reject `remote: true` bindings and remote proxy configuration during setup.

Nitro generates `.output/server/wrangler.json` at build time. If the app has a root Wrangler file, keep Worker settings there but let Nitro supply the built `main` and `assets` paths. NuxtHub supplies the D1 binding and migration metadata. Keep app queries behind NuxtHub rather than wiring a parallel raw D1 client.

## Add the requested server behavior

Define Drizzle schemas in `server/db/schema.ts` or files under `server/db/schema/`. Use SQLite table definitions from `drizzle-orm/sqlite-core`. Access the database in `server/api/` handlers through:

```ts
import { db, schema } from '@nuxthub/db'
```

Use Nuxt server routes for request validation, data access, and responses. A page can load data through Nuxt `useFetch` and submit event-driven writes through `$fetch`. Keep server-only modules and private configuration out of the browser bundle. Read request-dependent runtime configuration with `useRuntimeConfig(event)` inside handlers, not at module scope.

## Generate and apply local migrations

Run `nuxt db generate` through the project's package executor after defining the schema. Review the generated SQL under `server/db/migrations/sqlite/` and retain it in the project. NuxtHub consolidates migrations into its generated output and tracks them in `_hub_migrations`.

Nuxt dev applies migrations through its development plugin by default. With the explicit generated-config path above, generate the schema migration and build once before starting Nuxt dev so that its D1 proxy can read the binding. Rebuild that config after binding changes. Keep local state and generated output git-ignored. Start the app with the explicit D1 driver and confirm the requested page and server route can write and read local D1. Record the actual local state directory. The example gives Nuxt dev its own `.data/wrangler-nuxt` directory rather than assuming that it shares built Wrangler's state.

With a D1 driver, `nuxt db migrate` uses an HTTP D1 client and remote credentials. It is not the local setup command. A built Worker also does not run NuxtHub's development-only migration plugin. Build first, inspect `.output/server/wrangler.json`, then apply migrations with Wrangler's explicit local path. For Bun, with an absolute local state path chosen under the app's ignored data directory:

```sh
bun run build
bunx wrangler d1 migrations apply DB --local --config .output/server/wrangler.json --persist-to "$LOCAL_STATE"
bunx wrangler dev --local --config .output/server/wrangler.json --persist-to "$LOCAL_STATE"
```

Use the selected manager's equivalent commands. Verify that generated `migrations_dir` resolves relative to the generated Wrangler file and contains the reviewed SQL. Use the same absolute persistence directory for the built migration and `wrangler dev`. Exercise the page and write/read route again in workerd, then reload to confirm persistence. A Node preview or a successful build alone does not establish this behavior. Apply [the Cloudflare local-only process settings](cloudflare-deploy.md#keep-setup-local) to both development modes and migration commands.

## Add storage only when needed

For key-value storage, NuxtHub's Cloudflare binding config uses `kv: { driver: 'cloudflare-kv-binding', namespaceId: '<id>' }`. For file storage, it uses `blob: { driver: 'cloudflare-r2', bucketName: '<name>' }`. Add only the service the task needs. Check the installed version's local emulation and NuxtHub API before using it. Keep identifiers simulated during account-free setup and list the eventual resources in the deploy checklist.

Do not treat `kv: true` or `blob: true` filesystem fallbacks as proof of Workers KV or R2. A database task does not by itself require either service or a separate cache namespace.

Finish with the observed local outcomes and [the written deploy checklist](cloudflare-deploy.md#write-the-deploy-checklist). Report account-side binding and migration compatibility as unproven by local execution.
