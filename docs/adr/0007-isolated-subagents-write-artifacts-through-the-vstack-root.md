# Isolated subagents run unapplied and write artifacts through the vstack root

Five subagent roles need their own checkout: hillclimb hypothesis workers, compare-attempts runners, wayfinder research runners, ship verifiers, and the background babysitter. Each one runs under omp's own task isolation (the APFS clone on macOS). It is spawned with eval `agent(..., isolated=True, apply=False, merge=False)`, so the parent applies only the candidate it picks, from that candidate's `patchPath`. `merge=False` forces patch mode. Without it, the call inherits the machine's `task.isolation.merge`, and in branch mode omp returns a `branchName` instead of a `patchPath`. omp clones `.git` into each isolated workspace and merges back only working-tree changes. A Private-mode artifact written under a recomputed `--git-common-dir` would therefore land in a disposable copy. To prevent that, the top-level agent resolves the **vstack root** once, and every spawn prompt carries it as an absolute path. Children write vstack config and artifacts only under that root, and they pass it on to their own children. We chose this so the user keeps APFS isolation, and Private-mode artifacts survive at any depth.

## Considered Options

- **`tasks[]` with `task.isolation.apply: false` set machine-wide by setup-vstack**: rejected. It keeps one batch form, but it changes how every non-vstack isolated task behaves on the machine.
- **Children never write Private artifacts; they return content, and the top-level agent writes it**: rejected. A nested writer, such as research's background agent under a research runner, would have to route its content back through every level.
- **The parent runs `git worktree add`, which shares `.git` the way `/wt` does**: rejected. Artifacts would persist with no extra rule, but this gives up APFS speed and the carried-over dirty state. The user prefers omp's isolation.
- **omp `isolated: true` through `tasks[]` with apply on**: rejected. Auto-apply conflicts with keep-only-the-best (hillclimb, compare-attempts), and it would merge a verifier's or a babysitter's checkout state back into the parent.

## Consequences

- A Fan-out block's batch may be one eval `agent()` batch as well as one `tasks[]` batch. The lint in `check-register.ts` accepts both forms, and every spawn site still names a vstack agent.
- setup-vstack gains a seventh machine check: `task.isolation.enabled` is on, and it is set only with approval. A skill that needs an isolated role while isolation is off stops and points at setup-vstack. It never falls back to the shared checkout.
- The vstack Private-mode rule gains one line: a subagent uses the vstack root from its prompt and never re-resolves `--git-common-dir`.
- omp isolation is not a filesystem sandbox. Writes through the vstack root are immediate, and the patch does not cover them. Children write disjoint files under it.
- In Standard mode, the vstack root is the user's main checkout. An isolated child's artifact that belongs on a throwaway branch, such as a wayfinder research runner's findings file, is therefore written inside the child's own clone and travels in its patch. The parent lands that patch on the branch through a temporary worktree. Writing it through the vstack root would dirty the user's checkout.
