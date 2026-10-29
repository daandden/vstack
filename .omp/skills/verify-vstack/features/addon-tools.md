# Addon tools

A typed Matt run displays an instruction to gather intent from the task's real context and call `inject_principles` (implement, implement-spec) or `inject_addons` (other Matt skills). Main-session prompts do not select Addons automatically. Subagent Brief selection remains automatic for judged vstack agents in a Matt run.

## Sub-features

- `addon-run-instruction` a bare typed Matt skill displays the instruction even without a native judge. implement and implement-spec name `inject_principles`. Other Matt skills name `inject_addons`.
- `addon-no-chat-instruction` plain chat and a pasted skill header below the first line display no instruction.
- `addon-tool-unavailable` both registered tools complete without picks when the judge role has no native candidate.
- `addon-tool-picks` with a native judge, tools return fitting pointers and save them once per session across branches and resume.
- `addon-principle-scope` `inject_principles` asks all main principle questions, including never-block-on-the-human. `inject_addons` asks both kinds of Addon questions.
- `addon-subagent-brief` judged vstack agents receive automatic Brief principle picks, excluding never-block-on-the-human, without the main precedence sentence.

## How to get to it (user POV)

- Type a Matt skill such as `/skill:implement #42`, `/skill:implement-spec #42`, or `/skill:to-spec`.
- Let the agent read the issue, map Notes, selected ticket, and prior conversation before calling the named tool with `intent`.
- Change the kind of work and let the agent call the tool again.
- Continue on another branch or resume the saved session.

## Driving it with drive.ts

Preconditions:

- The baseline from `README.md`.
- The normal stub home has no native judge. It can prove instructions and unavailable-judge tool completion, but cannot select an Addon.

Start a fresh saved session with a bare Matt skill:

```sh
bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name addon-run-instruction --session '{"type":"prompt","message":"/skill:implement"}' '{"type":"get_state"}'
```

Read `addon-run-instruction/model-requests.jsonl` and `rpc.jsonl`. The first request contains a displayed `vstack-addon-instruction` message to gather intent and call `inject_principles`. The saved session records that message. There is no automatic pick. Repeat with `/skill:to-spec` in a new drive named `addon-other-matt-instruction` and observe the `inject_addons` instruction. Use a new drive named `addon-no-chat-instruction` with plain chat and then a message containing a pasted skill header below its first line. Neither receives the instruction.

To exercise both tools without a native judge, create `$VERIFY_RUN_DIR/addon-tool-replies.json`:

```json
[
	{"tool":"inject_addons","args":{"intent":"Issue 42 asks for a PR for the login fix after its tests pass."}},
	{"tool":"inject_principles","args":{"intent":"Implement the selected login ticket and prove the behavior."}},
	{"text":"Finished the two tool calls."}
]
```

Run:

```sh
bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name addon-tool-unavailable --session --replies "$VERIFY_RUN_DIR/addon-tool-replies.json" '{"type":"prompt","message":"/skill:implement #42"}' '{"type":"get_state"}'
```

In `addon-tool-unavailable/rpc.jsonl`, each tool has a successful `tool_execution_end` with a no-picks result. The later model request contains that result. The saved session contains no `vstack-addons` custom entry. Report this as unavailable-native-judge proof, not selection proof.

Native selection needs a separately authorized, isolated omp home with a configured native judge role and credentials. The stub-only drive does not provide one. In that home, start a fresh Matt run, gather real source intent, call the tools, and capture the returned pointers and saved `vstack-addons` entries. Call again to prove delivered pointers do not return, then branch and resume the saved session and repeat. Cancel an in-flight call and confirm its late response saves no pointers. For subagents, start a judged vstack agent during that Matt run and capture its first-prompt pointers and a follow-up without automatic selection. Report any missing native-judge path as skipped with its missing prerequisite.

## Gotchas

- A successful tool call with no native judge proves registration and graceful completion, not the selection threshold, scope, or dedup.
- A displayed instruction is not an enforcement gate. A scripted stub does not prove that an agent gathers issue context or follows the instruction.
- Check actual `tool_execution_end` frames. A completed prompt alone does not prove the named tool ran.
- Use `--session` to inspect saved custom entries. A tool result alone does not prove persistence.
- Plain main-session follow-ups do not trigger selection. Another call is the agent's responsibility when the work changes kind.
