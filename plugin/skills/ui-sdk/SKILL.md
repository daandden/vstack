---
name: ui-sdk
description: "Use when a project has @ui-sdk/* installed or the user names ui-sdk. Compose UI SDK components, build missing components from @ui-sdk/core, and connect and test the agent bridge in React, Vue, Svelte, Solid, or Web Components."
---

# Build with ui-sdk

Adapted by vstack from the upstream UI SDK skill.

ui-sdk is a library of UI behaviors: keyboard navigation, focus, selection, dismissal, popups, drag and drop and the ARIA they need. Its components are built from those behaviors and render no styles of their own, in React, Vue, Svelte, Solid and web components. `@ui-sdk/core/web.css` gives them an optional default look. When a component is missing, you build it from the same behaviors in `@ui-sdk/core`, and it gets the same keyboard, focus, server rendering and right to left support.

## Read first

Use the installed package docs for API facts. The installed docs and exported `.d.ts` types describe the version that runs in the project:

- `node_modules/@ui-sdk/<framework>/docs/llms.txt` is the index. Read it first. `<framework>` is `react`, `vue`, `svelte`, `solid` or `web`.
- Then read only the pages your task needs, like `docs/components/select.md`. Don't read the whole `docs/` folder; it's large.
- An interface built from our components doesn't need `docs/core.md`. Only path 2 below does, and even then you search it by heading: it's over 300 KB. `docs/rendering.md` sits next to it in the same `docs/` folder.
- Use the docs and public types rather than compiled `dist/*.js`. If a behavior is still unclear, use a narrow probe supported by the running workflow.

Use [the online docs](https://ui-sdk.dev/docs) when the installed docs are unavailable. If the online docs or these references disagree with the installed package, follow the installed package. The skill copy bundled in `@ui-sdk/core` is reference material, not a second active skill.

For a page without a build step, read [the no-bundler instructions](references/web-components.md#without-a-bundler) and https://ui-sdk.dev/web.md instead of `llms.txt`. It needs no package installation.

When the task explicitly calls for UI SDK setup with a build step for Vue or Nuxt, follow [web-fullstack's UI SDK package setup](../web-fullstack/references/setup.md#wire-ui-sdk-for-vue). For other frameworks, install missing `@ui-sdk/core` and the framework package with the project's package manager. Match the framework package version to core.

## Pick your path

1. **Build an interface from UI SDK components**, like a settings page, a form or a command palette: read [references/build-interface.md](references/build-interface.md).
2. **Build or extend a component or behavior**: read [references/create-component.md](references/create-component.md).

Use path 1 for the interface and path 2 only for parts that need a custom component.

Both paths lead to the same [agent-ready requirements](references/agent-ready.md). The running workflow, such as `skill://implement` or the project's Verify skill, owns general test seams and proof. Read [the UI SDK testing reference](references/testing.md) when it calls for UI SDK checks.

## Rules for every path

- **Import from entries.** Each component has its own entry, like `@ui-sdk/react/select`. Import components from there, not from a package root. Never import `@ui-sdk/core/internal/*`.
- **One shape everywhere.** A root and its parts, nested as the component page's Composition shows. Change a part's element with `render`, never an `as` prop.
- **Default or controlled.** `defaultValue` to start, or `value` with `onValueChange(value, details)` to control it (each framework's idiom: `v-model` in Vue, `bind:value` in Svelte, properties and events in web components). `details` has `reason`, `source` and `cancel()`.
- **Name every control.** Use the component's label part (`FieldLabel`, `SelectLabel`, `DialogTitle`), or `aria-label` when there's no visible text. People using screen readers and agents both find controls by name.
- **Style from state.** Target `data-slot` and state attributes like `data-open` or `data-pressed`, and the CSS variables each component lists. Never inline styles for state, and never generated ids. When the app uses `web.css`, read [references/styles.md](references/styles.md) first: it draws icons and sets sizes you can't see in the markup.
- **Declare the ui-sdk layer.** Put `@layer ui-sdk;` at the top of the global stylesheet, above `@import "tailwindcss"` if there is one.
- **Check color.** Text needs 4.5:1 against what's behind it, and control edges, focus rings and state fills 3:1. jsdom can't see color, so check it in a real browser.
- **Key lists by value or id**, never by index.
- **Right to left needs no provider.** Components read the direction from the page.
- **Comments are rare.** Write one only when a reader would get the code wrong without it, like a browser quirk or a trade-off, in one or two lines. Never comment what the code does, what a value is, or which section starts here, and no JSDoc blocks on app code.
- **Don't hand-roll what we ship.** Before you write any `role=` attribute, look for the component in the table in [references/build-interface.md](references/build-interface.md). A `div` with `role="listbox"`, `"menu"`, `"dialog"`, `"tablist"`, `"separator"`, `"switch"`, `"slider"`, `"radiogroup"`, `"toolbar"` or `"tree"` next to an installed ui-sdk package is almost always a bug.
