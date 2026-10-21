# A closing pick gets Addon picks through an extension tool

> Superseded by [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md): the grill closes with its summary and no ask, grill-with-docs offers no next-step options, and the `vstack_pick_addons` tool is gone. None of this ADR still stands.

grill-with-docs closes with next-step options: Shared understanding, then to-spec (recommended), Shared understanding, then implement, plain Shared understanding, and Not yet. grilling owns the closing ask and lets a caller add next-step options. Each next-step option confirms the shared understanding, and the agent then runs that skill in the same session. The picked skill runs inside the grill's Matt run, so no hook sees a run start. An `ask` answer is a tool result, not a prompt, so the `before_agent_start` hook does not run either. After a next-step pick, grilling's close therefore calls the extension tool `vstack_pick_addons` with the closing summary as the request. jev judges only the Addons that no earlier `vstack-addons` entry in the session names, at the 0.70 threshold. The tool returns the `skill://` pointers and records them in a `vstack-addons` custom session entry. The agent reads the pointers before it runs the next skill.

## Considered Options

- The extension watches `ask` results and spots the closing pick by its option label. This ties the extension to the label text of one skill and needs a tool-result hook that the extension does not use.
- No Addon picks after a closing pick. The picked skill then keeps only the Addons that jev picked from the grill's first words, and the closing summary holds a much clearer goal.
- A picked skill starts a new Matt run with its own smol restatement. The extension cannot see a pick, so this needs the same tool or watcher, plus a second definition of a run start.
- Close and tell the user to type the next skill. This keeps every run start typed, but the user asked for one pick from the grill to the spec.

## Consequences

- ADR 0021 rejected a vstack tool that the agent calls to ask jev, because the picks arrive after the agent starts and only if the agent follows a hidden instruction. Neither objection applies here. No prompt hook exists at a closing pick, and the call is a visible step in grilling's close, not a hidden instruction.
- This amends ADR 0026 for closing picks. The closing summary is already a restatement of the decided goal, so the tool calls no smol.
- The tool records its picks with `pi.appendEntry`, not `pi.sendMessage`. A tool runs while the session streams, and `sendMessage` then steers the turn or waits for a later one. A custom entry joins no model context and starts no turn. The hook and the tool read delivered pointers from both the saved `vstack-addons` messages and these entries. The tool also runs its calls one at a time, so two parallel calls cannot both judge the same Addons. Each pointer therefore appears at most once per session (ADR 0002).
- A headless close takes plain Shared understanding, runs no next skill, and calls no tool. A headless run therefore never publishes a spec that the user did not confirm.
- to-spec writes the pointers that the tool returned, because the agent read them through `skill://`.
