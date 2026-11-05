# Ticket publication Interface

The publisher consumes approved structured data. It creates tickets without readiness, installs relationships, reads back approved fields and relationships, and then applies readiness. Remote trackers use the configured label. Local tickets use the configured `Status:` value. All tickets in the batch pass relationship readback before activation starts. Open blockers stay open. The frontier still excludes a ticket with an open blocker.

## Commands and receipts

`<to-tickets>` is this installed skill's directory.

```sh
bun <to-tickets>/scripts/publish.ts publish --input approved.json --record publication.json
bun <to-tickets>/scripts/publish.ts resume --record publication.json
```

`publish` refuses an existing record. `resume` reads the saved intent, not a revised input file. Both return one JSON receipt on stdout with `status`, the absolute `record` path, and `tickets` keyed by local identity. Saved ticket facts include the tracker `id`, whether relationship readback succeeded in `verified`, and whether activation readback succeeded in `ready`. A blocked receipt includes a `problem` with its category and actual error or reconciliation candidates. Exit code zero means the batch is complete. A blocked publication or invalid command exits nonzero. Invalid input produces a JSON error on stderr before publication starts.

The equivalent Bun Interface is `publish(input, recordPath, connection?)` and `resume(recordPath, connection?)` from `scripts/publisher.ts`. It returns the same receipt. Invalid input, an existing record, a corrupt record, or a held lock rejects before tracker effects. An MCP caller supplies the live transport connection described below. Both entry points use the same publisher. Tracker Adapters are internal.

Keep the approved input and record together under `.scratch/<feature-slug>/` in Standard mode or `<vstack root>/artifacts/<feature-slug>/` in Private mode. The record contains the approved bodies and tracker facts. It is not a public tracker attachment.

## Approved description

The description has version `1`, `tracker`, and a nonempty `tickets` array. This example declares one blocking edge. The foundation's body reference to the dependent declares no reverse edge.

```json
{
	"version": 1,
	"tracker": {
		"mode": "github",
		"repo": "owner/project",
		"readiness": "ready-for-agent"
	},
	"tickets": [
		{
			"key": "01-foundation",
			"title": "Create the foundation",
			"body": "Build the approved foundation. The dependent provides context.",
			"labels": ["task"]
		},
		{
			"key": "02-dependent",
			"title": "Use the foundation",
			"body": "Deliver the approved dependent behavior.",
			"labels": ["task"],
			"parent": { "external": "100" },
			"blockedBy": ["01-foundation"]
		}
	]
}
```

Each ticket has a unique lowercase `key` made of letters, digits, and hyphens, starting with a letter or digit. `title` and `body` are nonempty strings. `labels` is an array of distinct nonempty strings that excludes the configured readiness label. Unsupported ticket fields are refused rather than discarded.

`parent` is optional. It names either another batch ticket with `{ "local": "01-foundation" }` or an existing tracker identity with `{ "external": "100" }`. `blockedBy` is an optional array of distinct local keys. Each named ticket blocks this ticket. Unknown keys and self-relationships are refused. The publisher checks parent cycles and blocking cycles separately. A parent may be blocked by its own child. Neither parent membership nor explanatory body references become blocking edges.

`tracker.readiness` is the actual value from the project's canonical `ready-for-agent` role mapping. Remote trackers use it as a label. Local tickets use it as their ready status. Record it before approval. Ticket bodies remain byte-for-byte approved content. Native relationships or local headers carry the resolved identities, so publication does not patch body prose with guessed references or recovery markers.

## Tracker modes

### GitHub CLI

Use `mode: "github"` and the configured `repo` as `owner/repo`. `command` is an optional argv prefix and defaults to `["gh"]`. The Adapter uses that CLI's authenticated `api` route, including paginated reads. It creates issues with the approved title, body, and non-readiness labels. Parent membership uses the native sub-issue relationship. A dependent's `dependencies/blocked_by` endpoint receives the blocker's database identity. These are separate relationships.

Readback requires issue fields, parent membership, dependency listing, and labels. Unavailable native capabilities stop publication. The publisher does not replace a missing capability with a parent-body edit or an inferred text edge.

### Other configured CLI routes

Use `mode: "cli"` and `routes` containing the configured `owner`, `search`, `create`, `read`, `parent`, `block`, and `activate` command rows as argv arrays. Preserve the project's CLI and command knowledge. Each command receives a JSON object on stdin with `facts` and the operation's values. An argv placeholder such as `{issue}`, `{parent}`, `{blocker}`, or `{readiness}` receives that value as one argument, without shell interpolation. Creation values include `title`, `body`, `labels`, and the stable `idempotencyKey`. Search receives `title`.

Routes return JSON. `owner` returns a string identity or `{ "id": "identity" }`. `create` returns `{ "id": "tracker-identity" }`. `search` returns an issue array. `read` returns one issue. The normalized issue fields are `id`, `title`, `body`, `labels`, `author`, `createdAt`, optional `parent`, and `blockedBy`. Identities and timestamps are strings. Labels and blockers are string arrays. Parent, block, and activation writes may return any JSON outcome. The following readback establishes their effect.

Use the CLI's JSON output or its configured JSON projection to produce this shape. Missing routes or readback remain capability gaps. A route must add only its authorized relationship or label. It must not rewrite a parent's fields or replace unrelated labels. `knownFailureExitCodes` may name documented exit codes that guarantee no tracker write occurred. Other command failures have uncertain outcomes. Set `idempotentCreate: true` only when the configured create route actually uses the stable key with provider-supported idempotency.

### MCP discovery

Use `mode: "mcp"`, the configured `server`, and `facts` containing the project's `project` or `projectKey` or `projectId`, `issueType` or `issueTypeId`, and `linkType` or `blockingLinkType`. Keep per-operation tool names out of project configuration.

The public Bun Interface accepts a live `connection` with two transport methods:

- `listTools(server)` returns the named server's current tool names, descriptions, and `inputSchema` values.
- `callTool(server, name, arguments)` invokes a discovered tool and returns its actual result.

The publisher selects an unambiguous schema-compatible tool for authenticated identity, search, full issue reads, creation, parent membership, directed blocking links, and additive labeling. It binds approved fields and recorded project facts to the current schemas. Flat parameter names must identify their roles, such as `issue`, `parent`, `blocker`, `dependent`, `title` or `summary`, `body` or `description`, `labels`, `project`, `issueType`, and `linkType`. Snake-case forms and issue-key or issue-id forms are supported. The blocking write must identify the blocker and dependent separately. Ambiguous tools, unsupported required parameters, missing fields, and incompatible schemas produce a named-server capability gap before writes. Discovery runs again on resume.

Tool results may be JSON values, MCP structured content, or JSON in text content. Full reads must expose the normalized issue fields above plus `project` and `issueType`. Jira-style `key` and `fields` readbacks are supported when the description is text. For Jira `issuelinks`, record `facts.blockingSide` as `inwardIssue` or `outwardIssue` from the server's actual relationship semantics. This identifies the blocker as seen from the dependent. The publisher never guesses a direction from a parent or a prose reference. Unsupported rich-text representations remain readback gaps rather than lossy conversions of approved content.

A tool that advertises provider idempotency and accepts an `idempotencyKey` receives the stable key on initial creation and recovery. Otherwise the publisher uses owned-state reconciliation. An unavailable live connection is an explicit gap. It is not permission to publish through agent-selected writes outside the publisher.

### Local Markdown

Use `mode: "local"` and an absolute `directory`. Each ticket is `<directory>/<key>.md`. Number keys before approval when the configured workflow needs numbered filenames.

A local file starts with a JSON metadata fence, followed by `Status:` and `Blocked by:` lines, a blank line, and its exact approved body. Metadata stores title, non-readiness labels, identity, parent, author, and creation time. `Status: draft` excludes an unfinished publication from the frontier. Activation sets `Status:` to the configured readiness value only after every ticket's required files and relationships read back.

`Blocked by:` contains comma-separated full ticket keys, such as `01-foundation, 02-schema`, or `None`. The Adapter reads blockers and status from these lines, not JSON copies. The existing workflow claims a ready, unblocked ticket by setting `Status: claimed`. It resolves the ticket by appending an `## Answer` and setting `Status: resolved`. A dependent becomes unblocked when every listed ticket is resolved. Publication leaves blockers open.

Discovery recognizes publisher-owned metadata through `author: "local-publisher"`. It skips unrelated Markdown, including convention-format tickets and ordinary parent documents. An occupied approved filename or a publisher-owned identity that differs from its filename blocks publication with `local-identity-conflict`. Discovery does not adopt existing tickets.

File creation is exclusive and atomic. Existing unrelated tickets are not overwritten. Parents may be local ticket keys or existing Markdown file paths. An external parent path resolves relative to the ticket directory unless it is absolute. Parent content stays unchanged. A missing or non-regular parent prevents activation.

### No tool

`mode: "none"` persists the intent and returns a blocked capability gap without creating or activating tickets.

## Resume and reconciliation

The record is synced before tracker writes. Each write first saves a pending operation. Returned identities and outcomes are synced as soon as they are available. The journal distinguishes succeeded operations, known failures, and uncertain outcomes. A killed publisher can leave an operation pending, which resume treats as uncertain.

Resume preserves approved intent and checks the authenticated ownership identity. It reads existing relationships before adding a missing approved relationship. It never removes an unrelated relationship to force a match. Changed content or extra relationships block readback rather than trigger a rewrite. It neither closes nor edits a parent's fields.

For an uncertain create, provider idempotency takes precedence when available. Otherwise reconciliation compares tracker candidates with the pre-create identity set, authenticated creator, creation window, exact approved content, and labels. Only one new owned matching candidate establishes the outcome. Zero candidates or several candidates block publication and report the candidate state. Resume does not blindly create again or adopt preexisting work. GitHub timestamps use second precision, so the saved window starts at the attempted second. Identity-set exclusion still applies.

A record lock excludes another publisher. Resume recovers a lock whose recorded process no longer exists. A live or unknown owner is refused. If lock recovery itself was interrupted and left `<record>.recover`, establish that no publisher or recovery process owns it before removing that recovery directory. Keep the durable record and approved input intact. Do not remove the record to bypass uncertain reconciliation or use a changed input to redesign approved work.
