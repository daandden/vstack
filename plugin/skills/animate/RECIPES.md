# Motion recipes

Read the matching section while implementing that component. Reuse the timing tokens from [the construction guidance](SKILL.md). Apply its keyboard, reduced-motion, hover, dependency, and browser requirements to every example. These patterns adapt the pinned UI upstream's companion reference.

## Press feedback

A pointer press can transition `transform 160ms var(--ease-out)` to `scale(0.97)`. Scaling also scales the label and icon. Put movement inside `prefers-reduced-motion: no-preference`. Give keyboard and reduced-motion users immediate nonmoving feedback. `:active` works on touch. Hover needs its own fine-pointer gate.

## Dropdown, popover, menu, and select

Use opacity and a scale near 0.95 over about 200ms. Set the transform origin to the trigger's position using the actual component's supported API. Base UI versions exposing `--transform-origin` are one example, not a dependency requirement. Keep focus management and arrow-key behavior with the existing semantic component. Ensure hidden or exiting content cannot receive unintended focus.

## Tooltip

Use the same trigger-relative origin with scale near 0.97 and about 125ms. An initial hover delay prevents accidental activation. Once a tooltip is open, adjacent tooltips should skip the delay and entrance motion. Preserve keyboard-accessible information and dismissal. Do not make critical information hover-only.

## Modal

A modal can remain centered and enter with opacity and scale near 0.96 over 250ms. Fade its backdrop in the same interval. Keep the actual dialog's focus entry, focus restoration, Escape, and modal behavior. Coordinate the exit with the component lifecycle so removing it does not cut the effect off or leave a focus trap behind. Keyboard opening can be instant.

## Drawer and sheet

Use `translateY(100%)` for a bottom drawer's closed position and zero for its open position. The percentage follows the drawer's own size. Start below 300ms with the drawer curve, and justify longer travel with observation. A dragged drawer also needs the gesture rules below. Preserve scroll, focus, dismissal, and the correct nonanimated state.

## Toast

Use a transition so another trigger can retarget it. A toast entering from below also exits below. `@starting-style` can express its entry where supported. When the target lifecycle requires it, a mount state can express the same transition. Coordinate stacking height and opacity by observing real additions and removals. The upstream 400ms `ease` toast is a component-specific example, not a default for routine UI. Keep status announcements and avoid delaying access to actions.

## Disclosure and collapse

A height and opacity transition around 200ms can preserve document flow where scaling would distort text or fail to move following content. Keep the animated region clipped. Measure content size only when the target engine and lifecycle require it. Supported intrinsic-size interpolation or an existing semantic disclosure may avoid a measurement script. Validate entry, exit, dynamic content, focus, and rapid reversal in the target browser. Layout cost needs measurement, not a blanket ban.

## Group entrance

Use one entrance per container. For an occasional group, keep the container still when its children enter. Start near an 8px translation with opacity, and vary the delays, for example 0, 50, 90, and 120ms. Use the total timing budget and role guidance in skill://choreograph. Omit decorative stagger under reduced motion and on frequently visited lists. Never block interaction while an entrance plays.

## Hold to confirm

A clipped overlay can show deliberate progress without resizing the button:

```css
.hold-fill { clip-path: inset(0 100% 0 0); }
@media (prefers-reduced-motion: no-preference) {
  .hold-fill { transition: clip-path 200ms var(--ease-out); }
  .hold:active .hold-fill {
    clip-path: inset(0);
    transition-duration: 2s;
    transition-timing-function: linear;
  }
}
```

The visual fill alone must not execute a destructive action. Handle pointer cancellation and early release in the owning control. Provide an accessible keyboard alternative, such as an explicit confirmation. Use nonmoving progress or text for reduced motion.

## Tab indicator and color continuity

A clipped active-state copy can reveal coordinated text and background without independently interpolating colors. Transition an inset clip around 250ms with ease-in-out. Keep the duplicate presentation `aria-hidden`, inert, and without duplicate IDs or focusable controls. Keep one semantic tab list and correct selected state, keyboard navigation, and panels. Measure geometry on layout changes. This is a browser-qualified clip-path pattern, not a guarantee of compositing in every engine.

## Scroll reveal

On explanatory marketing content, an inset clip can reveal once over about 600ms with ease-in-out. Use an IntersectionObserver only if the existing stack needs one. Avoid hiding content when JavaScript fails, repeating the animation every time the reader scrolls past, or applying this delay to functional daily UI. Reduced motion should reveal immediately.

## Drag to dismiss

Write the dragged element's transform directly. Capture the active pointer, reject additional pointers, and release capture on end or cancellation. Distinguish a flick from a slow movement using distance and elapsed time. The upstream's 0.11px/ms velocity threshold is an example to tune against real gestures, not a universal dismissal threshold. Apply increasing resistance beyond boundaries rather than an abrupt wall. A spring can settle with carried velocity if the installed library supports it. Preserve a non-gesture dismissal control and reduced-motion behavior.

## Crossfade

If overlapping states cannot blend cleanly with opacity alone, a small blur around 2–5px can soften the overlap. The upstream's under-20px guidance is a starting limit, not a performance guarantee. Keep the affected area small and measure its paint cost, especially on Safari. Keep readable states and honor reduced motion.

## Programmatic playback

WAAPI can animate a reveal without another dependency:

```js
const playback = element.animate(
  [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0)' }],
  { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'both' },
);
```

Check reduced motion before starting. Handle cancellation and completion without stale callbacks overwriting a newer state. Persist the final semantic state rather than relying solely on a retained animation. WAAPI permits browser-managed playback, but support and the animated property determine actual acceleration. Observe the target browser under the task's workload.
