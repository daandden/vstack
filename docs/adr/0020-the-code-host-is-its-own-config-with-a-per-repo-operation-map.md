# The Code host is its own config with a per-repo operation map

setup-vstack writes `code-host.md` beside `issue-tracker.md`. It names the Code host, the repo, the tool (a CLI or an MCP server), and one row per operation that implement's PR chain, why, session, and wizard use. vstack ships templates only for GitHub (`gh`) and GitLab (`glab`). For any other Code host, Bitbucket Cloud and Data Center included, the user brings an MCP server or CLI that is already set up for the project. setup-vstack drafts the rows from that tool's list or help, the user confirms them, and setup checks the tool with one read-only call. We chose this for two reasons. A company can run Bitbucket with Jira while a side project runs GitHub with its own issues, so the Code host and the issue tracker vary on their own. And no first-party Bitbucket CLI exists to template.

## Considered Options

- **A code host section inside `issue-tracker.md`**: rejected. It mixes two choices that vary on their own, and every tracker template would need a host section.
- **No config; read `git remote -v` at each run**: rejected. The user wants the setting to come from setup, and a remote URL cannot tell a self-hosted host or a mirror apart.
- **vstack owns one operation map per host, and `code-host.md` names only the host and tool**: rejected. A user-provided MCP server or CLI for a new host would need a vstack change before it works.
- **vstack ships Bitbucket REST templates (curl and a token)**: rejected. It is two APIs to write and keep, Cloud 2.0 and Data Center 1.0, and the user's own tool covers it.

## Consequences

- A repo with no `code-host.md`, every repo set up before this ADR included, gets only End state commit. Step 0a points at `/skill:setup-vstack`, which on a re-run asks only the sections whose files are missing. why and session record the missing setting as a gap. No skill guesses the host from the remote.
- Each End state names the operations it needs. Step 0a offers only End states whose needed operations exist in `code-host.md`. A missing optional operation skips with a reported gap.
- migrate-to-vstack adds `code-host.md` to the project plan from a GitHub or GitLab template when the remote is github.com or gitlab.com, and leaves a notice for other remotes.
- `code-host.md` rows in a repo do not pick up later vstack template fixes; the user edits them or re-runs setup.
- This amends ADR 0006: setup-vstack writes four config files.
