# vstack owns its project config paths

`setup-vstack` writes a project's config to `docs/vstack/issue-tracker.md`, `docs/vstack/triage-labels.md`, and `docs/vstack/domain.md`, and adds a `## vstack` block to `CLAUDE.md` or `AGENTS.md`. Matt's setup writes `docs/agents/` and an `## Agent skills` block instead. Private mode becomes a vstack plugin rule, and it keeps everything under `.git/vstack/`: `config/` for the three files (the directory's presence turns Private mode on), `domain/` for `GLOSSARY.md` and `adr/`, and `artifacts/` for tickets and prototypes. Before this, it was a personal user rule using `.git/matt-pocock/`. We chose vstack's own names so that the paths a project carries match the pack that reads them. At the Base upstream Pin `v1.2.3`, no adopted Matt skill mentions `docs/agents/`, the `## Agent skills` block, or the setup skill, so the rename turns nothing from adopt into adapt (ADR 0001).

## Considered Options

- **Keep Matt's `docs/agents/` and `## Agent skills`**: rejected. It would leave projects already set up for Matt valid without any change, and it would keep setup-vstack's templates closer to the Upstream text. The user preferred names that say vstack.
- **Keep private mode as a personal rule using `.git/matt-pocock/`**: rejected. The rule's wording names Matt, and nothing would check it when vstack changes.
- **A legacy-path guard in the vstack rule for `.git/matt-pocock/`**: rejected because it is a permanent check for a one-time move. Migration moves the directories instead.

## Consequences

- Every adapted consumer that names the config (code-review, to-spec, to-tickets, triage, wayfinder, ask-vstack) and setup-vstack's seed templates use `docs/vstack/`. This substitution goes on the written list of exact replacements, and every Update re-applies it.
- If a later Matt release mentions `docs/agents/` in an adopted skill, that skill becomes adapt.
- The domain layout stays `GLOSSARY.md` (`GLOSSARY-MAP.md` when there are several contexts) plus `docs/adr/`, because adopted skills (domain-modeling, diagnosing-bugs, tdd, codebase-design, wait-what) mention those paths.
- Projects set up for Matt and every `.git/matt-pocock/` directory need a Migration. If a private repo has not been migrated, the vstack rule sees no `.git/vstack/config/`, falls back to Standard mode, and skills write tracked files there. Migration therefore moves each private directory before the old user rule is removed.
- Amended for Matt `v1.3.0`, which renamed the domain files `CONTEXT.md` → `GLOSSARY.md` and `CONTEXT-MAP.md` → `GLOSSARY-MAP.md`: the domain layout follows the new names so adopted skills stay adopt. A project set up with the old names needs a Migration (`git mv` both files, then update the links in the map).
- At Base Pins before `v1.3.0`, Matt's text still says `CONTEXT.md` and `CONTEXT-MAP.md`, so adopted skills stay adopt only from `v1.3.0` on. Until then the required House style rows `glossary-map` (`CONTEXT-MAP.md` → `GLOSSARY-MAP.md`) and `glossary` (`CONTEXT.md` → `GLOSSARY.md`) rewrite those names, and wait-what ships as adapt. The Update that moves the Pin to `v1.3.0` or later proposes wait-what as adopt again, and Migration keeps both rows for old project config.
