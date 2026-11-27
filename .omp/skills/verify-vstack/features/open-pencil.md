# OpenPencil design work and Design baselines

The visible `open-pencil` Utility works on named designs through the user's existing OpenPencil MCP server. It leaves unnamed documents and unrequested changes alone. New Design baselines require the editor. Implement and Verify can fetch an existing Design baseline, check its bytes, and render its frames without the editor or MCP connection.

## Sub-features

- `open-pencil-targeting`: a fresh consumer edits only the named frame, even with a different document active.
- `open-pencil-server-unavailable`: a fresh consumer reports an unreachable MCP server and stops live design work.
- `open-pencil-baseline`: agreed bytes are stored once in PikPak, reused by exact file ID, refused on a byte mismatch, and consumed in file mode.
- [Native Utility discovery](frontend-guidance.md#native-utility-discovery) proves description and command visibility, not actual selection.

## How to get to it (user POV)

- Ask a fresh omp session with OpenPencil MCP access to edit a named frame. Name the document, page, frame, and change.
- Type `/skill:open-pencil` to load the Utility directly.
- Agree to the saved `.fig`, its SHA-256, the named frames, and the resolved PikPak folder in one question. In a later implementation or verification session, give the recorded Design baseline from the spec.

## Driving it with native omp and OpenPencil MCP

Preconditions: Follow [Native Utility discovery](frontend-guidance.md#native-utility-discovery) for the offline portion. Before the native behavioral cases, record explicit approval for real-model sessions and any fixture dependency installs. For missing approval, follow `skill://tdd`'s Costly seam rule and use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract, or plain `ask` outside a Flow. Workers return the question to the coordinator. Without approval, leave the affected case unrun.

Use the [real-model isolation recipe](flow-page.md#real-model-enrollment-flow-enrollment), including the checkout's package and skill path, Session model and thinking level, a new session directory per case, raw RPC output, and saved history. Use the user's available OpenPencil desktop app, but only a run-owned MCP connection and disposable documents. The targeting and unreachable-connection cases need no external design store or token.

### Scope the fixtures

Step `open-pencil-fixture`: Use the run's MCP client to call `tools/list`. Retain the returned names and schemas for document creation, frame creation, reads, saves, and activation. Use the installed stdio bridge for the native connection when available. For a disposable project, put only the run's connection under `mcpServers` in the project's `.omp/mcp.json`. For example, for an already installed local bridge:

```json
{"mcpServers":{"open-pencil":{"command":"openpencil-mcp","env":{"OPENPENCIL_MCP_ROOT":"<run-owned ordinary directory>"}}}}
```

Set `mcp.shared: false` and `mcp.startupTimeoutMs: 0` in the native run overlay. Launch each process with `--cwd` pointing to its disposable project and `-e "$CHECKOUT/plugin"` as in the real-model isolation recipe. Check the process's actual MCP inventory before sending a prompt. If a connection other than the run's connection also exposes OpenPencil tools, stop the case. Do not change user settings to hide it.

In a run-owned ordinary directory accepted by the app, create and save `Target.fig` and `Decoy.fig`. Use `create_document`, `render` or `create_shape`, and `save_document` if the live schemas expose them. The two documents each need a page named `Design` and a frame named `Checkout`. Give each frame a distinct sentinel layer. Include another frame on `Target.fig`'s `Design` page and another page in `Target.fig`, with sentinels to detect wrong-frame and wrong-page writes. Resolve actual document, page, and node IDs from `list_documents` and frame reads, and pass them explicitly for fixture calls. Capture both documents' exact baseline trees and saved file hashes. Activate `Decoy.fig` last and record `list_documents` showing it active. Do not put native fixture `.fig` files in Scratch or a dot directory.

Use the [fixture privacy relay](../scripts/open-pencil-fixture-relay.ts) for every reachable native targeting or Design baseline consumer. Set `command: "bun"` and pass `--no-env-file`, the relay's absolute path, the installed `openpencil-mcp` path, and the fixture directory as `args`. Keep `OPENPENCIL_MCP_ROOT` set to the fixture directory. Before sending the native prompt, use a driver-side client on the same relay configuration to verify that `list_documents` contains only the two fixture documents, with their expected IDs and active flags. Keep only fixture data and the count of dropped rows in evidence. Stop if the relay is missing, it refuses the listing, or you cannot establish filtering. Do not substitute an unfiltered native connection. Keep the independent fixture reads on the original connection.

### Design against the named target

Step `open-pencil-targeting`: Require the filtered fixture inventory above before sending the native prompt. In a fresh native session, send an ordinary user request, without a skill header, for example:

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

### Scope the Design baseline account drive

Preconditions: The Design baseline drive is a Costly seam. Before writing a real-account test or running the drive, record the maintainer's approval and allowance for the account operations and fresh real-model sessions. For missing approval, follow the Costly seam and `ask` route above. Require the official `pikpak` and `openpencil` CLIs, PikPak access, the fixture fonts, and one `Read & write files` Personal Access Token. Check that the privately supplied token file is present and mode `0600` without reading it in the model session. Missing approval or the token file leaves the real-account test unrun. Do not use a cached login.

Stage the [PikPak proof launcher](../scripts/pikpak-launchers/README.md). The driver alone creates the run folder. Give native consumers the absolute launcher path, never a token, account profile, or bare PikPak CLI. Keep captured output redacted.

Step `open-pencil-launcher-stub-suite`: Run `bun --no-env-file "$launcher_source/test-launchers.ts" suite "$stub_evidence"` with a byte-checked launcher source and an empty evidence directory. Retain the command, exit status, stdout, stderr, and `$stub_evidence/cases.log`. Require exit 0 and passing cases.

Step `open-pencil-pikpak-live-preflight`: Record the official CLI version and help. Start the scoped drive with `"$driver" run --preflight "$fixture" -- "$proof_command"`. Retain the command, exit status, and redacted driver stdout and stderr. Require the creation receipt, an empty folder listing, and `pagination_followed` before the proof command starts. If `pagination_followed` is false, record that the provider returned no cursor and pagination was not exercised.

The live proof showed that PikPak accepted an upload with a `Read files` token. The maintainer retired the upload-denial probe and chose one writable token for every case, including offline consumption. Report only that the launcher refused non-download calls in download-only mode. The launcher is not a process boundary. Integrity rests on the exact file ID and the agreed SHA-256. A fetch does not authorize a remote write.

Step `open-pencil-baseline-fixtures`: Start the drive with the driver's creation receipt and empty listing. Create fresh `Target.fig` and `Decoy.fig` as in [Scope the fixtures](#scope-the-fixtures). Choose a small, named viewport and theme and a known available font. A fresh native consumer designs and saves the named `Checkout` frame while `Decoy.fig` is active. Read both documents independently. Preserve the saved file hash and frame node ID, and export that node to PNG from the saved file. Show the PNG, saved `.fig` path, frame node ID, full SHA-256, and resolved PikPak folder name and ID. Follow the [Design baseline agreement](../../../../plugin/skills/open-pencil/references/create-design-baseline.md). The one question covers the frames and transfer of the exact saved bytes to that folder. Preserve the maintainer's answer separately from the native transcript. A scripted picker response is not agreement.

### Drive the Design baseline

Use `{"type":"prompt","message":"..."}` in each native turn. Supply the design names or the recorded baseline fields as the user would. Give the native consumer only the scoped launcher path. Record the requested action and the actual tools and arguments. Do not substitute the verifier's own successful upload or render for native behavior.

Step `open-pencil-baseline-upload`: Ask the native consumer to hand over the agreed `Checkout` frame in `Target.fig` to the run's PikPak folder while `Decoy.fig` is still active. Require the consumer to make a private copy in the fixture directory, check its SHA-256 against the agreement, and upload only that copy. Require no new save. Require one upload via the writable launcher and an exact-ID download before the consumer returns a spec-ready record. Confirm that the decoy and other frames or pages were unchanged. Use the writable launcher to list all folder pages and download the returned file ID to an independent path. Compare `shasum -a 256` on the download and the agreed digest. Require one exact `<sha256>.fig` with that ID, the agreed frame node IDs, and the mapped behavior and token requirements. Retain the source check, CLI results, and before and after inventories.

Step `open-pencil-baseline-reuse`: Hand over the same agreed saved file again. Require its original SHA-256, the original file ID, another exact-ID byte check, no upload or save call, and an unchanged remote inventory.

Step `open-pencil-baseline-mismatch`: Have a fresh native consumer save a different revision and independently confirm its SHA-256. Export the new frame and obtain the maintainer's explicit agreement as in the fixture step. Stop before planting or prompting for handoff until that agreement is recorded. Via the writable launcher, plant a file named for the new digest but containing different bytes, such as the decoy `.fig`. Independently download the planted ID and confirm the mismatch. Ask the fresh consumer to hand over the agreed saved file without saving again. Require the consumer to download that exact ID, report the mismatch and ID, and return no baseline record. Require no upload, overwrite, deletion, or switch to another design. Check that both remote IDs and their bytes are unchanged.

Step `open-pencil-baseline-offline`: Finish the writable cases, then run `"$PIKPAK_DRIVER" download-only "$file_id"`. Retain the receipt and require its initial CLI home entries to be empty. The driver uses a separate home for the exact-ID download with the same token. Run a fresh native consumer with the unreachable run-owned connection above. Keep the desktop app running. Pass only the launcher path, file ID, SHA-256, and agreed node IDs. Check that the launcher refuses non-download calls and downloads for other IDs. Require the native trace to show an exact-ID fetch, a matching digest, and a strict file-mode render of the agreed nodes. Keep the render command, node IDs, and output dimensions. Require no remote writes, alternate MCP connection, active-tab fallback, or regenerated baseline.

Step `open-pencil-baseline-cleanup`: End the drive after success, refusal, or failure. Only the driver can remove the folder. It binds deletion to its `mkdir` receipt and a fresh parent listing. Require exit 0, the v0.6.0 acceptance line for one item for the single ID passed to `rm`, and a fresh paginated parent listing without that ID. Never query account-wide trash. The driver removes both CLI homes. Keep journal archive and remote cleanup outcomes separately. Remove the private launcher installation, close only the run's OpenPencil tabs and connections, and remove their disposable files. Use the shared Cleanup for native processes and fixture data. Keep redacted output, inventories, receipts, and teardown results. If cleanup is unverified, report the exact folder ID and what failed.

When the change also builds a user interface, compare each strict render with its browser capture at the same viewport and theme. Record visual mismatches separately from keyboard, focus, and form behavior. The storage drive alone proves neither visual parity with a build nor UI behavior.

## Gotchas

- Keep the running app and maintainer connections untouched. A run-owned unreachable endpoint tests server failure, not desktop app failure. Report the unexercised app branch separately.
- Starting a fresh process or printing the description does not prove instruction following. A stub provides inventory proof only. Missing approval, missing capabilities, or an unavailable fixture is a named proof gap.
- The native trace must match the two documents' observed state. An agent's reply cannot prove isolation, and an independent script must not perform the requested edit on its behalf.
- For skipped and failed baseline steps, name the exact missing precondition or contradicted guarantee. An image without a matching digest does not count.
