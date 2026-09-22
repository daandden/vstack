# Source dispositions

`config/inventory.json` is the source-level disposition ledger for [#13](https://github.com/daandden/vstack/issues/13), governed by the final specification in [#12](https://github.com/daandden/vstack/issues/12). The final resolutions in #9–#11 supersede earlier proposals in #8 and earlier checkpoints. Inventory is not an installation manifest: pending sources do not create discoverable skills or workflow stubs.

## Pinned boundary

- Matt: `mattpocock/skills`, stable `v1.2.3`, commit `6acc160e4e0cd062dbbbd7a1b26ae92855edf07e`. Include complete stable `skills/engineering/` and `skills/productivity/` directories and `LICENSE`. This snapshot contains **25** stable `SKILL.md` files, counted from the files rather than assumed from a historical report. Deprecated, misc, in-progress, root steering, and build/distribution machinery are excluded.
- Pstack: `cursor/plugins`, explicitly approved commit `c1c0a32802223f4be824112dd83d33ad29a8b26c`. The locked allowlist is `pstack/skills/` and `pstack/LICENSE`. It contains **47** skill entry points, **23** poteto-mode playbooks, and the retained **bugbot-triage reference**. The initial full snapshot also contains three dormant Benny automation skill files. They are recorded as dropped, outside the allowed source boundary, rather than silently omitted or treated as approved workflows.

Each `path` is relative to its source mirror root: `vendor/matt/<sha>/<path>` or `vendor/pstack/<sha>/<path>`. For example, Matt wizard is `skills/engineering/wizard/SKILL.md`; pstack how is `pstack/skills/how/SKILL.md`. Each inventoried path identifies the actual source file, not a generated directory. The pins above describe the initial accepted snapshot; `config/sources.lock.json` is authoritative after an approved transition. Cached builds never check remote tags.

The delivered [explicit sync workflow](sync-workflow.md) prepares isolated candidates without changing this ledger or exposing pending skills. Matt selection requires consistent full stable SemVer tags, excludes prereleases, and rejects ambiguous highest equal-precedence tags. Pstack requires a nominated full SHA and approval before activation. Only no-source-tree-change or narrowly verified existing non-executable `agents/openai.yaml` UI changes (`display_name`, `short_description`, `brand_color`) are automatic-eligible. Unknown, mixed, new-skill, moved-tag, and affected-patch changes require whole-transition approval with per-path rationale and per-affected-patch semantic review. Source sync does not approve new selections or finish pending family adaptations.

## Ledger semantics

- `retain` preserves an approved source or supporting resource. Renames, such as pstack teach to explain, remain retention. A retained source is not necessarily a standalone skill.
- `fold` moves useful behavior into the named owner without exposing the old entry point or a compatibility alias.
- `drop` excludes the source from generation and active execution links. Pristine source evidence may remain in the mirror.
- `targets` names intended family entry points or supporting resources. It is not a claim that those targets are currently installed. `continuity` denotes the approved family, including trail, handoff, recall, pickup, and safe-stop behavior, not a new universal dispatcher.
- `owner` is the accountable implementation issue. Dropped rows have no implementation owner. A row spanning families names its primary owner and records collaborating owners in its reason.
- `installed` marks a source selected for the complete delivered slice. **Only Matt wizard is installed in #13.** `pending` means its real family adaptation and verification have not been delivered; it must not be exposed by a placeholder. `dropped` records an excluded source.

Supporting sibling references, scripts, templates, assets, and licensing travel with the retained skill's resource closure. They are not separate disposition rows unless explicitly enumerated here as a playbook or the bugbot-triage reference. In particular, retaining `to-tickets` includes its approved extras, not just its main prompt.

## Accountable families

| Issue | Owned sources and behavior |
| --- | --- |
| #13 | Complete wizard slice; pending source-accountability for the 23 supporting principle skills. |
| #14 | Pstack setup-pstack becomes setup-models, with native model configuration and runtime checks. |
| #15 | Delivered public `sync prepare/show/approve/activate` CLI and whole-transition approval. No additional source entry point is invented. |
| #16 | How, why, research, investigation, Matt teach, pstack explain, writing-for-agents, technical-writing, unslop, codebase-design/domain-modeling support, ask-matt, grill-with-docs, to-questionnaire, and wait-what. |
| #17 | Matt-led merged TDD, diagnose-and-fix, code-review, resolving-merge-conflicts, and diagnosis's blast-radius fold. |
| #18 | Matt setup becomes setup-repo; issue triage and reference-derived review-comment-triage. Preserve wizard when composing setup. |
| #19 | Wayfinder, to-spec/to-tickets/implement including extras, grilling/grill-me, and retained portions of figure-it-out and automate-me. Feature/refactoring/publication playbooks fold here. |
| #20 | Local Swarm and Arena, with declared coverage, capture-only isolation, and parent verification. |
| #21 | Prototype, architect, improve-codebase-architecture, and the design consumer of blast-radius guidance. |
| #22 | Explicitly invoked local babysit, derived from its playbook, without merge or topology-change authority. |
| #23 | Continuity: handoff, recall, show-me-your-work folded into trail, safe-stop and pickup. Wayfinder (#19) also consumes the decision trail. |
| #24 | Opt-in reflect and standalone agent-evaluation derived from eval, not an OMP eval-tool wrapper. |

All approved Matt singleton entry points remain inventoried, including grill-me and grilling separately. No unsupported historical count governs coverage. No retro stub or unrelated local-only skill is added.

### Principles remain support

All 23 pstack `principle-*` sources are retained **pending** as supporting material, accountable to #13 until their relevant family adaptation establishes the actual dependency closure. Their source names in `targets` identify support, not approved independent active installs. This ledger does not invent a consumer assignment, make upstream principles universal policy, or approve an authority change. The delivering family must adapt relevant support and remove excluded cloud, dispatcher, or publication assumptions before activation. Source retention alone cannot override the final workflow contracts.

### Explicit exclusions

The eight excluded normal pstack skill entry points are bro, create-verification-skill, maintain-verification-skill, interrogate, make-bot-ui, no-comments, poteto-mode, and typescript-best-practices. The three Benny automation entries are outside the locked allowlist. Blast-radius, pstack TDD, and show-me-your-work are folds rather than additional standalone installs. Dropped routes must disappear from active incoming instructions; do not replace poteto-mode with another dispatcher, restore Comment Sicko under a new name, or silently substitute local execution for an excluded cloud workflow.

## All 23 playbooks

| Source playbook | Disposition | Target | Owner |
| --- | --- | --- | --- |
| `authoring-a-skill` | drop | None | None |
| `autonomous-run` | drop | None | None |
| `autopilot-full` | drop | None | None |
| `autopilot-stack` | drop | None | None |
| `babysit` | retain | `babysit` | #22 |
| `bug-fix` | fold | `diagnose-and-fix` | #17 |
| `eval` | retain | `agent-evaluation` | #24 |
| `feature` | fold | `to-spec`, `to-tickets`, `implement` | #19 |
| `hillclimb` | drop | None | None |
| `investigation` | fold | `investigation` | #16 |
| `multi-phase-plan` | drop | None | None |
| `opening-a-pr` | fold | `implement` | #19 |
| `orchestrate` | drop | None | None |
| `pause-safely` | fold | `continuity` | #23 |
| `perf-issue` | fold | `diagnose-and-fix` | #17 |
| `prototype` | fold | `prototype` | #21 |
| `refactoring` | fold | `to-spec`, `to-tickets`, `implement` | #19 |
| `runtime-forensics` | drop | None | None |
| `session-pickup` | fold | `pickup` | #23 |
| `shipping` | drop | None | None |
| `trace-forensics` | drop | None | None |
| `visual-parity` | drop | None | None |
| `worktree-cleanup` | drop | None | None |

The final playbook split is **12 drops, 9 folds, and 2 retained standalone families**. Swarm and Arena are normal skill sources, not additional playbooks. Dropping multi-phase-plan includes its template, validator, and added checks; no replacement verification-lane policy is required. Opening-a-pr folds only into the separately authorized pipeline publication step. Bugbot-triage is a separate retained reference row owned by #18 even though its containing poteto-mode dispatcher is dropped.

## Coverage and delivery counts

| Source category | Rows |
| --- | ---: |
| Matt stable skills | 25 |
| Pstack normal skills | 47 |
| Pstack excluded automation skills | 3 |
| Pstack playbooks | 23 |
| Pstack retained bugbot-triage reference | 1 |
| **Total inventoried snapshot entries** | **99** |
| **Entries within the locked source allowlists** | **96** |

Across all 99 rows, there are **64 retain, 12 fold, and 23 drop** dispositions. Delivery status is **1 installed, 75 pending, and 23 dropped**. The 23 principle sources are included in pending, not installed. These are source counts, not counts of final discoverable skills: merges and renames deliberately break any one-to-one correspondence.

Coverage verification compares exact `(source, path)` pairs with every `SKILL.md` in the pinned snapshots, all playbook files, and the bugbot-triage reference. It rejects omissions, duplicates, unexpected paths, invalid status/disposition combinations, missing owners on retained/folded rows, and changes to the 12/9/2 playbook split. The generator's installed selection and real OMP acceptance are verified separately; inventory coverage is not proof that pending workflow behavior works.
