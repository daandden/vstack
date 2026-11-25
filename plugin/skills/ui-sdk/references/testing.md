# UI SDK testing techniques

Adapted by vstack from the upstream UI SDK skill.

`@ui-sdk/core/testing` checks keyboard behavior, focus, ARIA, server output and reading direction. The full page is "Testing" in `docs/core.md`, or https://ui-sdk.dev/docs/core/testing.

Use the techniques that fit the running workflow's test seam. For example, check names, values, callbacks, focus return, and form submission when the interface wiring is under test. For a custom primitive, exercise the documented keys and states. The [agent test](agent-ready.md#prove-it-with-a-test) has its own required coverage.

## Set up tests

This example uses React with Vite and Vitest. Reuse the project's test tools. If the task calls for setting up this test stack, add missing dependencies with the project's package manager: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/dom`, and `@testing-library/user-event`. Use the framework's Testing Library package, such as `@testing-library/vue` for Vue.

`vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from "vitest/config"
import viteConfig from "./vite.config.ts"

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  })
)
```

`src/test/setup.ts` holds the [jsdom stubs](#jsdom), strict mode and cleanup:

```ts
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

declare global {
  var __UI_SDK_STRICT__: boolean | undefined
}
globalThis.__UI_SDK_STRICT__ = true

// The jsdom stubs below go here.

afterEach(cleanup)
```

## Which tool for what

| You built                                                   | Test with                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| An interface from our components                            | The framework's testing library for what you wired (names, values, callbacks, what submits), and the [agent test](agent-ready.md#prove-it-with-a-test). Our components are tested already: don't run `checkPattern` on them.                                                                                                                 |
| A primitive                                                 | `mount` with `keys`, `type`, `click`, `hover` and `drag`, then `checkPattern`, `checkServer` and `checkDirection`. If a page in the app uses it, also render that page: press its keys there, click each of its buttons that moves between steps (Next, Back), assert where focus lands after each, and assert its name in the page's markup |
| Anything with popups, layout or focus moving between fields | Also a real browser                                                                                                                                                                                                                                                                                                                          |

## Check a pattern

`checkPattern(element, pattern)` checks roles, names, states, references between parts and the keyboard interactions of a WAI-ARIA pattern, and throws one error that lists every problem:

```ts
import { checkPattern } from "@ui-sdk/core/testing"

await checkPattern(screen.getByRole("tablist").parentElement!, "tabs")
```

Patterns: `listbox`, `menu`, `menubar`, `tabs`, `radio-group`, `toolbar`, `tree`, `dialog`, `alertdialog`, `disclosure`, `accordion`, `combobox`, `slider`, `switch`, `checkbox`. Open a menu or dialog before checking it. A menu check activates an item, so use safe actions in tests.

## Test a primitive

```ts
import { checkDirection, checkServer, mount } from "@ui-sdk/core/testing"
import { expect, test } from "vitest"
import { stepper } from "./stepper"

test("arrows move between steps and Enter opens one", async () => {
  const view = mount(
    stepper,
    {},
    `<root><step value="a">A</step><step value="b">B</step></root>`
  )
  try {
    await view.keys("Tab", "ArrowRight", "Enter")
    expect(view.state.value).toBe("b")
    expect(view.changes.at(-1)).toMatchObject({
      key: "value",
      source: "keyboard",
    })
  } finally {
    view.unmount()
  }
})

test("renders on the server and works in both directions", async () => {
  checkServer(stepper, {}, `<root><step value="a">A</step></root>`)
  await checkDirection(
    stepper,
    {},
    `<root><step value="a">A</step><step value="b">B</step></root>`
  )
})
```

- In `mount`'s markup, tags named after slots become parts and their attributes become part props. `root` is the first element; `view.part("step", "b")` finds another.
- Focus an input before `type`. `keys` takes `Tab`, `Shift+Tab`, `Space` and combinations.
- `view.announced` holds what screen readers heard. Call `await view.settle()` before reading delayed work.
- Always `unmount`.
- Set `globalThis.__UI_SDK_STRICT__ = true` in the test setup so development warnings fail the test. Declare it first: `declare global { var __UI_SDK_STRICT__: boolean | undefined }`.

For a composite widget, test both arrow directions, that exactly one item is tabbable, Space and Enter, and every state attribute you set, like `aria-current` or `aria-disabled`.

## Probe test sensitivity

If the running workflow calls for a mutation check, temporarily break the behavior in a disposable copy. For example, skip a custom component's focus move or remove the page's control label. Confirm that the chosen test fails on that change and passes on the original behavior.

## jsdom

Framework renderers don't fill jsdom's gaps. Before anything opens, add these to the test setup:

```ts
HTMLElement.prototype.showPopover = function () {}
HTMLElement.prototype.hidePopover = function () {}
Element.prototype.getAnimations = () => []
Element.prototype.scrollIntoView = function () {}
Element.prototype.checkVisibility = () => true
Element.prototype.getClientRects = () => [] as unknown as DOMRectList
document.elementFromPoint = () => null
document.elementsFromPoint = () => []
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
document.head.append(
  Object.assign(document.createElement("style"), {
    textContent: "[popover] { display: block !important }",
  })
)
```

Assign these rather than using `??=`: jsdom has some of them without the parts that matter. Web components in jsdom also need `ElementInternals`: jsdom's `attachInternals` lacks `setFormValue`, `setValidity`, `checkValidity`, `reportValidity` and `states`, so wrap `HTMLElement.prototype.attachInternals` and add them (no-ops, `() => true` for the checks, a `Set` for `states`). jsdom also never calls `formResetCallback`, and its `FormData` leaves custom elements out, so check form reset and submitted values in a real browser. Stub `URL.createObjectURL` for file previews. File Input's native input has `pointer-events: none`, so upload with `userEvent.setup({ pointerEventsCheck: 0 })`. Some parts render a status region of their own, like `SliderValue`'s `<output>`, so name yours and query by name: `getByRole("status", { name: "Total" })`. `mount` already does the popover and animation stubs, and it keeps a part that isn't present as a detached node, so `view.part()` still returns it: check `isConnected` to tell whether it's on the page. Some state arrives a moment after a render or an event, like an icon-only button's name from its tooltip, or focus moving into a menu that opened on a press: wait with `await settle()` from `@ui-sdk/core/testing` (inside `act` in React), or query with `findByRole`.

## WebMCP

If the app registers WebMCP tools, `registerTools` calls `document.modelContext.registerTool` once per tool and expects a Promise back. A mock:

```ts
const tools = new Map<string, { execute: (input: object) => unknown }>()
Object.assign(document, {
  modelContext: {
    registerTool: async (tool: {
      name: string
      execute: (input: object) => unknown
    }) => {
      tools.set(tool.name, tool)
    },
  },
})
const unregister = registerTools(agent, { allow: () => true })
expect(await tools.get("snapshot")!.execute({})).toBeInstanceOf(Array)
unregister()
```

## A real browser

Check what jsdom can't show: top layer popups and their placement, layout, a key that moves focus so the next typed character lands in another field, typeahead timing. A browser tool's "type" may insert text without key events, so press real keys to test keyboard handling. Tab through the whole interface once and confirm every control is reachable and named.

### Contrast

Measure the color pairs in [styles.md](styles.md#color) in every state a person can reach: hover, focus, selected, disabled, open, invalid, and each theme. Read the colors that are painted, not the ones you set: a tint over another fill, a gradient or a sliding indicator changes what's behind the text. Measure in a visible window with a size, after animations finish: a hidden tab paints nothing and runs no animations, so it gives wrong numbers.
