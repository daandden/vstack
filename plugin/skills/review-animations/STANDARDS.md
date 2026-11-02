# Animation standards

Use these values and conditions in motion findings. Adapted from Emil Kowalski's design-engineering guidance. The authority rules in [SKILL.md](SKILL.md) apply ADR 0047 and travel with the distributed plugin.

## Purpose and frequency

| Frequency | Default |
| --- | --- |
| 100+ times/day, including command palettes and shortcuts | Instant, without opening or closing motion |
| Tens/day, including list navigation and hover | Remove or drastically reduce motion |
| Occasional dialogs, drawers, and notifications | Short, purposeful animation |
| Rare onboarding or explanatory moments | More expressive motion when it serves the content |

Keep keyboard-initiated actions instant. Valid purposes include spatial continuity, state indication, explanation, feedback, and avoiding a jarring change. Decoration alone does not justify repeated delay. A functional state change must remain immediate and usable during an effect.

## Easing

Choose ease-out for entry and exit, ease-in-out for on-screen movement, ease for hover or color, and linear for constant progress. Ease-in starts slowly and delays ordinary UI feedback. Start with these curves and compare them in the actual interaction:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);
```

Built-in easings can be too weak for a deliberate effect. Their presence alone does not establish a defect, especially for color or an opacity-only accessibility alternative. Consult [easing.dev](https://easing.dev/) or [easings.co](https://easings.co/) rather than inventing arbitrary curves.

## Duration

| Component | Starting budget |
| --- | --- |
| Press feedback | 100–160ms |
| Tooltip or small popover | 125–200ms |
| Dropdown or select | 150–250ms |
| Modal or drawer | 200–500ms, justified by size and distance |
| Explanatory marketing motion | Can be longer when it serves comprehension |

Keep ordinary UI animation below 300ms by default. The drawer range is a qualified exception, not a contradiction to resolve by blocking every longer drawer. Once a tooltip is open, adjacent tooltips should skip the first delay and animation. A faster spinner can change perceived wait, not actual completion time. Keep pending state honest.

## Physicality

- Start an ordinary scale entrance at scale(0.9–0.97) with opacity rather than scale(0).
- Anchor popover, dropdown, and tooltip origins to their trigger. Base UI's `var(--transform-origin)` is an example only when the installed primitive supplies it. Centered modals retain a centered origin.
- A press scale of 0.95–0.98, such as scale(0.97) with a 160ms ease-out response, can provide feedback when motion is appropriate. Provide nonmoving feedback for reduced motion and repeated keyboard use.
- Translate percentages use the moving element's own size. `translateY(100%)` follows that element's height. Scale also scales children, including text and icons.
- CSS rotateX/rotateY with preserve-3d can express depth without a JavaScript animation loop. Test flattening and rendering in the target browser.

## Springs and interruption

Springs can preserve velocity during reversal and suit momentum, drag, or deliberately playful interactions. Starting examples, only for a compatible installed animation library:

```js
{ type: "spring", duration: 0.5, bounce: 0.2 }
{ type: "spring", mass: 1, stiffness: 100, damping: 10 }
```

Keep bounce subtle, usually 0.1–0.3, and avoid it in ordinary dashboard responses. Decorative mouse tracking can use a spring rather than direct position assignment. Confirm the library version and its parameter model before recommending these APIs. They are not native Web Animations API options or a reason to install a library.

CSS transitions retarget from the current interpolated state. Recreated entry keyframes often restart from their first frame. Test rapid toggles and repeated notifications rather than assuming every keyframe is defective. A spring also needs correct state and cancellation handling to preserve continuity.

`@starting-style` can supply a starting state for entry without a JavaScript mount effect when the target browser supports it. For example, transition opacity and transform from opacity zero and translateY(100%) into their resting values. Use the duration budget for that component. Framework mount-state fallback patterns belong only in a project that actually uses that framework.

## Deliberate holds and gestures

A deliberate hold fill can take 2s linear while release resets in about 200ms ease-out. Provide an accessible keyboard alternative to pointer holding. Cancellation and system responses must not inherit the deliberate delay.

For drag:

- Combine travel distance with velocity. Distance divided by elapsed milliseconds gives px/ms. Roughly 0.11 px/ms is a starting flick threshold, not a universal constant.
- Dampen movement past a boundary with increasing resistance rather than an invisible hard stop.
- Capture the active pointer so dragging continues outside the element.
- Ignore extra pointers until the active drag ends. Test pointer cancellation as well as release.

## Rendering and browser-qualified exceptions

Transform and opacity are preferred starting points because they can avoid layout and paint. Compositing depends on the browser, effect, layer state, and surrounding work. Animated width, height, padding, margin, and positional properties commonly cause layout or paint. Establish the measured cost and user impact in this context before blocking them for performance.

The broad upstream GPU-only rule conflicts with its own clip-path, blur, and list-height examples. Resolve that disagreement through browser support and observed behavior, not by deleting the examples or prohibiting every other property.

- `clip-path: inset(...)` can reveal content, fill a hold overlay, clip an active tab copy, or drive a comparison slider. Observe interpolation, endpoints, reversal, and reduced motion in the target engine. Browser support alone does not prove off-main-thread execution.
- WAAPI can control browser-native effects without a library. For example:

  ```js
  element.animate(
    [{ clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0)" }],
    { duration: 200, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
  ```

  Apply this only on an appropriate input path with reduced-motion handling and cancellation. Not every WAAPI effect is composited.
- A small blur, such as 2px, can bridge an otherwise visibly doubled crossfade. Keep it below 20px as a starting limit, and measure cost, especially on Safari. Blur is an option, not an obligation to animate expensive filters.
- Height plus opacity in entering and exiting lists can preserve useful spatial continuity. Assess the actual layout cost and interruption behavior.
- An inherited custom property used to drive a child's transform can invalidate styles across descendants. Prefer updating the moving element directly when that avoids observed recalculation. Check registration and inheritance before claiming that every custom property causes a storm.
- Framer Motion or Motion x/y/scale shorthands have version- and effect-dependent rendering paths. Inspect the actual installed dependency and current documentation. A full transform string can change acceleration eligibility, but neither spelling proves GPU execution. Use a busy-main-thread trace when that is the claimed failure.
- CSS or WAAPI predetermined effects can avoid JavaScript frame-loop work. Dynamic gestures may need JavaScript or a library spring. Assess the actual path rather than claiming all CSS is off-thread or all JavaScript animation stutters.

## Stagger, accessibility, and cohesion

A group entrance can use 30–80ms offsets. Longer delays feel slow. Stagger is decorative and must not gate interaction. Omit it under reduced motion and on high-frequency or keyboard paths. An all-at-once entrance is not automatically a defect.

Under `prefers-reduced-motion: reduce`, remove movement, scaling, positional changes, and decorative stagger. A brief opacity or color change can aid comprehension, but an instant change is valid. A pure fade is not a physicality failure in this branch. Guard hover motion with `@media (hover: hover) and (pointer: fine)` so touch does not acquire false hover effects. Preserve semantic controls, focus, accessible names, cancellation, and status feedback.

Match personality and timing to the product. A playful interaction can tolerate bounce; a professional dashboard usually needs crisp responses. A subtle notification can use ease when that fits its behavior. Inspect crossfades, clipping, and group timing in context.

## Evidence when uncertain

Use slow playback or frame-by-frame inspection for continuity, origin, and coordinated timing. A disposable slowed copy is diagnostic evidence, not the shipped duration. Use traces for layout, paint, frame drops, and compositor claims. Real-device gesture evidence requires an actual device; desktop emulation does not prove it. A fresh look can help, but missing evidence remains explicit in the current review. Validate every library-specific claim against the application's actual dependency version and report the observed browser and scenario limits.
