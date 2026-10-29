---
name: skill-creator
description: Create or update an agent skill with appropriately scoped instructions and any needed supporting resources.
---


# Skill Creator

Create skills that give an agent useful, non-obvious guidance without constraining unrelated work. This skill covers scope, structure, tooling, validation, and evaluation. For the writing itself (descriptions, information hierarchy, progressive disclosure, wording, pruning), read skill://writing-for-agents; for the invocation choice, read skill://writing-for-agents/SKILL-MECHANICS.md.

## Scope and Authority

A skill serves the requested task. It keeps the user's chosen product, stays within the assignment, leaves unrelated configuration alone, and grants no permission for additional external actions. Approval to complete a task leaves its scope and execution permissions unchanged. For retrying or externally mutating workflows, define a stopping condition proportional to the risk, and require authorization immediately before the actual mutation.

For batch or destructive operations, have the skill produce a plan first, validate it with a script whose errors name the fix, and execute only after validation passes and authorization is given.

Match specificity to risk. For open-ended work, describe the outcome and decision criteria and let the agent choose the approach. For workflows with a preferred shape, offer examples or configurable scripts. Reserve fixed sequences, narrow parameters, and absolute language for operations where deviation causes a concrete problem: correctness, safety, permissions, or a genuinely fragile step. Distinguish real requirements from recommendations and local conventions, and leave policies enforced elsewhere to their owners.

Treat a particular example, past failure, or personal preference as evidence about one case; generalize it only when real usage shows the pattern.

## Anatomy of a Skill

```text
skill-name/
|-- SKILL.md         Required: YAML frontmatter + instructions loaded when the skill applies
|-- scripts/         Optional executable helpers
|-- references/      Optional documentation read when a branch needs it
`-- assets/          Optional files copied or adapted into output
```

Create only the parts the workflow uses. A short, self-contained skill is often just `SKILL.md`.

### Frontmatter

`name` and `description` are required. omp also interprets `disable-model-invocation` (a boolean; the choice is covered in `SKILL-MECHANICS.md`), `hide`, `globs`, and `alwaysApply`; it preserves other keys as metadata. Preserve an existing skill's optional fields, including harness-specific ones, unless the user asks to change them, and add new ones only for a concrete need.

A skill with sensitive operations stays discoverable when it otherwise should be; its protection is the authorization check right before the mutation.

### Scripts

Use `scripts/` when the same logic would otherwise be rewritten repeatedly or deterministic execution materially improves reliability: transformations, reliable API operations, data processing. Good scripts:

- Extract facts into compact output (such as JSON) that the agent reads, and leave judgments of meaning to the agent.
- Report errors that name the fix.
- Run without their source loaded into context, although an agent may read them to patch or adapt them.

Run every new or changed script on meaningful input.

### References

Use `references/` for maintained, task-specific material that only some branches need: schemas, API contracts, domain rules, detailed procedures, substantial examples. Link each reference from `SKILL.md` or another reference and state when to read it. Before removing an existing resource, inspect its callers and purpose.

### Assets

Use `assets/` for templates, images, fonts, boilerplate projects, and sample data that belong in the output. Read an asset only when the task requires inspecting it.

Supporting files serve the skill's work: a README, installation guide, changelog, or duplicate quick reference belongs only where a packaging requirement calls for it. Keep packaging requirements with their owner.

## Create or Update a Skill

Adapt the effort to the request: a narrow update may need only a focused edit and validation, while a complex new skill involves every step below.

### 1. Establish the task

Identify which requests the skill handles and which outcomes matter.

- When the conversation already contains the workflow ("turn this into a skill"), mine it first: tools used, step order, corrections the user made, input and output formats. Resolve only material gaps through `ask`.
- Ground the skill in real expertise where it exists: runbooks, incident fixes, review comments, a transcript of the task done once. Teach the method, not that instance's answer.
- Decide whether the need is a skill at all, and whether it is one skill or several; splitting rules are in skill://writing-for-agents.

Use `ask` only when missing information changes the work and cannot be reasonably inferred. When the user has explained the task clearly, proceed.

### 2. Choose the location and name

For a new skill, a location the user names wins. Otherwise choose `.omp/skills/<name>/` for guidance about this repo, vstack only when the user names vstack, or `~/.omp/agent/skills/<name>/` in every other case (the default). Use `ask` once only if the home is unclear.

For an update, resolve `omp skill list --json`: inspect `source` and resolve `filePath` to its real path. Edit an own project or user skill in place and leave it uncommitted. Refuse someone else's install, because its next update overwrites the edit. State the reason and stop.

A vstack target is a new skill in vstack, or an existing skill whose real path is inside a vstack clone's `plugin/`, whatever its Disposition. A change to a vstack skill is a Hand edit. When vstack-maintain's drafting worker reads this skill in the Matt flow, edit the target that its brief supplies in the worker's own clone. Write only the requested draft. The Matt flow owns every other step, including the confirmation for an adopt target.

In every other case, tell the user to start the Hand edit through `/skill:grill-with-docs` before you write anything. That run loads vstack-maintain. Give the user the request and the target's real path as input for the grill. The clone root is the directory above `plugin/` in the real path of any vstack skill, such as this one. Stop without editing the target.

Names use lowercase letters, digits, and single hyphens, at most 64 characters; prefer short action-oriented names, namespaced by tool or domain when that aids discovery. The folder name matches the skill name.

### 3. Scaffold a new skill

Resolve bundled `scripts/` paths relative to this skill's directory. The initializer uses Bun and refuses to overwrite an existing skill:

```bash
bun scripts/init_skill.ts <skill-name> --path <output-directory> [--resources scripts,references,assets] [--examples]
bun scripts/init_skill.ts my-skill --path ~/.omp/agent/skills --resources references
```

It creates `SKILL.md` with `[TODO: ...]` placeholders and only the resource directories requested. `--examples` adds starter files; replace or delete them before finishing.

### 4. Write the skill

Write what another agent needs to perform the task well: the desired outcome, who or what consumes it and what they need to act on it without the conversation, non-obvious context, real constraints, and the relevant tools and references. Completeness and rigor follow from that consumer. Preserve the user's explicit choices and authorization boundaries. Follow skill://writing-for-agents for the description, structure, and wording.

- A skill that builds an artifact across turns keeps its state outside the conversation, in a decision log, a work-in-progress file, or both, so the work survives compaction and resumption.
- A skill that delegates specifies the exact return format and lets the subagent do the reading; the parent keeps paths and results.

Keep the skill self-contained: refer to another skill or tool only when the workflow requires it and the target environment provides it. Specialized review, hardening, or audit steps belong where the user requests them or the task genuinely needs them.

### 5. Validate

Run the Bun validator:

```bash
bun scripts/quick_validate.ts <path/to/skill-folder>
```

It reports every problem it finds: frontmatter syntax and types, naming, a folder name that differs from `name`, an empty body, unfinished `[TODO: ...]` placeholders, Markdown links that do not resolve, and `references/` files that nothing mentions. A clean result covers structure only. Also confirm that the description selects the intended requests, the instructions preserve scope, and added scripts work.

### 6. Evaluate when warranted

Ordinary creation and small edits need no formal evaluation. For a complex or risky skill, or when the user asks whether a skill works, read [references/evaluation.md](references/evaluation.md). For description changes or misrouting, read [references/trigger-evals.md](references/trigger-evals.md). To decide whether one version beats another, or whether a section earns its place, read [references/blind-comparison.md](references/blind-comparison.md).

Follow `skill://flow-page`'s "Stage entry/exit line" for an evaluation run. Publish the Results specified by the selected evaluation reference. Preserve skill files and all required eval exports. Redact secrets in transcripts and captured outputs. Summarize the Results rather than writing a separate report page.

Improve skills from real usage and demonstrated failures, preferring a narrow correction to a new universal rule.
