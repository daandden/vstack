# Ticket publication Interface

The publisher consumes approved structured data. It creates tickets without readiness, installs relationships, reads back approved fields and relationships, and then applies readiness. GitHub uses the configured label. MCP maps labels and readiness separately, so readiness can live in a custom field. Local tickets use the configured `Status:` value. All tickets in the batch pass relationship readback before activation starts. Open blockers stay open. The frontier still excludes a ticket with an open blocker.

## Commands and receipts

`<to-tickets>` is this installed skill's directory.

```sh
bun <to-tickets>/scripts/publish.ts publish --input approved.json --record publication.json
bun <to-tickets>/scripts/publish.ts resume --record publication.json
```

`publish` refuses an existing record. `resume` reads the saved intent, not a revised input file. Both return one JSON receipt on stdout with `status`, the absolute `record` path, and `tickets` keyed by local identity. Saved ticket facts include the tracker `id`, whether relationship readback succeeded in `verified`, and whether activation readback succeeded in `ready`. A blocked receipt includes a `problem` with its category and actual error or reconciliation candidates. Exit code zero means the batch is complete. A blocked publication or invalid command exits nonzero. Invalid input produces a JSON error on stderr before publication starts.

The equivalent Bun Interface is `publish(input, recordPath, connection?)` and `resume(recordPath, connection?)` from `scripts/publisher.ts`. It returns the same receipt. Invalid input, an existing record, a corrupt record, or a held lock rejects before tracker effects. An MCP caller supplies the live transport connection described below. Both entry points use the same publisher. Tracker Adapters are internal.

Keep the approved input and record together. In Standard mode, they go under `<feature-slug>/` in the `to-tickets` Scratch kind, outside every checkout, so `resume` finds them from any worktree. In Private mode, they go under `<vstack root>/artifacts/<feature-slug>/`. The record contains the approved bodies and tracker facts. It is not a public tracker attachment.

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

Each ticket has a unique lowercase `key` made of letters, digits, and hyphens, starting with a letter or digit. `title` and `body` are nonempty strings. `labels` is an array of distinct nonempty strings that excludes the configured readiness value. Unsupported ticket fields are refused rather than discarded.

`parent` is optional. It names either another batch ticket with `{ "local": "01-foundation" }` or an existing tracker identity with `{ "external": "100" }`. `blockedBy` is an optional array of distinct local keys. Each named ticket blocks this ticket. Unknown keys and self-relationships are refused. The publisher checks parent cycles and blocking cycles separately. A parent may be blocked by its own child. Neither parent membership nor explanatory body references become blocking edges.

`tracker.readiness` is the actual value from the project's canonical `ready-for-agent` role mapping. Record it before approval. Approved ticket labels and readiness are separate concepts even when they share a tracker field. The approved bodies remain unchanged in the input and record. MCP body comparisons use the fixed normalization described below. Other modes compare the approved bytes. Native relationships or local headers carry resolved identities, so publication does not patch body prose with guessed references or recovery markers.

## Tracker modes

### GitHub CLI

Use `mode: "github"` and the configured `repo` as `owner/repo`. `command` is an optional argv prefix and defaults to `["gh"]`. The Adapter uses that CLI's authenticated `api` route, including paginated reads. It creates issues with the approved title, body, and non-readiness labels. Parent membership uses the native sub-issue relationship. A dependent's `dependencies/blocked_by` endpoint receives the blocker's database identity. These are separate relationships.

Readback requires issue fields, parent membership, dependency listing, and labels. Unavailable native capabilities stop publication. The publisher does not replace a missing capability with a parent-body edit or an inferred text edge.

### Other configured CLI routes

Use `mode: "cli"` and `routes` containing the configured `owner`, `search`, `create`, `read`, `parent`, `block`, and `activate` command rows as argv arrays. Preserve the project's CLI and command knowledge. Each command receives a JSON object on stdin with `facts` and the operation's values. An argv placeholder such as `{issue}`, `{parent}`, `{blocker}`, or `{readiness}` receives that value as one argument, without shell interpolation. Creation values include `title`, `body`, `labels`, and the stable `idempotencyKey`. Search receives `title`.

Routes return JSON. `owner` returns a string identity or `{ "id": "identity" }`. `create` returns `{ "id": "tracker-identity" }`. `search` returns an issue array. `read` returns one issue. The normalized issue fields are `id`, `title`, `body`, `labels`, `author`, `createdAt`, optional `parent`, and `blockedBy`. Identities and timestamps are strings. Labels and blockers are string arrays. Parent, block, and activation writes may return any JSON outcome. The following readback establishes their effect.

Use the CLI's JSON output or its configured JSON projection to produce this shape. Missing routes or readback remain capability gaps. A route must add only its authorized relationship or label. It must not rewrite a parent's fields or replace unrelated labels. `knownFailureExitCodes` may name documented exit codes that guarantee no tracker write occurred. Other command failures have uncertain outcomes. Set `idempotentCreate: true` only when the configured create route actually uses the stable key with provider-supported idempotency.

### MCP binding

Use `mode: "mcp"`, the configured `server`, project `facts`, and an approved `binding`. The agent drafts the binding from the named server's live tool descriptions and schemas. The user approves it with the ticket breakdown. Per-operation tool names belong only in this approved input, not in `issue-tracker.md`.

The public Bun Interface accepts a live `connection` with two transport methods:

- `listTools(server)` returns the named server's current tool names, descriptions, and `inputSchema` values. It preserves optional `outputSchema` metadata from the server, including `x-fastmcp-wrap-result`, so schema-declared envelopes can be decoded.
- `callTool(server, name, arguments)` invokes a bound tool and returns its actual result.

Both `publish` and `resume` validate the entire binding against `listTools` before any `callTool`. Every named tool must exist. All required parameters must be supplied, and values must satisfy the live schema's types and enums, including nested objects, arrays, and nullable alternatives. Each action must structurally bind its required roles to arguments. A literal that happens to equal today's title or project does not bind that role. The publisher validates actual rendered arguments again before each call. A failed check produces a named-server `capability-gap`. The publisher does not select replacement tools.

#### Actions and readback

`binding.actions` contains `search`, `read`, `create`, `block`, and `activate`. `owner` is optional when `facts.owner` supplies the authenticated identity. `parent` is optional when `create` carries `{parent}`. Each action has a `tool` name and an `arguments` object. `result` is an optional dot path into the decoded result. `owner` extracts an identity, `create` extracts the created identity, and `search` extracts the issue array. An empty result path selects the root.

Search can declare `pagination` with `offset` and `limit` argument names and a `total` path in the decoded response before `result` selection. Its argument template must start at offset `0` with a positive integer limit, and both parameters need numeric live schemas. The publisher advances by the number of returned issues until it reaches the stable total. Missing or invalid totals, changing totals, empty incomplete pages, and repeated issue identities block publication. Without a pagination declaration, raw issue arrays remain supported, but a conventional `total` that differs from the returned count blocks as incomplete.

Templates use `{issue}`, `{parent}`, `{blocker}`, `{dependent}`, `{title}`, `{body}`, `{labels}`, and `{readiness}`, plus recorded facts such as `{facts.projectKey}`. An exact whole placeholder retains its value's type, so `{labels}` supplies an array. Placeholders embedded in a search string receive JSON-quoted strings. Write `project = {facts.projectKey}`, not `project = "{facts.projectKey}"`. When an object is supplied for a string-typed parameter, the publisher JSON-encodes it after substitution. This supports JSON-string fields such as `additional_fields` without hand-escaped JSON.

The publisher resolves an approved parent before creation and creates local parents before their children. In a create template, an exact `{parent}` value is omitted when the ticket has no approved parent. A create-time parent binding needs no separate `parent` action. If a later parent operation is required but no action binds it, the publisher reports a parent capability gap rather than treating the write as successful.

`binding.issue` maps `id`, `title`, `body`, `labels`, `readiness`, `author`, `createdAt`, `parent`, `project`, and `issueType` to dot paths in each decoded issue. These paths cover flattened responses as well as nested `fields` responses. Labels and readiness each resolve to string arrays. When the provider omits an empty collection, an explicit `{ "path": "...", "empty": true }` mapping treats missing or null as an empty array. Without that declaration, absent collection readback is a capability gap. A missing optional parent means no parent. Project, issue type, and the mapped author identity must match the approved facts.

`blockedBy` can be a path to a string identity array. For directed link arrays, it contains `path`, `type`, and `sides`. `path` selects the link array. `type` selects each link's type. `sides.inwardIssue` and `sides.outwardIssue` select the issue identity on each side of a link. The publisher filters by `facts.linkType` and reads the side named by `facts.blockingSide`. Record that side as `inwardIssue` or `outwardIssue` according to the server's actual semantics as seen from the dependent. Add `"empty": true` only when the provider omits empty link arrays. Parent membership and body references establish no blocking direction.

Tool results can be JSON values, MCP `structuredContent`, or JSON in text content. When the live output schema declares `x-fastmcp-wrap-result: true` and a string `result`, the publisher decodes that structured string before applying binding paths. Other schemas retain legitimate `result` fields. Binding paths address decoded tool data, not the transport envelope. An unavailable live connection or an unsupported readback representation is a capability gap.

#### mcp-atlassian example

This `tracker` uses captured `mcp-atlassian` schemas and flattened issue results, with server-reported version `3.4.11` and package version `0.23.1`. Substitute the project's approved facts and custom field id. The example has no identity tool, so `facts.owner` is the token owner's tracker username. The required `issue_type` receives the name "Task", not an issue type id.

```json
{
	"mode": "mcp",
	"server": "mcp-atlassian",
	"readiness": "available",
	"facts": {
		"projectKey": "DEMO",
		"issueType": "Task",
		"linkType": "Dependency",
		"blockingSide": "inwardIssue",
		"owner": "publisher"
	},
	"binding": {
		"actions": {
			"search": {
				"tool": "jira_search",
				"arguments": {
					"jql": "project = {facts.projectKey} AND summary ~ {title}",
					"fields": "*all",
					"start_at": 0,
					"limit": 10
				},
				"result": "issues",
				"pagination": { "offset": "start_at", "limit": "limit", "total": "total" }
			},
			"read": {
				"tool": "jira_get_issue",
				"arguments": { "issue_key": "{issue}", "fields": "*all" }
			},
			"create": {
				"tool": "jira_create_issue",
				"arguments": {
					"project_key": "{facts.projectKey}",
					"summary": "{title}",
					"description": "{body}",
					"issue_type": "{facts.issueType}",
					"additional_fields": {
						"labels": "{labels}",
						"parent": "{parent}"
					}
				},
				"result": "key"
			},
			"block": {
				"tool": "jira_create_issue_link",
				"arguments": {
					"link_type": "{facts.linkType}",
					"inward_issue_key": "{blocker}",
					"outward_issue_key": "{dependent}"
				}
			},
			"activate": {
				"tool": "jira_update_issue",
				"replace": true,
				"arguments": {
					"issue_key": "{issue}",
					"fields": {},
					"additional_fields": {
						"customfield_10010": "{readinessValues}"
					}
				}
			}
		},
		"issue": {
			"id": "key",
			"title": "summary",
			"body": "description",
			"labels": { "path": "labels", "empty": true },
			"readiness": { "path": "customfield_10010.value", "empty": true },
			"author": "reporter.name",
			"createdAt": "created",
			"parent": "parent.key",
			"project": "project.key",
			"issueType": "issue_type.name",
			"blockedBy": {
				"path": "issuelinks",
				"empty": true,
				"type": "type.name",
				"sides": {
					"inwardIssue": "inward_issue.key",
					"outwardIssue": "outward_issue.key"
				}
			}
		}
	}
}
```

`jira_search` requires `jql`. In the example, a title of `Create the foundation` renders as `project = "DEMO" AND summary ~ "Create the foundation"`. Search returns `issues`, `total`, `start_at`, and `max_results`. The approved pagination exhausts the results before creation. The publisher checks candidates across all issue types in the configured project, with exact title and normalized body comparison. Uncertain-create reconciliation still requires the configured issue type, as does created-issue readback.

The create call receives `additional_fields` as a JSON string containing approved labels and, when present, the resolved parent. The activation call receives `fields` as the JSON string `{}` and `additional_fields` as a JSON string containing the readiness values. It changes neither system labels nor other fields.

#### Ownership, readiness, and body comparison

When `owner` is bound, its selected result establishes the authenticated identity. Otherwise `facts.owner` supplies that identity. Missing both is a capability gap. A created issue whose mapped author differs from that identity blocks publication. A search result or project listing is not evidence of the authenticated user.

The example maps `author` to `reporter.name` because mcp-atlassian's simplified issue result omits creator even with `fields: "*all"`. This is an explicitly approved weaker ownership check. Reporter is mutable and does not prove creator identity. Reconciliation still requires baseline exclusion, the creation window, title, normalized body, labels, and absence of readiness. Bind creator instead when the server exposes it.

Approved-field readback compares normalized `labels` exactly with the approved labels. When the label and readiness mappings select the same field, normalization removes only the configured readiness value from labels. When they select different fields, every system label must match, including any label equal to the readiness value. Premature-readiness detection, activation, and reconciliation read the complete `readiness` collection, not a substitute system-label field. Unrelated values in a separate readiness field do not fail approved-label readback. Readiness present before activation still blocks publication.

For additive activation, bind the authorized readiness addition. For replacement activation, set `replace: true` and bind `{readinessValues}` to the readiness field. The publisher reads that field's current values and unions them with the approved readiness value. Activation readback must contain readiness and every earlier value. It journals the earlier values before activation, so resume cannot forget a loss after an interrupted or failed write. In the example, `["unrelated"]` becomes `["unrelated", "available"]`. Copying system labels into the custom field does not preserve the readiness field.

MCP readback, uncertain-create reconciliation, and duplicate detection use one fixed body comparison. The fixtures in `tests/support/mcp-body-roundtrips.json` come from package `mcp-atlassian==0.23.1`'s offline Markdown-to-wiki and wiki-to-Markdown converters. The server-reported version `3.4.11` is not the package version.

The publisher normalizes CRLF line endings and removes trailing blank lines only at the end of fenced code content. It then compares canonical `Bun.markdown.html` output with GFM tables, strikethrough, and task lists enabled. Both `noHtmlBlocks` and `noHtmlSpans` are true, so raw HTML does not become equivalent to Markdown accidentally. The comparison preserves all other code whitespace, inline code, and link targets.

Equivalent emphasis, list numbering, spacing, and table formatting can compare equal. Lost list hierarchy does not. The offline nested-list fixture changes two-space indentation to six spaces and must block rather than discard that difference. Unsupported lossy conversions remain readback gaps. A body mismatch blocks with a diff. Titles, labels, and relationships remain exact. This comparison does not change CLI, GitHub, or local behavior.

Before each MCP create, a search result in the configured project with the approved title and a normalized-equal body stops that create with `duplicate-risk` and lists the candidates. It does not adopt external tickets or create another copy, including when a resumed record has no saved identities or operations.

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

MCP records created before the approved-binding format cannot resume transparently. Resume requires a valid binding in the original approved intent and does not migrate older records or adopt their tickets. Keep the original intent and record intact, and inspect saved identities and operations before deciding how to recover.

For an uncertain create, provider idempotency takes precedence when available. Otherwise reconciliation compares tracker candidates with the pre-create identity set, mapped author matched against the recorded owner, creation window, approved content, labels, and absence of readiness. The [ownership limitation](#ownership-readiness-and-body-comparison) applies when the approved MCP binding maps mutable reporter rather than creator. MCP compares normalized bodies. Other modes require the approved bytes. Only one new owned matching candidate establishes the outcome. Zero candidates or several candidates block publication and report the candidate state. Resume does not blindly create again or adopt preexisting work. GitHub timestamps use second precision, so the saved window starts at the attempted second. Identity-set exclusion still applies.

If tickets were published outside the publisher, inspect their identities and the saved operations before attempting recovery. A blocked record without identities or operations cannot adopt those tickets. For MCP, the duplicate-risk guard stops matching tickets from being created again. Keep the record intact and report the candidates. External publication is not permission to resume blindly, fabricate saved operations, or discard the record.

A record lock excludes another publisher. Resume recovers a lock whose recorded process no longer exists. A live or unknown owner is refused. If lock recovery itself was interrupted and left `<record>.recover`, establish that no publisher or recovery process owns it before removing that recovery directory. Keep the durable record and approved input intact. Do not remove the record to bypass uncertain reconciliation or use a changed input to redesign approved work.
