# MCP publication uses an agent-drafted binding that the publisher validates

The to-tickets publisher chose each MCP tool by matching its description against a fixed regex. Against `mcp-atlassian` package 0.23.1, which reports FastMCP server version 3.4.11, five of the seven tracker actions matched no tool and search matched two. Publication stopped before any write ([#369](https://github.com/daandden/vstack/issues/369)). The agent now reads the live tool descriptions and drafts an MCP binding into the approved input. The binding names one tool per action, an argument template with the CLI routes' `{role}` placeholders, and the paths where readback finds each issue field. The user approves the binding with the ticket breakdown. The publisher checks each bound tool and schema against the live server at publish and on resume, then makes the calls. This follows [ADR 0035](0035-an-mcp-config-names-the-server-project-facts-and-pins.md). The agent picks tools from descriptions, and the project config holds only the server, project facts, and pins.

## Considered Options

- A broader generic matcher keeps the cause of #369. Free-text descriptions vary per server, and each new phrasing misses again.
- A Jira profile in the adapter learns one server's tool shapes in code. Every other Jira MCP server, such as `@atlassian-dc-mcp/jira`, would need more code.
- Binding rows in `issue-tracker.md` at setup would undo part of ADR 0035 and go stale when a server renames a tool.

## Consequences

- The regex discovery table and the Jira-only `fields` normalizer go away. Read paths in the binding cover both raw Jira `fields` and flattened results.
- A string-typed parameter that receives a template object, such as `additional_fields`, gets that object JSON-encoded.
- When a server has no tool that returns the authenticated user, the `owner` tracker fact supplies the identity. The publisher checks each created issue's mapped author against it. For mcp-atlassian, the approved binding maps reporter because simplified results omit creator. Reporter is mutable, so this is weaker than creator-based ownership, including during uncertain-create reconciliation.
- When the server can only replace a field's whole value, activation reads the readiness field, journals its current values, writes those values plus readiness, and reads back that every earlier value is still there. Resume retains that preservation check. Approved ticket labels read back separately from readiness.
- Body readback and reconciliation compare bodies after a fixed normalization, because converting servers do not return the approved bytes. A mismatch blocks with the diff.
- Before each MCP create, an existing issue with the approved title and normalized body blocks publication as a duplicate risk. Other tracker modes keep their existing behavior.
