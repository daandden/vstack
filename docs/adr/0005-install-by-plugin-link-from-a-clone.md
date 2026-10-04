# Install vstack by linking a local clone, not from the marketplace

vstack is installed with `omp plugin link <clone>/plugin` from a local clone of `daandden/vstack`, the way `omp-tools` is, and the repo carries no `.omp-plugin/marketplace.json`. Refreshing is `git pull` in the clone followed by a new omp session. We chose this because the linked working tree is live: there is no catalog clone or plugin cache to refresh, and no `marketplace update` or `upgrade` step that silently reinstalls stale content (see "Prove the vstack omp marketplace plugin installs from the private repo", daandden/vstack#41). This supersedes only the install channel in ADR 0003. vstack is still one omp plugin in `plugin/`, not a `skills` CLI install.

## Considered Options

- **The `daandden` marketplace (ADR 0003's channel)**: rejected. Every refresh needs `omp plugin marketplace update` first. Upgrading all plugins and `marketplace.autoUpdate` skip a commit unless the catalog `version` grows, and the catalog has to sit on the default branch.
- **Link on the Update machine, marketplace everywhere else**: rejected. It means two install channels to document, keep in sync, and migrate.

## Consequences

- `plugin/package.json` is required. It holds `name: vstack`, the semver `version`, and an `omp` field. Without the `omp` field, omp 18.6.1 discovered none of the linked root's skills, agents, or rules.
- Linked plugins load through the `omp-plugins` provider, which has priority 90. Plugin skills still outrank leftover `~/.agents/skills` copies (priority 70), as ADR 0003 states.
- Commands are not namespaced. `plugin/commands/<x>.md` becomes `/<x>`, not `/vstack:<x>`, so command file names must carry the `vstack` prefix themselves.
- Uncommitted edits in the clone load in every new session. On the machine that runs Updates, an Update in progress is live before it is confirmed unless it works outside the linked tree.
- Every machine needs its own clone. Cloning the private repo needs working git HTTPS credentials for github.com.
