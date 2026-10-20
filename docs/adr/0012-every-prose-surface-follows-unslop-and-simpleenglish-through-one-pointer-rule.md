# Every prose surface follows unslop and SimpleEnglish through one pointer rule

> The SimpleEnglish provisions are superseded by [ADR 0030](0030-simpleenglish-leaves-and-vstack-prose-splits-into-unslop-and-technical-writing.md): SimpleEnglish is no longer an Upstream, and no text from it ships. The one always-apply rule, unslop for every text, and writing-for-agents for agent-facing text still stand.

vstack ships one always-apply rule, `plugin/rules/vstack-prose.md`, that loads in every agent and points at `skill://unslop` and `skill://simple-english`. Every text that an agent writes follows both skills in SimpleEnglish's Plain mode. Agent-facing text also follows `skill://writing-for-agents`. Agent-facing text is AGENTS.md, skills, agents, rules, and subagent briefs and results. The rule is the only trigger for the three skills, so all three are hidden. SimpleEnglish, from `AminBlg/SimpleEnglish`, joins as the Prose upstream. Its Pin starts at the release tag `v2.1.1`, and the Update moves it to the latest `v<semver>` tag, as it does for Matt.

## Considered Options

- The user turned down i-have-adhd for the text that the user reads. Its rules shape output for a reader with ADHD, and its own examples break unslop 14 and 33. The user wants plain English for every reader. Nothing from `ayghri/i-have-adhd` ships, and its omp extension does not ship.
- A rule that holds SimpleEnglish's system-prompt block in full was rejected. The block costs about 950 tokens in every prompt, and the Decision register would need a row for a file that is not a skill.
- A vstack extension that injects both skill texts at session start and after compaction was rejected. It needs TypeScript, and it is not known if extensions run in subagents.
- A vstack original, copied once, was rejected. New SimpleEnglish releases would stop arriving.

## Consequences

- The agent has to follow the pointer. ADR 0002 turned down a pointer rule for principles for this reason. Here the user accepted that risk.
- The rule states the choices that override the two skills, so unslop stays adopt:
  - The Document register applies to every text, chat included. Lists, headings, and tables are allowed when they carry structure. Bold is banned.
  - Where unslop and SimpleEnglish differ, SimpleEnglish wins. A short definition in parentheses is allowed. may, might, could, should, and would are banned. Bold lead-ins are banned.
  - In agent-facing text, a leading word from writing-for-agents stays with no definition. It passes SimpleEnglish rule 9 and unslop 26 and 32.
- simple-english is adapt. vstack's copy is hidden and has no Strict mode. The copy loses every Strict reference at the Pin:
  - In `SKILL.md`: the Strict sentence in the description, the Strict part of Modes, the compliance sentence in CHECK mode, and the References line for the strict vocabulary.
  - `references/strict-vocabulary.md`, the whole file.
  - In `references/rule-catalog.md`: "for Strict mode" in the opening line, the sentence about rules marked (S), the three (S) rows (1.1-1.4 and 1.6, 3.1, 9.2), the Strict sentence in rule 9.3, and the sentence that routes to the strict vocabulary.
  - In `references/use-cases.md`: the line "Mode: strict." in the translation section.
- writing-for-agents is adapt for one frontmatter line, `disable-model-invocation: true`. unslop is hidden at the pstack Pin and stays adopt.
- SimpleEnglish's hooks, output style, and system-prompt file are not Upstream items and do not ship. No licence material ships. The MIT notice has to be restored before vstack is shared.
- grilling no longer names its own writing skills. The Grilling HTML and the `ask` text follow the rule like all other prose.
- Amended by the Hand edit loosen-prose-structure: chat replies and `ask` text follow SimpleEnglish's Reply rules, and every other text follows its Document rules. The Reply rules allow a list, a table, a heading, or a code block that carries structure. The Document rules no longer have the heading, list, and paragraph thresholds or the forced words `make sure that` and `configuration`, and the 20-word and 25-word limits are targets. should and would stay banned, and may, might, and could are allowed for a fact that the writer is not sure of. Parentheses are allowed for a short definition, an example, or an aside. Bold stays banned. The copy has no modes: CHECK mode and `references/rule-catalog.md` are removed, and no skill or rule names Plain mode.
- Amended by ADR 0016: unslop, simple-english, and technical-writing merge into the visible skill vstack-prose, the overrides move into it, the bold ban goes, and the rule is renamed `vstack-writing`.
