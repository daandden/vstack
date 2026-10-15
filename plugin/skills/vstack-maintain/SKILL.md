---
name: vstack-maintain
description: Update and Hand edit knowledge for the grill and implement, with read-only fact-finding and bookkeeping commands.
disable-model-invocation: true
---

# vstack-maintain

An Update moves one or more Pins through confirmed row decisions. A Hand edit changes a vstack skill, agent, or rule outside an Update. This Addon supplies case knowledge to the running Matt skill. implement owns the branch, commit, review, and End state chain.

An Update is one ticket and one implement session. A Hand edit can span tickets. Run the commands from the vstack checkout root. Resolve the checkout and script paths once and pass absolute paths in briefs. Read GLOSSARY.md, house-style.yaml, and every docs/adr file for the affected choices.

## Fact-finding for the grill

The grill runs these commands before it asks about a case:

```sh
bun scripts/vstack-maintain.ts plan [<upstream>|<upstream>@<ref> ...]
bun scripts/vstack-maintain.ts merge --plan <Scratch>/plan.json
bun scripts/vstack-maintain.ts check --plan <Scratch>/plan.json [<artifact> ...]
bun scripts/vstack-maintain.ts check <artifact> ...
bun scripts/vstack-maintain.ts check --take <upstream>:<path>
bun scripts/vstack-maintain.ts check --rename <artifact>=<new artifact>
bun scripts/vstack-maintain.ts check --remove <artifact>
```

`plan`, `merge`, and `check` make no branch or worktree and write nothing in a checkout. They can fetch into the external Upstream cache. `plan` writes one Scratch entry of kind `maintain` and prints its plan.json path, even when no Pin moves. Keep that path for `merge` and `check` in this session. All commands accept `--root <checkout>`, `--upstreams <cache>`, and `--remote <url>`. `plan` and `gates` also accept `--scratch <dir>`, the absolute Scratch dir for their entry. Without it, the entry goes under the Scratch dir that the checkout's own `.git` names. `-h` prints usage. JSON failures exit 2. The `--scratch` dir and the external cache must not be inside a checkout.

The plan classifies unchanged, changed, moved, removed, and new rows. It groups rows that share an artifact and diffs each held row from its own `held_at` and `held_path`, not the global old Pin. Both Upstream sides of adapt and merge rows already contain the ordered House style replacements (ADR 0008). Judgment rules still need an agent.

`merge` reports the file paths and line ranges where Upstream edits overlap local edits. It makes no draft and replays nothing. For a Playbook, the default destination is SKILL.md. If its contribution lives elsewhere, pass `--decisions <file>` with `file_maps`, keyed by row id and then Upstream file path. Each value is a path within the artifact.

`check` reports target actions, current register rows and Dispositions, callers, and name clashes at the current Pins. For a rename or removal, callers include Upstream forms such as `/<name>`, and `adopt_callers` lists callers that need a flip. With `--plan`, check also covers every artifact of the Update rows. Read the returned callers before asking.

Confirm decisions only, through `ask`. Do not draft alternatives for the user to review or make a finished-text report. Mechanical gates need no user approval. Use `ask` for row actions, Disposition changes, removal and rename choices, name clashes, adopt flips, and the user's one-line reasons. State each moved Upstream as `<upstream>@<ref>` with each confirmed decision and its reason. Preserve the row ids, new-item paths, and Hand edit target paths in the hand-off. A later session cannot use this session's Scratch entry as its plan.

### Update cases

- Existing rows: Accept, Hold, or Change Disposition. A Hold keeps that row's text at its effective old version. Unresolved choices default to Hold. Pins can move while individual rows stay on Hold.
- Changed rejects: compare the new text with the reason and revisit condition. Also reconsider unchanged rejects whose reason starts `Deferred at `.
- New items: Accept, Defer, or Change Disposition. Read the entire item. A new item has no older contribution to Hold. Defer records reject with `Deferred at <pin>: <gist>`.
- Adopt: byte-identical at the selected Pin, minus agents/openai.yaml. A required House style row, a caller fix, a rename, or a Fan-out fix can require adapt. Ask for the flip and its new reason. Never patch an adopt copy and leave its row adopt.
- Removed items: ask with no recommended option. For an unshared artifact, offer Drop, Keep as a vstack original, and Hold. For a shared artifact, offer Remove its contribution, Keep its contribution as vstack text, and Hold. Never delete an artifact that another row still names.
- Renamed adopt items: ask Follow the new name, Keep the vstack name, or Hold, with no recommended option. Follow keeps adopt and changes every caller. Keep changes the row to adapt and records a required House style replacement from the new Upstream name to the vstack name. Confirm moves of other rows with no recommended option, then handle their text by Disposition.

### Hand edit cases

- Add: a new original skill, agent, or rule joins `originals:`. A new name must not clash with an Upstream item at a current Pin.
- Clash: if check offers a `take`, ask Take the Upstream item or Pick another name. Otherwise ask for another name only. A rename cannot take a clashing item. Give no recommended option.
- Take: a rejected or unregistered item at its current Pin, never a newer ref. Check prints the artifact, row, Disposition, and matching required House style rows. Ask for its one-line reason. Adopt takes stay byte-identical. Required rows can make a take adapt.
- Edit or rename of adopt text: ask Flip to adapt with the user's new reason, or Drop this target. Give no recommended option. Do the same for each adopt caller that must change. If the user drops a required caller, also drop the rename or removal that needs that caller.
- Rename: keep the artifact kind, move the artifact, set a skill's frontmatter name to the new folder name, and change every caller. Record the required rename House style row.
- Remove: delete the artifact and change every caller. Rows that name only that artifact become reject. Ask for their one-line reason. Shared rows keep their other artifacts.

A timed-out answer is not confirmation. The grill uses its own question and closing steps. It never substitutes an automatic answer for the user's decision.

## Knowledge for implement

Draft every Update and Hand edit in one isolated `vstack-worker`. An in-place session lesson is the exception and follows the "In-place session lessons" section below. The installed plugin can load from this checkout, so the main checkout never holds an ungated draft. implement still owns the branch choice, and its review, commit, and PR continue in the main checkout.

Spawn one `vstack-worker` via eval `agent(<prompt>, agent="vstack-worker", isolated=True, apply=False, merge=False)`: the drafting brief below, the confirmed hand-off, and any open decision-trail log path, the vstack root, the Scratch dir. Wait for its result. If it cannot be spawned, stop: report the Update or Hand edit as not done, and point at `/skill:setup-vstack` when `task.isolation.enabled` is off.

Read the worker's patch path from omp's completion notice, `Isolation: changes captured at … (apply=false). Not applied.`, as skill://ship does. If structured output hides the notice, read the full completion through the handle's `output()` or `agent://<id>`. Never derive a path from an agent id. Read the patch. Apply it on implement's branch in the main checkout with `git apply -- "<patchPath>"`. A worker that returns without passing `gates` lands nothing. Report its failing stage and evidence path.

For each wave of code-review fixes that implement accepts, run the single-subagent line above again after the earlier patch landed. The fresh worker gets the accepted findings in its brief, so its patch holds only the fix and passes `gates` first. State in the brief whether the branch was pushed. If the fix wave lands before the branch's first push, the fix-wave worker runs `gates` alone, because the first push already carries the bump. If the fix wave's plugin changes go into a commit that is pushed after an earlier push, the worker runs `prepare` before `gates`. CI's push check compares the version with the commit before the push, so each push that changes `plugin/` needs a raised version. If the accepted findings change a target, a row, or a decision, the worker also runs `prepare` before the first push. Land it the same way. Never edit plugin text in the main checkout.

### Drafting brief

Write only in your clone and under the Scratch dir. Never commit. Run every command from your clone's root, not from a checkout path in this brief. Pass `--scratch <Scratch dir>` to every `plan` and `gates` run. Your clone has its own `.git`, so the default Scratch entry is outside the Scratch dir. Run `gates` last. Return only after `gates` passes, with each stage name and its `ok` value. If a failure remains after your fixes, return the failing stage and its evidence path.

For an Update, rerun `plan` at each stated `<upstream>@<ref>`. Compare its row set and new-item paths with the confirmed hand-off. If they differ, stop with a report of the difference. Do not apply decisions to unseen rows. Write the decisions file yourself from the confirmed decisions. For a Hand edit, rerun `check` at the current Pins for the targets and their callers.

Before drafting, read `plugin/rules/vstack-writing.md` and `skill://vstack-prose`. Read `skill://skill-creator` for skill changes. Write and merge each accepted row's Upstream text into the vstack text yourself. Keep each row's effective old baseline and reason in view, especially for shared artifacts. Keep clean hunks and resolve overlaps from the actual texts. No script composes row drafts. Leave held rows' text alone.

Apply the judgment-based House style rules to new adapt, merge, and original text: Fan-out lines, single-subagent forms, skill references, and ask-tool. Check against every contributing row's reason and the ADRs. A real trade-off can need an ADR. Ordinary reversible edits do not. Follow `skill://domain-modeling` for that decision.

For a removal or rename, change every caller in your clone. Each changed adopt caller needs its confirmed flip and reason. Write or move adapt and merge artifacts yourself. `prepare` writes adopt copies and takes from the Pin, not agent-authored adopt drafts. It keeps an existing adapt take so a correction survives another prepare.

#### One decisions file

Store the file outside your clone, under `<Scratch dir>/maintain/`. It can contain Update rows and Hand edit targets together:

```json
{
  "decisions": [
    { "id": "matt/example", "action": "accept", "reason": "The current reason still holds." },
    { "id": "matt/held-example", "action": "hold", "reason": "Keep this contribution." },
    { "id": "matt/new-example", "upstream": "matt", "path": "skills/engineering/new-example", "action": "defer", "gist": "Review after the caller changes." }
  ],
  "targets": [
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/local-example" },
    { "action": "edit", "kind": "skill", "artifact": "plugin/skills/adopt-example", "flip": { "confirmed": true, "reason": "The caller needs the local contract." } },
    { "action": "add", "kind": "rule", "artifact": "plugin/rules/local-contract.md" }
  ],
  "changelog": ["Record each shipped change in the repo's style."]
}
```

Update rows use `action` accept, hold, or defer. A changed Disposition uses `disposition`, `artifacts`, and `reason`. New accepted rows also need `upstream`, `path`, and a unique `id`. Removed rows use `removal` drop, original, remove-contribution, or keep-contribution. Renamed adopts use `rename` follow or keep. Keep needs `disposition: adapt` and a new reason. Hand edit actions are add, edit, take, rename, and remove. `kind` is skill, agent, or rule. Takes also need `upstream`, `path`, and `reason`. Renames need `to`. Removals that make rows reject need `reason`. `flip` belongs only to an adopt edit or rename.

Run `prepare --decisions <file> [--plan <rerun plan.json>]`. It starts from branch HEAD, not the default branch or a saved snapshot. It keeps earlier tickets' rows and CHANGELOG lines. It writes the Decision register, Pins, Hold fields, House style rows, adopt copies, takes, the version, and CHANGELOG only. The version goes above HEAD's version. Removed or renamed shipped skill or agent names need a major bump, but the branch gets at most one major bump compared with its merge base on the default branch.

Run `gates` after the last change in your clone. It validates changed skill folders with skill-creator's quick_validate, runs check-register, runs `bun test`, and runs the load smoke. The smoke runs outside the home directory. The gate always deletes its temporary output directory. On failure, it copies the evidence into one Scratch entry of kind `maintain` and prints that path in the smoke stage output. Any failure blocks the patch. Fix its cause. Rerun `gates` after the final fix. No judge or sample corpus runs in this gate.

### In-place session lessons

For an in-place session lesson, use `gates --in-place` without prepare. Only `no-version-bump` is pending bookkeeping. Every other check, test, or load failure still fails. implement reports the pending bookkeeping through the lesson path.

## Extra criteria in implement's one code-review pass

Use these criteria in the existing pass, not a second review or a separate closing gate:

- Trigger: compare changed visible skill descriptions with neighboring skills for requests that can select either. Only for an overlap, use the selection-only trigger evals in skill-creator's trigger-evals reference. Return the queries, scores, and evidence paths. A hidden Addon gets no trigger eval: its description never selects it.
- Domain: check every change against every ADR and the glossary. Name the ADR or term for a conflict or an avoided word.
- Subagent: inspect targets and the skills they call for concurrent subagents outside a Fan-out line, unnamed or non-vstack roles, and user questions that bypass `ask`.
- Update Fan-out: review every changed Upstream item, adopt included, and every caller, including callers whose own Upstream text stayed unchanged. Follow calls across skills. Check the Session model rule (ADR 0004), roles, and asking wording. Check that every step with two or more parts uses the Fan-out line, and that every single-subagent line ends with a stop or skip clause from skill://vstack-fan-out's FORMS.md, so that no caller does a subagent's work itself. Check each accepted row's hunks against the final text so no Upstream change is lost. Return reviewed paths, findings with file and line, evidence, proposed fixes, and open questions without asking. Review coverage that is missing is not a clean result.

When implement delegates these criteria, use code-review's Fan-out line and reviewer briefs. Pass the resolved vstack root, target and caller paths, accepted findings, and Scratch path. implement handles findings in its review step and owns every later commit and publication action.
