# An MCP config names the server, project facts, and pins

MCP tool descriptions already say what each tool does. Drafting one config row for every operation duplicates those descriptions, makes setup confirm many rows, and leaves stale names when a server renames a tool. The issue tracker, the Code host, and the CI service use the same MCP config shape. The tool line names the MCP server, a list of project facts follows, and a pin names a tool only where a vstack rule requires exactly one tool. The config tells the agent to pick every other tool from that server's descriptions.

A project fact is a value that no tool description knows. Examples include the repo, a Jenkins job folder, a Jira project key, the ticket issue type, the close transition, the blocking link type, and the mapping from triage labels to Jira labels. A job folder is not a way to find the failed build. That build comes from the failed check's link, as [ADR 0031](0031-the-ci-service-is-its-own-config.md) records.

Every MCP config pins its read-only check tool, and `ci.md` also pins its rerun tool. Nothing else is pinned, including merge, create, comment, label, or close. The check pin keeps setup's connection check to one call that changes nothing. The rerun pin binds babysit's one-rerun rule to the tool that fits it. babysit allows one fresh full rerun for a proven flake, not a failed-job-only retry. Jenkins offers `rebuildBuild`, `triggerBuild`, and `replayBuild`, and a description does not say which one fits that rule. `rebuildBuild` reruns the build with the same parameters, while `replayBuild` runs a changed script. These are the only two steps where a vstack rule needs exactly one tool. Setup reads the user's server's tool list and parameters before drafting any pin. It never names a tool absent from that list.

This supersedes [ADR 0020](0020-the-code-host-is-its-own-config-with-a-per-repo-operation-map.md)'s drafted MCP operation rows, not its operation ids. Skills keep using those ids as names for their steps. CLI configs, including `gh` and `glab`, keep their command rows. Those rows hold command knowledge that MCP descriptions supply for an MCP server, such as a paged query for review threads.

## Considered Options

- Naming only the server and facts removes all pins but leaves the read-only check and the constrained rerun to a new tool choice each run, which can pick a tool that changes something.
- Keeping a row for every MCP operation duplicates the server's descriptions and their tool names. Setup drafts many rows for the user to confirm, and they go stale when a server renames a tool.
- Also pinning the Code host's merge tool keeps the step that changes the default branch from guessing, but no vstack rule needs one exact merge tool, and it is one more line to keep.
- Pinning every write step would restore much of the per-operation map.
- Using different MCP shapes for the tracker, the Code host, and the CI service makes readers maintain separate conventions for the same kind of tool.

## Consequences

- implement's step 0a reads each needed MCP server's tool list live at the start of a run. It offers an End state only if tools exist for every needed operation. An unreachable server means commit only, with the server named in the gap. CLI configs still supply their operation rows.
- When `ci.md` has no rerun tool, babysit reports the proven flake for the human and reruns nothing.
- setup drafts facts and pins from the named server's tool list for an Other issue tracker, Code host, or CI service. Jira and Jenkins have no shipped templates. A tracker without a tool keeps its prose-paragraph path.
- On a re-run that creates a missing `ci.md`, setup also reduces an existing MCP `code-host.md` to the server, facts, and check pin. The user confirms the drafts before setup writes them.

The CI config split and this MCP shape are separate decisions. Either can change without superseding the other.
