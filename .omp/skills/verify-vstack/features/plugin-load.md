# Plugin load

After a user links the plugin and starts a new omp session, the session offers every vstack skill as a `/skill:<name>` command, lists the model-invocable skills in the system prompt, offers the vstack agents to the `task` tool, applies the always-on rules, and has the extension's `/vstack-clean` Command.

## Sub-features

- `load-skills` every skill directory under `plugin/skills/` is a `/skill:<name>` command.
- `load-listed` skills without `disable-model-invocation: true` are in the system prompt skill list, and hidden skills are not.
- `load-agents` every agent under `plugin/agents/` is in the `task` tool's agent list.
- `load-rules` the body of every rule under `plugin/rules/` is in the system prompt's generic rules.
- `load-extension` the extension loads, so the session offers the `/vstack-clean` Command with source `extension`.
- `load-clean` no skill name collision warnings.

## How to get to it (user POV)

- Run `omp plugin link <checkout>/plugin`, then start a new omp session.
- Type `/skill:` in a session and read the command list.
- Run `omp skill list --json` in a terminal.

## Driving it with the load gate and drive.ts

Preconditions:

- The baseline from `README.md`.

- Step `plugin-load-gate`: Load gate. Run the repo's load gate for the checkout. It links the plugin into its own throwaway home, starts `omp --mode rpc` and `omp skill list --json`, and checks the result against `decision-register.yaml`. Run `bash "$SKILL_DIR/scripts/load.sh" "$CHECKOUT" "$VERIFY_RUN_DIR"`. Exit 0 and `"load_gate":"passed"`, with `vstack-clean` in `extension_commands`. A missing part exits 1 with `load smoke missing skill <path>`, `load smoke missing agent <path>`, `load smoke missing rule <path>`, `load smoke warnings: <messages>`, or `load smoke missing extension command vstack-clean: ./extensions/vstack.ts did not load`.
- Step `plugin-load-listed`: Listed and hidden. The full smoke summary is `$VERIFY_RUN_DIR/plugin-load-summary.json`, with `listedSkills`, `skillCommands`, `hiddenSkills`, `extensionCommands`, `agents`, `tools`, `genericRules`, and `warnings`. `extensionCommands` lists every Command with source `extension`, which also holds omp's own builtin extension Commands such as `autoresearch`. Run `jq '{listed: (.listedSkills | length), hidden: (.hiddenSkills | length), warnings}' "$VERIFY_RUN_DIR/plugin-load-summary.json"`. For one skill you changed, make sure that it is in `listedSkills` when its frontmatter has no `disable-model-invocation: true`, and in `hiddenSkills` when it has it. `warnings` is `[]`.
- Step `plugin-load-commands`: Command list in a session. Ask a live session for its commands. Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name plugin-load '{"type":"get_available_commands"}'`. Then run `jq -r 'select(.type=="response" and .command=="get_available_commands") | .data.commands[] | select(.source=="skill") | .name | ltrimstr("skill:")' "$VERIFY_RUN_DIR/plugin-load/rpc.jsonl" | sort > "$VERIFY_RUN_DIR/plugin-load-commands.txt"`. Make sure that `diff "$VERIFY_RUN_DIR/plugin-load-commands.txt" <(ls "$CHECKOUT/plugin/skills" | sort)` prints nothing.

## Gotchas

- `load-smoke.sh` and the load gate use `jq`. Without it they stop before the summary.
- The load gate reads `decision-register.yaml`. A new skill that no row or `originals:` entry names is not checked. Run `bun scripts/check-register.ts` for that.
- omp logs an extension that fails to load and goes on. The only sign in the load output is the missing `vstack-clean` Command in `extensionCommands`.
- Every skill under `.claude/skills` or `.agents/skills` in a parent dir of the session's working directory also loads. `load.sh` and `drive.ts` put that directory in the OS temp dir for this reason. A `diff` line for a skill that is not in `plugin/skills` means the working directory was under the real home.
