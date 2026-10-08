---
alwaysApply: true
---

Create every git worktree with `omp wt add`, never `git worktree add`, following `skill://vstack-worktree`. omp clones the tree, so ignored and excluded files (deps, env, the Private-mode Verify skill link) carry over. When the user wants their own session moved into a new worktree, tell them to type `/wt`.
