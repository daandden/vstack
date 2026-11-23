---
name: verify-vstack
description: Drives the vstack omp plugin from a checkout as a user and captures proof. Covers fresh omp sessions, skills, agents, rules, model-free Commands, Bun CLIs, Pele figures, the Flow page served by the Local Flow host, the vstack-flow Tern plugin, and maintainer scripts. Use before reporting plugin/ or scripts/ changes done.
---

# Verify vstack

vstack is an omp plugin. omp loads `plugin/` (skills, agents, rules, and the TypeScript extension `plugin/extensions/vstack.ts`) when a session starts. The one server is the Local Flow host, which the flow-page script starts on demand. It serves the Flow page from the prebuilt Nuxt reader committed under `plugin/skills/flow-page/reader/`. To verify the plugin, you start a fresh omp session on a throwaway home with the plugin linked, and you act through that session the way a user does.

The user-facing parts:

- Primary: the plugin inside an omp session. That covers the skill list, `/skill:<name>` commands, the model-free `/vstack-clean` Command that the extension registers, the agents in `task`, and the always-on rules.
- Bun CLIs that skills run through `bun "$(realpath skill://<skill>/scripts/<script>.ts)"`, such as the Scratch scripts under vstack-tmp and the flow-page script.
- The HTML pages those scripts serve, such as the Flow page at its live `http://127.0.0.1` URL. You view them in a browser. The Flow page needs the host; it has no `file://` form.
- The maintainer CLIs in `scripts/` (`check-register.ts`, `vstack-maintain.ts`, `addon-judge-check.ts`, `load-smoke.sh`), documented in the repo `docs/maintainer.md`.
- The `vstack-flow` and `vstack-clean` Tern window plugins in `plugin/tern/`, linked and driven in their own isolated native Tern instance.

`features/README.md` indexes the feature map. Read it, then the feature file for the change, before you drive anything.

## Names used below

- `SKILL_DIR` is the directory this SKILL.md was read from. Every helper path below is relative to it.
- `CHECKOUT` is the root of the vstack checkout or worktree under test (`git rev-parse --show-toplevel` inside it). The plugin under test is `$CHECKOUT/plugin`.
- `VERIFY_RUN_DIR` is the run entry. Make it in Evidence step 1.

## Isolation

Each stub drive gets its own omp home at `$VERIFY_RUN_DIR/data/home` and its own stub model port on `127.0.0.1`, chosen free by the OS. Runs in parallel do not share ports, data, or omp profiles. omp in a stub drive gets an env of only `PATH`, `HOME`, and `TERM`, so it never reads the real `~/.omp`. The real-model enrollment recipe in `features/flow-page.md` uses a separate fresh native process with the caller's real HOME and credentials, as ADR 0010 requires.

omp also loads project skills from `.claude/skills` and `.agents/skills` in every parent dir of its working directory. A stub drive's run dir is under the real home, so its working directory is a temp dir outside it. The first drive or load gate makes that dir with `mktemp` as `<os temp dir>/vstack-verify-XXXXXX/`. Its random name is unique, so two run dirs with the same name never share it. `$VERIFY_RUN_DIR/data/outside` links to that dir, later stub drives reuse it, and Cleanup deletes it.

For the Flow question panel, use the native helper in `features/flow-page.md` with `--tern`. It starts its own headless real Tern renderer, with a separate control endpoint and config directory, outside the user's working window. HOME and cwd stay in the outside temp dir. The explicit omp-tools path supplies its ordinary `ask` picker. The PTY-only mode remains useful for terminal bytes, but neither those bytes nor RPC dialog replies prove native clickable links or the panel's removal.

Never use your already-running omp session as proof. It loaded the plugin when it started, so it does not show edits made since then. Stub drives use the throwaway home. The real-model enrollment recipe verifies instruction following with the actual provider in a fresh session, not the shared session.

Reasoning-led skill behavior is an exception to the stub-model isolation below. For architecture assessment and agreement, use `features/architecture-agreement.md` and skill-creator's actual isolated evaluations with the Session model and real `HOME`. Keep their Flow homes and outputs disposable and separate. Scripted replies prove tool plumbing, never the model's reasoning or a human's consent.

The Tern plugin recipes use `scripts/tern-verify`, ported from `tern-plugins`. It links the checkout's `plugin/tern/vstack-flow` and `plugin/tern/vstack-clean` into a new config directory, with separate daemon and control sockets. Read `features/README.md`'s Tern baseline and the matching `features/vstack-flow.md` or `features/vstack-clean.md` recipe for Launch, Doctor, Drive, Evidence, and Cleanup. Every Tern command uses the helper. A bare `tern` command can act on the user's working window.

## Proof step IDs

Every required proof step starts with the word Step, its ID in code formatting, and a colon. A caller copies the IDs it requires into `expected.json`, and the Verifier reports one `proof_steps` outcome per ID, as `skill://ship/references/verdict-record.md` describes. `features/README.md` defines the feature-step convention and the uniqueness check. This file owns four shared steps:

- `reader-build`: Launch's reader build, when the change touches `reader/`.
- `tests`: `bun run test` in `CHECKOUT`, as Gotchas says.
- `doctor`: the Doctor check.
- `cleanup`: every Cleanup item.

Parent-versus-head comparisons are feature steps with their own IDs, such as `ticket-publication-parent-vs-head`.

## Launch

Nothing builds at launch: the Flow reader is committed prebuilt. Step `reader-build`: When the change touches `reader/`, run `bun run reader:build` in `CHECKOUT` first. It ships the bundle under `plugin/skills/flow-page/reader/` and reseals `runtime.json`. Unset `FLOW_READER_ASSETS` and `FLOW_READER_SERVER` before starting an isolated host for shipped-reader proof. For scripted smoke proof, `scripts/drive.ts` links the plugin into the run's home and starts a stub model and `omp --mode rpc` (or `--mode rpc-ui` with `--rpc-ui`). It sends the requested RPC commands and stops both processes before it exits. The real-model enrollment recipe launches its own fresh native process from `CHECKOUT`.

```sh
bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name <drive> \
  [--rpc-ui] [--no-ui] [--session] [--replies <replies.json>] [--ui-replies <ui.json>] '<rpc command json>' ...
```

- `<drive>` names the evidence dir `$VERIFY_RUN_DIR/<drive>/`. Use the feature ID. The dir must be new. If it exists, the script exits 2 and writes nothing, so the earlier proof stays as it was. To retry a drive, give a new name such as `<feature>-retry1`, or start a new run dir. Never delete the old dir to reuse its name.
- Each RPC command is one JSON object from the omp RPC protocol, for example `'{"type":"get_state"}'` or `'{"type":"prompt","message":"/skill:vstack-tmp"}'`. The protocol reference is `omp://rpc.md`.
- `--replies` is a JSON array of what the stub model answers, in order: `{"text": "..."}` or `{"tool": "<tool name>", "args": {...}}`. With no replies left, it answers the text `stub: no reply left`.
- `--ui-replies` is a JSON array that answers the dialogs omp sends as `extension_ui_request` frames (`select`, `confirm`, `input`, `editor`), in order: `{"value": "<exact answer>"}`, `{"pick": "<text>"}` (the first `select` option that contains the text), `{"confirmed": true}` or `false`, or `{"cancelled": true}`. With no UI reply left, the script cancels the dialog. Each answer goes to `ui-responses.jsonl`, and `summary.json` counts the dialogs in `ui_requests`. A `pick` that matches no option cancels the dialog and fails the drive.

Readiness: the script waits for the response to each command, and for the `prompt_result` of a prompt, a Command such as `/vstack-clean` included. It prints a summary JSON. `"ok": true` with exit 0 means omp started and every command completed. Exit 1 means a command failed or waited 90 seconds without a result. The summary then names that command. Exit 2 is a usage error. A Command that waits for a dialog with no `--ui-replies` item gets it cancelled, so it does not hang.

Teardown: the script stops its own omp process and stub server. If it was killed before that, `scripts/cleanup.sh` stops what it left (see Cleanup).
`--no-ui` passes the same flag to `omp --mode rpc`. Extensions get `ctx.hasUI: false`. omp drops extension UI notifications, so a missing warning is a product finding when the feature requires an observable refusal.
`--rpc-ui` starts `omp --mode rpc-ui`. omp 18.13 registers the `ask` tool only in that mode; in `--mode rpc`, a stub `ask` call fails with `Tool ask not found`. Each `ask` question reaches the drive as an `extension_ui_request` `select` frame whose options end with `Other (type your own)`. Picking that option opens an `editor` frame for the custom words. `--ui-replies` answers both like any other dialog. Use it for every drive whose model calls `ask`.
`--session` drops the `--no-session` flag that a drive passes by default. omp then writes the session file under `$VERIFY_RUN_DIR/data/home/.omp/agent/sessions/` and holds its lease under `$VERIFY_RUN_DIR/data/home/.omp/run/session-owners/` while the drive runs. Tool calls get `PI_SESSION_ID` in both modes, but only with `--session` does a session file and a held lease back it. Use it for a skill whose script checks the running session, such as clean-wt.

For actual-model current-picker non-consent cases, use the PTY helper without a stub provider:

```sh
python3 "$SKILL_DIR/scripts/flow-questions-tui.py" --checkout "$CHECKOUT" \
  --omp-tools "$OMP_TOOLS" --run "$VERIFY_RUN_DIR/<new-case>" \
  --prompt <scenario.md> --config <isolate.yml> --case <cancelled|timeout|empty> \
  [--session-source <persistent-session.jsonl>] [--deadline-seconds 1800]
```

The helper reads the last model and thinking records from `PI_SESSION_FILE` or `--session-source`. It clears inherited session variables, retains real HOME for credentials, and starts a fresh interactive TUI with the supplied overlay. It loads the checkout's package and the named omp-tools package. It appends operational guidance requiring the checkout CLI's explicit `--home <new-case>/flow-home` on every Flow command and records that home, guidance, and effective prompt hash in `launch.json`. Follow `features/architecture-agreement.md`'s current-picker procedure. The normal-HOME native extension stays intentionally unbound. This proves isolated CLI publication plus ordinary native `ask`, not automatic binding or Flow-card acceptance. A free `VSTACK_FLOW_PORT` selects the owned host's startup port, not its namespace, and cannot override existing discovery.

Cancellation uses Escape in the actual picker. Timeout leaves it unanswered and requires `ask.timeout` in the overlay. Empty uses the real Submit tab without selecting an option, so it needs a generated multi-question or multiselect round. Unsupported routes remain unavailable. A controller deadline is not a picker timeout.

`summary.json` reports transport completion, not a behavioral pass. Inspect `terminal.bin`, `terminal.txt`, `inputs.json`, `tool-results.json`, `before-picker.json`, `launch.json`, and `sessions/` alongside the actual Flow and file inventory. Check that all Flow commands use the recorded isolated home and the child's own identity. Keep human confirmation separate from automated keyboard actions. Preserve failed attempts. Copy exports, close only owned Flows, and authenticate host cleanup with the same explicit `--home`. Record normal-HOME discovery, secrets, and binding hashes and nonsecret host identity before and after the proof, never their secret contents. Leave normal-HOME hosts and foreign listeners untouched.

For a load check with no session turn, use the repo's own load gate. `scripts/load.sh` runs `loadGate` from the checkout's `scripts/lib/update-gates.ts`, which runs `scripts/load-smoke.sh` on a throwaway home. The gate fails when a registered skill, agent, or rule is missing, when the extension's `vstack-clean` Command is missing, or when omp warns about a skill:

```sh
bash "$SKILL_DIR/scripts/load.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

Exit 0 prints `{"load_gate":"passed",...}` and writes it to `$VERIFY_RUN_DIR/plugin-load-gate.json`. A failed gate exits 1, prints its error on stderr, and writes no gate file. In both cases the script copies the smoke summary to `$VERIFY_RUN_DIR/plugin-load-summary.json`.

## Doctor

Step `doctor`: Run Doctor first, and again whenever a result looks wrong. It is read-only.

```sh
bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

It prints one `ok` or `FAIL` line per check and exits 1 on a failure. It checks that `omp`, `bun`, `jq`, and `git` are on `PATH` with their versions. It names the plugin version, the `HEAD` commit, and the count of uncommitted plugin paths in `CHECKOUT`. After the first drive, it also checks that the session's working directory is outside the real home, that the run's home links `vstack` to `$CHECKOUT/plugin`, and that omp there lists the same version. It checks that the only model provider in that home is the `127.0.0.1` stub, so no real credential is in play. Last, it reports each PID the run recorded as exited, or as live with its listening ports. A `live` line after a drive finished means a process leaked. Run Cleanup.

For the actual-model exception, stub-home checks do not establish runtime isolation. Run the tool and checkout checks above on every fresh case. Inspect the persisted effective system prompt, expanded user message, actual dependency read paths, model and thinking records, and raw tool results. Confirm the installed skill is absent and the checkout's dependencies are used. A missing credential, unsupported TUI route, or failed discovery leaves the case unavailable.

## Drive

Each feature file in `features/` gives the exact commands and the proof for one feature. The ways to act:

- Session behavior (skills, commands, tools, rules, agents): `scripts/drive.ts`, as in Launch. Make the stub model act as the agent with `--replies`. A `{"tool": ...}` reply makes omp run that tool for real, in the session, with the plugin loaded.
- Bun CLIs that skills run: run the checkout's script with the bash tool's `cwd` set to `CHECKOUT`, as `bun plugin/skills/<skill>/scripts/<script>.ts ...`. For isolated CLI fixtures, pass `--home "$VERIFY_RUN_DIR/data/<name>"` when the script takes `--home`. Native enrollment instead uses its documented normal-HOME namespace. Do not use `realpath skill://...` here. That path resolves to the plugin your own session loaded, which is not always `$CHECKOUT`.
- Pages: open the page's URL in the omp `browser` with `app: "chromium"` and a `viewport` of `{ width: 1280, height: 900 }`. For the Flow page, that is the receipt's `live.url`. Read state with `tab.ariaSnapshot()` and act by role and name.
- Maintainer CLIs: run them with the bash tool's `cwd` set to `CHECKOUT`, as `docs/maintainer.md` documents. Capture the command, stdout, stderr, and exit code.

Keep every verification browser outside the user's working Tern window. Ordinary page checks use the explicit non-Tern backend on every open, including diagnostics, retries, recovery, and delegated verification. The Tern plugin recipe instead uses only its helper-owned isolated Tern window. Pass this policy in verification handoffs and inspect each open result to confirm the actual backend.

Opening a browser, capturing a screenshot, and reading an image are separate operations. Image inspection is not evidence that a browser pane opened.

Set the working directory with the bash tool's `cwd` parameter, not with `cd`. On this machine the bash tool's `cd` is a shell function that fails with `command not found: __zsh_like_cd`.

## Evidence

1. Open the marked `verify` session folder through `skill://vstack-tmp`. In a subagent, use the explicit mode with the project dir and session id from your brief. Set `VERIFY_RUN_DIR` to `vstack-<run-id>/` inside the folder. Use a new `date +%Y%m%d-%H%M%S` value plus the feature ID as the run id. Make the entry with `mkdir -p`.
2. Keep proof and notes at the top level of `VERIFY_RUN_DIR`. Keep throwaway app data in `$VERIFY_RUN_DIR/data/`: the omp home, the link to the temp working directory, and Scratch homes for the CLIs.
3. A drive writes its proof to `$VERIFY_RUN_DIR/<drive>/`: `summary.json`, `rpc.jsonl` (every frame omp wrote), `rpc.err`, `model-requests.jsonl` (every request the model got), `ui-responses.jsonl` (every dialog answer it sent, when there was a dialog), and `link.txt`. Read your proof out of these files with `jq`.
4. Prove the action and the state after it. For a tool, that is the `tool_execution_end` frame and a later `get_state` value or file. For a skill command, that is the text the model received in `model-requests.jsonl`. For a CLI, that is the stdout, the exit code, and a separate listing of the files it changed. For a dry run, list the files before and after and show that nothing changed. Do not trust the word "dry".
5. For a page, capture a full-resolution PNG with `tab.screenshot({ format: "png", silent: true, fullPage: true })`. The call returns a temp PNG path. Convert it losslessly in eval, with `out` set to the evidence path that ends in `.webp`:

   ```js
   await Bun.write(out, await new Bun.Image(await Bun.file(pngPath).bytes()).webp({ lossless: true }).bytes());
   ```

   Read the WebP path to look at it. Keep the ARIA snapshot next to it as a `.aria.txt` file.
6. Write `$VERIFY_RUN_DIR/notes.md` with the feature ID, the entry point, each command, the result, and the path of each proof file. Report an entry point you did not drive as skipped, with the reason. A proof through one entry point does not prove another.

The model stub stands at the model-provider boundary. Scratch identity uses named process-boundary fault fixtures, and Private MCP verification uses an unrelated named-hook fixture to put a conflicting regular config into a newly cloned checkout. Both run the real production CLIs and Git. Never prove application behavior through `tests/support/extension-host.ts`, the extension factory called in-process, or another replacement of the component under test.

## Cleanup

Step `cleanup`: Do all three items below.

1. Close every browser tab this run opened, by the name you gave it: `await browser.tab("<name>").close()`.
2. Run the cleanup script:

   ```sh
   bash "$SKILL_DIR/scripts/cleanup.sh" "$VERIFY_RUN_DIR"
   ```

   It stops only the processes in `$VERIFY_RUN_DIR/data/pids` whose working directory is still this run's temp project dir. Then it deletes the temp dir that `data/outside` links to, and `$VERIFY_RUN_DIR/data/`. It refuses a dir that is not under `~/.vstack/tmp/<repo-key>/verify/<session-id>/`. It prints what it kept.
3. Make sure that the proof files and `notes.md` from Evidence are still at their paths.

Never stop a process because of its name. Never delete the run dir itself. The `/vstack-clean` Command removes old run dirs later.

## Helpers

All paths are relative to `SKILL_DIR`.

- `scripts/drive.ts`: one omp RPC session on the run's throwaway home, against the stub model. See Launch.
- `scripts/tern-verify start|doctor|ctl|tern|type|shot|lens|stop <run> [args...]`: owns and drives one isolated Tern instance. `VSTACK_CHECKOUT=<checkout>` chooses the packaged Tern plugin. Use `features/vstack-flow.md` and its baseline in `features/README.md`. The `lens` command installs a disposable native-link fixture only in that instance.
- `scripts/tern-flow-fixture.ts seed|other|picker|target|stop <run> [args...]`: seeds disposable native-session Flow bindings and picker presence only inside a live `TERN_VERIFY_HOME=RUN/data/home`. Use `features/vstack-flow.md` for the exact fixture commands and safety refusals. It needs no driver-authored Flow command under a native session's identity.
- `scripts/ticket-publication.ts <source checkout> <new evidence dir> [fixture checkout] [complete|blocked]`: drives the public publisher API with the documented MCP binding and captured provider fixtures. Use `features/ticket-publication.md`.
- `scripts/flow-questions-tui.py --checkout <checkout> --omp-tools <plugin path> --run <new run> --case tui|timeout|cancel|retry|later-round|offline|abort|ratchet [--tern]`: drives the UI-only Flow panel beside the unchanged picker. `--tern` retains native trees, full-resolution lossless WebP shots, a real panel-link click and its browser destination, the panel's removal, keyboard inputs, session history, model requests, and a Flow export. The later-round case publishes and answers a new question after recording the first round's answers. The Ratchet case uses its actual eval prelude and verifies reused approval. Use `features/flow-page.md`.
- `scripts/load.sh <checkout> <run dir>`: the repo's load gate for one run. See Launch.
- `scripts/doctor.sh <checkout> <run dir>`: the read-only Doctor check. See Doctor.
- `scripts/cleanup.sh <run dir>`: stops this run's recorded processes and deletes `data/` and the temp working directory. See Cleanup.
- `scripts/figures.ts <checkout> <new evidence directory>`: renders the named figure inputs and refusals, retains raw CLI proof, and writes the browser consumer. Use `features/figure-render.md`.
- `scripts/figure-audit.js`: evaluate its complete text in the figure consumer with `await tab.evaluate(await Bun.file(SKILL_DIR + "/scripts/figure-audit.js").text())`. It returns browser-computed paint and geometry checks.
- `scripts/figure-flow.ts <checkout> <verify run> <own session> <own agent>`: captures historical SVG, role-marked Mermaid, and a Document Mermaid code block in a labelled disposable isolated-home Flow. Follow the figure recipe's authenticated host stop and export steps before Cleanup.
- `scripts/figure-reader-audit.js`: evaluate its complete text in that live Flow after explicitly selecting Light or Dark. It checks seven 22% role fills, ordinary labels, border-only focus, step edges, Base edge-label boxes, and cluster-label outlines. Use `features/figure-render.md`.
- `scripts/worker-lifecycle.ts <checkout> <new verify run>`: drives real isolated implementer and review-fixer patch landing, retention, and release in a fresh throwaway omp session. Use `features/worker-lifecycle.md`.
- `scripts/verifier-python.ts seed <new case dir> <case> | audit <case dir>`: prepares offline editable packages, captures environment hashes, and checks the native Verifier's evidence. Use `features/verifier-preparation.md`.
- `scripts/flow-questions-tui.py --prompt <scenario.md> --config <isolate.yml>`: actual Session-model TUI controller for cancelled, elapsed-timeout, and empty architecture responses. See Launch and `features/architecture-agreement.md`.
- `scripts/frontend-maintenance.ts <checkout> <new evidence directory> <upstream cache>`: drives the public register and maintenance CLIs with a deterministic future-source fixture, preserving the real Pin and local adaptations. Use `features/frontend-guidance.md`.
- `scripts/clean-adr-isolation.ts <checkout> <fresh fixture> <new evidence directory>`: pins native project skills, agents, and the project plugin to the checkout without changing real-HOME credentials or installed packages. Run before every actual-model clean-adr fixture, then audit actual delegated reads as `features/clean-adr.md` specifies.
- `scripts/clean-adr-evidence.ts <fresh-git-fixture> <new-evidence-directory> <standard|private>`: seeds the separate complete Bun simulator for clean-adr's controlled-repair case and executes its logical-clock producer, receiver, capacity and expiry transitions, and valid alternate-codec negative control. Keep evidence-poor baselines unchanged. Use `features/clean-adr.md` for baseline, current help-navigation citations, and real-model repair checks.
- `scripts/private-mcp.ts <checkout> <new evidence directory>`: drives Private MCP setup through its CLI, actual ignored-file-cloned omp creation, shared edits, and observable conflict preservation on a disposable HOME and repository. It retains exact command records and removes its owned fixture data. Use `features/private-mcp.md`.

## Gotchas

- A drive starts a new omp process, so it sees the plugin files as they are on disk now, uncommitted edits included. Your own session does not.
- `omp plugin link` in the run's home replaces the link each drive. To compare two checkouts, use two run dirs.
- Step `tests`: Run tests with `bun run test`, or pass `--timeout 30000` when naming files. Bun's default 5000 ms timeout fails slow tests such as `tests/clean-wt.test.ts` that pass under the repo's declared command.
- The stub model does not think. It answers with `--replies` in order, one per model request. A tool call needs a second reply for the turn after the tool result.
- Startup tool-routing compression requests are logged but do not consume `--replies`. The helper recognizes only tool-less requests whose user text starts with `Compress into one routing hint`.
- `get_state` holds the whole system prompt (about 40 KB). The summary shows only its size. Read fields from `rpc.jsonl` with `jq`.
- Main Addon selection runs through `inject_addons` and `inject_principles` after the agent gathers intent. A native judge model in omp's `judge` role and its credentials are needed for picks. The stub can prove the displayed instruction and both no-picks tool results. `features/addon-tools.md` separates those paths from native selection.
