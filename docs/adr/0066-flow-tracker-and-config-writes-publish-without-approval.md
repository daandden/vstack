# Flow tracker and config writes publish without approval

> This extends [ADR 0061](0061-triage-acts-without-confirmation-gates.md) beyond triage and amends [ADR 0058](0058-mcp-publication-uses-an-agent-drafted-binding-the-publisher-validates.md)'s binding approval.

to-tickets publishes its tickets without a breakdown approval, and an MCP binding without an approval of its own; the publisher's live schema, readback, and duplicate checks still gate each write. wayfinder posts a resolution and closes the ticket without waiting for the user's next prompt. setup-vstack writes, commits, and pushes its config once the section choices are made, without a separate Write it question. In the newest vstack sessions, every ticket-breakdown approval accepted the draft unchanged, and wayfinder's confirmation and setup's Write it never changed content. A tracker write is fixed by editing, relabeling, or closing, and a config commit by another commit.

Some writes keep a check. A comment, review, approval, or thread resolution on a PR or issue the user does not own is drafted on the Flow page and posted after the user's pick, because the user asked for drafts there and changed recommended finding dispositions. Publishing a Private-mode artifact, deleting work that cannot be recovered, and reversing an earlier out-of-scope decision still ask.

## Considered Options

- Keep only the ticket-breakdown approval, because the breakdown sets the work graph. It was a stop the user always approved unchanged.
- Ask for an MCP binding the first time a server produces it, then reuse that approval. It needs a stored record per server, and a tool rename brings the question back.
- Keep every write approval.

## Consequences

- A breakdown the user would have reshaped is already on the tracker, and watchers see it before the user fixes it.
- A semantically wrong MCP binding that passes the schema checks, such as a reversed blocking direction, creates wrongly linked issues that the user fixes by hand.
