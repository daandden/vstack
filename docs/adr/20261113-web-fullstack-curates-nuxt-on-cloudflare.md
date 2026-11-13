# web-fullstack curates Nuxt on Cloudflare and deploys only on request

`pick-frontend-stack` is renamed `web-fullstack` and extended from frontend libraries to fullstack websites. One skill owns the framework, package-manager, and read-only-advice rules for every layer, so frontend and server guidance cannot drift apart. For fullstack work it curates one stack: Nuxt server routes on Cloudflare Workers with Static Assets (Nitro `cloudflare_module`), NuxtHub for D1, KV, and R2, and Better Auth through the `@nuxtjs/better-auth` module. Cloudflare is the only curated host.

The skill keeps the existing rule that no setup request authorizes a deployment, a paid service, or an account. Setup ends with a project that builds and runs locally in `wrangler dev`. Only an explicit deploy request touches the user's Cloudflare account. It confirms the account first, then each resource creation, secret, remote D1 migration, and `wrangler deploy`, from the user's machine to one production Worker. Secret values come from the user and never pass through chat or the Flow.

## Considered options

- A separate Cloudflare skill beside `pick-frontend-stack`. Rejected because two skills would restate the framework and setup rules, and a Nuxt-on-Cloudflare request would match both descriptions.
- Extending `pick-frontend-stack` under its old name. Rejected because the name says frontend while the skill also scaffolds servers and deploys.
- Direct Cloudflare bindings with Drizzle instead of NuxtHub. The agent recommended them because they match Cloudflare's docs and have no wrapper with a recent breaking change (NuxtHub v0.10 replaced `hubDatabase()`). The user chose NuxtHub, which `@nuxtjs/better-auth` requires (peer `@nuxthub/core >= 0.10.5`).
- nuxt-auth-utils for OAuth-only apps. Rejected in favor of one auth recipe.
- A Vue with Vite SPA plus a Hono API Worker for explicit Vite requests. Rejected; fullstack is Nuxt only. Frontend-only Vue with Vite rows stay.
- Treating a request to build a Cloudflare site as permission to deploy. Rejected because it reverses the existing no-implicit-deploy rule and can create billable resources from a vague request.
- Workers Builds, GitHub Actions, and staging or preview environments. Out of scope for now.

## Consequences

- The rename is a major Change note. Nothing in `plugin/` calls the old name. README, `docs/maintainer.md`, `decision-register.yaml`, and the Verify recipe change.
- The Verify recipe requires a generated app built and run in workerd with local D1 and checked in a browser. A real deploy to a throwaway Worker is a Costly seam under [ADR 0062](0062-the-agent-picks-test-seams-and-asks-only-for-costly-ones.md) and runs only with the user's approval for that verification. Otherwise the report names the gap.
