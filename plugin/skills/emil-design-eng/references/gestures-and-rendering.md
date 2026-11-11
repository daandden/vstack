# Gestures and rendering

Use this reference for drag, springs, and animation diagnosis. The running task owner retains implementation and verification.

## Springs

Springs are useful for momentum, drag dismissal, and gestures that reverse before settling. A spring implementation that retains velocity can reverse smoothly. Check the installed library's retarget behavior rather than assuming every spring does so.

Decorative mouse-following effects can benefit from a spring instead of snapping directly to each pointer position. A functional graph may be clearer without that interpolation. If Motion is already installed, use the installed version's motion-value and spring APIs. Feed a motion value or a supported input, not an unverified arithmetic expression copied from another version.

Some libraries offer duration-and-bounce controls, such as a 0.5s duration with 0.2 bounce. Others use mass, stiffness, and damping. Start with subtle bounce, around 0.1–0.3 where that API applies, and normally omit bounce from functional UI. Use the project's existing solution; a spring is not a reason to install a dependency.

## Drag behavior

- Dismiss based on distance or a sufficiently fast flick. Measure distance in pixels and elapsed time in milliseconds before comparing velocity. The upstream example uses about 0.11 px/ms, a starting point to test with the actual component rather than a universal threshold. Guard zero elapsed time and include direction so a flick toward the open state does not dismiss.
- Dampen movement beyond a boundary instead of abruptly stopping it. Increasing drag distance should produce progressively less displacement.
- Capture the active pointer so dragging continues when it leaves the element. Handle release, cancellation, and lost capture.
- Track the first pointer's identity and ignore additional touch points during that drag. Otherwise a second finger can jump the element to a different position.
- Preserve native scrolling and a keyboard alternative. Test the interaction on physical touch hardware when claiming touch reliability. Browser emulation alone does not prove device behavior.

## Rendering choices

Transform and opacity are usually good starting points for inexpensive motion. They can avoid layout and paint when the engine composites the element. Compositing is conditional, not guaranteed. Width, height, margins, and padding generally require layout. An occasional layout effect can still be appropriate when measured and coordinated with content.

A clip-path reveal, blur, or Web Animations API call is not automatically GPU-accelerated. Performance depends on the shape, property, engine, layer allocation, content, and competing work. Under ADR 0051, investigate supported browser behavior before issuing a blocking verdict. Record the browser, device or emulation, workload, and observed frames or trace.

Changing an inherited CSS custom property on a parent can invalidate descendant styles. For a high-frequency drag, compare updating the target element's transform directly with updating an inherited variable. Avoid unnecessary descendant work, but measure the actual tree before claiming a regression.

From Motion 14.2, shorthand transforms such as `x`, `y`, `scale`, and `rotate` on HTML elements can use an accelerated transform animation. Before 14.2, they use a main-thread frame loop; consider an upgrade or an explicit transform string when that causes stutter under load. Layout animations (`layout`, `layoutId`), `onUpdate`, `transformTemplate`, inertia, and motion-value-driven values remain main-thread in every version. Inspect the installed version and capture the actual workload. A full transform string can use an accelerated path in every version, but no property spelling proves compositor execution.

Prefer CSS transitions for known state changes and use JavaScript where dynamic input or playback control requires it. CSS animation of a compositable property can continue during main-thread work, but CSS layout animation still needs main-thread work. The Web Animations API provides programmatic playback without an extra library; it has the same property-specific rendering constraints.

```js
const animation = element.animate(
  [{ opacity: 0, transform: 'translateY(8px)' },
   { opacity: 1, transform: 'translateY(0)' }],
  { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
);
```

Apply this only in the appropriate input and reduced-motion branch. Keep the element's underlying style correct after completion, and cancel or retarget the animation when state reverses. Do not use `fill: forwards` to conceal an incorrect final application state.

## Observe the result

Use the project's Verify and diagnosis tools. Slow playback by two to five times, or inspect frames in the browser animation tools, to see an incorrect origin, overlapping crossfade, or properties that finish at different times. Restore production timing before final proof.

Exercise rapid open, close, and reopen, cancellation during a gesture, keyboard activation, and reduced motion. For performance claims, capture the actual workload, including competing script or page-load work. Record an unavailable engine or physical device honestly. Evidence from one browser does not establish every engine's rendering behavior.
