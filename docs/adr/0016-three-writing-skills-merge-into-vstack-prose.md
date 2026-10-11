# Three writing skills merge into vstack-prose

unslop, simple-english, and technical-writing merge into one visible Utility skill, vstack-prose. writing-for-agents stays its own skill and stays adapt, because Matt skill text stays close to Upstream. The three skills repeated many rules from ASD-STE100 and conflicted on bold, parentheses, and contractions, and technical-writing had no trigger. The always-apply rule is renamed `vstack-writing` and holds only the text types and their skills: every text follows vstack-prose, and agent-facing text also follows writing-for-agents. This amends ADR 0012.

## Considered Options

- Keep four skills and add technical-writing to the rule. The user rejected this option, because the repeats and conflicts stay and the rule needs more overrides.
- Merge all four into two, with a copy of the plain-English rules in the agent skill. The user rejected this option, because the rules would live in two places and writing-for-agents would move far from Upstream.
- Reject technical-writing. The user rejected this option, because the user wants its Diátaxis, Google style, and Global English rules.
- Delete the rule, so that the skill's description is the only trigger. The user rejected this option, because a description gives no promise for chat replies, `ask` text, and subagent briefs, and writing-for-agents would lose its trigger.

## Consequences

- pstack/unslop and pstack/technical-writing go from adopt to merge, and prose/simple-english goes from adapt to merge. All three rows point at `plugin/skills/vstack-prose`.
- vstack-prose's text is vstack's own: one deduplicated rule set in `SKILL.md`, and a second file with the technical-writing lines for docs, PR text, and commit text. An agent, not `git merge-file`, merges Upstream changes into it. The Update Addon decides how.
- The overrides move from the rule into vstack-prose. vstack drops its absolute bold ban. vstack-prose keeps simple-english 11: no bold lead-ins and no bold emphasis, and bold marks a UI element name only.
- Skills that named a writing skill lose those pointers, because the rule covers every text.
