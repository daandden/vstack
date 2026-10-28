# Skill commands

When a user types `/skill:<name> [args]` in an omp session, omp sends the model that skill's `SKILL.md` body from the linked plugin, the skill directory, and the user's arguments, and the agent turn runs.

## Sub-features

- `skill-body` the model gets the SKILL.md body of the named skill, without its frontmatter.
- `skill-dir` the prompt names the skill directory inside the linked plugin, so relative paths in the skill resolve there.
- `skill-args` text after the command name reaches the model with the skill.
- `skill-hidden` a skill with `disable-model-invocation: true` still runs by its command.

## How to get to it (user POV)

- Type `/skill:<name>` with optional arguments in an omp session.
- Pick the command from the `/` command menu in the omp TUI.

## Driving it with drive.ts

Preconditions:

- The baseline from `README.md`.

- Run the command. Send it as a prompt. Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name skill-command '{"type":"prompt","message":"/skill:vstack-tmp where does Scratch go"}'`. Exit 0, and `summary.json` shows the prompt with `"status": "completed"`.
- Body and directory. Read the user message that contains the skill invocation, not the last message, because extensions can append guidance. Run `jq -r --arg skill "vstack-tmp" '.body.messages[] | select(.role=="user") | .content | if type=="array" then map(.text // "") | join("") else . end | select(contains("User invoked the \"" + $skill + "\" skill"))' "$VERIFY_RUN_DIR/skill-command/model-requests.jsonl" > "$VERIFY_RUN_DIR/skill-command-prompt.txt"`. The file holds `User invoked the "vstack-tmp" skill`, the line `# vstack-tmp` from the body, and `[Skill directory: $VERIFY_RUN_DIR/data/home/.omp/plugins/node_modules/vstack/skills/vstack-tmp]`. That path is the plugin link in the run's home. Doctor shows that the link points to `$CHECKOUT/plugin`.
- No frontmatter. `grep -c '^name: vstack-tmp' "$VERIFY_RUN_DIR/skill-command-prompt.txt"` prints `0`.
- Arguments. The same file ends with the line `User: where does Scratch go`.
- Hidden skill. Repeat with a skill whose frontmatter has `disable-model-invocation: true`, for example `/skill:grill-me`, and `--name skill-command-hidden`. The model gets that body as well.
- Your change. For an edited skill, run its command the same way and `grep -F` a line you added in the prompt file. That proves the session used the edited file.
- Session-bound script. A skill whose script checks the running session, such as clean-wt, needs `--session`. `clean-wt.md` gives that recipe, with and without `--session`.

## Gotchas

- The stub model does not follow the skill. This feature proves what the model gets, not what an agent does with it.
- `model-requests.jsonl` has one line per model request, including routing-hint requests. Select the user message with the invoked skill's header. Its position can change when an extension appends guidance.
- An unknown name such as `/skill:no-such-skill` is not an error. omp sends it to the model as plain text. Look for `User invoked the` in the request to tell the two cases apart.
