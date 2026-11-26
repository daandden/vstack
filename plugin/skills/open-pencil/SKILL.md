---
name: open-pencil
description: "Design or inspect in OpenPencil via MCP, or build or verify against a Design baseline."
---

# Work with OpenPencil designs

Use the user's existing OpenPencil MCP server for live design work. This Utility gives the current workflow design guidance. The current owner keeps the stack choice, execution, and proof. A Design baseline is the agreed `.fig` file identified by its SHA-256, not the live document or a PNG export. The live document can change independently.

For standalone result-producing work, follow `skill://flow-page`'s "Stage entry/exit line" before discovery. When another workflow reads this skill as a reference, keep design work and handoff in that owner's Stage. Open no separate Stage.

- To save and agree frames before handoff, or to hand over the exact saved file the user agreed to in the grill, follow [Create a Design baseline](references/create-design-baseline.md).
- To build or verify against an existing Design baseline, follow [Fetch and verify a Design baseline](references/fetch-design-baseline.md). Start there even when the editor or MCP server is unavailable.

## Locate the live target

1. Discover the connected OpenPencil server's current tools and argument schemas before acting. Use the tools it actually exposes. Do not install or configure the server, add project config, or widen a restricted connection.
2. List documents to resolve the user's exact document. Locate the named page and frames within that document. Keep the returned document, page, and node IDs. Resolve missing or ambiguous names before reading or editing the design. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md). For remaining questions use `ask` under skill://flow-page's "Every ask in a Flow" contract, or plain `ask` outside a Flow. Return open questions to the coordinator when delegated.
3. Pass `document_id` and `page_id` wherever the live schema accepts them. Use the resolved frame or child node IDs, and set the parent explicitly when creating layers in a frame. Do not substitute the active tab, a session's remembered document, or the current selection for named targets. If the exposed tools cannot target the named design reliably, stop.
4. Keep inspection read-only. Change only the designs, comments, or statuses the user asked to change. A design edit does not authorize comment resolution or status changes. Read the named frames back with the same IDs to check the result.

If this session's configured OpenPencil MCP connection is missing or fails discovery or transport, report the unavailable server and the observed error, if any. Stop live design work and wait for a working connection. Let the MCP client handle discovery and retries. Do not retry the connection yourself or probe the endpoint with `curl`, raw HTTP, another MCP server, or any other tool.

If a reachable server reports that it cannot connect to the OpenPencil desktop app, report the unavailable app and that evidence. If the evidence does not distinguish the two, report what failed and what remains unknown.

Without the app or MCP server, pause live design work and new Design baselines. Work against an existing Design baseline can continue in file mode.

## Save an authorized edit

Use the document's existing path if it is eligible, or a user-authorized path in an ordinary folder inside the configured MCP root. Never save under a dot directory such as an omp worktree or Scratch. Stop on a path refusal instead of changing the MCP root or moving the user's file.

## Read design intent for implementation

Use the agreed frames and requirements. Read the behavior annotations, variables, variants, and states as design intent. Map each required interaction to the project's UI SDK components and each visual role to its project tokens. Use skill://ui-sdk and the installed library docs for the mapping. OpenPencil's Reka and Tailwind codegen recipe does not decide the stack or justify copying generated code.

Write required interactions the editor cannot annotate, such as Select, as explicit requirements. Do not infer them from layer names. If no UI SDK equivalent preserves a requirement, give the change's owner the requirement and the gap for a decision. Do not silently substitute a different behavior or library.
