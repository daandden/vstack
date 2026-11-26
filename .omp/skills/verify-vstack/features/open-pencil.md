# OpenPencil design work

The visible `open-pencil` Utility uses the user's existing OpenPencil MCP server to work on named designs. It leaves unnamed documents and unrequested changes alone. If the server is unavailable, live work stops without a fallback.

## Sub-features

- `open-pencil-targeting`: a fresh consumer edits only the named frame, even with a different document active.
- `open-pencil-server-unavailable`: a fresh consumer reports an unreachable MCP server and stops live design work.
- [Native Utility discovery](frontend-guidance.md#native-utility-discovery) proves description and command visibility, not actual selection.

## How to get to it (user POV)

- Ask a fresh omp session with OpenPencil MCP access to edit a named frame. Name the document, page, frame, and change.
- Type `/skill:open-pencil` to load the Utility directly.

## Driving it with native omp and OpenPencil MCP

Preconditions: Follow [Native Utility discovery](frontend-guidance.md#native-utility-discovery) for the offline portion. Before the native behavioral cases, obtain explicit approval for real-model sessions and any fixture dependency installs. Use the [real-model isolation recipe](flow-page.md#real-model-enrollment-flow-enrollment), including the checkout's package and skill path, Session model and thinking level, a new session directory per case, raw RPC output, and saved history. Use the user's available OpenPencil desktop app, but only a run-owned MCP connection and disposable documents. No external design store or token is needed.

### Scope the fixtures

Step `open-pencil-fixture`: Use the run's MCP client to call `tools/list`. Retain the returned names and schemas for document creation, frame creation, reads, saves, and activation. Use the installed stdio bridge for the native connection when available. For a disposable project, put only the run's connection under `mcpServers` in the project's `.omp/mcp.json`. For example, for an already installed local bridge:

```json
{"mcpServers":{"open-pencil":{"command":"openpencil-mcp","env":{"OPENPENCIL_MCP_ROOT":"<run-owned ordinary directory>"}}}}
```

Set `mcp.shared: false` and `mcp.startupTimeoutMs: 0` in the native run overlay. Launch each process with `--cwd` pointing to its disposable project and `-e "$CHECKOUT/plugin"` as in the real-model isolation recipe. Check the process's actual MCP inventory before sending a prompt. If a connection other than the run's connection also exposes OpenPencil tools, stop the case. Do not change user settings to hide it.

In a run-owned ordinary directory accepted by the app, create and save `Target.fig` and `Decoy.fig`. Use `create_document`, `render` or `create_shape`, and `save_document` if the live schemas expose them. The two documents each need a page named `Design` and a frame named `Checkout`. Give each frame a distinct sentinel layer. Include another frame on `Target.fig`'s `Design` page and another page in `Target.fig`, with sentinels to detect wrong-frame and wrong-page writes. Resolve actual document, page, and node IDs from `list_documents` and frame reads, and pass them explicitly for fixture calls. Capture both documents' exact baseline trees and saved file hashes. Activate `Decoy.fig` last and record `list_documents` showing it active. Do not put native fixture `.fig` files in Scratch or a dot directory.

### Design against the named target

Step `open-pencil-targeting`: In a fresh native session, send an ordinary user request, without a skill header, for example:

```json
{"type":"prompt","message":"In OpenPencil, add a text layer that reads Delivery estimate to the Checkout frame on the Design page of Target.fig. Do not change other pages, frames, comments, or statuses."}
```

Save the actual checkout `open-pencil` skill read, tool inventory, timed sequence of tool calls and results, and final reply. Require live discovery, explicit native document and page IDs and the target frame or parent ID in the edit, and a readback of that frame. After the turn, inspect both complete documents with independent, explicitly targeted reads. Require the new text within the named frame and no other changes in the target's other frames or pages or in the decoy document. No call may activate a different tab to substitute for explicit targeting. Match the native tool trace against the raw before and after observations.

### Isolate an unreachable connection

Step `open-pencil-server-unavailable`: In a second disposable project, replace only the run's MCP configuration with a loopback HTTP connection to an unused port. Confirm that no service is listening there and retain the connection failure. Put this in that disposable project's `.omp/mcp.json`:

```json
{"mcpServers":{"open-pencil":{"type":"http","url":"http://127.0.0.1:<unused-port>/mcp"}}}
```

In another fresh native process with the same overlay and distinct evidence, require no healthy OpenPencil connection in its inventory. Send a typed request so absence of tools cannot hide whether the Utility loaded:

```json
{"type":"prompt","message":"/skill:open-pencil Add a text layer that reads Delivery estimate to the Checkout frame on the Design page of Target.fig through this session's configured OpenPencil MCP connection."}
```

Retain the expanded skill invocation and connection diagnostic. Require the consumer to identify the unavailable OpenPencil MCP server, leave the app's availability undiagnosed, and stop without design edits or another connection, CLI, or app automation. Independently read both fixture documents over the original working connection after the case. Confirm that no document changed during the unavailable-connection case and that the desktop app still responds. Retain launch, diagnostic, before and after observations, and teardown evidence. Close only the run's own tabs and connections, and delete only its disposable fixture files.

## Gotchas

- Keep the running app and maintainer connections untouched. A run-owned unreachable endpoint tests server failure, not desktop app failure. Report the unexercised app branch separately.
- Starting a fresh process or printing the description does not prove instruction following. A stub provides inventory proof only. Missing approval, missing capabilities, or an unavailable fixture is a named proof gap.
- The native trace must match the two documents' observed state. An agent's reply cannot prove isolation, and an independent script must not perform the requested edit on its behalf.
