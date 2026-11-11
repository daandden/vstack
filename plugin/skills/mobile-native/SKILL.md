---
name: mobile-native
description: "Use when building or reviewing mobile-web touch behavior, viewport height, safe areas, hover, inputs, scrolling, or browser chrome. Not React Native, Expo, or Swift development."
---

# Mobile web

Make the existing web UI usable on a phone. Despite its retained Upstream name, this is mobile-web guidance, not React Native, Expo, or Swift development. The running vstack skill and its workers retain edits, planning, review, verification, and evidence ownership. Keep the current stack and user scope.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/mobile-native). The [MIT notice](LICENSE) ships with this skill.

## Apply where the symptom applies

Use CSS and platform capabilities before device sniffing or JavaScript workarounds. Touch and mouse can coexist. Gate behavior by capability rather than guessing input from screen width or user-agent strings. Each fix needs its reason. Selectable content, zoom, scrolling, semantic controls, and keyboard operation remain available.

| Area | Check and response |
| --- | --- |
| Touch | Give immediate press feedback, preserve release activation and cancellation, and provide usable hit targets. Use `touch-action: manipulation` on ordinary tappable controls where appropriate. |
| Viewport | Use `dvh` for an app shell that tracks changing browser chrome. Use `svh` for a stable hero. Keep content and actions reachable after resizing and in landscape. |
| Safe areas | Pair `viewport-fit=cover` with `env(safe-area-inset-*, 0px)` padding on edge-attached chrome and sheets. Preserve ordinary spacing as well as the inset. |
| Hover | Put every hover effect inside `@media (hover: hover) and (pointer: fine)`. Keep touch press and keyboard focus feedback independent. |
| Inputs | Keep input, textarea, and select text at least 16 CSS pixels where iOS focus zoom applies. Preserve user zoom and choose appropriate field types and keyboard hints. |
| Scroll | Use `overscroll-behavior` only where scroll chaining or pull-to-refresh interferes with app behavior. Prefer native scrolling and scroll snap to custom gesture code. |
| Browser chrome | Match supported `theme-color` metadata to the actual top surface and theme. Installed-PWA behavior needs its own observation. |

Read [platform fixes](references/platform-fixes.md) before implementing any matching row. It supplies the declarations, capability caveats, and distinctions between native scrolling and custom gesture surfaces. Viewport and safe-area handling are separate checks, not alternatives.

For direct manipulation, interruptibility, materials, or Apple-derived web feedback, read skill://apple-design. For motion choices, use skill://emil-design-eng under ADR 0051. These are conditional references within the existing task, not new workflows or dependency requirements.

Emil-derived guidance takes precedence over good-css for CSS and animation under ADR 0074, which amends ADR 0051. Reconcile disagreements among Emil skills using browser-specific behavior and observed evidence. Preserve skill://review-animations' blocking verdicts when the applicable rule and evidence justify them.

## Observe the result

Exercise applicable behavior in all five core areas: touch, viewport, safe areas, hover, and inputs. Record non-applicability with its reason. A document without edge-attached controls can need no extra safe-area padding, but that conclusion still requires inspection. Exercise both precise-pointer and coarse-pointer paths where the browser supports them, keyboard use, reduced motion, focus, cancellation, and the narrow action row.

Record the actual application's dependencies and versions before relying on library-specific guidance. A vanilla app does not validate Tailwind, Next.js, Motion, or a component library. Consult installed-version documentation only for APIs the task uses.

Retain the project's Verify actions, ARIA snapshots, full-resolution lossless WebP, browser backend and engine, and actual outcomes. Emulation can exercise layout, media queries, and browser input behavior. It does not establish physical touch feel, mobile Safari input zoom, real browser-chrome collapse, a software keyboard, nonzero notch insets, status-bar appearance, or installed-PWA behavior.

Use hardware and remote debugging when available. On iOS, use Safari's device inspector. On Android, use Chrome's device inspection. Open the dev server on the phone only within the user's existing network and permission scope. Test landscape, keyboard-open state, and older hardware where relevant. When hardware is unavailable, identify the observed web scope and leave those checks unavailable. Do not call emulation universal native-device proof or silently require a new installation.

Report the symptom, changed file and declaration with the reason, observed behavior, and remaining device checks in the existing owner's output format. Keep evidence ownership with that owner rather than replacing its report with an abbreviated imported format.
