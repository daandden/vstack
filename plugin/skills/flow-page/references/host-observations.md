# Local host and read-only observations

Read this reference before configuring an observation adapter, recovering an unavailable checkout, diagnosing host startup, changing a host namespace, or presenting a live/static fallback.

## Read-only observations

The host observes git and the separately configured Code host and CI service while a page is being read. It never runs the operation strings in project configuration. Observation changes update the open page without changing the authored revision, task completion, requested or reached End state, or Flow lifecycle.

The built-in native adapters support GitHub and GitHub Actions. GitLab has no built-in native observation adapter. A GitLab Code host or CI service remains `unknown` unless its configuration selects the provider-neutral `http-json` contract below. Setup's `glab` workflow commands do not select an observation adapter and are never executed by the host.

Existing `code-host.md` facts `Host: GitHub` and `Repo: owner/repo` select the fixed `gh pr list` adapter. Existing `ci.md` facts `CI service: GitHub Actions` and its own `Repo` select the fixed `gh run list` adapter independently. Repo values can be backtick-quoted as setup writes them. The files live under `docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. A Flow's most recently recorded `branch:` alias selects the remote branch. Without one, the adapter reads the checkout's branch. A detached checkout needs a branch alias. Record it with `alias branch:<branch>`.

Worktrees of one project can intentionally share a Flow. Successful authoring or an explicit `bind` registers checkout context under the Flow lock, even in static-only mode. Read-only `show`, `find`, and `render` do not take ownership away from that context. Observations use the most recently registered available checkout. If a disposable checkout disappears, the host can use another registered checkout. To register a replacement, continue authoring or bind the in-progress Stage from an available worktree. Keep the intended remote branch as a `branch:` alias. Inspect each observation's adapter, source, timestamps, and available `checkout`, `stage`, and `branch` provenance before drawing conclusions. Checkout recovery changes no authored progress or delivery evidence.

The detached host needs `git` and, for GitHub adapters, an authenticated `gh` on its startup `PATH` in the same user's home. Missing credentials, tools, or checkout access are observation failures, never a reason to run setup or log in automatically. Repository and provider errors are not copied into the page. Git reads HEAD, the branch, and tracked working-tree changes with optional locks disabled.

An optional `- Flow observation: <JSON>` line in either configuration file overrides only that service's adapter. `adapter` is `github` in Code host configuration, `github-actions` in CI configuration, or `http-json` for a separate read-only JSON service. The GitHub adapters take `repo: "owner/repo"`. All adapters accept `poll_seconds`, at least `0.1`, default `15`, and positive `stale_after_seconds`, default `120`. Unsupported or absent provider configuration is unknown. Invalid override configuration is unavailable.

For example, a controlled Code host adapter can use:

```text
- Flow observation: {"adapter":"http-json","url":"http://127.0.0.1:43120/prs","poll_seconds":1,"stale_after_seconds":120}
```

The HTTP adapter sends only GET, follows no redirects, and accepts HTTPS or loopback `http://127.0.0.1`. URLs contain no credentials, query, or fragment. The service returns `{ "observed_at": "<ISO timestamp>", "records": [{ "name": "PR 42", "state": "open", "url": "https://..." }] }`. `url` is optional. Code host states are `open`, `merged`, `closed`, or `unknown`. CI states are `passed`, `failed`, `pending`, `cancelled`, `skipped`, or `unknown`. At most 100 records are accepted. Keep secrets out of record names and URLs. There are no configured commands, scripts, write operations, or browser-triggered actions.

Each observation shows its adapter, source, last observation time, and attempt time. `current` means a recent successful read, not a successful build. `stale` keeps a last observation when its freshness period expires or a later read fails. `unavailable` means a read failed with no observation from that source. `unknown` means no configured adapter or no matching records. Empty results do not mean passed checks. A configuration or branch change discards the earlier source's cache. Restarting the host observes again. Observations are not authored evidence or durable workflow history. Static exports show unknown observations and preserve reported records.


## Present the page

Never open the page automatically. When `live.state` is `serving`, print `live.url`. That scoped read link stays the same across folder moves and host restarts. When `live.state` is `unavailable`, print the plain absolute `page` path and `live.error`. The contribution remains committed. `live.state: "off"` means static-only mode.

An open live page receives committed answers, Results, task changes, and new Stages without a reload. Live refresh preserves the selected Stage and reading stop by stable id, URL fragment, reading position, focus, and open evidence disclosures. Corrected combined browser/native proof exercised observation polling and authored updates, including short Stages where the selected question cannot align beneath the bar. A static file does not receive live updates.

The script starts one detached Local Flow host per operating-system user in the normal home namespace. An explicit `--home <path>` selects an isolated namespace with its own discovery record and credentials, not another identity in the normal host. Two namespaces cannot share a bound port. The default loopback port is `42000 + uid % 10000`. `VSTACK_FLOW_PORT` selects a different port before startup. The running host's discovery record takes precedence until it stops. Hosts with different code or Bun runtimes report incompatibility instead of serving a page with an old renderer. Run `host stop` to stop that authenticated host, then retry the original command.

`host status` reports the host without starting it. `host stop` stops only the host authenticated by this home's private credential. A port held by another program or another home's host stays untouched. The private discovery and secrets live under `<home>/.vstack/host/`. Do not attach these files as evidence.

The host stops after 30 idle minutes with no connected reader, publication, or progress sync. `VSTACK_FLOW_IDLE_SECONDS` changes that duration. Set `VSTACK_FLOW_HOST=off` for static-only authoring. Static pages remain readable with the server stopped. Browser links grant read access to one Flow, never authoring, host control, commands, tracker mutations, or merging.
