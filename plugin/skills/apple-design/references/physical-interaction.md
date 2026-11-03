# Physical interaction

Read for drag, swipe, momentum, springs, and interruptible sheets. Keep gesture tracking continuous, cancellable, and compatible with scrolling and keyboard alternatives.

## Track the user's movement

Use Pointer Events and `setPointerCapture` on a custom gesture surface. Respect the grab offset rather than snapping the element's center under the pointer. Track a short history of positions and timestamps to estimate release velocity. Handle `pointercancel` and lost capture so an interrupted gesture cannot leave the control stuck.

Give taps immediate feedback, commit on release, and allow cancellation by moving away. A small movement threshold, roughly 10 CSS pixels as a starting point, helps distinguish a drag from a tap. Consider plausible gestures from the first movement, then cancel incompatible interpretations once direction is clear. Avoid double-tap recognition when the task has no double-tap action because it delays single taps.

For custom horizontal gestures, `touch-action: pan-y` leaves vertical scrolling to the browser. For a vertical handle, `pan-x` leaves horizontal panning. Restrict `none` to surfaces that genuinely own every gesture axis. Preserve pinch zoom where it applies. Prefer native scrolling and scroll snap when they satisfy the task.

## Interrupt and redirect

Start a new animation from the presentation value. Read the live transform when interrupting an effect whose API does not already preserve it. Keep controls operable while the effect runs. Blend current velocity into the new target instead of hard-cutting at reversal. Independent X and Y springs can preserve different velocities on the two axes.

Springs are useful for continuous, velocity-aware retargeting. A fixed CSS transition or keyframe timeline alone does not supply gesture tracking and release-velocity handoff. Use the existing stack's measured behavior rather than prohibiting CSS transitions for unrelated, discrete states.

Apple's designer-facing starting points use damping ratio and response, not physical mass, stiffness, and damping:

| Interaction | Damping ratio | Response |
| --- | --- | --- |
| Reposition | 1.0 | 0.4 seconds |
| Rotation after momentum | 0.8 | 0.4 seconds |
| Momentum-driven sheet | 0.8 | 0.3 seconds |

A ratio of 1 is critically damped without overshoot. Lower ratios bounce. Start without bounce and reserve overshoot for an interaction whose momentum explains it. Response describes responsiveness, not a fixed settling duration.

The upstream Motion example uses `animate(element, { y: target }, { type: 'spring', bounce: 0, duration: 0.4 })`, or `bounce: 0.2` after a flick. This is an approximate design mapping, not equivalent physics. Check the installed Motion or Framer Motion version, supported options, and velocity behavior before using it. Do not install a library solely for this example.

## Release velocity and projection

Pass release velocity into the spring with the API's expected units. Some APIs take relative velocity:

```text
relativeVelocity = gestureVelocity / (targetValue - currentValue)
```

For 50 pixels per second over 100 remaining pixels, the relative velocity is 0.5 per second. Avoid division when remaining distance is zero. APIs accepting absolute velocity need the raw pixels per second instead. Verify which parameter the installed version accepts.

Choose a snap point from the projected endpoint rather than only the release position. The upstream exponential-decay projection is:

```js
function project(velocity, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}
const projectedEndpoint = currentPosition + project(releaseVelocity);
```

The velocity is pixels per second. Select a permitted snap point near that endpoint, then preserve release velocity during settling. A rate near 0.99 stops sooner. These values model a particular interaction, not a universal browser scrolling constant. Bound the result to the component's allowed destinations.

For a soft boundary, increase resistance with overshoot:

```js
function rubberband(overshoot, dimension, constant = 0.55) {
  return (overshoot * dimension * constant) /
    (dimension + constant * Math.abs(overshoot));
}
```

Use a positive component dimension. Resistance communicates the boundary without a frozen hard stop.

## Inspect frames and input

Use `requestAnimationFrame` when custom visual updates need a display-synchronized clock. Inspect per-frame positions, not just average frame rate. Very fast movement can strobe even at a steady rate. Add stretch or blur only when it communicates velocity and remains legible and performant in the target engine.

Exercise grab, release, reversal, cancellation, scroll arbitration, and a keyboard alternative in the actual UI. Under reduced motion, keep the manipulation usable while removing decorative settling and overshoot. Retain the existing Verify owner's actions and evidence rather than treating formulas or a loaded library as proof.
