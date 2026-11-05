# Local host and read-only observations

Read this reference before configuring an observation adapter, recovering an unavailable checkout, diagnosing host startup or an unavailable reader, changing a host namespace, or presenting the Flow URL.

## Read-only observations

The host observes git and the separately configured Code host and CI service while a page is being read. It never runs the operation strings in project configuration. Observation changes update the open page without changing the authored revision, task completion, requested or reached End state, or Flow lifecycle.

The built-in native adapters support GitHub and GitHub Actions. GitLab has no built-in native observation adapter. A GitLab Code host or CI service remains `unknown` unless its configuration selects the provider-neutral `http-json` contract below. Setup's `glab` workflow commands do not select an observation adapter and are never executed by the host.

Existing `code-host.md` facts `Host: GitHub` and `Repo: owner/repo` select the fixed `gh pr list` adapter. Existing `ci.md` facts `CI service: GitHub Actions` and its own `Repo` select the fixed `gh run list` adapter independently. Repo values can be backtick-quoted as setup writes them. The files live under `docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. A Flow's most recently recorded `branch:` alias selects the remote branch. Without one, the adapter reads the checkout's branch. A detached checkout needs a branch alias. Record it with `alias branch:<branch>`.

Worktrees of one project can intentionally share a Flow. Successful authoring or an explicit `bind` registers checkout context under the Flow lock, even with the host turned off. Read-only `show` and `find` do not take ownership away from that context. Observations use the most recently registered available checkout. If a disposable checkout disappears, the host can use another registered checkout. To register a replacement, continue authoring or bind the in-progress Stage from an available worktree. Keep the intended remote branch as a `branch:` alias. Inspect each observation's adapter, source, timestamps, and available `checkout`, `stage`, and `branch` provenance before drawing conclusions. Checkout recovery changes no authored progress or delivery evidence.

The detached host needs `git` and, for GitHub adapters, an authenticated `gh` on its startup `PATH` in the same user's home. Missing credentials, tools, or checkout access are observation failures, never a reason to run setup or log in automatically. Repository and provider errors are not copied into the page. Git reads HEAD, the branch, and tracked working-tree changes with optional locks disabled.

An optional `- Flow observation: <JSON>` line in either configuration file overrides only that service's adapter. `adapter` is `github` in Code host configuration, `github-actions` in CI configuration, or `http-json` for a separate read-only JSON service. The GitHub adapters take `repo: "owner/repo"`. All adapters accept `poll_seconds`, at least `0.1`, default `15`, and positive `stale_after_seconds`, default `120`. Unsupported or absent provider configuration is unknown. Invalid override configuration is unavailable.

For example, a controlled Code host adapter can use:

```text
- Flow observation: {"adapter":"http-json","url":"http://127.0.0.1:43120/prs","poll_seconds":1,"stale_after_seconds":120}
```

The HTTP adapter sends only GET, follows no redirects, and accepts HTTPS or loopback `http://127.0.0.1`. URLs contain no credentials, query, or fragment. The service returns `{ "observed_at": "<ISO timestamp>", "records": [{ "name": "PR 42", "state": "open", "url": "https://..." }] }`. `url` is optional. Code host states are `open`, `merged`, `closed`, or `unknown`. CI states are `passed`, `failed`, `pending`, `cancelled`, `skipped`, or `unknown`. At most 100 records are accepted. Keep secrets out of record names and URLs. There are no configured commands, scripts, write operations, or browser-triggered actions.

Each observation shows its adapter, source, last observation time, and attempt time. `current` means a recent successful read, not a successful build. `stale` keeps a last observation when its freshness period expires or a later read fails. `unavailable` means a read failed with no observation from that source. `unknown` means no configured adapter or no matching records. Empty results do not mean passed checks. A configuration or branch change discards the earlier source's cache. Restarting the host observes again. Observations are not authored evidence or durable workflow history.


## Present the page

Never open the page automatically. Present links only at the question handoffs defined by flow-page's "Every ask in a Flow" contract, using the receipt's `live.url`. That scoped read link stays the same across folder moves and host restarts. The reader needs the host: there is no static file to print instead. When `live.state` is `unavailable`, report `live.error` as diagnostics and say the contribution remains committed. Fix the named cause, such as a port another program holds or an incompatible running host, then run `bound` or `show` for the URL. `live.state: "off"` means `VSTACK_FLOW_HOST=off` turned the host off, so no reader is available. Result-only replies and completion summaries have no Flow link or path reminder.

An open reader receives committed answers, Results, task changes, and new Stages without a reload. Live refresh preserves the selected reading stop by stable id, URL fragment, reading position, focus, open evidence disclosures, demo state, quiz attempts, and video position. While the host is unreachable, the open reader keeps its last content and says it is reconnecting. The read-scoped `content` route beside the page exposes the content view and its authoritative `reading` order. `historical` references have no invented position or publication revision; `publications` carry both. The reader consumes this same content-owned order.

Readers poll the read-scoped `versions` route for the authored `revision` and independent `observationVersion`. Each reader finishes its requests before scheduling another poll and bounds each request to five seconds. It reads `content` only for a newer authored revision and `observations` only for a changed observation version. Hidden readers use the same finite requests, so correctness does not depend on visibility signals and parked pages do not hold persistent update connections.

The reader is a Nuxt app built ahead of time and shipped with the plugin under `skills/flow-page/reader/`. The host loads it into memory once at startup and serves it at `/_flow-reader/`, without the Flow capability, from its own origin only. A missing build makes every authoring receipt report `unavailable` with the rebuild command, and the content still commits.

The script starts one detached Local Flow host per operating-system user in the normal home namespace. An explicit `--home <path>` selects an isolated namespace with its own discovery record and credentials, not another identity in the normal host. Two namespaces cannot share a bound port. The default loopback port is `42000 + uid % 10000`. `VSTACK_FLOW_PORT` selects a different port before startup. The running host's discovery record takes precedence until it stops. A command using different flow-page code, reader bytes, or Bun runtime reports incompatibility; the running host keeps serving its startup reader bytes until stopped. After a plugin refresh, run `host stop` with the same `--home` namespace, then `bound` or `show` to start the updated host. Reload an already-open page to load the new reader. Do not resubmit a contribution whose receipt already committed it, and do not stop another namespace's host to free a port.

`host status` reports the host without starting it. `host stop` stops only the host authenticated by this home's private credential. A port held by another program or another home's host stays untouched. The private discovery and secrets live under `<home>/.vstack/host/`. Do not attach these files as evidence.

The host stops after 30 idle minutes with no connected reader, publication, or progress sync. `VSTACK_FLOW_IDLE_SECONDS` changes that duration. `VSTACK_FLOW_HOST=off` turns the host off: authoring still commits, and no reader is available until the host runs. Browser links grant read access to one Flow, never authoring, host control, commands, tracker mutations, or merging.
