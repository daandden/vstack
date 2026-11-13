# Set up the requested project

## Set the boundary

Apply the [shared framework, manager, and rendering rules](../SKILL.md#inspect-the-target-application). Resolve consequential rendering requirements through [the shared question contract](../SKILL.md#flow-and-questions).

Check the scaffold command's current options before running it. Create the real project in the requested directory, install its dependencies with the selected manager, and replace its starter page with the requested working feature. For Bun with no prior convention, the starting commands are:

For Nuxt:

```sh
bun create nuxt@latest <directory>
```

For explicit standalone Vue with Vite:

```sh
bun create vite@latest <directory> --template vue-ts
```

Use only the chosen branch. Inspect scaffold output before adding modules or tools. Record a compatible version in the manifest and use that manager's lockfile. A scaffold may supply DevTools or linting already. Do not duplicate them. No setup request implicitly authorizes server deployment, a paid service, or an account.

## Wire the task

Use the [curated task row](choices.md), not the whole list. Verify current framework integrations before editing configuration. For Nuxt, register needed modules in `nuxt.config.ts`. For Vue, register needed plugins before mounting the application. Keep browser globals and browser-only libraries behind appropriate client boundaries and preserve hydration-safe initial state.

For UnoCSS, shadcn-vue, and icons, follow [the controls recipe](unocss-controls.md). For managed forms and runtime schemas, follow [the forms recipe](forms.md). Optional state, query, chart, table, motion, and 3D packages remain absent unless their task requires them.

For server routes or data, follow [server and data setup](server-data.md). For a Cloudflare target, also follow [the local boundary and deploy checklist](cloudflare-deploy.md). Frontend-only setup does not load either reference unless the task needs it.

## Keep one lint and format policy

Preserve existing ESLint, Prettier, Biome, or other tooling unless migration is explicit. When tooling is absent, use compatible ESLint and `@antfu/eslint-config` development dependencies. In Nuxt, compose antfu with the generated Nuxt configuration rather than creating a parallel Vue or TypeScript ruleset:

```js
import antfu from '@antfu/eslint-config'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(antfu({
	stylistic: true,
}))
```

Register `@nuxt/eslint` and run Nuxt preparation before importing its generated config. Check the installed module's current configuration API. With its compatible `config` API, use `eslint: { config: { standalone: false, stylistic: false } }` in `nuxt.config.ts` so antfu supplies the shared rules and Nuxt adds framework-specific rules. Select a TypeScript version supported by both the framework and ESLint parser. In standalone Vue, export `antfu()` directly from the flat config. Keep formatters for CSS, HTML, or Markdown off unless deliberately assigning those file types to ESLint with the required compatible formatter dependencies. Document each file type's owner. Do not add Prettier on top of antfu's stylistic rules for the same files.

## Establish completion

Run the target project's production build, typecheck, and relevant configured lint command. Fix integration failures within scope. Exercise the actual requested feature, including keyboard and error paths, themes, and narrow layouts where applicable. For schemas, include repeated validation under the target policy, not only a first successful call.

For fullstack Cloudflare setup, also prove a page and server route writing and reading local D1 in both Nuxt dev and the built Worker under `wrangler dev`. Return the written deploy checklist. A successful Node preview is not Workers-runtime proof.

Return the project path, framework and manager decisions, installed task-required dependencies, exact commands and outcomes, and browser evidence or an explicit unavailable check. Report incompatibility or missing prerequisites instead of replacing the chosen CSS system, components, or schema library silently.
