# Ticket publication

To-tickets publishes an approved batch through its Bun API or CLI, saves a resumable record, verifies the directed relationships, and activates readiness last. An MCP batch includes an approved binding from live tool schemas.

## Sub-features

- `publication-mcp` the documented binding publishes a parent and blocking edge, preserves system labels and unrelated custom readiness values, then resumes without duplicates.
- `publication-transport` captured FastMCP structured string-result envelopes decode before field paths, and approved search pagination finds matches beyond the first page before creation.
- `publication-refusal` missing tools, incompatible schemas, wrong readback, premature readiness, and existing matching tickets block rather than claim success.
- `publication-conversion` offline mcp-atlassian converter fixtures accept equivalent Markdown but reject lost hierarchy, changed code, and changed link destinations.

## How to get to it (user POV)

- Run `/skill:to-tickets`, approve the breakdown and MCP binding, and provide the live `Connection` to the public `publish` or `resume` Bun API.
- Other tracker modes use `bun plugin/skills/to-tickets/scripts/publish.ts publish --input <approved.json> --record <publication.json>` and `resume --record <publication.json>`.

## Driving it with Bun

Preconditions:

- The baseline from `README.md` and Doctor pass.
- No Jira credentials are needed. The transport uses captured tool schemas and results serialized offline by mcp-atlassian package 0.23.1. The captured server reports FastMCP version 3.4.11. No live tracker writes are allowed for this recipe.

Run the actual public API, using the documentation's binding as input:

```sh
bun "$SKILL_DIR/scripts/ticket-publication.ts" "$CHECKOUT" "$VERIFY_RUN_DIR/publication-mcp"
```

The evidence directory must not exist. The command prints a complete receipt, a successful resume, and two readback issues. `receipt.json`, `resume.json`, and `readback.json` retain the evidence. Both issues have system labels `["task"]` and custom readiness values `["unrelated", "available"]`. The dependent has parent `DEMO-99` and the foundation as its inward-side blocker. The durable record is `publication.json`.

Run boundary cases through the same public interface:

```sh
bun test --timeout 30000 tests/mcp-publication.test.ts tests/ticket-publisher.test.ts
```

For parent-versus-head proof, extract only the base commit's publisher scripts under a disposable directory without checking out the base. Run the head's helper with the base directory as its first argument, the head checkout as its fixture argument, and `blocked` as its expected outcome:

```sh
bun "$SKILL_DIR/scripts/ticket-publication.ts" "$BASE_SOURCE_DIR" "$VERIFY_RUN_DIR/publication-base" "$CHECKOUT" blocked
```

It must retain a `capability-gap` receipt and report no writes. Use this baseline expectation only when verifying the binding cutover against the pre-binding base.

## Gotchas

- A transport fixture proves deterministic publication, not access to a Jira instance or human approval.
- The reporter identity in the mcp-atlassian binding is an approved weaker ownership check. It cannot prove creator identity.
- The offline converter loses nested-list hierarchy in one captured case. That case must block with a diff.
- Keep fixture output and run records in the evidence directory. Do not resume a production record as a smoke test.
