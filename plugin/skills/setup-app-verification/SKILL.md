---
name: setup-app-verification
description: "Generate a project-local Verify skill for implement's END-STATE checks in steps 4 and 6b. Standard mode writes a .omp/skills/verify-* dir. Private mode uses the vstack root."
disable-model-invocation: true
---

# Set up app verification

A Verify skill drives the app as a user and captures proof. Write it for an agent reading it cold, mid-task.

Use the vstack root and mode from the Private-mode rule. A subagent uses the root from its prompt. Resolve Scratch through `skill://vstack-tmp` at the top level, or use the Scratch dir from the parent.

Follow `skill://flow-page`'s "Stage entry/exit line" and "Every ask in a Flow" for all user questions through `ask`, including Flow CLI publication and separate answer recording. Follow skill://implement/END-STATE.md's "Publish delivery progress". Track the steps below as tasks. Preserve the caller's requested End state. Standalone uncommitted setup uses `none`. Keep the generated Verify skill and feature map as real deliverables.

In Standard mode, this run commits its output in step 5. If the caller states that it commits the output, as implement does, hand the output back uncommitted. Private mode commits nothing. A committing run is a Standard-mode run whose caller does not commit the output. It runs the commit script with the bash tool, from inside the repo:

```sh
bun "$(realpath skill://setup-app-verification/scripts/commit.ts)" <args>
```

Below, `commit.ts` stands for this command.

## 1. Interview the repo

Read the code and docs before any question through `ask`. Find:

- The app and every user-facing surface, such as web, CLI, TUI, desktop, API, mobile, or library. Name the primary surface and the rest.
- The repo's documented build and launch commands, ports, environment, seed data, and auth.
- The repo's own driving harness. Use it first. Otherwise use omp `browser` for web and Electron, acting by ARIA role and name. Use bash with `pty` for CLI and TUI, and `curl` for services. Add helper scripts only for a step those tools cannot express.
- The evidence that proves the action and resulting state, including side effects.
- Whether isolated instances can run side by side. Refuse to double-drive a shared instance when ports, data, or profiles cannot be isolated.

Run the build and launch as found. If the checkout does not build or start as-is, report the exact failure and stop. Product fixes go through `skill://diagnosing-bugs` or `skill://implement`. The one exception is an irrelevant missing asset, such as a static directory the API never serves or a sample configuration. The generated skill can create it as marked verification scaffolding, and must remove it in cleanup.

## 2. Generate the Verify skill

On a committing run, run the dirty check before you write anything. The dirty check runs `commit.ts state --app <app>`, which prints `mode`, `dir`, and `dirty` as JSON. When `dirty` is true, tell the user that `<dir>` has uncommitted changes and that the commit is going to include them. Call `ask` with the options Go on and include them, and Stop so I can commit them first. On Stop, stop. A timed-out answer is not the user's. Re-ask once with `again`, and if that times out too, stop. Unavailable questioning grants no approval.

In Standard mode, write `.omp/skills/verify-<app>/SKILL.md` in this checkout. In Private mode, write `<vstack root>/skills/verify-<app>/SKILL.md`. Create an absolute symlink at this checkout's `.omp/skills/verify-<app>` to that directory. Add the literal line `.omp/skills/verify-*` once to the file returned by `git rev-parse --git-path info/exclude`. Leave shared ignore files unchanged. Never overwrite a conflicting directory or link. Report the conflict instead.

If an existing Private-mode skill has no link, re-create the link. Read its SKILL.md by absolute path for the rest of this session. omp discovers a new link in the next session.

Generated frontmatter has `name: verify-<app>` and a description that names the app, every surface, and when to use it. Omit `disable-model-invocation` so END-STATE step 4 can choose a Verify skill by surface.

Ground every section in the repo. Leave no placeholders:

- Launch gives the exact command and readiness signal. For a long-lived server, require a named bash service `verify-<app>-<run-id>` with a `ready` log pattern or port check. Use the run id of this run's Scratch entry, record the resolved service name in its notes, and use it through Cleanup. Set the bash `cwd` to the checkout under test. Launch reaches a usable state from an empty data dir, including any migrations and seed data. Ready means usable, not only that a process answers. For example, a database health check can pass while its init scripts still run. A short-lived CLI or TUI builds once and uses an isolated PTY session per drive.
- Doctor gives one read-only instance check for process, version or build, port ownership, and auth. Run it first whenever anything looks off.
- Drive gives real commands and stable handles, not coordinates or tab order. Use the interview's harness choice.
- Evidence requires the real user path, not internal setters or test-only endpoints. Capture the action and resulting state, not just the final screen. Prove files, rows, or messages alongside the visible result. Use mocks only at a production boundary that isolates the external system. Observe what a dry-run skips through files, network, or git refs. Do not trust its name.
- Cleanup tears down only instances the run created, never processes selected by name. For a long-lived server, stop it with `write` to `proc://<name>/kill`, using the exact service name recorded at Launch. Keep concurrent runs' service names, ports, and data separate. Never restart or stop another run's service. Remove run residue, but keep proof evidence and run notes.
- Helpers names executable scripts relative to the skill's own directory, the directory its SKILL.md was read from. Show each invocation in the body. Do not bake checkout paths into helper calls.

The generated Evidence section resolves a fresh run entry at `<Scratch dir>/verify/<app>-<run-id>/`. Evidence and notes go at its top level. Throwaway app data goes in `data/`. Both modes use this Scratch path, never committed. Cleanup can remove disposable data, but must preserve evidence and notes at the named paths.

Give each mandatory proof action a stable step ID, its required preconditions, and its passing observation. Distinguish optional observations from required journeys and negative probes before execution. Callers and Verifiers use these IDs under `skill://ship/references/verdict-record.md`.

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

## 5. Commit

On a committing run, take the title from the repo's convention. Read `git log --format=%s -n 20` on the default branch (`git symbolic-ref --short refs/remotes/origin/HEAD`, else the current branch) and follow the pattern you see there. When no convention is visible, use `chore: set up verify-<app>`. Run `commit.ts commit --app <app> --title "<title>"`. It stages only `.omp/skills/verify-<app>/`, deletions included, and commits it alone on the current branch. Anything else the user had staged stays staged. It prints `commit`, `title`, and `dir` as JSON, with `commit` null when nothing changed. Exit 2 means it refused. Show its message.

## 6. Report

Report the skill path, changed files, the commit or the caller that commits the output, surfaces, feature map, proof paths, and any stand-in setup steps that stay unverified. Private-mode output stays untracked, including the link and exclude file. Upkeep uses `skill://maintain-app-verification`. State a cadence only when the user requests one.

Publish a delivery table of surfaces, feature coverage, changed files, commit ownership, and proof. Append the actual launch, Doctor, drive, correction, cleanup, and commit outcomes to a Timeline. Attach the logs and browser evidence. Use a Document for stand-in setup and unavailable target proof. A generated skill alone does not complete live-proof coverage. A standalone committing run records requested commit before committing and reached commit only after success.
