# to-tickets keeps its publication record in Scratch

In Standard mode, to-tickets saves `approved.json` and `publication.json` in Scratch, under `~/.vstack/tmp/<repo-key>/to-tickets/<feature-slug>/`, for every tracker mode. Private mode keeps `<vstack root>/artifacts/<feature-slug>/`. In Standard mode with the local-markdown tracker, the tickets, spec, and map stay under `.scratch/<feature-slug>/` in the checkout the session runs in, never under the vstack root. Private mode keeps them under `<vstack root>/artifacts/<feature-slug>/`.

The skill used to say only "In Standard mode, use `.scratch/<feature-slug>/`". The Standard-mode vstack root is the main checkout, so a to-tickets run in a worktree wrote the record into the main checkout as untracked files. With a GitHub, GitLab, CLI, or MCP tracker, the record is not a tracker attachment and has no tracked home. It needs a place outside every working tree that `resume` can find from any worktree. Scratch gives both, because every worktree of a repo resolves the same repo key.

The record is read after its run, unlike most Scratch. `resume` reads it to finish a blocked batch. `/vstack-clean` offers a to-tickets entry for deletion 90 days after its newest file and deletes it only after the user confirms. A blocked record gets no extra protection.

In Standard mode, local-markdown tickets are tracked files, so they travel with the branch of the checkout that wrote them. A ticket claimed in a worktree stays invisible to other checkouts until that branch merges.

## Considered options

- `<git common dir>/vstack/artifacts/<feature-slug>/` in both modes. It is shared and never cleaned, but Standard-mode repos would get an untracked `.git/vstack/`, which the glossary reserves for Private mode. Nothing would ever delete it, and a seven-ticket batch wrote about 330 KB.
- `.scratch/<feature-slug>/` in the checkout the session runs in, untracked. `git add .` can commit it, another worktree cannot `resume`, and removing the worktree deletes the record. A session in the main checkout still dirties it.
- `.scratch/<feature-slug>/` in the main checkout, with `.scratch/` in `.git/info/exclude`. It still writes into the user's main working tree, against [ADR 0007](0007-isolated-subagents-write-artifacts-through-the-vstack-root.md). A setup-vstack re-run reads `.scratch/` as a sign of a local-markdown tracker, and the exclude would also hide local-markdown tickets that Standard mode tracks.
- Local-markdown tickets in the main checkout, for one shared frontier. Worktree sessions would leave uncommitted ticket files in the main checkout, the same leak this ADR fixes.
