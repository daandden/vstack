# Principles are hidden skills with a curated index

Each adopted pstack principle stays a hidden skill (`disable-model-invocation: true`), mapped 1:1 to its Upstream item. There are two ways to reach one. The first is a `skill://principle-<name>` pointer at the skill step it governs. The second is a line in a single always-apply index rule that vstack writes; only principles that pass two gates get a line. Gate 1 requires a specific trigger, one that names a situation you can observe. Gate 2 requires that the rule is not already stated by omp's harness prompt or by vstack's own always-apply rules. We chose this design because many pstack triggers are broad ("any non-trivial work"), and several principles restate rules the omp harness already enforces. Listing every principle ambiently would cause needless skill reads and give the same rule two sources that could conflict. Citing principles only at steps would never let the distinctive ones reach plain sessions.

## Considered Options

- **Visible principle skills**: omp's smol model rewrites each description to 12 words or fewer. That dropped the action from several triggers, and when compression failed, the description was cut off. vstack would not control the trigger wording.
- **Full always-on index** of every adopted principle: about 860 tokens, broad triggers firing on nearly every turn, and duplication of the harness.
- **Citations only**, as pstack does outside poteto-mode: no ambient reach at all.
- **One rulebook rule per principle**: each principle would exist twice, once as a rule and once as a skill.

## Consequences

- "Choose which pstack skills and principles vstack adopts" applies both gates when it sets Dispositions. The index rule file is the single record of membership.
- Turning pstack's bold-name principle citations into `skill://` pointers makes those skills adapted, per ADR 0001.
- `vstack update` flags an index line whenever its principle changes upstream. On every run it also re-checks Gate 2 against the live omp prompt, because omp has no Pin and can drop a rule the index relies on.
