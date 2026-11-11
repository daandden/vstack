# Choreography recipes

Use these patterns only for the interaction selected under [SKILL.md](SKILL.md). Values are starting points. Reuse installed dependencies and check their versions before using APIs. Every recipe retains semantic state, keyboard behavior, reduced motion, cancellation, and unmount cleanup through the current task owner.

## Overlap with CSS indexed delays

For a rare one-shot entrance, give the title and first paragraph the same index, then assign later beats to support. A per-element `--i` and shared step can compute the delay without a class for each item:

```css
.entrance > * {
	animation: enter 0.6s ease both;
	animation-delay: calc(120ms * var(--i));
}
@keyframes enter {
	from { opacity: 0; transform: translateY(10px); }
}
@media (prefers-reduced-motion: reduce) {
	.entrance > * { animation: none; }
}
```

Keep resting styles visible. `backwards` holds the first keyframe during a delay; `forwards` holds the end. Use `both` only when both are needed, not to conceal an incorrect final application state. Omitting `to` targets the resting style. Vary roles or beat spacing rather than making every item identical. A one-time inherited delay variable is different from per-frame updates across a large descendant tree.

## Overlap with Motion variants

When the installed Motion API supports it, a parent variant can use `delayChildren: stagger(0.06, { ease: "easeOut" })`. The helper's `from` can express center-out or an initiating item's index. Older versions can expose `staggerChildren` instead. Confirm the actual API.

Role variants control distance and duration separately from start delay. A rare lead can rise 12px over 0.5s, support 6px over 0.4s, and decoration only fade over 0.3s. Those marketing values do not replace the shorter product budgets. Cap long-list delays around the first six items, keeping the total product group near 300ms. Remove movement and delay under reduced motion.

## Together on item removal

In a compatible Motion list, use `AnimatePresence mode="popLayout" initial={false}`, stable item keys, and retained item exits such as opacity zero with scale 0.95 over about 0.2s. Sibling layout motion begins while the item exits. Layout animations remain main-thread in every Motion version; observe cost rather than claiming the layout flag is accelerated.

Without a library, read the item's current offset and size before removal. Retain the exit as absolutely positioned in a positioned parent and let siblings reflow, or use the project's existing FLIP mechanism. Preserve focus transfer and prevent an exiting control from remaining unintentionally interactive. Remove the retained node after completion and on cancellation or unmount.

## Together in a resizing container

Measure the new content using the project's existing measurement mechanism. Compare its height with the previous committed measurement. A fade duration in seconds can use `min(max(abs(newHeight - oldHeight) / 500, 0.15), 0.27)`. Keep measurement bookkeeping out of render-time mutation. Match the container's timing family, with a lighter content curve where needed.

A compatible Motion implementation can crossfade stable keyed children in `AnimatePresence mode="popLayout" initial={false}` while animating the measured container height. Use the actual framework's lifecycle and cancel stale completion handlers. Include the surrounding drawer's timing when the container is one part of it. Height animation is a measured layout trade-off, not proof of compositor playback.

## Direction-aware steps

Keep current step and direction together. With compatible Motion APIs, set `custom={direction}` on both presence owner and child. The exit must read the latest direction, not the direction captured on mount. Forward and Back move opposite ways, adjusted to the interaction's reading direction. A large illustrative slide may use 110% travel; small or similar views often need only a crossfade and about 8px of shift. Related controls follow the container's height change in the same timing family.

## Sequence a drawing

For a rare explanatory drawing, normalizing SVG paths with `pathLength="100"`, dasharray 100, and dashoffset 100 makes the initial hidden path explicit. Animate the square's dashoffset to zero, then the checkmark's. A 0.6s square and 0.4s checkmark can overlap by starting the latter around 0.5s rather than waiting for a full stop. Retain completed strokes through underlying state or appropriate fill behavior. Under reduced motion, jump to meaningful frames or the final state. These durations are not suitable for repeated checkbox feedback.

## Morph two rich states

When overlapping dense content in a container changing both dimensions becomes unreadable, prefer sequence, such as compatible Motion's `mode="wait"`. A crossfade can instead retain an entering view and a separate absolutely positioned exit copy. Make the decorative copy noninteractive, inaccessible, and free of duplicate DOM ids. Only the current semantic view owns focus and controls.

Tune the exit's scale toward the destination size and center, with per-state-pair values for a small finite state set. Smaller states can use more bounce than large ones. Retarget or remove both copies during reversal, cancellation, and unmount. Do not turn visual duplication into duplicate form submission or two mounted interactive views.

## Carry shared-layout children

When the library controls a `layoutId` path, move the destination parent to affect where children arrive. One source example moves the destination by 73px after 0.13s, over 0.3s; tune those numbers to the actual geometry. Reveal a container's front face just before items land so they do not pass visibly through it. Treat shared layout as a main-thread path and measure the full scene.

## Imperative coordination across events

Use an installed imperative helper such as Motion's `useAnimate` only when hover, click, reset, and idle events truly require awaited groups. Scope selectors to the component, for example with `data-animate` attributes. Keep handles for every running effect and stop or retarget them before the next sequence.

Await `Promise.all` for the entire reset rather than one convenient effect. Use a generation token or cancellation check before an awaited continuation starts another loop or changes readiness. An old hover completion must not mark a newer reset ready. A bookkeeping ref can avoid per-phase renders; it must not disable functional controls while decoration runs.

Start justified idle motion after about 2.5s and repeat rarely, around 6s between runs. Track the loop with other animation handles and cancel it, pending continuations, and timers on unmount. Test rapid enter, leave, click, repeated click, reduced-motion changes, and teardown. Return the recordings and remaining limits through the existing owner, not a separate choreography report system.
