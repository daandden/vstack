---
name: setup-app-verification
description: "Generate a project-local Verify skill for live proof in implement's END-STATE step 4. Standard mode writes a .omp/skills/verify-* dir. Private mode uses the vstack root."
disable-model-invocation: true
---

# Set up app verification

A Verify skill drives the app as a user and captures proof. Write it for an agent reading it cold, mid-task.

Use the vstack root and mode from the Private-mode rule. A subagent uses the root from its prompt. Resolve Scratch through `skill://vstack-tmp` at the top level, or use the Scratch dir from the parent.

## 1. Interview the repo

Read the code and docs before any question through `ask`. Find:

- The app and every user-facing surface, such as web, CLI, TUI, desktop, API, mobile, or library. Name the primary surface and the rest.
- The repo's documented build and launch commands, ports, environment, seed data, and auth.
- The repo's own driving harness. Use it first. Otherwise use omp `browser` for web and Electron, acting by ARIA role and name. Use bash with `pty` for CLI and TUI, and `curl` for services. Add helper scripts only for a step those tools cannot express.
- The evidence that proves the action and resulting state, including side effects.
- Whether isolated instances can run side by side. Refuse to double-drive a shared instance when ports, data, or profiles cannot be isolated.

Run the build and launch as found. If the checkout does not build or start as-is, report the exact failure and stop. Product fixes go through `skill://diagnosing-bugs` or `skill://implement`. The one exception is an irrelevant missing asset, such as a static directory the API never serves or a sample configuration. The generated skill can create it as marked verification scaffolding, and must remove it in cleanup.

## 2. Generate the Verify skill

In Standard mode, write `.omp/skills/verify-<app>/SKILL.md` in this checkout. In Private mode, write `<vstack root>/skills/verify-<app>/SKILL.md`. Create an absolute symlink at this checkout's `.omp/skills/verify-<app>` to that directory. Add the literal line `.omp/skills/verify-*` once to the file returned by `git rev-parse --git-path info/exclude`. Leave shared ignore files unchanged. Never overwrite a conflicting directory or link. Report the conflict instead.

If an existing Private-mode skill has no link, re-create the link. Read its SKILL.md by absolute path for the rest of this session. omp discovers a new link in the next session.

Generated frontmatter has `name: verify-<app>` and a description that names the app, every surface, and when to use it. Omit `disable-model-invocation` so live proof can choose a Verify skill by surface.

Ground every section in the repo. Leave no placeholders:

- Launch gives the exact command, readiness signal, and teardown. Launch reaches a usable state from an empty data dir, including any migrations and seed data. Ready means usable, not only that a process answers. For example, a database health check can pass while its init scripts still run. A short-lived CLI or TUI builds once and uses an isolated PTY session per drive.
- Doctor gives one read-only instance check for process, version or build, port ownership, and auth. Run it first whenever anything looks off.
- Drive gives real commands and stable handles, not coordinates or tab order. Use the interview's harness choice.
- Evidence requires the real user path, not internal setters or test-only endpoints. Capture the action and resulting state, not just the final screen. Prove files, rows, or messages alongside the visible result. Use mocks only at a production boundary that isolates the external system. Observe what a dry-run skips through files, network, or git refs. Do not trust its name.
- Cleanup tears down only instances the run created, never processes selected by name. Remove run residue, but keep proof evidence and run notes.
- Helpers names executable scripts relative to the skill's own directory, the directory its SKILL.md was read from. Show each invocation in the body. Do not bake checkout paths into helper calls.

The generated Evidence section resolves a fresh run entry at `<Scratch dir>/verify/<app>-<run-id>/`. Evidence and notes go at its top level. Throwaway app data goes in `data/`. Both modes use this Scratch path, never committed. Cleanup can remove disposable data, but must preserve evidence and notes at the named paths.

For browser screenshots, capture full-resolution PNG with `tab.screenshot({ format: "png", silent: true })`. Convert it losslessly in eval and read the WebP path:

```js
await Bun.write(out, await new Bun.Image(await Bun.file(pngPath).bytes()).webp({ lossless: true }).bytes());
```

Set `out` to the capture path with `.webp`. Add `selector` or `fullPage` when needed. Select the `iframe` element for iframe content. The final proof image is lossless WebP, with no resize.

## 3. Seed the feature map

Write `features/README.md` and one file per identified user-facing feature in the Verify skill directory. Start with the top 3–5 from routes, commands, menus, or docs. Read `references/feature-map-example/` for the shape, then substitute the real app's facts and harness.

The README indexes the features and states baseline preconditions, driving conventions, and proof and skip reporting. Each feature starts with its title and user-visible behavior. Use these four H2s in order:

1. `Sub-features` lists behavior IDs.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with <harness>` names preconditions, actions, exact commands, and observable proof.
4. `Gotchas` names traps that invalidate the run.

If the seed data lacks a precondition that a journey needs, the journey reports a failure, and that feature's `Gotchas` names the reason. Never weaken the journey to make it pass. Keep implementation details out of the map. A proof through one entry point does not prove another listed entry point.

## 4. Prove the generated skill

Run its instructions end to end once: launch, Doctor, drive one mapped feature, capture evidence, and clean up. Make sure that evidence still exists at its named location after cleanup. Fix failed instructions and run cleanup after every failed iteration. Do not strand processes or ports. Stop on broken app behavior instead of editing product code. An unexecuted Verify skill is not a deliverable.

If you proved it in a stand-in for the real target, such as a container in place of a fresh VM or a local stack in place of a remote one, list every setup step that the stand-in did and the target will not. Those steps stay unverified until a run on the real target covers them.

## 5. Report

Report the skill path, changed files, surfaces, feature map, proof paths, and any stand-in setup steps that stay unverified. implement commits the Standard-mode output. Private-mode output stays untracked, including the link and exclude file. Upkeep uses `skill://maintain-app-verification`. State a cadence only when the user requests one.
