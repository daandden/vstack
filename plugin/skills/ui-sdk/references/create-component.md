# Build a component from @ui-sdk/core

Adapted by vstack from the upstream UI SDK skill.

ui-sdk ships its behavior layer as public API. A component it doesn't have is one primitive, written once with `definePrimitive`, and one small file per framework that renders it. It gets the same keyboard handling, focus, server rendering and right to left layout as ui-sdk's own components.

## Read first

1. **The Core docs.** Every package ships them in `docs/`: `docs/core.md` is the whole Core section in one file, the same in every package, since no framework changes it. Each framework's package adds `docs/rendering.md`, how its adapter renders a primitive, and `docs/components/<name>.md` and `docs/utilities/<name>.md` (React's are `docs/hooks/<name>.md`) for the rest. Read `docs/core.md` and `docs/rendering.md` from the package of the framework you render in, like `node_modules/@ui-sdk/react/docs/`. In `core.md`, read the overview, "Build a Component" (a mute button), "Compose Behaviors" (a star rating, the template to copy), "Popups and Layers" under Behaviors if anything opens, and the Behaviors page for each one you use. Search it by heading rather than reading it top to bottom. For another framework, see [Other frameworks](#other-frameworks).
2. **The types.** Every export has JSDoc in `node_modules/@ui-sdk/core/dist/**/*.d.ts` and in each framework's `.d.ts`. A component entry's types point into its folder, like `dist/components/input/input.d.ts`. Read them there. Those JSDoc blocks document the library; your primitive gets none.
3. **What ui-sdk already has.** List the entries in `node_modules/@ui-sdk/<framework>/package.json`. If one covers part of what you're building, compose it (see [Compose ours](#compose-ours)) rather than rewriting its behavior. If the user named the blocks to use, build from those blocks.

Use the public docs and types rather than compiled `dist/*.js`. When they leave a behavior unclear, a narrow probe can resolve it.

### Probe what the docs don't say

If the running workflow calls for a probe, render the component in jsdom and log the DOM and callback arguments after firing events. In Vitest, `--silent=false` shows the logs. A probe can reveal whether an empty part hides, what reason a change reports, or where focus lands. Delete the probe after it answers the question. For a jsdom probe:

- **Wait a tick after mounting.** Some state, like an input group's `filled`, arrives after mount: `await act(() => new Promise((r) => setTimeout(r, 0)))`.
- **Stub what jsdom lacks before anything opens:** see [testing.md](testing.md#jsdom).

## Steps

### 1. Define the component behavior

Pick the WAI-ARIA pattern from the Authoring Practices (https://www.w3.org/WAI/ARIA/apg/patterns/) and write down its roles, states and keys. Then decide each of these in writing, since they're where components go wrong:

- **Focus on open and on Tab.** Where does focus land when the component opens or is tabbed into? Is the group one tab stop?
- **Selection and focus.** Does selection follow focus (radio group, single-select listbox), or do arrows only move focus and Space selects (multi-select listbox, data grid)?
- **Escape.** Who owns it? Inside a popup, the popup closes on it. A field that clears on Escape should only claim it when there's something to clear.
- **Parts that leave.** When the focused part is removed or moves out, where does focus go? Use `createFocusRecovery`.
- **Pick the pattern.** [patterns.md](patterns.md) has the roles for common shapes: a set of choices in two dimensions is a `grid`, a stepper is buttons with `aria-current="step"`.
- **Declare it on the slots.** Each part's role goes on its slot (`role: "option"`), never in `attrs`. TypeScript then requires what the role needs: `focus` for roles that take it, `press` for roles that activate, `keys` with an `on.keydown` for roles that move with keys, or `{ none: "why" }` when another element does it. Its `attrs` returns the role's required states, like `aria-checked`, and only the ARIA the role takes. Don't cast past these errors; set `globalThis.__UI_SDK_STRICT__ = true` in tests so development warnings fail them (declare it first: `declare global { var __UI_SDK_STRICT__: boolean | undefined }`).
- **Controls that stop applying.** A button that can't act right now should be `aria-disabled`, not `disabled`, if it may hold focus at the time. `disabled` drops focus to the page.
- **Keys with no APG rule.** Like Enter to move items between lists. Pick one, and say which in your report.
- **What an agent may call.** Which api methods are actions a person takes, like `rate` or `moveToTarget`? They go in `agent.actions` (step 2).

### 2. Write the primitive in `<name>.ts`

- **Options:** controlled keys as `<key>`, `default<Key>` and `on<Key>Change(value, details: ChangeDetails<Reason>)`.
- **Schema:** `options` names every option with its kind, and each slot's `props` every prop: `"string"`, `"number"`, `"boolean"`, `"list"`, `"value"` (any other value), `"callback"`, `"action"` (a callback whose return value counts, like a Promise), `"id"` (made when left out), `"key"` (a list item's value of any type, which keys the part and reaches nested parts as that key), or `{ kind, from: "item" }` for a prop a nested part takes from its parent, with `required: true` when it must sit inside it. Renderers read it to tell the primitive's props from the element's. TypeScript checks it names every key.
- **State:** `state` reads the default. `sync` maps controlled options onto state, or they're silently ignored. Copy any option a part renders into state.
- **Changes:** `api` builds `change` with `createChange(context)` and returns the api. Every change a user sees goes through `change` with a reason. Internal state, like a selection that starts over, can use `store.set`.
- **Reasons:** use the shared vocabulary (`ReasonVocabulary` in `@ui-sdk/core`) when one fits. When none does, like "select all" or "move to the other list", declare your own in the `on<Key>Change` type.
- **Slots:** `attrs` for ARIA and `data-*` (pure, server safe), `press` for activation, `on` for other events, `bind` for anything that touches the DOM (return a cleanup).
- **`press` hears only clicks on parts that aren't buttons.** For a `div` or `td` part, handle Space and Enter in `on.keydown`.
- **Every element gets its `data-slot` from a slot.** The adapter never sets one directly. Wrappers, like a row of buttons, get a slot of their own.
- **Agents:** end the definition with `agent: { actions: [...] }`, the api methods an agent may call. Keep it after `slots`. Give the root a name, with `aria-label` or a label part: the bridge names the component after it. [agent-ready.md](agent-ready.md) covers `closed`, `items`, `reveals`, `shown` and `secret`.

### 3. Use the blocks, don't rewrite them

`createRovingFocus` for one tab stop and arrow keys (`move` for grids and trees), `createListbox` for a highlight that moves through options and filters them as someone types (a search box over a list, a picker of your own), `createGridFocus` for cells by row and column, `createCellRange` for a spreadsheet's block of cells with `cellsToText` and `textToCells` to copy and paste it, `createSelection`, `createTypeahead`, `createInputHistory` for ArrowUp and ArrowDown through earlier messages in a chat box or a command line, `createFocusRecovery`, `bindPanel`, `announce` for screen reader messages, `createReorder` for reordering by drag and keyboard, `bindScrollPicker` for a listbox you scroll to pick from, like a time wheel or a strip of pages, with `--picker-offset` on each option to draw it in CSS, `bindDrag` for a drag of your own, `createPopup` with `popupState`, `popupTrigger` and `popupContent` for anything that opens, `elements`, `selects`, `isRTL`, `idPart`, `@ui-sdk/core/text-match`, `@ui-sdk/core/date`, `createTreeCollection`. The tables under "All Behaviors" map jobs to them, with a demo for each. [patterns.md](patterns.md) has tested snippets for what the blocks leave to you: grid `move`, derived state, internal selection, a `createFocusRecovery` fallback, and more.

### A new behavior

When the same interaction repeats across components, like press-and-hold or drag to select a range, write it once as a `create<Thing>(context, options)` behavior. Return the methods and slot bindings its consumers need, with cleanup in `bind`, and keep framework code out. Read two examples on the Behaviors pages first. If the chosen test seam is the behavior itself, use `mount` as shown in [testing.md](testing.md#test-a-primitive).

### 4. Render it

`createParts(primitive, { root: "div", item: "div" })` from `@ui-sdk/<framework>/primitive` returns `Root` and one part per tagged slot, typed from the primitive (`@ui-sdk/web` has `createParts`). Write your own part with `usePart` only when it renders something of its own, like a list from data, and a root with `usePrimitive`. The adapter only renders: no key handlers, focus moves, ARIA or `data-slot` in it. In React, the file that calls `createParts` starts with `"use client"`.

### 5. Make it agent-ready

For the resulting interface, connect the bridge and write the [agent test](agent-ready.md#prove-it-with-a-test).

## Compose ours

Two seams, both public:

- **Render ours inside yours, controlled from your state.** For a picker that opens in a Popover, your primitive owns `open`, ours renders with `open={state.open}`, and its `onOpenChange` forwards `reason`, `event` and `source` into your `change`. Use its props for the rest, like `initialFocus` on `PopoverContent`. Pass `initialFocus` explicitly when a specific field should take focus: in jsdom, the default focused the popup itself. See "Popups and layers" under Behaviors.
- **Wrap ours and add behavior from outside.** For an input that clears on Escape, render our Input inside a root slot of yours that hears keydown as it bubbles, and change ours through its public controller (`createInputController()`, or the element's `.api` in web components). Check `event.target` so only the part you mean counts.

Never bind a slot of yours to an element one of ours already binds. In React our attributes win, but in web components two owners write `data-slot` onto the same element.

## Rules

- Import only `@ui-sdk/core`, `@ui-sdk/core/<entry>`, each framework's primitive entry, and component entries. Never `@ui-sdk/core/internal/*`: only the ui-sdk repo resolves it. A type you can see only under `dist/foundation/<layer>/*.d.ts` and not in an entry, like `fuzzyFilter` in `foundation/text/fuzzy`, isn't public: rewrite it and record it as a gap.
- Key collection parts by a string `value` or `id` prop, never an index. Composite keys, like a grid cell's, join ids with a separator ids can't contain. Structural parts, like rows, need keys too.
- Expose state as ARIA and `data-*` attributes, never inline styles.
- No direction provider: read `isRTL(el)` when a key is pressed. `createRovingFocus` passes `rtl` to `move`.

## Other frameworks

Use the adapter at the same version as `@ui-sdk/core`. Follow the [main skill's setup rule](../SKILL.md#read-first) if it is missing. Read the adapter package's `docs/rendering.md` for how it renders a primitive.

**Web components** have no `primitive` entry. `createParts` comes from `@ui-sdk/web` itself. [web-components.md](web-components.md) covers what the types don't: component entries define their elements on import, how to find tag names and required inner markup, and how hidden parts differ from React.
