# A Flow starts only on request

This amends [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md)'s enrollment decision for result-producing skills, including standalone explanations. Ordinary product questions should not acquire an unexpected Flow card because the agent selected research, explain, or another skill from its description. The user chose this boundary in issue #321.

`skill://flow-page`'s "Stage entry/exit line" defines enrollment centrally, before discovery or creation. It preserves supplied Flow context and this session and agent's binding for the same work. Typing `/skill:<name>` asks for that skill's output on a page, and a request in words for a page or Flow also enrolls the run. Selecting a skill from its description does not.

Outside a Flow, the producer gives the full useful answer in chat and uses plain `ask`, with the question's context in chat. It still writes canonical research notes and other required files. Within a Flow, ADR 0044's Stage ownership, publication, receipts, rendering, and canonical-file rules remain unchanged. Typed-only producers and triage's existing no-administrative-Flow discovery exception keep their behavior. This changes skill guidance, not the extension, scripts, storage, commands, or receipts. The glossary's Flow definition stays unchanged because a standalone explanation still can start a Flow.

## Alternatives considered

- Require an explicit page request in words. This would leave a typed skill invocation in chat, contrary to the user's expectation that it requests page output.
- Allow only a Matt run to start a Flow. This would prevent Utility skills such as explain from starting one when requested.
- Copy the enrollment condition into every producer. One central rule avoids drift. Producers only make contradictory publication instructions conditional and preserve complete chat output.
- Edit ADR 0044's original decision in place. A new ADR preserves the historical choice and records why it changed.
