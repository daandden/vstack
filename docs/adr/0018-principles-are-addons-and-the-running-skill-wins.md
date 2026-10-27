# Principles are Addons, and the running skill wins over them

> The Update to pstack `e73df47` amends this decision. fix-root-causes returns as an adopt principle Addon, because attack-the-premise mentions it and the user wants pstack principles adopt. attack-the-premise is adopt again and keeps its link to fix-root-causes. test-behavior-not-implementation and exhaust-the-design-space stay rejected.

> [ADR 0039](0039-main-agent-tools-pick-addons-from-gathered-intent.md) supersedes main-session prompt selection and smol restatements with agent-called tools over gathered source intent. Principles remain Addons, and the running Matt skill's steps and its Addons still win over a conflicting principle. ADR 0025's subagent Brief picks are unchanged.

> [ADR 0021](0021-a-mid-session-matt-run-start-sends-a-smol-restatement-to-jev.md) amends this decision. When a Matt run starts mid-session, the judge reads a `smol` restatement of the earlier talk and the new words, not only the words after `User:`. This includes a bare skill start.

> [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) amends this decision. jev reads the user's words as `request`, beside the catalog's `preamble`, in one state object. The selection threshold is 0.70, not 0.75.

> [ADR 0025](0025-subagents-get-principle-picks-from-their-own-brief.md) amends this decision. During a Matt run, the subagent sessions of `vstack-explorer`, `vstack-worker`, and `vstack-verifier` get principle picks from their own brief, with no sentence about which rule wins.

> [ADR 0026](0026-every-matt-run-start-sends-a-smol-restatement-to-jev.md) amends this decision. A fresh Matt run start also gets a `smol` restatement of the user's words, so the judge reads that restatement on every run start.

Principles follow the Addon rule of ADR 0015. The jev judge asks the principle questions only while a Matt skill runs. A plain prompt with no Matt skill gets no principle. The hidden pointer message for the picked principles also says that the steps of the running Matt skill and its Addons win when a principle conflicts with them. On the prompt that starts a Matt skill, the judge reads only the user's words after `User:`, not the skill text, for principles and Addons alike. vstack rejects test-behavior-not-implementation, fix-root-causes, and exhaust-the-design-space, because tdd, diagnosing-bugs, prototype, and DESIGN-IT-TWICE cover the same ground. We chose one judge scope for every Addon, because every change now starts with a Matt skill. We chose one precedence line over text edits, because 25 conflicts in 9 principles then need no change to adopt text.

## Considered Options

- Keep ADR 0002's scope and judge principles on every main prompt as a stated exception. The user chose one scope for every Addon.
- Judge most principles in Matt runs and a short list on every prompt. This option needs two scopes and a list to keep at each Update.
- Make guard-the-context-window and encode-lessons-in-structure Utility skills. A Utility skill needs a visible description or a rule to start, and ADR 0002 rejected both for principles.
- Narrow the jev questions of the conflicting principles. A jev question cannot see which skill runs, so it cannot exclude a principle by skill.
- Edit the conflicting principle texts. Up to 7 adopt rows then flip to adapt, and each Update has to merge them.
- Keep the skill text in the judge input on a skill-start prompt. The cleaned prompt keeps about 1,300 characters of skill text and 600 at the end, so each run of a skill got the same picks, and short user words could fall outside the kept part.

## Consequences

- This supersedes the scope of ADR 0002. ADR 0002's judge design still stands: hidden principle skills, one `noul` question per principle, the 0.75 threshold, one pick per session, and no picks in subagent sessions.
- A skill can still read any principle by `skill://` in any session. Such a skill frames the read in its own step, as prune-comments does with "for intent only".
- A bare `/skill:<matt skill>` with no user words gets no pick on that prompt. A later prompt in the run can get one.
- The three rejected principles leave the plugin, `principle-questions.json`, and `sample-prompts.json`, and their Decision register rows become reject. prototype and prune-comments drop their citations.
- attack-the-premise drops its relative link to fix-root-causes, so its row flips from adopt to adapt. The precedence line changes no other principle text.
