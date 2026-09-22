# Explicit upstream sync

Issue #15 adds a public, explicit-request CLI. It does not run on startup, watch repositories, change model settings, or publish anything. Direct `bun run build` and `bun run install:workspace <workspace>` remain available. A cached build uses the accepted full SHA without checking tags remotely; only an explicit sync prepares an upstream transition.

## Commands and selection

Run commands from the repository root. First build the accepted stack with `bun run build`; Git, tar, Bun, and a real `omp` executable must be available. Local selections, inventory, patches, and additions must already match the active build. Review and build intentional local changes separately before syncing.

```sh
bun scripts/stack.ts sync prepare matt
bun scripts/stack.ts sync prepare pstack <full-40-character-sha>
bun scripts/stack.ts sync show <candidate-id>
bun scripts/stack.ts sync approve <candidate-id> <decision.json>
bun scripts/stack.ts sync activate <candidate-id>
```

These are command forms, not a script to run unattended. Choose one source, prepare it, inspect the returned candidate, and only then decide whether to approve and activate.

- **Matt:** preparation fetches an isolated upstream view and selects the highest stable full SemVer tag. Tags must use a consistent prefix matching the accepted tag (`v` or none). Partial versions, mixed naming, and invalid versions require a source-policy decision rather than a guess. Valid prereleases are excluded. Build metadata does not establish precedence: two highest stable tags with equal precedence are rejected as ambiguous. Moved or missing accepted tags and moved previously observed selected tags require approval, including rewritten tag objects at the same commit. Accepted tag object IDs are retained in `tagObject` provenance.
- **Pstack:** preparation requires a user-nominated lowercase 40-character commit SHA. Nomination authorizes inspection, not acceptance. Whole-transition approval is always required before activation, even for a provenance-only change.

No source transition is activated by `prepare`, `show`, or `approve`. Even candidates eligible for automatic approval require an explicit `activate` command.

## Conservative approval boundary

Only a transition with no source-tree changes, or changes limited to existing non-executable `agents/openai.yaml` UI strings under `interface` (`display_name`, `short_description`, and `brand_color`), can omit a human approval decision. The remaining parsed metadata must be unchanged; unknown or unparseable content is not assumed harmless.

Everything else requires approval of the **whole transition**: instruction or `SKILL.md` changes, scripts, executable bits, supporting resources, invocation policy, unknown paths, new skills, mixed metadata/behavior changes, moved tags, and affected local adaptations. Classification covers the full upstream tree, not only installed skills or allowlisted paths. New upstream skills remain unselected; sync does not edit the inventory or install a pending family.

Any source-tree change conservatively makes every patch for that source an affected adaptation, even without direct path overlap. A clean Git patch application cannot prove semantic compatibility: sibling instructions or resources can invalidate an overlay's assumptions.

## Inspect the exact candidate

Preparation prints JSON including `id`, `fingerprint`, `previous`, `next`, `changes`, `adaptations`, `requiresApproval`, `release`, `verification`, and `record`. Use `show` to reload the sealed candidate. Its files live at:

| Path | Purpose |
| --- | --- |
| `generated/candidates/<id>/candidate.json` | Successful prepared candidate and exact fingerprint. |
| `generated/candidates/<id>/failed.json` | Failure details when candidate generation or verification fails. |
| `generated/candidates/<id>/upstream.patch` | Full binary-capable upstream diff between old and proposed commits. |
| `generated/candidates/<id>/input/config/sources.lock.json` | Proposed lock; other selections remain fixed. |
| `generated/candidates/<id>/input/overlays/` | Copied local adaptations and additions used by the build. |
| `generated/candidates/<id>/input/vendor/<source-id>/<sha>/` | Pristine allowlisted source mirror for each candidate pin. |
| `generated/candidates/<id>/input/generated/releases/<release>/` | Exact generated candidate, including `skills/`, licenses, and provenance. |
| `generated/candidates/<id>/input/generated/current` | Candidate-only pointer to that release, not the accepted stack. |
| `generated/candidates/<id>/approval.json` | Recorded decision after `approve`. |
| `docs/sync/<date>-<source>-<sha-prefix>-<candidate-prefix>.md` | Dated decision record; use the exact `record` path printed by the CLI. |

Review procedure:

1. Read `show` and `upstream.patch`. Account for **every** entry in `changes`, including changes outside installed selections and paths with no mapped skill. Verify the old/new tag and full SHA, moved-tag flag, source boundary, and intended disposition.
2. Read the complete affected instructions and their resource closure, not just changed lines. Compare the pristine candidate mirror with the applicable patch in `input/overlays/` and the resulting candidate release. Review each path in `adaptations` for intent, authority, tool names, resource references, invocation policy, and removed upstream assumptions.
3. Inspect resources at their exact candidate paths. For wizard, read `generated/candidates/<id>/input/generated/releases/<release>/skills/wizard/SKILL.md` and its `template.sh`; compare the source at `input/vendor/matt/<next-sha>/skills/engineering/wizard/`. Do not accidentally inspect `generated/current`, which still serves the accepted version.
4. Exercise changed behavior in a disposable workspace. Point its `.omp/config.yml` `skills.customDirectories` at the **absolute** candidate `input/generated/releases/<release>/skills` directory and launch real OMP there. Invoke the affected skill (for wizard, `/skill:wizard`) and read its supporting resource through `skill://wizard/template.sh`. Use harmless local fixtures; inspect any resource before executing it. Record concrete inputs, observed outputs, permissions, and failure/boundary behavior relevant to the change.
5. Write the decision only after meaningful human semantic review. Mechanical discovery, nonempty text, or a clean patch alone is insufficient behavioral evidence. Do not describe unexecuted scenarios as passing.

Preparation and activation run real OMP RPC discovery for selected skills. Generation also validates metadata, invocation-policy overlays, resources, and provenance. These checks establish structural integrity and discoverability, **not** behavioral equivalence or human approval.

## Decision format

`approve` reads a JSON file with these fields:

- `candidate`: the exact `fingerprint` printed by `show`, **not** the candidate ID.
- `reference`: a nonempty reference to the user's or maintainer's explicit whole-transition approval.
- `verification`: nonempty reviewer evidence describing actual behavioral exercises and results.
- `changes`: an object keyed by every exact `changes[].path`, with a nonempty semantic review rationale for each.
- `adaptations`: an object keyed by every exact path in `adaptations`, with a nonempty rationale establishing the corresponding local patch's semantic compatibility. Use `{}` only when there are no affected patches.

For example, for a candidate whose only changed path and affected patch are the wizard paths below, replace the illustrative values with actual evidence and the exact fingerprint:

```json
{
  "candidate": "<exact candidate fingerprint>",
  "reference": "<explicit approval reference>",
  "verification": "<actual scenario, inputs, observed results, and evidence location>",
  "changes": {
    "skills/engineering/wizard/SKILL.md": "<review of upstream intent and resulting OMP behavior>"
  },
  "adaptations": {
    "overlays/matt/wizard.patch": "<semantic review of this patch against the complete new source and resources>"
  }
}
```

Use the candidate's actual paths; this example does not supply an approval. `approve` validates coverage and binds the decision to the candidate. It cannot judge the truth or quality of the prose. Approval receipts reject edits; do not hand-edit a stored decision to bypass review.

## Activation, stale candidates, and records

Activation checks the accepted baseline and the sealed candidate, regenerates the exact release, and repeats OMP discovery before updating the accepted patches and lock and switching the local `generated/current` pointer. Selected commits are retained in local object caches under `refs/vstack/pins/<sha>`. Pending or failed transitions leave the accepted pin and active release unchanged; diagnostics, candidate artifacts, cache objects, or dated records may still be written.

The fingerprint binds the candidate inputs, generator, generated release, pristine mirrors, and `upstream.patch` bytes. Changed candidate data, resources, patches, diff evidence, or generator require a new `prepare` and renewed approval; never repair a sealed candidate in place. Preparation will not silently incorporate unbuilt local changes.

For a conflicting adaptation, rebase a separate copy of the source's existing patch files against the proposed upstream. Place them beneath a separate directory using their existing repository-relative paths (for example, `/tmp/rebased/overlays/matt/wizard.patch`). Supply all existing patches for that source, then prepare a fresh candidate:

```sh
bun scripts/stack.ts sync prepare matt --patches /tmp/rebased
bun scripts/stack.ts sync prepare pstack <full-40-character-sha> --patches /tmp/rebased
```

This copies only that source's declared patches into isolated candidate inputs. It does not change the accepted overlays, add patch declarations, or weaken the source boundary. Rebased patches always require semantic review and whole-transition approval. Successful activation persists the reviewed patch bytes together with the new pin; failures before publication restore the previous patch bytes and pin. Include the rebased patches in the same reviewed commit as the lock and dated record.

Candidates also bind the accepted baseline for **all** sources. Activating another source changes that baseline: prepare a fresh candidate and renew its approval rather than reusing the stale decision. Missing or ambiguous tag policy must be resolved explicitly, not by editing candidate JSON. Keep unrelated user work; do not clear integrity errors by discarding unexpected edits.

The dated record captures old/new revisions, changed paths and affected skills, classification, adaptation rationale, approval reference, and verification. It is written in the version-controlled documentation area, but sync does **not** stage or commit it. After successful activation, the maintainer reviews and commits the record named by `candidate.record`, `config/sources.lock.json`, and any rebased patches together. Generated candidates, mirrors, and releases remain regenerable local artifacts. No automatic commit, push, PR, merge, or upstream publication occurs. Source approval and local activation grant no publication authority; any later publication needs separate explicit permission.

## Verification status

The [verification record](verification/issue-15.md) describes deterministic CLI regressions and actual model-driven reads through the installed stack before and after activation. OMP discovery does not replace per-transition human semantic review and behavioral evidence.
