# Animation audit criteria

Use these eight categories for surveyed motion. Values below are source recommendations, qualified by interaction, actual dependency versions, target browsers, and ADR 0051. A search hit is an investigation candidate, not a finding by itself. Read skill://review-animations/STANDARDS.md for the shared review bar and skill://animation-performance for measured rendering questions.

## 1. Purpose and frequency

Name the purpose of each effect: spatial continuity, state indication, feedback, explanation, or preventing a jarring change. Decoration alone rarely justifies frequent motion.

| Frequency | Starting decision |
| --- | --- |
| Keyboard-initiated or 100+ times/day | Keep the functional response instant |
| Tens/day | Remove or drastically reduce unnecessary motion |
| Occasional | Standard purposeful motion can be useful |
| Rare or first-time | Delight can earn a larger budget |

Inspect command palettes, list navigation, hover effects, and repeated toggles first. Deletion is often the best remedy. Preserve useful occasional motion rather than removing everything.

## 2. Easing and duration

When assessing easing or duration, read the Easing and Duration sections of skill://review-animations/STANDARDS.md for the shared curves, component budgets, and qualified exceptions. Compare custom curves with existing repo tokens before proposing changes. Inspect tooltip delay plus animation, especially after the first tooltip in a toolbar.

## 3. Physicality and origin

For scale entrances, prefer scale(0.9–0.97) with opacity over scale(0). Trigger-anchored popovers generally originate at the trigger. Centered modals are exempt. A pure fade is valid, especially for reduced motion. Press feedback can use scale(0.97), with the subtle source range 0.95–0.98, and a 160ms ease-out transition when the interaction warrants motion. Do not add scaling to an intentionally instant keyboard action.

Base UI's origin variable is a library-dependent example. Inspect the installed version and component API before prescribing it.

## 4. Interruptibility

Test actual reversal and repeated triggering. CSS transitions retarget current values. Restarted keyframes can jump. Retargetable springs can preserve gesture velocity, but correct cancellation and state ownership matter for every driver.

For supported CSS entry, consider `@starting-style`; an existing mounted-state convention may be needed in other targets. Motion spring recommendations such as `{ type: "spring", duration: 0.5, bounce: 0.2 }` depend on the installed API. Bounce 0.1–0.3 is a starting range, not a universal requirement. The source's approximate dismissal velocity of 0.11 distance units/ms requires confirming coordinate units and interaction intent. Do not substitute it blindly for the application's gesture policy.

Deliberate holds can be slow while release or cancellation snaps back. Check stale completion handlers, exit/unmount ownership, focus, and asymmetric timing.

## 5. Performance

Prefer transform and opacity where they preserve the effect. Investigate layout, paint, blur, `transition: all`, parent-variable invalidation, per-frame rerenders, and rAF work. Browser-managed CSS or WAAPI may avoid main-thread driver delays, but neither API guarantees compositing.

The source's blanket property-only rule conflicts with its clip-path and layout examples. Resolve this through skill://animation-performance and observed target-browser behavior. Before Motion 14.2, `x`, `y`, and `scale` shorthands use a main-thread frame loop; consider an upgrade or full transform string when busy-page behavior fails. From 14.2 the HTML shorthand path can be accelerated, so the shorthand alone is not a finding. In every version, inspect layout animations, `onUpdate`, `transformTemplate`, inertia, and motion-value-driven values as main-thread paths. Measure workload and user impact. Interpolation proves neither GPU execution nor acceptable frame cost.

The source recommends keeping transient blur below 20px, especially on Safari. This is a heuristic requiring measurement, not proof that 19px is cheap or 21px always blocks.

## 6. Accessibility

Under reduced motion, remove positional, scaling, and decorative stagger effects. An instant state change is valid. Retained opacity or color feedback can aid comprehension but is not mandatory. Preserve meaningful loading and completion information even when motion disappears. Scripted motion observes the same preference using the actual stack's supported API.

Gate hover motion behind `@media (hover: hover) and (pointer: fine)`. Verify keyboard focus and instant activation. A hidden or closing element must not strand focus or remain unintentionally operable.

## 7. Cohesion and tokens

Match the product's personality and consolidate genuinely duplicated near-identical motion values through existing tokens. A source recommendation of 30–80ms stagger applies only to suitable occasional group entrances. Stagger is decoration and never delays interaction. Do not flag every unstaggered list as deficient.

Subtle blur around 2px can mask a visibly doubled crossfade when supported and measured. Neither blur nor crossfade is required. Record the actual overlap before proposing it.

## 8. Missed opportunities

Consider jarring content swaps, spatially connected panels, or rare meaningful completion. Apply skill://find-animation-opportunities rather than assuming that instant state is wrong. Percentage translation uses the element's own dimensions. A supported inset clip-path can reveal content without scaling text. Layout animation needs stack-specific support and performance assessment.

Return a small evidence-backed opportunity list separately from existing-motion defects. Include rejected candidates and their deciding gate. Missing browser evidence remains uncertainty, not a confirmed feel defect.
