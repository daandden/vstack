---
name: vstack-worktree
description: How vstack creates a git worktree with omp wt add, tells a clone from a plain checkout, and removes it.
disable-model-invocation: true
---

# vstack-worktree

Every git worktree vstack makes goes through `omp wt add`. omp clones the checkout, so ignored and excluded files (deps, env files, the Private-mode Verify skill link) carry over. A skill that needs a worktree follows these steps; its own contract names the purpose and says what to do on a plain checkout.

Not covered here:

- A parallel worker's tree is an isolated agent (ADR 0007), not a worktree.
- omp task isolation and the `github` tool's `pr_checkout` already go through omp.
- When the user wants their own session moved into a new worktree, tell them to type `/wt`.

## Steps

1. Base. Use `$OMP_WORKTREE_DIR` when it is set. Else run `omp config get worktree.base` and use what it prints, unless it prints `(not set)`. Else use `~/.omp/wt`. Expand the base to an absolute path.
2. Path. Use `<base>/vstack-<repo>-<purpose>`. `<repo>` is the dir name of the main checkout, the path on the first `worktree` line of `git worktree list --porcelain`. `<purpose>` is the slug the calling skill names, such as `research-<name>`. With no calling skill, pick a short slug for the task.
3. Create. Run one of these from the repo, and never add `-q`: it hides the line that step 4 reads.
   - A new branch: `omp wt add -b <branch> <path> <ref>`
   - An existing branch: `omp wt add <path> <branch>`
   - A detached checkout: `omp wt add --detach <path> <commit>`
4. Check. A stdout line `Cloned from <main checkout> via <backend>` means omp cloned the tree. With no such line, the worktree is a plain checkout that holds tracked files only. Every outcome exits 0, and the stderr warning appears only when a clone was tried and failed, so read stdout, not the exit code or stderr.
5. Plain checkout. If the work needs ignored or excluded files from the main checkout, run `git worktree remove --force <path>`, stop, and tell the user that omp could not clone the checkout. Name omp's `worktree.clone` setting and `/skill:setup-vstack`. Otherwise go on with tracked files only, and install deps first if the work needs them. The calling skill's contract says which case applies to it.
6. Remove. When the work is done, run `git worktree remove --force <path>`. Delete the branch only if this run created it.
