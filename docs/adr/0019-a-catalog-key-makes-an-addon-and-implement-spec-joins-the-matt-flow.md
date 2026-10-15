# A catalog key makes an Addon, and implement-spec joins the Matt flow

> [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) amends this decision. The catalog key is a key in the `questions` map of `addon-questions.json`, beside its `preamble`. Its meaning is unchanged.

An Addon can carry Base upstream rows. A shipped skill with a key in `addon-questions.json` is an Addon, whatever its rows. A skill with a non-reject Base row and no catalog key is a Matt skill, so tdd and prototype stay Matt skills. This lets `session` merge Matt's retro with pstack's reflect and correct and stay a hidden Addon. The jev judge selects it during a Matt run, and a skill can read it through a `skill://` pointer. The Matt flow also gains implement-spec. We chose catalog membership because the user wants the retro reached through jev in a grill, and because a rule that the catalog already holds needs no second list.

## Considered Options

- Make retro a Matt skill that the user types. The user rejected this option, because the user wants the retro reached through jev in a grill.
- Keep matt/retro Deferred and copy its text into the Addon. The user rejected this option, because Matt's later edits to retro then stop arriving at an Update.
- A skill that merges any Upstream text is not a Matt skill. The user rejected this option, because tdd and prototype then leave the Matt skills.
- A named list of exceptions to the Matt skill rule. The user rejected this option, because it is a one-off list to keep in sync.

## Consequences

- check-register and the vstack extension classify skills by catalog key. `mattSkillNames` leaves out every catalog key, so typing a catalog skill never starts a Matt run. `invalid-utility` still rejects a `utility:` entry with a non-reject Base row.
- session's catalog question replaces session-lessons'.
- This amends ADR 0015. A Matt skill is a skill with a non-reject Base row and no catalog key, and the Matt flow ends in implement or implement-spec.
