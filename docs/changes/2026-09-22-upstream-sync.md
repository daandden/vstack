# Explicit upstream sync

Issue #15 adds `sync prepare`, `show`, `approve`, and `activate` to the existing stack CLI. Source checks run only on explicit preparation. Matt uses the highest unambiguous stable semantic-version tag; Pstack requires a nominated full SHA and a reviewed activation decision.

Candidates keep patched inputs, generated releases, and review evidence outside the active stack. Behavioral, uncertain, mixed, new-skill, moved-tag, and affected-adaptation transitions require whole-transition approval bound to the exact candidate. Only narrowly verified non-executable UI metadata or provenance-only transitions can omit approval. Activation regenerates and verifies the candidate with real OMP before publishing the complete active view. Each selected transition writes a dated Markdown audit record for the maintainer to commit with the accepted lock.

Conflicting patches can be rebased outside the accepted tree and supplied to `prepare --patches <directory>`. The candidate binds those exact patch bytes; activation persists them only after review and verification. YAML UI classification uses a non-mutating projection so aliases into unknown instruction sections cannot bypass approval.

Pristine mirrors now use `vendor/<source>/<sha>/` so independent accepted revisions do not overwrite previous mirrors. Existing old-layout files are left untouched; do not discard local edits. Cached generation treats the accepted full SHA as authoritative, leaving remote tag checks to explicit sync. Generated releases include their matching lock and provenance behind the same active pointer.

No new discoverable skill, dispatcher, model configuration, automatic commit, push, or publication permission is introduced. Pending families and unrelated local skills remain unchanged. See [workflow](../sync-workflow.md) for review and activation steps and [verification](../verification/issue-15.md) for observed behavior and limits.
