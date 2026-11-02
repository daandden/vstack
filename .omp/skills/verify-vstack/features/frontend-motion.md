# Frontend motion

Existing frontend implementation and diagnosis paths reach animate and animation-performance conditionally through good-css. Native main and delegated work must apply that guidance to a runnable interaction, with browser observations rather than property-name assertions.

## Sub-features

- `motion-main`: an ordinary implementation task constructs short, purposeful motion and diagnoses stutter.
- `motion-worker`: the existing vstack-worker reaches the same guidance and makes real edits.
- `motion-interruption`: pointer reversal, keyboard activation, cancellation, and reduced motion preserve the final functional state.
- `motion-measurement`: a repeatable browser workload demonstrates the problem and the effect of the fix.
- `motion-browser-conflict`: supported clip-path playback reconciles a broader property-only rule under ADR 0047.

## How to get to it (user POV)

- Start an existing implementation task that includes interaction motion or animation performance. Do not invoke an extra UI command.
- Delegate the same frontend task to the existing vstack-worker role without naming UI Addons in its brief.
- For a stuttering animation investigation, use the existing diagnosing-bugs path. It conditionally reaches animation-performance while retaining diagnosis ownership.

## Driving it with native omp and the browser

Preconditions:

- Follow [frontend guidance](frontend-guidance.md) for Doctor, fresh native RPC processes, complete-plugin loading, Session model provenance, isolated skill discovery, public maintenance commands, packaging, and final gates.
- Keep fixtures, original snapshots, full native histories, RPC frames, commands, and observations under the proof run. Use no new dependencies without approval.
- Open every browser tab with a unique name, `app: { tern: false }`, and an explicit viewport. Record the actual backend and engine. Capture full-resolution lossless WebP and ARIA using `../SKILL.md`.

### Build and diagnose through existing paths

1. Create a vanilla HTML/CSS/JS delivery page with a button-controlled disclosure, real checkbox, tracking-preview button, moving parcel, and status. Record that its dependency set is empty and retain the actual source. Deliberately drive the 1500ms, 300px tracking preview through rAF with a 90ms busy loop per frame. The original disclosure can toggle instantly.
2. Before plugin changes, run a fresh native main-session task against a copy. Retain the actual reads, edits, and behavior. Do not interpret a good baseline implementation as a regression or proof that imported guidance caused quality.
3. Measure the original app through real controls. Sample rAF intervals for the preview and record status and final transform. A 50ms maximum-gap check should fail on the deliberate 90ms workload. Retain raw samples. Observe the disclosure's state and lack of motion separately.
4. On the changed plugin, copy the same original app into a new directory and fresh native session. Send this task through the implementation entry:

   ```json
   {"type":"prompt","message":"/skill:implement Polish this existing delivery frontend. Give the occasional Delivery options disclosure purposeful short interruptible motion, instant keyboard use, and reduced motion. Evaluate a supported clip-path reveal that keeps text unscaled. Fix the tracking-preview stutter without changing its 1500ms duration or final 300px position. Preserve semantics and cancellation. Keep the vanilla stack, no packages. This throwaway task has an agreed browser seam observed by the parent. Do actual main-session edits without delegation. No Flow, commit, branch, push, installation, or machine changes. The parent owns browser measurement and publication."}
   ```

5. Run another identical copy in a fresh native session. Have the existing owner delegate edits to one vstack-worker with its existing single-subagent form. Pass the allowed fixture tree, resolved vstack root, and Scratch. Leave Addon names out of the worker brief. If the worker cannot start, report that path unmet rather than doing its work in the coordinator.
6. Preserve the typed implementation expansion and actual native tool executions. Inspect the worker's saved history as well as the coordinator's frames. Identify actual reads of good-css, animate, its relevant recipes, and animation-performance, plus the resulting edits. A pointer list is not enough.

### Observe behavior and performance

- Through real controls, open, close, and reopen each resulting disclosure. Capture the intermediate clip-path and running playback, then final expanded state and visible content. Use a timeline or Performance trace to support the observation. Do not stretch production timings to hide a defect.
- Reverse quickly before completion. The newest state must win without stale completion callbacks hiding a reopened panel. Check that a closing panel does not leave hidden focusable content available.
- Activate with Enter or Space and inspect both visible state and focus. The repeated keyboard path should be instant. Emulate reduced motion, reload, and exercise both controls. Observe no positional movement while completion and functional state remain honest. Also test a preference change during playback where supported.
- Run the same frame-gap measurement after the native fix. Retain duration, distance, sample count, raw gaps, final position, and status. Name the actual cause and changed workload. Removing the deliberately useless busy loop is valid here. It does not prove retained production work became cheaper or every animation is composited.
- Set the preference explicitly for each observation. If a wrapper reapplies its default media preference between calls, set `page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }])` and exercise the UI inside the same `tab.run`. Verify `matchMedia` in the retained sample. Preserve an initial reduced-motion observation rather than mislabelling its lack of movement a failed animation.
- Measure a supported clip-path reveal in the actual engine. Compare its narrower recipe guidance with the broad transform-and-opacity-only statement under ADR 0047. Retain the computed intermediate clip, playback timings, final visibility, frame samples, and accessibility state. A property-support query alone does not prove rendering or acceleration.
- Capture screenshots and ARIA for main, worker, and reduced-motion states. Preserve trace and measurement errors as evidence. Scope results to the observed browser and workload, not every engine or physical phone.

### Distribution and maintenance

Run the existing public register, preparation, catalog, validation, test, load, and packaging interfaces described in frontend-guidance. Inspect the package inventory for both motion skill folders, animate's `RECIPES.md`, and their MIT notices. Compare notice bytes with the actual Pin. Confirm the six excluded contributions remain absent and the existing vstack prototype is unchanged. Run final maintenance gates after the last product edit.

## Gotchas

- A transform-only rAF animation can still stutter behind a long task. A property swap without measurement is not proof.
- CSS and WAAPI permit browser-managed playback but do not guarantee compositing for every property or value.
- Inspect actual fixture dependencies before making Motion, React, Base UI, or other library claims. Vanilla browser APIs require no third-party runtime.
- Native baseline and changed runs can choose different valid implementations. Preserve what each actually did rather than claiming a causal quality score.
- A missing browser, model, worker history, or engine stays unavailable or unmet. Do not replace it with stub echoes, source assertions, or repeated unchanged stochastic runs.
- Keep principle-only implementation and worker judge scopes unchanged. Only existing conditional skill references activate this non-principle guidance.
- Close only this run's tabs and servers. Keep raw evidence outside the clone for the delivery owner.
