# GitHub PRs land by merge commit by default

[ADR 0055](0055-prs-land-by-a-stored-landing-method-rebase-by-default.md) made `rebase` the recommended Landing method on GitHub. GitHub then refused it in practice: `gh pr merge 371 --rebase` returned `This branch can't be rebased`, and another project's PR #191 got the same error. The repo allowed rebase merges, so neither the repo settings nor `gh` caused the refusal. Both PRs held commits that merged the default branch into the PR branch. [ADR 0033](0033-chain-conflicts-resolve-by-merge-and-pushed-commits-stay.md) creates those commits on purpose, because vstack never rewrites a pushed branch. GitHub's Rebase and merge drops merge commits and replays the others. The likely mechanism is that a conflict a merge commit resolved comes back during that replay, but no replay of #371 or #191 confirmed it, and GitHub's error names no cause. Of the 40 PRs merged in this repo up to #374, 18 had merged the default branch in. Now setup-vstack recommends `merge` on GitHub, and this repo stores `- Landing method: merge`.

The count comes from:

```sh
gh pr list --repo daandden/vstack --state merged --limit 40 --search 'merged:<=2026-11-06T08:30:17Z' --json number,commits \
  --jq '[.[] | select(any(.commits[]; .messageHeadline | test("^Merge ")))] | length'
```

## Considered Options

- Keep `rebase`: the default branch stays linear, but ship stops and asks for another method whenever GitHub refuses a PR that merged the default branch in.
- Return to `squash`: GitHub never refuses for that reason, but every PR loses its own commits, which ADR 0055 set out to fix.

## Consequences

- The default branch is no longer linear. Each PR adds one merge commit, and the commits that merged the default branch into the PR also reach the default branch.
- The PR's commits land with the SHAs that were verified.
- Projects that already store `- Landing method: rebase` keep it. The user picks the method once per project, and setup-vstack asks only when the line is missing.
- Other hosts keep ADR 0055's rule: recommend the allowed method that lands without squash.
