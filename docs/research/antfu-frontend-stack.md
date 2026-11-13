# Anthony Fu's frontend choices and a Nuxt default

Research for issue [#454](https://github.com/daandden/vstack/issues/454), checked on 2026-11-11. This records public preferences and repository configuration, not a universal recommendation from Anthony Fu.

## What the primary sources establish

Anthony Fu's [Use page](https://antfu.me/use) names pnpm as his preferred package manager, `ni` for package-manager aliases, and ESLint with `@antfu/eslint-config` for linting and formatting. It links both Vitesse and Vitesse Nuxt as starter templates. It does not prescribe Nuxt for every frontend.

The inspected repositories agree on the package manager and core tooling:

| Project | Framework and rendering | Styling and icons | Other observed choices | Package manager |
| --- | --- | --- | --- | --- |
| [Personal website](https://github.com/antfu/antfu.me/blob/0be14a9ef6fdad5ccaf72010e8e1fed508920102/package.json) | Vue, Vite, and `vite-ssg` | UnoCSS, Iconify, and `unplugin-icons` | VueUse, Pinia, Vue Router, Shiki, Floating Vue, D3 modules, and antfu ESLint config | pnpm |
| [Vitesse](https://github.com/antfu-collective/vitesse/blob/a8785264f83c2ebe1b3cf689296775a4949957c8/package.json) | Vue, Vite, and `vite-ssg` | UnoCSS and Iconify Carbon assets | VueUse, Pinia, Vue Router, `vue-i18n`, Vitest, and antfu ESLint config | pnpm |
| [Vitesse Nuxt](https://github.com/antfu/vitesse-nuxt/blob/bca9f861108bca09b6e0abc4260324dd574e170b/package.json) | Nuxt | UnoCSS and Iconify assets | VueUse, Pinia, Nuxt color mode, PWA module, Nuxt ESLint module, and antfu ESLint config | pnpm |

The linked revisions are the main-branch HEADs observed during this research. Package manifests and configuration were read from the corresponding main branches. Versions are intentionally not recommended here.

[Vitesse Nuxt's Nuxt configuration](https://github.com/antfu/vitesse-nuxt/blob/bca9f861108bca09b6e0abc4260324dd574e170b/nuxt.config.ts) registers VueUse, UnoCSS, Pinia, color mode, PWA, and Nuxt ESLint modules. Its [ESLint configuration](https://github.com/antfu/vitesse-nuxt/blob/bca9f861108bca09b6e0abc4260324dd574e170b/eslint.config.js) composes `antfu(...)` with the generated Nuxt config and enables formatters. Its [UnoCSS configuration](https://github.com/antfu/vitesse-nuxt/blob/bca9f861108bca09b6e0abc4260324dd574e170b/uno.config.ts) uses icon, typography, and utility presets.

These sources support an antfu-inspired core of pnpm, Vue or Nuxt, VueUse, UnoCSS, Iconify, Pinia where needed, and antfu ESLint config. They do not establish Nuxt UI, Tailwind, Valibot, TanStack Vue Query, Unovis, or motion-v as his default stack. Those were separate proposals in this triage, not researched preferences of his. A package's absence from these three manifests does not prove he never uses it.

Nuxt UI is still a valid independent choice. Its [official Vue installation guide](https://ui.nuxt.com/docs/getting-started/installation/vue) supports standalone Vue with Vite as well as Nuxt. Choosing it does not require choosing Nuxt. Its Tailwind integration should not silently replace an existing UnoCSS setup.

## Why Nuxt can be the default

[Nuxt's rendering documentation](https://nuxt.com/docs/4.x/guide/concepts/rendering) supports server rendering, prerendering, client-only rendering, and per-route rendering rules. A Nuxt default therefore does not imply a permanent server bill or server rendering for every route.

Nuxt is a reasonable default when the project benefits from routing conventions, modules, server endpoints, public content indexing, or a mix of public pages and private application pages. This is an engineering recommendation based on those capabilities, not a documented Anthony Fu preference for all projects.

## Why not use Nuxt for every frontend

| Situation | Nuxt | Standalone Vue with Vite |
| --- | --- | --- |
| Public content and useful initial HTML | Provides integrated server rendering, prerendering, and hybrid route rules. | Requires a rendering solution such as Vite SSG when client rendering is insufficient. Vitesse already demonstrates this option. |
| Browser-only internal app with a separate backend | Can run as a static client-only app with `ssr: false`, but retains Nuxt's framework and module conventions. | Avoids server-rendering concerns by default. Routing and other app conventions are configured separately. |
| Server-rendered page using browser-only libraries | Requires deliberate client boundaries and hydration-safe state. | A client-rendered app avoids that split between server and client execution. This is not an advantage if the app also needs SSR. |
| Static-only hosting | Can output static files. Server endpoints are not available in that output. | A normal client build produces static assets. |
| Embedded widget, component library, or app inside an existing tool | A full application framework may add conventions the deliverable does not need. | A smaller Vue setup with Vite is often sufficient. This is a judgment, not a measured performance result. |

The strongest argument against a Nuxt default is unnecessary application-framework conventions for a deliberately small, browser-only deliverable. It is not that Nuxt cannot do SPAs or static hosting.

No benchmark was run. No claim about build time, bundle size, hosting price, or relative runtime speed follows from this research.

## Recommendation for the triage decision

Use pnpm, not Bun, if this skill is intended to follow Anthony Fu's published package-manager preference. Keep existing declarations and lockfiles, and honor an explicit user request. `ni` dispatches to package managers and does not replace that choice.

Nuxt remains a defensible default for new applications, with standalone Vue with Vite for explicit client-only or embedded requirements. Keep framework choice separate from rendering and deployment mode. Do not silently deploy a server or add SSR solely because the framework is Nuxt.

For the curated list, distinguish the evidenced antfu-inspired core from extra task-specific picks. Either accept only that core and explicitly mark other tasks uncurated, or approve the additional component, forms, charting, and motion defaults as vstack's own preferences. No option has been accepted by this research.

## Limits

This research inspected public preferences, three package manifests, and the Vitesse Nuxt integration configs. It did not audit every Anthony Fu project, install dependencies, run the templates, or verify interoperability. The current compatibility of any generated stack still needs checking during implementation.
