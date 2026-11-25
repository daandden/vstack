# web-fullstack recommends UI SDK, and the Flow reader keeps its Reka controls for now

The user chose this in the grill of the Flow `ui-sdk-openpencil-design` on 2026-11-26. web-fullstack's curated UI controls choice moves from shadcn-vue copied components to UI SDK: `@ui-sdk/core` with the framework package, such as `@ui-sdk/vue` and its Nuxt module. Apps style its unstyled components with UnoCSS from their `data-slot` and state attributes and the project's own tokens. The recipe does not import `@ui-sdk/core/web.css`, so an app keeps one CSS pipeline and its own icon artwork. Apps that already use suitable controls keep them.

The upstream ui-sdk agent skill ships as a visible adapt Utility skill from a new Upstream, key `ui-sdk` (vercel-labs/ui, path `packages/core/skills`). The adaptation drops upstream's blanket rule that every task gets tests, so the running owner, such as implement or Verify, still decides test seams and proof. It keeps upstream's agent-ready step on every path: each UI SDK interface gets the agent bridge and its agent test.

This amends [ADR 20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design](20261119-the-flow-reader-uses-web-fullstack-frontend-choices-and-the-doop-compact-design.md). The Flow reader keeps its copied reka-ui controls as a named exception to the controls choice until a later spec migrates it, because UI SDK is still in beta (0.1.0-beta.17 when chosen). The reader's Doop compact design and its other stack choices are unchanged.

## Considered Options

- **Theme `web.css` through its `--ui-*` tokens**: rejected. It adds a second token layer and a cascade layer, and its mask icons replace the project's artwork unless each one is overridden.
- **Migrate the reader in the same spec**: rejected for now, to keep a beta library out of the shipped reader.
- **Adopt the skill byte for byte**: rejected. Its every-task-gets-tests rule would compete with implement's test-seam rule whenever both load.
- **Make the agent-ready step opt-in**: rejected. The user kept upstream's step after weighing the bridge's gains against the state and actions it exposes to agents.
- **Upstream key `vercel`**: rejected. One key holds one repo, so the product name reads better.

## Consequences

- `pins.yaml` gains the `ui-sdk` Upstream with a commit Pin, the register gains row `ui-sdk/ui-sdk` with Disposition adapt, and `utility:` lists `plugin/skills/ui-sdk`. It gets no Addon catalog key, as [ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css](0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css.md) did for the UI-upstream skills.
- The shadcn-vue copying recipe leaves web-fullstack.
