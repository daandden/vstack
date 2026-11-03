# Component details

Use these patterns after the frequency and purpose decision in [design engineering](../SKILL.md). Examples are CSS patterns, not a replacement for the application's component API.

## Press feedback and entry

A subtle press scale gives immediate confirmation. Keep movement within the no-preference branch and provide nonmoving feedback in the base style.

```css
.button:active {
  background: var(--button-pressed);
}

@media (prefers-reduced-motion: no-preference) {
  .button {
    transition: transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
  }
  .button:active {
    transform: scale(0.97);
  }
}
```

Keep repeated keyboard activation instant. Where the component distinguishes keyboard and pointer input, limit decorative press motion to the pointer path.

Enter from a visible shape, such as `scale(0.95)` with opacity zero, rather than `scale(0)`. Scale changes the text and children too. Consider that distortion when choosing it over a translation or a different effect.

## Anchored components

A popover scales from its trigger, while a centered modal keeps a centered transform origin. Use the placement or origin value that the installed positioning library actually supplies. Base UI can expose `--transform-origin`; verify the component and version before relying on it. A hand-positioned component needs an origin matching its actual placement.

Tooltips should wait on the first hover to avoid accidental activation. Within an already active tooltip group, show the next one immediately. A library's instant-open state can set `transition-duration: 0ms`; use its documented attribute rather than inventing one. Make the content reachable with keyboard focus too.

## Retarget interrupted states

CSS transitions retarget from the current interpolated value. They are a useful default for rapid toggles and notifications. Entry keyframes can restart on remount, which can jump during rapid reversal. Keyframes and the Web Animations API also support playback control; inspect how the existing implementation handles interruption before replacing it.

`@starting-style` can define the initial style for a new element without a mount-effect state update:

```css
@media (prefers-reduced-motion: no-preference) {
  .toast {
    opacity: 1;
    transform: translateY(0);
    transition: opacity 200ms ease-out, transform 200ms ease-out;
    @starting-style {
      opacity: 0;
      transform: translateY(100%);
    }
  }
}
```

Check target-engine support and the display lifecycle for dialogs or popovers. Keep the nonanimated state functional where starting styles are unsupported. Use the existing mount-state technique only when needed by the target browser or component lifecycle. Percentage translation is relative to the element's own box, so `translateY(100%)` can hide a drawer of varying height without a fixed pixel offset.

## Crossfades and coordinated changes

Try timing and easing first. If a crossfade still looks like two objects overlapping, a small blur, such as `blur(2px)`, can soften that overlap. Measure the actual rendering cost, especially in Safari. Keep blur small, below 20px, and omit it when it harms clarity or performance.

When height and opacity change together, inspect their coordination in the actual list rather than assuming matching durations produce a good result. Preserve layout continuity and readable content. This is an evidence-qualified use of layout animation, not an exception inferred from a blanket GPU claim.

## Clipping and transforms

`clip-path: inset(top right bottom left)` clips a rectangle inward from each edge. `inset(0 100% 0 0)` hides it from the right and `inset(0)` reveals it. Useful applications include a progress overlay, a comparison slider, and an active-tab color treatment. A duplicated active tab strip must remain decorative and hidden from accessibility APIs; keep one semantic interactive tab list.

A hold overlay can fill linearly during a deliberate press and reset faster on release. The visual fill alone must not perform a destructive action or replace the owner's confirmation and accessible activation contract.

For a one-time image reveal, an existing intersection observer or installed library's visibility hook can trigger the state. Keep the image available without animation and respect reduced motion. Do not add scroll decoration to frequently used functional content without a purpose.

`rotateX`, `rotateY`, and `transform-style: preserve-3d` can create depth without a JavaScript animation loop. Match the transform origin to the object's anchor. These are optional visual tools, not required decoration.

## Stagger and component cohesion

Use a short stagger, about 30–80ms between items, only when it helps an occasional group entrance. Do not block interaction or leave content invisible while a decorative entrance runs. Remove the stagger for reduced motion and repeated navigation.

Component quality depends on consistent defaults and reliable edge cases. For notifications, pause dismissal timers when appropriate while the document is hidden, preserve hover across gaps in a stack, and retain pointer capture during a drag. Apply these general lessons from Sonner without importing its library-specific API or installation workflow.

Match the effect to the component's purpose and surrounding design. A slightly slower, restrained notification can be appropriate while the same timing would slow a keyboard command palette. Naming and documentation examples can make a reusable component easier to understand, but do not expand a UI task into a new library or documentation site.
