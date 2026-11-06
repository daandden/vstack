# PRs land by a stored Landing method, rebase by default

> [ADR 0059](0059-github-prs-land-by-merge-commit-by-default.md) amends the GitHub recommendation below. setup-vstack now recommends `merge` on GitHub, because GitHub can refuse to rebase a PR branch that has merged the default branch in.

ship used squash whenever the repo allowed it, so every PR reached the default branch as one commit and its own commits were lost. Now setup-vstack asks for the project's Landing method once, offers only the methods that the Code host's `merge-methods` reports, and writes the pick to `code-host.md` as `- Landing method: <value>` beside the default End state. On GitHub it recommends `rebase`. On other hosts it recommends landing without squash, which uses the project's own method, such as GitLab's `merge`, `rebase_merge`, or `ff`. The value is the Code host's own name, because GitHub picks a method for each PR while GitLab sets one for the project and each MR can only add squash. A shared vstack name would mean different things on the two hosts.

## Considered Options

- Keep squash first: the default branch stays linear, but every PR's commits collapse into one.
- Push the PR head to the default branch as a true fast-forward: the landed SHAs match the verified ones, but the push skips the Code host's merge button and any protection or merge queue would block it.
- vstack-neutral names (`squash`, `rebase`, `merge`, `fast-forward`) mapped by each template: GitLab's `rebase_merge` still writes a merge commit, so it has no honest neutral name.
- Write the chosen flag into the `merge-pr` and `auto-merge` rows with no fact line: ship cannot tell a legacy row from a chosen one, and the fallback below needs the other flags.

## Consequences

- This amends [ADR 0033](0033-chain-conflicts-resolve-by-merge-and-pushed-commits-stay.md), which counted on squash to keep the default branch linear. Branch updates still merge the target in. GitHub's Rebase and merge replays the PR's commits onto the default branch with new SHAs and drops the merge commits.
- ship checks the stored method against `merge-methods` before each landing. If the Code host does not allow it, or cannot rebase this PR because a replayed commit conflicts, ship asks which allowed method to use and leaves the PR unmerged until the user answers. ship never rebases or force-pushes the branch to make a rebase landing possible.
- `auto-merge` uses the same stored method.
- On GitLab, the allowed choices come from both `merge_method` and `squash_option`. `never` offers only the project's method, `always` offers only `squash`, and `default_off` or `default_on` offers both. A stored non-squash method sends `squash=false` explicitly in `merge-pr` and `auto-merge`. Leaving out `--squash` is not enough: `glab mr merge` omits the `squash` field unless `--squash` is set, and a `default_on` project presets new MRs to squash. A setup-vstack re-run that adds the Landing method to an existing GitLab `code-host.md` therefore also replaces its `merge-methods`, `merge-pr`, and `auto-merge` rows.
- A project with no Landing method line, every project set up before this ADR included, keeps the squash-first order. A setup-vstack re-run reports the missing line, asks only that question, and adds the line after confirmation, as [ADR 0038](0038-a-project-default-end-state-replaces-the-per-run-question.md) does for the default End state.
