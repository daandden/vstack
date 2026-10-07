# Every prose surface follows unslop and SimpleEnglish through one pointer rule

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
- simple-english is adapt. vstack's copy is hidden and has no Strict mode. The copy loses the Strict sentence in the description, the Strict part of Modes, the compliance sentence in CHECK mode, the References line for the strict vocabulary, and `references/strict-vocabulary.md`.
- writing-for-agents is adapt for one frontmatter line, `disable-model-invocation: true`. unslop is hidden at the pstack Pin and stays adopt.
- SimpleEnglish's hooks, output style, and system-prompt file are not Upstream items and do not ship. No licence material ships. The MIT notice has to be restored before vstack is shared.
- grilling no longer names its own writing skills. The Grilling HTML and the `ask` text follow the rule like all other prose.
