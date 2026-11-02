---
name: review-animations
description: Evidence-backed motion review with blocking findings for applicable animation defects.
disable-model-invocation: true
---

# Review animations

Apply Emil Kowalski's motion-review bar inside the current review. The existing review owner retains scope, reviewer delegation, finding format, blocking decisions, verification, and evidence. This Addon neither starts a flow nor edits the application. Review non-motion code through the existing owner.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/review-animations). The [MIT notice](LICENSE) ships alongside the adaptation.

Read [STANDARDS.md](STANDARDS.md) before judging motion. It supplies the frequency table, precise curves, duration budgets, spring and gesture guidance, rendering qualifications, and accessibility rules. Inspect every changed animation and any unchanged interaction needed to establish its behavior.

## Review posture and authority

A transition can run correctly yet regress responsiveness, continuity, or comfort. Flag genuine defects rather than assuming that working code earns approval. A high craft bar is not permission to manufacture violations from taste.

The selected Emil guidance takes precedence over good-css for animation under ADR 0048. Keep skill://good-css responsible for other CSS, focus, semantics, layout, and accessibility. Reconcile disagreements within Emil's guidance using the target browser and observed evidence. In particular, the broad transform-and-opacity preference does not by itself prohibit clip-path, blur, layout animation, or a library shorthand. Establish the actual dependency version, rendering path, support, cost, and user impact before making a performance claim. A supported technique is not automatically cheap, and a transform is not automatically composited.

## Examine the interaction

For each animation, establish its purpose, frequency, input path, and target engines. Check these standards with the companion's conditions:

1. Justify motion through spatial continuity, state indication, feedback, explanation, or avoiding a jarring change. Decorative motion on a frequently used action can block.
2. Keep keyboard-initiated and 100+/day interactions instant. Remove or greatly reduce motion on tens/day actions.
3. Use responsive entry and exit easing. Slow-start ease-in on an ordinary UI response delays the moment users watch most.
4. Keep ordinary UI motion below 300ms unless distance or purpose justifies the longer duration. Apply the component-specific budgets rather than treating every drawer above 300ms as a violation.
5. Scale anchored popovers from their trigger. Prefer scale(0.9–0.97) with opacity to scale(0). Centered modals are exempt from trigger-origin rules. An opacity-only reduced-motion alternative is valid.
6. Test rapid reversal, repeated triggering, and gestures. Transitions or retargetable springs usually preserve continuity better than restarted entry keyframes.
7. Prefer transform and opacity for inexpensive motion. Investigate other properties with browser-specific evidence, including the companion's clip-path examples, rather than imposing a blanket GPU-only ban.
8. Honor reduced motion by removing movement, positional effects, scaling, and decorative stagger. An instant change is valid. Gate hover motion behind fine-pointer hover capability.
9. Distinguish deliberate holds from system responses. A long confirmation fill can be appropriate while release and cancellation should snap back promptly.
10. Match motion to the product and component. Prefer deletion when an effect adds no useful information. Judge crossfades, blur, and stagger in the actual interface, not from a universal requirement to add them.

Inspect `transition: all`, scale(0), ease-in, long UI durations, keyboard/high-frequency effects, wrong origins, restart-prone keyframes, inherited animation variables, layout properties, missing reduced motion, ungated hover, and symmetric hold/reset timing first. These are investigation triggers. Cite the applicable condition and observable harm before treating one as blocking. Do not turn a pure fade, built-in easing, or absence of stagger into a hard violation without an applicable reason.

## Establish evidence and decide

Use the project's existing Verify workflow and review evidence contract. Observe the ordinary input path, keyboard path, reduced motion, and interruption when relevant. Retain browser identity, actions and outcomes, ARIA, and full-resolution lossless WebP evidence under the owner's Scratch. Every verification browser open uses `app: { tern: false }`; record the returned backend and engine. Claim only the stack, browser, and scenario actually exercised. Missing browser access or an unreadable dependency stays unavailable, not clean.

For uncertain feel, inspect slow playback or individual frames. A later fresh look can help, but it is not a prerequisite that postpones the current review. For a rendering claim, use appropriate trace or frame evidence; visual interpolation alone proves neither GPU compositing nor absence of dropped frames.

Return each finding in the existing owner's format with its location, applicable standard, observed behavior, impact, proposed remedy, evidence, and explicit blocking decision. In code-review, use its Standards axis and `blocking` field, and retain all other axis states. The coordinator and delegated Standards reviewer both read this Addon when motion is in scope. Do not replace the owner's authoritative finding cards with a second mandatory table or independent gate. A Before | After | Why comparison can support a finding when useful.

Prioritize feel-breaking regressions, unnecessary motion, demonstrated performance problems, interruption/timing, origin/cohesion, and accessibility. Prefer remedies in this order when they address the defect: delete, reduce, fix easing, correct origin, preserve interruption, change the rendering approach, fix asymmetric timing, then polish. Accessibility defects remain blocking regardless of where they appear in that list.

Preserve blocking authority. Block a demonstrated keyboard/high-frequency animation, slow-start or otherwise feel-breaking response, missing reduced-motion movement handling, or an applicable rendering defect with user impact and an effective remedy. An evidence-backed defect is not advisory merely because it concerns motion. Approve the assessed motion only when applicable standards are met and necessary evidence is available. Keep a supported browser-specific exception nonblocking, explain why the broad rule does not settle it, and state unassessed performance or engine limits separately.
