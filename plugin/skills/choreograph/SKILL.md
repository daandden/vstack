---
name: choreograph
description: "Use when coordinating several web animations, staggered entrances, view swaps, multi-step transitions, rich-state morphs, or moving elements and their siblings as one interaction."
---

# Coordinate motion

Apply this guidance when several elements move in response to the same event. Keep the current task's stack and scope. The existing vstack owner retains implementation, planning, review, verification, and evidence. An audit remains read-only until its owner obtains an explicit selection. This Utility skill starts no executor, plan-status system, or separate review gate.

Adapted from [Emil Kowalski's choreograph](https://github.com/emilkowalski/skills/tree/7cdf99421429c0a47d2cf9fbf40497b7ee0a3e5c/skills/choreograph). The [MIT notice](LICENSE) ships here. Read skill://animate for a single effect's purpose, easing, duration, and origin. Use skill://find-animation-opportunities or skill://remove-animations when deciding whether motion belongs at all.

## Inventory before choosing delays

List the elements that move on the event, with their source locations. Assign each a role:

| Role | Treatment |
| --- | --- |
| Lead | The one element that carries the change; it starts first and travels furthest |
| Support | Secondary content follows with smaller, shorter movement |
| Decoration | Fade in place or stay still |
| Static | Keep still, including a container whose content already moves |

If two elements compete to lead, resolve the visual hierarchy instead of compensating with more animation. A panel entrance normally carries its already-visible content. Do not add a second layer of child entrances. Remove moving parts before adding delay.

Never stagger frequent or keyboard-triggered UI such as command palettes, menu rows, repeated list navigation, or tab content. Interaction stays available as soon as content is visible; decorative timing never holds back a control.

## Choose the relationship

For each moving pair, choose deliberately:

- Together is the default for one visual object or one moment. An item exits while siblings close its gap. A view exits while its replacement enters.
- Overlap fits meaningful order when simultaneous content remains legible. Reading order or cause and effect can justify a stagger; DOM order alone cannot.
- Sequence fits content that would visibly collide or become unreadable together. Dense views in a container changing width and height may need the old content to leave first. Start the second effect just before the first settles when that preserves clarity.
- Carry fits children whose path is controlled by shared layout. Move the destination container and let its children follow rather than tuning every child separately.

Take an exiting item out of layout at removal so its siblings can close the gap during its exit. Preserve the element's current position and dimensions. With an installed compatible Motion version, `AnimatePresence` with `mode="popLayout"` is one approach; without a library, position the retained exit at its measured offset. Keep focus and semantic removal consistent with the component lifecycle.

A normal view swap crossfades. A rich two-dimensional morph can sequence instead, or use the carefully isolated duplicate-view approach in [RECIPES.md](RECIPES.md). Children and container share a timing family so they read as one object. A lighter content curve can keep a crossfade visible without an unrelated easing family.

## Set timing by role and event

For an occasional product group, start with 30–80ms offsets and a total near or below 300ms. Cap a long list's delays after the first handful; item twenty must not wait twenty offsets. A rare marketing entrance can justify 100–150ms offsets and 0.5–0.6s entrances when motion conveys the message.

Avoid a mechanical stagger in which every item has identical delay increments, distance, duration, and easing. Group a title and first paragraph into one beat when appropriate. Let importance set order and reduce distance for support. Direction follows reading direction or the initiating event. The budgets are starting points, not a reason to add motion.

Tie each secondary effect to the lead's start, impact, or settle rather than an arbitrary delay. Click feedback starts on click, not on the preceding hover. Accents can finish in the final fifth of the lead's motion, with roughly 40ms offsets where useful. Repeat actions skip already-completed buildup while retaining the internal timing relationships.

For variable-size changes, scale duration with distance and clamp it. For example, a resize fade can use a delta divided by 500, bounded to 0.15–0.27 seconds. Small elements may need more bounce than large ones for the same apparent effect. For a small finite set of states, hand-tune transition pairs rather than introducing a formula that cannot be adjusted locally.

## Preserve direction and interruption

Forward and Back convey opposite directions. Resolve direction for the actual reading order and user's mental model. A close exits toward its entrance. All items leave together, shorter and simpler than entry; do not reverse-stagger a dismissal. With compatible Motion APIs, pass current direction through `custom` on both `AnimatePresence` and the exiting child so it does not reuse stale mount-time direction.

Test retriggering halfway through, rapid Next or Back, and switching menus during entry. Stop or retarget in-flight effects before another sequence begins. Stable unique keys distinguish retained exits from new children. Completion callbacks from an older run must not overwrite the newest state.

Await every reset effect before resuming an idle loop. A nonrendered animation bookkeeping flag can live in a ref in React; functional controls remain usable without waiting for decorative buildup. An attention loop, only when purpose and frequency justify it, can wait about 2.5s initially and about 6s between runs. Pause it during interaction and resume only after reset. Cancel timers and animations on unmount.

Under reduced motion, collapse the choreography rather than merely shortening it. Remove movement and delays, show the group together, and retain useful opacity feedback or an instant change. If the sequence itself explains a process, jump between meaningful frames.

## Implement and report through the owner

Use the lightest existing tool. CSS indexed delays suit one-shot entrances. Compatible Motion variants and stagger helpers suit state-driven groups. Imperative orchestration is for multiple events that genuinely require awaited completion, not a simple list entrance. Read [RECIPES.md](RECIPES.md) for these cases. Inspect installed dependencies and consult matching docs before using library APIs; this guidance authorizes no installation.

Record the timing plan before editing. A table of element, role, start, duration, movement, and relationship can help, but use the current owner's output format. State what stays still and why. Return source locations and the exact moments that still need recording.

Observe the final UI, ordinary input, keyboard, rapid reversal, cancellation, unmount, and reduced motion through the existing Verify owner. Slow playback or inspect frames for overlap and ordering, then restore production timings. Code inspection does not prove the group reads correctly, and one engine does not prove every browser or device.

Under ADR 0074-emil-derived-skills-are-visible-utility-skills-and-hold-over-good-css, which amends ADR 0051, Emil-derived guidance holds over good-css for CSS and animation. Reconcile disagreements among Emil skills through browser-specific behavior and observed evidence. Preserve skill://review-animations' blocking verdicts when an applicable rule and evidence justify them. Do not replace the owner's review or final Verifier.
