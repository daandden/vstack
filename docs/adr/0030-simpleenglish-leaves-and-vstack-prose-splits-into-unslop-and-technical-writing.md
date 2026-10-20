# SimpleEnglish leaves, and vstack-prose splits into unslop and technical-writing

SimpleEnglish (`AminBlg/SimpleEnglish`) is no longer an Upstream of vstack. The Prose upstream, its Pin, and the `prose/simple-english` row go, together with every text that came from it: the plain-English rules, `word-swaps.md`, `use-cases.md`, the ASD-STE100 metadata line, and the MIT notice. The user wants no SimpleEnglish material in vstack. The user also chose to undo the merge of ADR 0016 instead of keeping a smaller vstack-prose. vstack-prose is deleted, and pstack's unslop and technical-writing ship again as their own adopt skills. Both skills are hidden at the pstack Pin, so the `vstack-writing` rule is their only trigger.

## Considered Options

- Keep the SimpleEnglish text as vstack's own and drop only the Pin and the row. The user rejected this option, because it keeps SimpleEnglish material and its MIT notice.
- Remove only the lines that come from SimpleEnglish alone and keep vstack-prose. The user rejected this option and asked for a rework of the skill.
- Rebuild vstack-prose as one merged skill from unslop and technical-writing only. The user rejected this option in favor of two adopt skills with no vstack-authored writing text.
- Rewrite the behaviors that came from SimpleEnglish, such as answer-first replies and the modal ban, in vstack's own words. The user rejected this option, because those rules would return in new words.
- Also remove STE guidance that does not come from SimpleEnglish. The user rejected this option. technical-writing's STE section, open-pr's STE line, and wait-what's ASD-STE100 requirement stay.

## Consequences

- The `vstack-writing` rule says: every text follows unslop. Docs, RFCs, READMEs, PR text, and commit text also follow technical-writing. Agent-facing text also follows writing-for-agents. One line adds that in agent-facing text, writing-for-agents wins where it and unslop differ, so that leading words survive unslop 26 and 32.
- SimpleEnglish's rule sets go: the Reply and Document rules, answer-first replies, American spelling, and the bans on should, would, contractions, and the present perfect. Guidance that technical-writing carries on its own stays as pstack wrote it, such as its 20-word and 25-word sentence targets and its "never 'should be done'" line. This text applies only to the texts that the rule sends to technical-writing.
- pstack/unslop and pstack/technical-writing change from merge to adopt. Their artifacts are `plugin/skills/unslop` and `plugin/skills/technical-writing`, and both are Utility skills. The prose Pin and its row are deleted by hand, because the maintainer tooling has no operation that removes a whole Upstream.
- Removing the shipped name vstack-prose needs a major version bump.
- skill-creator's description loses its pointer at vstack-prose.
- CHANGELOG entries, judge fixtures, and the body text of earlier ADRs keep their SimpleEnglish mentions as history.
- This supersedes the merge in ADR 0016 and the SimpleEnglish provisions of ADR 0012. Each of them carries a banner that names the parts that still stand.
