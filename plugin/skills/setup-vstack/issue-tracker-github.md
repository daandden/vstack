# Issue tracker: GitHub

Issues and specs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Make a sub-issue**: on `gh` 2.94 or newer, use `gh issue create --parent <parent> ...` or `gh issue edit <parent> --add-sub-issue <child>`. On older versions, use `gh api --method POST repos/<owner>/<repo>/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`. The value is the child's database id, not its issue number. Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: use native issue dependencies. On `gh` 2.94 or newer, use `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>`. On older versions, use `gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`. Obtain the numeric database id with `gh api repos/<owner>/<repo>/issues/<n> --jq .id`, not the issue number or `node_id`. If native dependencies are unavailable, put `Blocked by: #<n>, #<n>` at the top of the child body.
- **Count open blockers**: `gh api repos/<owner>/<repo>/issues/<n> --jq .issue_dependencies_summary.blocked_by`. Zero means startable. `gh issue view <n> --json blockedBy` includes closed blockers, so filter with `--jq '[.blockedBy.nodes[] | select(.state == "OPEN")] | length'`.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: first post the explanation with `gh issue comment <number> --body "..."`, then run `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` drops the comment while exiting successfully.

Infer the repo from `git remote -v`; `gh` does this automatically when run inside a clone.

File issues only into the user's repo. Before the first creation in a session, check `gh repo view --json nameWithOwner`, because a fork can default to its Upstream parent. Never file into the repositories these skills derive from unless the user owns the selected repo. If the target is not the user's repo, settle the target through `ask` under skill://flow-page's "Every ask in a Flow" contract when enrolled, or plain `ask` otherwise, before writing.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature requests; `skill://triage` reads this flag.)_

When set to `yes`, PRs run through the same labels and states as issues, using the `gh pr` equivalents:

- **Read a PR**: `gh pr view <number>`, then `gh pr view <number> --comments`, then `gh pr diff <number>`. Off a TTY, `--comments` prints comments without the body.
- **List external PRs for triage**: `gh api --paginate 'repos/{owner}/{repo}/pulls?state=open' --jq '.[] | select(.author_association | IN("OWNER","MEMBER","COLLABORATOR") | not) | {number, title, author: .user.login, author_association, labels: [.labels[].name]}'`.
- **Comment / label / close**: `gh pr comment`, `gh pr edit --add-label`/`--remove-label`, `gh pr close`.

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read the full issue as described under Conventions.

## Wayfinding operations

Used by `skill://wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: link the child to the map through Make a sub-issue above. Without native sub-issues, add it to a task list in the map and put `Part of #<map>` at the top of the child body. Use only `wayfinder:<type>` labels. Assign claimed tickets to the driving dev.
- **Blocking**: use Blocking above. A ticket is unblocked only when every blocker is closed.
- **Frontier query**: list the map's open children, exclude assigned tickets and tickets with open blockers as counted above, and take the first in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
