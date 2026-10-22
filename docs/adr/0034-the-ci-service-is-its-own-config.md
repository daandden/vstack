# The CI service is its own config

The Code host and the CI service vary independently. A repo on GitHub can run its builds on GitHub Actions or Jenkins. setup-vstack writes `ci.md` beside `code-host.md`, with its own setup section, tool, and read-only check. Each config names one service and its tool instead of mixing GitHub commands with Jenkins tools in `code-host.md`.

`ci.md` names the CI service and holds `ci-logs`, `rerun-ci`, `set-secret`, and `set-variable`. `required-checks` and `watch-checks` stay in `code-host.md`, because the Code host decides which PR checks are required and reports their status. Logs and build reruns belong to the CI service. Secrets and variables belong there too, because the build must read them. Storing a Jenkins credential on GitHub would leave the Jenkins build without it. If the CI service has no tool to store a secret, wizard directs the human to that service instead.

This amends [ADR 0006](0006-vstack-owns-its-project-config-paths.md) and [ADR 0020](0020-the-code-host-is-its-own-config-with-a-per-repo-operation-map.md). The split changes every repo's config, and ADR 0020 put the CI rows in `code-host.md`, so without this record ADR 0020 would describe a layout that no longer exists. Setup writes five config files, with `ci.md` in `docs/vstack/` in Standard mode or `<vstack root>/config/` in Private mode. The four operations above leave `code-host.md`. Every other Code host operation stays there, including the checks that ship uses to decide whether to merge. implement's step 0a finds `ci-logs` and `rerun-ci` in `ci.md`, so merge-ready and shipped need `ci.md` as well as `code-host.md`.

## Considered Options

- Keeping CI in `code-host.md` with a tool per row avoids a new file but mixes two independent choices and their tools.
- Making `ci.md` an optional override preserves old configs but leaves two places for the same operation and a permanent precedence rule.
- Moving all four CI operations to `ci.md` puts everything CI in one file. A Jenkins MCP server cannot say which checks GitHub requires, and ship would depend on `ci.md` to merge.
- Keeping `set-secret` and `set-variable` in `code-host.md` needs no wizard change, but on a Jenkins repo wizard would store secrets where no build reads them.

## Consequences

- A repo without `ci.md` gets only the commit End state until setup runs again. On that re-run, setup drafts `ci.md` from the old CI, secret, and variable rows, removes them from `code-host.md`, and shows both drafts for one confirmation. Migration does not seed `ci.md`.
- babysit reads PR checks through the Code host and takes the exact job and build or run from a failed check's link. It reads logs and reruns that failure through the CI service. With no link, it reports the gap and does neither. A job path alone cannot identify the failed build: the job's last build can belong to a newer push, and rerunning a guessed build breaks babysit's rule that it reruns the failure it saw. So `ci.md` has no PR job fact for finding builds. The cost is small, because Jenkins on GitHub and GitLab posts a link in the usual setup.
- GitHub Actions and GitLab CI have shipped CLI templates. Jenkins uses the user's MCP server through setup's Other path, without a shipped Jenkins template.
