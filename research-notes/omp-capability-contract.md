# OMP capability contract for deferred pstack workflows

Research date: 2026-09-22. Scope: native runtime equivalents, not stack implementation. Updated scope decision: remove cloud-dependent related skills rather than retain unsupported cloud gates. Durable remote runtime is no longer a requirement; cloud and durability rows below document boundaries only. Session-local concurrency, isolation, panels, and parent verification remain in scope.

## Evidence boundary

Inspected checkout: `/Users/vanguyen/work/tries/oh-my-pi`, HEAD **`df624f56b0508c51067a70422606cac898ac2bcb`** (read-only `git rev-parse HEAD`). Source references below are checkout-relative, under `packages/coding-agent/` unless noted. These describe the inspected source, not a claim that every installed OMP binary or this session's settings match it. No tracker, runtime configuration, branch, or product code changed. No agents were spawned for probes.

The accepted vstack vocabulary remains five capability-tier **model roles** and seven responsibility **custom agents**: `vstack-swift`, `vstack-researcher`, `vstack-coder`, `vstack-reviewer`, `vstack-planner`, `vstack-scribe`, `vstack-candidate`. Panel-slot binding variants are a configuration recommendation below, not a new role taxonomy (`CONTEXT.md:7–17`).

## Supported / conditional / unsupported matrix

“Unsupported” means absent from the inspected native agent-spawn contract, not impossible to build with an extension or external program.

| Requirement | Status | Precise current contract |
|---|---|---|
| Asynchronous background subagents | **Supported, settings-dependent for `task`** | `task` defaults to background execution when `async.enabled` is true and an async manager exists. A custom agent's `blocking: true` forces its task item inline; unavailable/disabled async falls back to synchronous fan-out. There is no per-spawn `background` switch. Eval `agent()` registers a background job and immediately returns a handle; it requires the manager and does not use the task adapter's `blocking` selection. [S1, S2] |
| Named custom agents | **Supported** | Spawn `agent` selects a discovered definition. Definitions own instructions, declared tools, spawn policy, model preference, and optional `blocking`. Project/user/extension agent discovery exists. Unknown/disabled/disallowed names fail preflight. [S3, S4] |
| Arbitrary per-spawn model selection on `task` | **Unsupported** | No `model` field in flat or batch wire schema; normalization does not forward one. Internal structured-subagent APIs do have `model`, but that is not the public tool contract. [S1, S3, S5] |
| Arbitrary per-spawn model selection on eval `agent()` | **Unsupported** | JS advertised options, Python signature, and host bridge all omit `model`. JS passes an options object through; the host schema strips unknown fields. Python rejects unknown keyword arguments. `completion(model=...)` is a different, stateless completion mechanism, not a tool-using agent replacement. [S2, S6] |
| Per-slot candidate/reviewer bindings | **Conditional; supported through named definitions/settings** | `task.agentModelOverrides[agentName]` selects a model-role/pattern for that exact name. One shared name cannot carry several simultaneous per-spawn bindings through the public interfaces. Explicit slot-specific names/variants can select independent bindings; labels/names used as handles are not model bindings. [S3, S7] |
| Isolated workspaces | **Conditional** | Must enable `task.isolation.enabled` (default false), request `isolated: true`, run outside actual OMP plan mode, and have a Git checkout. Pure non-colocated Jujutsu is rejected. Backend selection supports copy-on-write/copy strategies with fallback; these are not a guarantee of one specific `git worktree` implementation. [S3, S8, S9] |
| Capture without immediate application | **Supported, different controls by adapter** | `task` uses global `task.isolation.apply` (default true); public task item has no `apply` or `merge`. Eval supports `apply: false` per spawn; eval's default apply is **true**, independently of the task apply setting. Captured patch/branch artifacts are retained. [S2, S3, S10] |
| Select a winning candidate, then graft/merge | **Conditional / no first-class graft operation** | Capture-only enables parent-controlled selection. Native automatic integration is per successful isolated run, not a multi-candidate winner selector. Public interfaces have no `graft`, file selector, or hunk selector. Parent can inspect retained patch/branch and explicitly apply chosen changes with ordinary Git tooling. [S1, S2, S8, S10] |
| Parent verification before integration | **Not automatic; supported as workflow** | Default auto-application occurs before the result returns to the parent when child exit/error/abort checks pass. No parent test/review gate is called in that path. Capture-only is necessary if parent verification must precede integration. Structured output validation is not semantic verification of code. [S10] |
| Merge/apply conflict recovery | **Supported with partial-success caveats** | Patches/failed branches and recovery paths are retained; task appends warnings, whereas eval rejects root apply failure. Branch integration cherry-picks commits, stops on conflict, and can leave earlier commits applied. Stash restoration may fail after commits landed. This is not a transaction rolling back the whole candidate set. [S8, S10, S11] |
| Cloud-hosted remote agent spawn | **Unsupported in inspected native spawn contract** | Neither task nor eval has a remote/cloud target. The executor builds a local child session with local cwd/worktree. Hub `start` launches a named executable/process, not a cloud-agent service. SSH/remote file tooling is not evidence of remote agent orchestration. [S1, S2, S12] |
| Live wake chains / messages | **Supported** | `hub send` routes to busy agents as an aside, wakes idle agents with a turn, and revives parked agents. Direct messages can revive parked agents; broadcasts target live peers only. `await: true` waits for replies with configurable timeout. [S13] |
| Durable continuation after process restart | **Conditional** | Non-isolated subagents with persisted `session_init`, conversation history, and usable workspace can cold-revive from JSONL when addressed. The async-job map is in memory and disposal cancels/clears jobs. This is persisted conversational revival, not a durable workflow DAG, persistent pending-job queue, or exactly-once continuation guarantee. [S14, S15] |
| Wake an isolated agent after completion | **Unsupported** | Isolated runs are deliberately non-resumable, including a retained workspace after capture failure. Cold revival explicitly rejects `init.isolated`. Inspect artifacts/history instead. [S14] |
| Nesting to depth 3 | **Conditional; configurable** | Root depth is 0. Default `task.maxRecursionDepth: 2` permits children at 1 and grandchildren at 2, not a third child level. Setting 3 permits depth-3 children; 0 disables spawning; negative disables the depth cap. Agent spawn allowlists and self-recursion prevention still apply. [S3, S16] |
| Per-spawn tool restrictions via `tools` | **Unsupported interpretation** | Public `tools` names refer to eval-defined functions to add to the child, not an allowlist of built-in tools. Built-in capability selection belongs in custom-agent definitions and restricted-session policy. [S17] |
| `readonly: true` spawn switch / filesystem sandbox | **Unsupported** | No public readonly field. Read-only classification is derived from an agent's declared non-empty subset of built-in read-tier tools. It is not an OS-level filesystem permission boundary. `bash`, eval, arbitrary custom tools, and hub are not in that classification set. [S18] |

## Important details for implementation planning

### Adapter differences must remain explicit

The previous observation that task's wire schema strips `model`, `background`, `readonly`, and `cloud` remains true in this checkout. It also strips per-item `apply` and `merge`. However, **absence of `background` does not imply absence of background execution**: background is now the normal task path when async is enabled. Task's batch schema is `{ context, tasks[] }`, with a per-item custom-agent selector, optional identity name, instructions, output schema/mode, conditional effort, eval-defined tools, and conditional isolation. `task.enableEffort` defaults false; when enabled, `effort` is `lo|med|hi`, not a model-role selector. [S1, S16]

Eval `agent()` is not a hidden route to per-spawn models. It has additional isolation controls, but `merge` is a **boolean with surprising semantics**: `merge: false` selects patch mode; `merge: true` leaves the configured merge strategy unchanged. It does **not** mean “do not apply,” and does not force branch mode. Use `apply: false` to retain changes without applying. The host uses configured `task.isolation.merge` otherwise. [S2, S3]

Task and eval converge on `runStructuredSubagent`, including depth, allowed-agent, model-resolution, schema, and isolation preflight. Task-created children inherit the parent eval-session identity by default; eval `agent()` explicitly requests `shareEvalSession: false`. Eval-defined tool forwarding still calls the defining kernel, so independent child kernels do not turn forwarded functions into isolated copies. [S2:206–235, S3:480–486, S17]

`hub` is coordination/job/process control, not a third agent factory. Its persistent/detached process flags concern launched executables. They do not make the eval/task handles or Python/JS continuation state durable across host restart. [S12, S15]

### Isolation and integration

Git dirty state is supported, not a blanket clean-tree prerequisite. Baselines capture staged, unstaged, and untracked changes and nested repositories; isolation computes the agent delta relative to that baseline. Baseline content has a 1 GiB bound. Copies detach Git metadata from the source checkout, borrowing its object database rather than leaving index/HEAD shared. Backend preferences may fall back when unavailable. [S8:39–53,136–157,273–369,519–581]

In branch mode, current implementation uses cherry-picks of the captured commit range, preserving commit messages/authors where possible; it is **not `merge --no-ff`**, despite the current settings UI description saying that. Treat executable source as authoritative for the plan. Dirty-baseline commit reconstruction has extra filtering/rewrite paths. [S8:771–940,978–1054; S16 settings:4986–4997]

Automatic root integration runs only when `exitCode === 0`, `!error`, and `!aborted`. Patch mode checks reverse application (already applied) and forward application before applying. Failure returns `changesApplied: false`; artifacts remain. Task's final status can still say completed while `mergeSummary` reports integration failure because status is derived from the child result; do not parse “completed” alone as proof the parent's checkout contains the result. Eval explicitly throws on root apply failure. [S10:661–741, S11:678–750, S2:111–139; `src/task/result-summary.ts:41–79`]

Branch integration serializes stash/cherry-pick/restore within a repository. A cherry-pick error aborts the active cherry-pick and stops processing, but completed earlier cherry-picks need not be undone. If restoring parent WIP fails after the commits landed, the stash is preserved and a warning names manual recovery; it is not reported as a failed root integration. Nested repositories are applied separately, can create commits, and can have their own stash recovery warnings. Thus “winning candidate applied” and “all parent/nested dirty state restored” are separate checks. [S8:372–445,978–1054; S11:646–675,776–799]

### Limits and lifecycle

These are **source defaults**, not probed live settings:

| Setting | Default | Meaning / qualification |
|---|---:|---|
| `async.enabled` | `true` | Task async selection; missing manager still causes task sync fallback. |
| `async.maxJobs` | `100` | Async job admission cap; reaching the manager cap rejects registration rather than providing an unbounded queue. |
| `task.batch` | `true` | Batch model-facing task schema. |
| `task.maxConcurrency` | `32` | Task adapter's per-session semaphore; 0 is unlimited. Do not assume this caps eval `agent()` too: that adapter goes directly to the shared runner without acquiring the TaskTool semaphore. Async admission/provider limits still apply. |
| `task.maxRecursionDepth` | `2` | Root 0; configurable 3 or unlimited negative value. |
| `task.maxRuntimeMs` | `0` | No task wall-clock cap by this setting; not immunity from provider/other cancellation. |
| `task.agentIdleTtlMs` | `420000` | Seven minutes before parking; 0 keeps idle agents live until exit. |
| `task.softRequestBudget` | `200` | Notice at budget; forced stop at 1.5×; 0 disables. Bundled scout/sonic have lower caps. |
| `task.isolation.enabled` | `false` | Availability gate, not automatic isolation of every spawn. |
| `task.isolation.apply` | `true` | Task application default only; eval defaults true separately. |
| `task.isolation.merge` | `patch` | Patch or branch strategy. |
| `irc.timeoutMs` | `120000` | `hub send await:true`; 0 disables timeout. |

Sources: `src/config/settings-schema.ts:4674–4700,4903–4998,5051–5177`; `src/task/index.ts:565–572`; `src/eval/agent-bridge.ts:204–248`; `src/async/job-manager.ts:284–335`.

Cold revival reconstructs runtime contract from persisted session initialization, not just message history. Missing old contracts, missing conversational history, or isolated sessions are refused. Old contracts without spawn permissions default to no further spawning. Revival restores tool/model information, then clamps active tools; it requires a running host to discover and address the parked agent. Live wake-turn output is relayed to its sender, with loop suppression for automated relay replies. This supports request/reply continuation, but does not establish persisted dependency scheduling or autonomous recovery of arbitrary pending work. [S14; `src/task/executor.ts:2624–2688,2751–2929`]

### Tool restrictions versus read-only

`tools: ["read"]` on a task item is not a way to restrict a worker to reading: it asks for an eval-defined function named `read` and fails if absent. Agent frontmatter's `tools` is the relevant built-in list. If `spawns` is declared, the executor can auto-add task below the depth limit; ordinary collaboration policy may also add hub. Restrictive policy is not simply “list a few names and assume every capability source disappears.” [S17; `src/task/executor.ts:3353–3392`]

Actual OMP plan mode creates a restricted effective agent, disables additional spawn policy and prewalk, rejects eval-defined tool forwarding, and rejects any supplied isolation/apply/merge controls. The present research being “planning only” is an assignment constraint, not evidence that runtime plan mode is enabled. [S3:205–240,400–415]

The read-only classifier's set includes memory/checkpoint tools, so “read-only” here specifically means the runtime's declared read-tier capability classification, not literally no writes anywhere. Granting executable/custom capabilities requires separate review. [S18]

## Recommendations (not existing native guarantees)

1. Keep seven responsibility agents and five model roles. For simultaneous panel slots requiring different models, use explicit, limited candidate/reviewer binding variants in `task.agentModelOverrides`; do not generate an agent×tier cross-product. Do not pretend task `name` or eval `label` selects a model.
2. For candidate races, use eval `agent(..., isolated=True, apply=False)` (Python spelling) after enabling isolation, or set task capture-only before starting a batch. Capture all candidate artifacts, choose a winner, verify it, then explicitly integrate that winner. Avoid changing a global binding/apply setting during a concurrent panel.
3. Make parent verification check both code behavior and integration/recovery metadata. Child success, schema validity, and job completion are three different facts, none alone proves a correct integrated checkout.
4. Configure depth 3 where a main→planner→worker→leaf shape is required, and make every intermediate agent's spawn allowlist explicit. Treat default depth 2 as insufficient for that shape.
5. Separate resumable non-isolated coordination agents from disposable isolated implementation candidates. Following the updated scope decision, remove cloud-dependent related skills rather than preserving them behind unsupported gates or proposing remote-runtime integration work. Do not rename local hub persistence as cloud/durable-agent support; persisted revival is an optional local capability, not a durable remote requirement.

## Read-only proof

Ran Bun against source exports only, without executing any agent or touching Git state. An initial import used the wrong export name (`getTaskToolSchema`) and failed; after reading the export, reran with `getTaskSchema` successfully. Probe input included task-item `model`, `background`, `readonly`, `cloud`, `apply`, `merge`, plus supported fields. Output:

```json
{"parsed":{"context":"probe","tasks":[{"agent":"task","task":"do not run","effort":"hi","tools":["probe"],"isolated":true}]},"depths":[{"d":0,"default2":true,"configured3":true,"unlimited":true},{"d":1,"default2":true,"configured3":true,"unlimited":true},{"d":2,"default2":false,"configured3":true,"unlimited":true},{"d":3,"default2":false,"configured3":false,"unlimited":true}]}
```

This proves the current schema stripping and pure depth predicate only. Isolation creation, real agent scheduling, cloud provisioning, conflict handling, and restart revival were inspected in source, not exercised. No claim of end-to-end runtime verification is made.

## Source index

All paths below use the exact checkout SHA above. Local source is primary evidence; line ranges intentionally identify the owning implementations rather than secondary summaries.

- **S1:** `src/task/types.ts:48–215`; `src/task/index.ts:253–294,565–586,730–754,991–999,1476–1506` — task wire shape, normalization, settings and async routing.
- **S2:** `src/eval/agent-bridge.ts:24–48,111–139,171–254` — eval schema, errors, boolean merge translation, dispatch and handle.
- **S3:** `src/task/structured-subagent.ts:68–96,205–350,400–486` — shared preflight and policy.
- **S4:** `src/task/discovery.ts:1–12,75–90`; `src/task/types.ts:218–230` — definition discovery and fields.
- **S5:** `src/task/structured-subagent.ts:86–95,308–320` — internal-only model request capability.
- **S6:** `src/eval/js/shared/prelude.txt:21–38,427–442`; `src/eval/py/prelude.py:970–1004` — public helper arguments.
- **S7:** `src/config/model-resolver.ts:1210–1274`; `src/config/settings-schema.ts:5206–5209` — request/setting/definition/inherited model precedence.
- **S8:** `src/task/worktree.ts:39–72,136–157,273–445,519–581,771–940,978–1054` — prerequisites, baselines, native isolation, branch integration and recovery.
- **S9:** `src/task/isolation-runner.ts:132–146`; `src/config/settings-schema.ts:4903–4940` — isolation preparation/backend configuration.
- **S10:** `src/task/structured-subagent.ts:604–741` — run/capture/apply order and artifact retention.
- **S11:** `src/task/isolation-runner.ts:612–799` — merge outcomes, root and nested application.
- **S12:** `src/task/executor.ts:3710–3810`; `src/tools/hub/index.ts:66–96`; `src/tools/hub/launch.ts:130–155` — local session construction and named process launch.
- **S13:** `src/tools/hub/messaging.ts:1–10,186–193,233–240,276–279`; `src/config/settings-schema.ts:4691–4700` — messaging and wake semantics.
- **S14:** `src/task/persisted-revive.ts:44–253` — persisted revival eligibility and reconstruction.
- **S15:** `src/async/job-manager.ts:253–268,284–335,749–774` — memory ownership, admission and disposal.
- **S16:** `src/config/settings-schema.ts:4974–4998,5051–5177`; `src/task/types.ts:208–215`; `src/task/executor.ts:3353–3392` — settings defaults and depth gating.
- **S17:** `src/task/eval-tools.ts:77–117,145 onward`; `src/task/index.ts:1482–1494`; `src/eval/agent-bridge.ts:187–191` — kernel-defined function forwarding, not a built-in allowlist.
- **S18:** `src/task/read-only-policy.ts:1–29` — exact read-only classifier.
