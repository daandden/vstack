---
name: verify-vstack
description: Drives the vstack omp plugin from a checkout as a user and captures proof. Covers the plugin as a new omp session loads it (skills, /skill:<name> commands, agents, rules, the vstack_rename_session tool), the Bun CLIs that skills run, the Grilling page in a browser, and the maintainer CLIs under scripts/. Use to prove a change under plugin/ or scripts/ works before you report it done.
---

# Verify vstack

vstack is an omp plugin. It has no build step and no server: omp loads `plugin/` (skills, agents, rules, and the TypeScript extension `plugin/extensions/vstack.ts`) when a session starts. To verify it, you start a fresh omp session on a throwaway home with the plugin linked, and you act through that session the way a user does.

The user-facing parts:

- Primary: the plugin inside an omp session. That covers the skill list, `/skill:<name>` commands, the agents in the `task` tool, the always-on rules, and the extension tool `vstack_rename_session`.
- Bun CLIs that skills run through `bun "$(realpath skill://<skill>/scripts/<script>.ts)"`, such as the Scratch scripts of vstack-tmp and vstack-clean and the grilling-page renderer.
- The HTML pages those scripts write, such as the Grilling page. You view them in a browser.
- The maintainer CLIs in `scripts/` (`check-register.ts`, `update-plan.ts`, `vstack-update.ts`, `load-smoke.sh`), documented in the repo `README.md`.

`features/README.md` indexes the feature map. Read it, then the feature file for the change, before you drive anything.

## Names used below

- `SKILL_DIR` is the directory this SKILL.md was read from. Every helper path below is relative to it.
- `CHECKOUT` is the root of the vstack checkout or worktree under test (`git rev-parse --show-toplevel` inside it). The plugin under test is `$CHECKOUT/plugin`.
- `VERIFY_RUN_DIR` is the run entry. Make it in Evidence step 1.

## Isolation

Each run gets its own omp home at `$VERIFY_RUN_DIR/data/home` and its own stub model port on `127.0.0.1`, chosen free by the OS. Runs in parallel do not share ports, data, or omp profiles. omp in a drive gets an env of only `PATH`, `HOME`, and `TERM`, so it never reads the real `~/.omp`.

omp also loads project skills from `.claude/skills` and `.agents/skills` in every parent dir of its working directory. The run dir is under the real home, so the session's working directory is a temp dir outside it: `<os temp dir>/vstack-verify-<run dir name>/`. `$VERIFY_RUN_DIR/data/outside` links to that dir, and Cleanup deletes it.

The shared instance is your own omp session and the real `~/.omp`. Never use it as the proof. It loaded the plugin when it started, so it does not show edits made since then. It also uses real models and the user's credentials.

## Launch

There is nothing to build. A launch is one drive: `scripts/drive.ts` links the plugin into the run's home, starts a stub model, starts `omp --mode rpc`, sends the RPC commands you give it, and stops both processes before it exits.

```sh
bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name <drive> \
  [--replies <replies.json>] '<rpc command json>' ...
```

- `<drive>` names the evidence dir `$VERIFY_RUN_DIR/<drive>/`. Use the feature ID.
- Each RPC command is one JSON object from the omp RPC protocol, for example `'{"type":"get_state"}'` or `'{"type":"prompt","message":"/skill:vstack-tmp"}'`. The protocol reference is `omp://rpc.md`.
- `--replies` is a JSON array of what the stub model answers, in order: `{"text": "..."}` or `{"tool": "<tool name>", "args": {...}}`. With no replies left, it answers the text `stub: no reply left`.

Readiness: the script waits for the response to each command, and for the `prompt_result` of a prompt that starts agent work. It prints a summary JSON. `"ok": true` with exit 0 means omp started and every command completed. Exit 1 means a command failed or waited 90 seconds without a result. The summary then names that command. Exit 2 is a usage error.

Teardown: the script stops its own omp process and stub server. If it was killed before that, `scripts/cleanup.sh` stops what it left (see Cleanup).

For a load check with no session turn, use the repo's own load gate. `scripts/load.sh` runs `loadGate` from the checkout's `scripts/lib/update-gates.ts`, which runs `scripts/load-smoke.sh` on a throwaway home. The gate fails when a registered skill, agent, rule, or the extension tool is missing, or when omp warns about a skill:

```sh
bash "$SKILL_DIR/scripts/load.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

Exit 0 prints `{"load_gate":"passed",...}`. It writes `$VERIFY_RUN_DIR/plugin-load-gate.json` and copies the smoke summary to `$VERIFY_RUN_DIR/plugin-load-summary.json`, also when the gate fails.

## Doctor

Run Doctor first, and again whenever a result looks wrong. It is read-only.

```sh
bash "$SKILL_DIR/scripts/doctor.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"
```

It prints one `ok` or `FAIL` line per check and exits 1 on a failure. It checks that `omp`, `bun`, `jq`, and `git` are on `PATH` with their versions. It names the plugin version, the `HEAD` commit, and the count of uncommitted plugin paths in `CHECKOUT`. After the first drive, it also checks that the session's working directory is outside the real home, that the run's home links `vstack` to `$CHECKOUT/plugin`, and that omp there lists the same version. It checks that the only model provider in that home is the `127.0.0.1` stub, so no real credential is in play. Last, it reports each PID the run recorded as exited, or as live with its listening ports. A `live` line after a drive finished means a process leaked. Run Cleanup.

## Drive

Each feature file in `features/` gives the exact commands and the proof for one feature. The ways to act:

- Session behavior (skills, commands, tools, rules, agents): `scripts/drive.ts`, as in Launch. Make the stub model act as the agent with `--replies`. A `{"tool": ...}` reply makes omp run that tool for real, in the session, with the plugin loaded.
- Bun CLIs that skills run: run the checkout's script with the bash tool's `cwd` set to `CHECKOUT`, as `bun plugin/skills/<skill>/scripts/<script>.ts ...`. Pass `--home "$VERIFY_RUN_DIR/data/<name>"` when the script takes `--home`. Do not use `realpath skill://...` here. That path resolves to the plugin your own session loaded, which is not always `$CHECKOUT`.
- Pages: open the written HTML file in the omp `browser` with `app: { tern: false }` and a `viewport` of `{ width: 1280, height: 900 }`. Read state with `tab.ariaSnapshot()` and act by role and name, for example `role/link[name="Q1"]`.
- Maintainer CLIs: run them with the bash tool's `cwd` set to `CHECKOUT`, as `README.md` documents. Capture the command, stdout, stderr, and exit code.

Set the working directory with the bash tool's `cwd` parameter, not with `cd`. On this machine the bash tool's `cd` is a shell function that fails with `command not found: __zsh_like_cd`.

## Evidence

1. Resolve the Scratch dir through `skill://vstack-tmp`, or use the Scratch dir from the parent prompt. Set `VERIFY_RUN_DIR=<Scratch dir>/verify/vstack-<run-id>`, where `<run-id>` is a new `date +%Y%m%d-%H%M%S` value plus the feature ID. Make it with `mkdir -p`.
2. Keep proof and notes at the top level of `VERIFY_RUN_DIR`. Keep throwaway app data in `$VERIFY_RUN_DIR/data/`: the omp home, the link to the temp working directory, and Scratch homes for the CLIs.
3. A drive writes its proof to `$VERIFY_RUN_DIR/<drive>/`: `summary.json`, `rpc.jsonl` (every frame omp wrote), `rpc.err`, `model-requests.jsonl` (every request the model got), and `link.txt`. Read your proof out of these files with `jq`.
4. Prove the action and the state after it. For a tool, that is the `tool_execution_end` frame and a later `get_state` value or file. For a skill command, that is the text the model received in `model-requests.jsonl`. For a CLI, that is the stdout, the exit code, and a separate listing of the files it changed. For a dry run, list the files before and after and show that nothing changed. Do not trust the word "dry".
5. For a page, capture a full-resolution PNG with `tab.screenshot({ format: "png", silent: true, fullPage: true })`. The call returns a temp PNG path. Convert it losslessly in eval, with `out` set to the evidence path that ends in `.webp`:

   ```js
   await Bun.write(out, await new Bun.Image(await Bun.file(pngPath).bytes()).webp({ lossless: true }).bytes());
   ```

   Read the WebP path to look at it. Keep the ARIA snapshot next to it as a `.aria.txt` file.
6. Write `$VERIFY_RUN_DIR/notes.md` with the feature ID, the entry point, each command, the result, and the path of each proof file. Report an entry point you did not drive as skipped, with the reason. A proof through one entry point does not prove another.

The stub model is the only mock. It stands at the model-provider boundary. Never prove a feature through `tests/support/extension-host.ts`, the extension factory called in-process, or any other test-only path.

## Cleanup

1. Close every browser tab this run opened, by the name you gave it: `await browser.tab("<name>").close()`.
2. Run the cleanup script:

   ```sh
   bash "$SKILL_DIR/scripts/cleanup.sh" "$VERIFY_RUN_DIR"
   ```

   It stops only the processes in `$VERIFY_RUN_DIR/data/pids` whose working directory is still this run's temp project dir. Then it deletes the temp dir that `data/outside` links to, and `$VERIFY_RUN_DIR/data/`. It refuses a dir that is not under `~/.vstack/tmp/<repo-key>/verify/`. It prints what it kept.
3. Make sure that the proof files and `notes.md` from Evidence are still at their paths.

Never stop a process because of its name. Never delete the run dir itself. `/skill:vstack-clean` removes old run dirs later.

## Helpers

All paths are relative to `SKILL_DIR`.

- `scripts/drive.ts`: one omp RPC session on the run's throwaway home, against the stub model. See Launch.
- `scripts/load.sh <checkout> <run dir>`: the repo's load gate for one run. See Launch.
- `scripts/doctor.sh <checkout> <run dir>`: the read-only Doctor check. See Doctor.
- `scripts/cleanup.sh <run dir>`: stops this run's recorded processes and deletes `data/` and the temp working directory. See Cleanup.

## Gotchas

- A drive starts a new omp process, so it sees the plugin files as they are on disk now, uncommitted edits included. Your own session does not.
- `omp plugin link` in the run's home replaces the link each drive. To compare two checkouts, use two run dirs.
- The stub model does not think. It answers with `--replies` in order, one per model request. A tool call needs a second reply for the turn after the tool result.
- `get_state` holds the whole system prompt (about 40 KB). The summary shows only its size. Read fields from `rpc.jsonl` with `jq`.
- The extension's principle selection runs only when a `typesafe/jev-latest` model has a key. The stub home has none, so a drive never shows it. Report it as skipped.
