---
name: gestures
description: "Use when building or fixing web drag, swipe, fling, reorder, pull-to-refresh, hold-to-confirm, or sheet interactions that lag behind the pointer, jump on release, or cannot be interrupted."
---

# Build direct manipulation

Apply this guidance to the current web interaction. The existing vstack owner retains scope, edits, planning, review, verification, and evidence. Audit-only work stays read-only; implementation needs the owner's selected scope. This Utility skill creates no separate executor or final proof authority.

Adapted from [Emil Kowalski's gestures](https://github.com/emilkowalski/skills/tree/7cdf99421429c0a47d2cf9fbf40497b7ee0a3e5c/skills/gestures). The [MIT notice](LICENSE) ships here.

## Reuse the existing component

Use the project's existing accessible gesture solution. When the project already depends on Vaul, prefer its compatible drawer or bottom-sheet primitive over rebuilding drag, momentum, overlay progress, focus trapping, and Escape handling. Otherwise keep the installed stack. This skill requires neither Vaul nor another dependency. A new dependency needs the owner's normal explicit approval.

Before using any library API, inspect the application's dependency and version and consult matching documentation. Examples below describe behavior, not a stack-independent API contract.

## Separate tracking from release

While the active pointer is down, map movement 1:1 to its displacement. Use an existing motion value or direct transform writes on the moving element. Do not add easing, duration, or a spring to ordinary tracking; that makes the element trail the pointer. Apply resistance only beyond a boundary. An elastic factor near 0.2 is one starting point where the installed library supports it, not a universal API.

Avoid a React render for every pointer move. Keep the functional state declarative, but update high-frequency presentation through the supported motion value or element ref. Updating an inherited custom property on a large parent can invalidate descendants; compare direct element transforms under the actual workload instead of assuming every custom property is expensive.

On release, let physics finish the movement. Prefer a retargetable spring seeded with measured release velocity. Combine distance and velocity: passing roughly 40–50% of travel can dismiss, but a short fast flick can also count. Match direction and units before comparing a library's velocity. For example, a threshold of 500 px/s is not 500 px/ms. Tune thresholds to the actual component and prevent a flick toward the open state from dismissing.

Keep bounce small and normally limited to gesture release. A button-driven close has no gesture momentum and should not inherit that bounce. Smaller elements can need more bounce than large ones for the same apparent effect. A rejected dismissal snaps back promptly. If the element only repositions and should stop where released, disable automatic momentum where the installed API permits it.

## Preserve interruption and linked state

A user can catch a closing sheet and drag it back. Retarget from the visible position and preserve velocity when the driver supports it. Restarted keyframes are unsuitable for gesture-touched motion that must be caught. Transitions or a correctly retargeted spring can maintain continuity; test rather than assuming a driver's name proves it.

Derive overlay opacity and any background scale from the same drag progress. In an installed compatible Motion version, a motion value and `useTransform` can express this relationship. Do not start an independent overlay animation that drifts when the user reverses. Keep underlying semantic open state, focus, and exit/unmount behavior correct during interruption.

Capture the active pointer, retain its identity, and ignore extra pointers until the gesture ends. Handle release, pointer cancellation, and lost capture. Preserve native scrolling outside the intended gesture. For a vertical drag with horizontal scrolling allowed, `touch-action: pan-x` is one possible policy; inspect the actual scroll region and gesture ownership. Exempt interactive children from drag initiation.

## Existing Vaul sheets

Only when Vaul is already a dependency, inspect its current primitive and styling API. Its edge-attached iOS-style sheet uses a steep `cubic-bezier(0.32, 0.72, 0, 1)` curve over about 500ms. A small floating drawer can use roughly 200ms with a curve such as `cubic-bezier(0.165, 0.84, 0.44, 1)`. Match overlay, resizing, and content swaps to the same timing family.

Use `data-vaul-no-drag` for interactive descendants only when the installed version supports it. Preserve the primitive's focus trapping, Escape, cancellation, and close lifecycle. A CSS settle can be appropriate even though a custom momentum-driven release generally uses a spring. Reconcile the actual behavior rather than imposing contradictory driver rules.

## Direction, hold, and accessibility

Dismiss along the entrance axis toward the edge the element came from. A toast entering from below can dismiss downward. Keep spatial meaning consistent with the user's action and the component's opening state.

For a deliberate hold-to-confirm, use linear progress so time remaining stays honest. Release before completion resets promptly with ease-out rather than inheriting the long deliberate duration. Provide a keyboard alternative. A hold animation does not authorize a destructive action; the current owner's confirmation boundary still applies.

Keep targets at least 44×44px where possible, enlarging the hit area without forcing visual layout growth. Gate hover effects behind `@media (hover: hover) and (pointer: fine)`. Retain semantic controls, visible focus, accessible names, user zoom, and reachable actions.

Under reduced motion, direct tracking may remain because it follows the user's manipulation. Remove decorative movement, bounce, and long momentum flings. Settle promptly, with an instant change or short supported position or opacity response. This gesture-specific exception does not restore decorative movement in other reduced-motion paths.

## Observe and return evidence

Exercise tracking, short flicks, long slow drags, direction reversal, catching mid-close, boundary resistance, extra pointers, cancellation, scrolling, keyboard use, and reduced motion as applicable. Preserve component state, focus restoration, unmount cleanup, and overlay synchronization. Use a physical phone for claims about touch reliability or high-refresh hardware. Desktop emulation and trackpad input prove only their own scenarios; unavailable hardware stays unavailable.

For a stutter, use skill://animation-performance and measure the actual workload. For an unclear timing or continuity problem, record and inspect frames. Increasing damping can help an unsuitable spring, but it cannot repair an expensive tracking loop. Report the source location, driver, thresholds with units, observed behavior, and evidence limits through the current owner's format. A loaded skill and code inspection are not UI proof.

Under ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css, which amends ADR 0051, Emil-derived guidance holds over good-css for CSS and animation. Resolve disagreements among Emil skills through browser-specific behavior and observed evidence, including the tracking exception above. Preserve skill://review-animations' evidence-backed blocking verdicts and the existing final Verifier's proof ownership.
