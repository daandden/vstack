# Chain conflicts resolve by merge, and pushed commits stay

The End state chain never rewrites a commit that it has pushed. The Conflict owner in implement's shared End state block resolves a conflict, a stale base, and ship's step 2 move by merging the target branch into the reported branch. It resolves each conflict once and pushes a fast-forward. It can update any branch of the run's stack. open-pr rebases only commits after the remote tip, so a stack child with pushed commits merges its parent's tip instead of rebasing onto it. Before any history edit, step 0b reads the remote tip, so that the run knows which commits are pushed.

This reverses the Owned branch rule from #179, which let a run rebase and force-push a branch that its own first push created. That rule needed a fact per branch for every stack branch and for step 2's move (#176), and until then it stopped on every branch except the run's own. A fast-forward push needs no ownership, so the rule, its two leases, and the Owned flag in the chain facts are gone.

## Considered Options

- Keep the Owned branch rule and record the remote branch, the Owned flag, the last pushed SHA, and the base SHA for each branch that the run pushes. This keeps linear history, but every caller and hand-back carries the per-branch facts, and a stack from an earlier session still stops, because a later run cannot prove that nobody else pushed.
- Keep the rule as it is, unused. Two leases and a glossary term then guard no step.

## Consequences

- PR branches gain merge commits. The PR's three-dot diff still shows only the branch's own change, and squash merges keep the default branch linear.
- After a merge into the run's branch, the run records the merged target tip as the new base SHA, so that the whole-diff command keeps covering only the run's change.
- A rejected push stops the run. The chain never forces a push to get past a rejection.
