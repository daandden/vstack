---
name: animation-performance
description: Browser-grounded diagnosis of dropped frames, rendering cost, and animation drivers.
disable-model-invocation: true
---

# Diagnose animation performance

Use this reference inside the current diagnosis or implementation task. The existing vstack owner retains probes, edits, review, verification, and evidence. Report findings without applying fixes unless the task authorizes them. This Addon creates no executor or separate animation plan.

Adapted from [emilkowalski/skills](https://github.com/emilkowalski/skills/tree/a81dbca07f2217b7103e510c0f13f8d5b017afc9/skills/animation-performance). The [MIT notice](LICENSE) ships here. For frequency, purpose, easing, interruption, and reduced motion, read skill://animate. Keep skill://good-css for other CSS and accessibility requirements.

## Measure the symptom first

Reproduce the actual interaction and workload before editing. Retain the engine and version, viewport, device or emulation, dependency versions, and the steps that trigger stutter. Capture a browser Performance recording, frame intervals, long tasks, or another signal that can distinguish the proposed cause. A screenshot alone cannot establish smoothness.

At 60Hz the frame interval is about 16.7ms. At 120Hz it is about 8.3ms. Measure the actual environment rather than assuming its refresh rate. Desktop CPU throttling approximates CPU pressure, not phone GPU throughput, thermal behavior, or memory constraints. State when a real-device recording remains unavailable.

Before changing the animation driver:
1. Identify the required behavior, outputs, and any explicitly required benchmark pressure.
2. Trace blocking work to those requirements. Remove it only after establishing that it serves none of them. Existing code or comments alone do not make work required.
3. Preserve required work and its results. Reduce its main-thread cost or report a conflict with the performance target.
4. Report removed workload separately from faster retained work.

Example: an empty comparison spin is removable when its load is not required. A calculation must retain its required result.

## Find the cause

| Symptom or observation | Investigate |
| --- | --- |
| Geometry changes on every frame | Layout work from height, width, padding, margins, or positional properties |
| Choppy shadow, color, or corner changes | Paint area and redraw cost |
| Stutter during navigation, loading, or hydration | Long tasks competing with a JavaScript frame loop |
| Hand-rolled React animation | State updates causing a render on every frame |
| Drag cost grows with content | Inherited custom-property updates invalidating descendants, or too many animated nodes |
| Motion shorthand stalls under load | The installed version's driver and acceleration eligibility |
| Large blur is slow | Filter area and engine-specific raster cost |
| A visible pixel shift at promotion | Layer changes, then a targeted `will-change` experiment |

Name a falsifiable cause before changing code. If the cause is unclear, follow the existing diagnosis owner's hypothesis and probing contract. Do not label an unexecuted hypothesis confirmed.

### Rendering work and visual equivalence

Layout determines geometry, paint draws pixels, and compositing combines layers. Transform and opacity are good initial choices because they can avoid layout and paint. They do not guarantee a promoted layer or smooth output. A blocked JavaScript frame loop can still stutter while writing only transform.

Other properties depend on engine, value, element, and workload. Filter, clip-path, and background-color may have accelerated paths in some browsers. Test the actual scenario. `box-shadow`, border-radius, and text color often require paint. Height and width can require layout, but a small disclosure can still meet its frame budget. Scaling is not equivalent when text must retain size or adjacent content must reflow. Replacing display with opacity alone leaves hidden controls focusable unless the lifecycle handles them.

For a shadow, compare a retained shadow faded by opacity or a supported drop-shadow filter against the original, including visual fidelity and measured cost. A filter is not universally cheaper. Keep blur and layer area small. The upstream's under-20px blur advice is a starting point, not an engine-independent threshold.

### Driver and main-thread work

A `requestAnimationFrame` callback competes with other main-thread JavaScript. CSS transitions, CSS keyframes, and WAAPI can hand eligible animations to browser-managed playback. They do not move layout work or arbitrary JavaScript off the main thread. Measure main-thread responsiveness and visible startup separately from steady playback; offloading playback does not prove blocking work or startup stalls are fixed. Test busy-page behavior before claiming acceleration.

For predetermined motion, prefer an existing CSS or WAAPI path when it removes a frame-loop bottleneck. Preserve dynamic input and interruption requirements. Gesture springs can justify a library even when a simpler predetermined effect would not.

Inspect installed library versions and consult matching documentation before changing APIs. Motion shorthand values such as `x`, `y`, and `scale`, full transform strings, and library `animate()` calls can use different paths across versions. Do not declare all React Motion playback main-thread or all full transform strings accelerated from the spelling alone. No library installation is required by this reference.

### React and inherited custom properties

For a hand-rolled animation, compare per-frame state updates with an existing motion value or direct style update through a ref. Preserve declarative functional state and cleanup. Do not move every state change out of React merely because one loop is expensive.

An inherited CSS variable written on a large parent can invalidate styles across descendants. Probe with small and large content, then compare writing the animated element's transform directly. A registered non-inheriting property or a different dependency tree can behave differently, so measure rather than generalizing from the variable name.

### Layer hints last

Use `will-change` only for an observed promotion issue or measured improvement after cheaper causes are ruled out. Target the animated element, not every node or a page-sized container. Release a temporary hint when its use ends. Layers consume memory, and browsers can decline promotion. A hint cannot repair a long task or make layout compositable.

## Reconcile the rules with evidence

Under ADR 0051, selected Emil animation guidance takes precedence over good-css's animation advice. Good-css's remaining styling and accessibility requirements still apply. Within Emil guidance, a broad transform-and-opacity-only rule does not prohibit browser-supported clip-path, filter, or intrinsic-size techniques by itself.

For a disputed technique, record the applicable narrower guidance, target-engine support, observed behavior, measured cost, and any fallback or unavailable engine. Retain a blocking verdict when an applicable rule and evidence justify it. One Chromium run does not establish Safari, Firefox, a phone, or every application stack.

## Return evidence to the owner

For each finding, give its element and file location, confirmed cause or remaining hypothesis, before and after behavior, workload, numeric measurements with units and samples, and evidence paths. Separate code inspection from executed browser and device proof. Report remaining gaps explicitly.

Observe the final interaction, rapid reversal, cancellation, keyboard, and reduced-motion paths as applicable. Preserve semantic state, focus, and readable content while improving performance. Do not infer success solely from a property swap, a loaded skill, or a fast development machine.
