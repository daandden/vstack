# Adopt means byte-identical

An adopted Upstream item ships byte-for-byte as it is at the Pin, under its Upstream name. The one exception is an item on Hold: it ships byte-for-byte as it is at the Upstream version it is held at, until an Update accepts it at the Pin. vstack drops only Codex's `agents/openai.yaml` from every skill. Any other change, including a rename, a swapped reference to a renamed skill, or an omp tool-name substitution, makes the item adapted. We chose this rule so that `vstack update` can copy adopted items straight from the new Pin and check them by hash. It also means the Decision register shows every item whose text differs from its Upstream.

## Considered Options

- **Behavior line** (recorded earlier by "Choose which pstack skills and principles vstack adopts"): adopt allowed mechanical omp edits and renames as long as behavior stayed the same. We rejected it because "mechanical" is a judgment call. Every Update would have to redo and review those edits, while the register still labelled the items as untouched.
- **Adopt plus house style**: adopt allowed a pack-wide list of find-and-replace edits. We rejected it for the same reason: the register would hide the changes.

## Consequences

- More items are adapted. Examples: the Matt skills that name `setup-vstack`, and `principle-encode-the-domain`.
- An adopted item becomes adapted when a skill it names is renamed.
- Text substitutions are a written list of exact replacements. Applying them makes an item adapted.
- Amended by "Define the `vstack update` flow end to end" (#38): a Hold keeps an adopted item byte-identical to the Upstream version it is held at (`held_at`, `held_path` on its register row) instead of to the Pin, so it stays adopt rather than turning adapt. The check verifies it against that version. A held adopt item still never carries a vstack-made change.
