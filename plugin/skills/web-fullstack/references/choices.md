# Curated choices

Use the row for the task, after checking built-ins and suitable installed alternatives. A row is not permission to install a dependency bundle.

| Task | Default and boundary |
| --- | --- |
| New application | Nuxt by default. Vue with Vite stays curated for frontend-only requests, embedded widgets, and component libraries. Apply the [shared framework rules](../SKILL.md#inspect-the-target-application). |
| UI controls | Use native controls or suitable installed components when they cover the task. Otherwise choose UI SDK for unstyled controls with keyboard, focus, and ARIA behavior built in. Use the [UnoCSS controls recipe](unocss-controls.md). |
| Styling | UnoCSS. Use `@unocss/nuxt` for Nuxt and `unocss/vite` for Vite. Preserve an existing suitable CSS system. |
| Icons | UnoCSS `presetIcons` and the required local Iconify collection package, retaining the project's artwork. `@nuxt/icon` is a conditional Nuxt alternative for its component integration, not a second default renderer. |
| Form management | `@tanstack/vue-form`. Keep suitable installed form management. Do not introduce Nuxt UI Form or vee-validate alongside it for the same job. |
| Runtime schemas | `@oh-my-pi/omptype`, through Standard Schema V1 with TanStack Form. Preserve a suitable installed schema library. See [forms](forms.md) for output parsing and CSP. |
| Shared state | Vue state or Nuxt `useState` first. `pinia` is optional for organized shared stores. Use the compatible Nuxt integration only when needed. Keep user-specific SSR state request-scoped. |
| Remote data | Nuxt `useFetch` for SSR payload transfer, `$fetch` for event-driven requests, or simple native `fetch` in Vue. `@tanstack/vue-query` is optional for server-state caching and coordination. Give each resource one cache owner. |
| Table behavior | `@tanstack/vue-table` for sorting, filtering, selection, or other needed table behavior, rendered with the selected controls. Plain tables need no table engine. |
| Charts | `@unovis/vue` with its compatible `@unovis/ts` integration. Handle sizing, accessible data, and browser-only chart boundaries where required. |
| Library-driven motion | `motion-v` when built-in CSS or Vue transitions do not cover the motion task. Respect reduced motion and component lifetimes. |
| 3D | TresJS, with compatible `@tresjs/core` and `three`. For Nuxt, check the current `@tresjs/nuxt` integration and client-only canvas boundary. Do not execute browser-only rendering during SSR. |
| Reactive browser utilities | VueUse, with `@vueuse/nuxt` in Nuxt or `@vueuse/core` in Vue. Choose the relevant composable and respect SSR and permission boundaries. |
| Images | `@nuxt/image` for Nuxt image processing. Check the selected provider and deployment compatibility. On Workers, follow [the provider boundary](server-data.md#check-worker-compatibility). |
| Fonts | `@nuxt/fonts`, the published package name. `@nuxt/font` is not the curated identity. Check font sources and local-serving requirements. |
| Color mode | `@nuxtjs/color-mode` in Nuxt. Align its preference, SSR fallback, and class or attribute with the app's theme tokens. |
| Internationalization | `@nuxtjs/i18n` for Nuxt's locale routing and integration. `vue-i18n` for standalone Vue. Native `Intl` is enough for number or date formatting alone. |
| Third-party script loading | `@nuxt/scripts`. A module choice does not authorize a provider, private-data disclosure, tracking, or an account. Retain normal privacy and authorization checks. |
| Content-driven pages | `@nuxt/content`. Check its storage, build, and hosting requirements for the target version. |
| Readable regular expressions | `magic-regexp` when readable composition benefits the task. A simple literal expression needs no package. |
| Nuxt development inspection | Nuxt DevTools, or `@nuxt/devtools` when the installed Nuxt version needs it. Inspect built-in activation before adding a duplicate. |
| Component tests | Only when testing is requested. For Vue with Vite, use `vitest`, `@vue/test-utils`, and `happy-dom`. For Nuxt, add `@nuxt/test-utils` to that stack. Install all as development dependencies. See [component test setup](setup.md#set-up-component-tests). |
| Linting and formatting | `@antfu/eslint-config` when tooling is absent or migration is explicit. Compose with generated `@nuxt/eslint` where applicable. Keep existing policy otherwise, with one formatting owner per file type. |
| Server routes and SSR | Nuxt server routes in the same Worker as pages, using Nitro `cloudflare_module` on Workers with Static Assets. See [server and data setup](server-data.md). |
| Relational data | NuxtHub 0.10 or later with D1 and Drizzle through `@nuxthub/db`. Schemas live in `server/db/`. See [local migration rules](server-data.md#generate-and-apply-local-migrations). |
| Key-value storage | NuxtHub KV with Workers KV only when the task needs key-value storage. No default KV or cache namespace. |
| File storage | NuxtHub blob with R2 only when the task needs file storage. |
| Hosting | Cloudflare Workers with Static Assets only. Static-only Nuxt uses `nuxt generate` and assets without server Worker code. See [the Cloudflare checklist](cloudflare-deploy.md). |

Nuxt-specific modules are conditional Nuxt integrations. Do not insert them into a standalone Vue application. Check peer versions, module registration, styles, providers, and SSR constraints for every package actually installed. No setup is complete until its relevant command and consumer behavior succeed.
