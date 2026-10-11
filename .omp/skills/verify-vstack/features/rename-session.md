# Rename session

The vstack extension gives the agent the `vstack_rename_session` tool. When the agent calls it with a name, omp sets that name as the session name, and omp's automatic title does not replace it. An empty name changes nothing and returns an error to the agent.

## Sub-features

- `rename-set` a call with a name sets the session name and returns `Session renamed to "<name>".`
- `rename-empty` a call with an empty or blank name returns `The session name is empty; nothing changed.` as an error, and the name stays as it was.

## How to get to it (user POV)

- Ask the agent to name the session, for example "Name this session after the ticket". Skills such as `implement` call the tool by name.
- Read the name in the omp session list, or in `get_state` over RPC.

## Driving it with drive.ts

Preconditions:

- The baseline from `README.md`.

- Set a name. Write the stub replies: run `printf '%s' '[{"tool":"vstack_rename_session","args":{"name":"verify rename ok"}},{"text":"Renamed."}]' > "$VERIFY_RUN_DIR/rename-replies.json"`. Then run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name rename-session --replies "$VERIFY_RUN_DIR/rename-replies.json" '{"type":"prompt","message":"Name this session verify rename ok"}' '{"type":"get_state"}'`. Exit 0, and the prompt result is `completed`.
- Tool ran. Run `jq -c 'select(.type=="tool_execution_end") | {toolName, isError}' "$VERIFY_RUN_DIR/rename-session/rpc.jsonl"`. It prints `{"toolName":"vstack_rename_session","isError":false}`.
- Tool result. Run `jq -c '.body.messages[]? | select(.role=="tool")' "$VERIFY_RUN_DIR/rename-session/model-requests.jsonl"`. The content is `Session renamed to "verify rename ok".`
- Session state. Run `jq -c 'select(.type=="response" and .command=="get_state") | .data.sessionName' "$VERIFY_RUN_DIR/rename-session/rpc.jsonl"`. It prints `"verify rename ok"`.
- Empty name. Write `[{"tool":"vstack_rename_session","args":{"name":"   "}},{"text":"Done."}]` to `$VERIFY_RUN_DIR/rename-empty-replies.json` and drive the same two commands with `--name rename-session-empty`. `tool_execution_end` has `"isError":true`, the tool result is `The session name is empty; nothing changed.`, and the `get_state` query prints `null`.

## Gotchas

- The drive runs with `--no-session`, so the name lives only in that process. The omp session list on disk does not show it. `get_state` in the same drive is the proof.
- Keep `get_state` in the same drive as the prompt. A new drive is a new session with no name.
- The stub needs a second reply for the turn after the tool result. With none left, it answers `stub: no reply left`, and the proof still holds.
