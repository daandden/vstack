# Skill evals run as headless omp processes, not vstack agents

skill-creator's eval runs each run as its own `omp -p` process instead of a vstack agent. That covers the with-skill and baseline runs, the trigger-query runs, and the blind comparator. Each process starts with the parent's model and thinking level, read from the last `model_change` and `thinking_level_change` entries in `$PI_SESSION_FILE`. The with-skill, baseline, and comparator runs start in a temp directory that holds only their inputs, with `--no-skills --no-rules --no-extensions` and a `--config` overlay that turns memory off. Trigger selection runs start in an empty temp directory with the real environment, so they see the real skill listing. We chose this because an eval measures the skill only when the run sees nothing but what the test gives it. A `task` subagent always inherits the installed skill list and the context files, so a baseline for an installed skill could load the very skill under test.

## Considered Options

- **`vstack-worker` via `task`**: rejected. It fits the roster and the lint as they are, but a baseline can't be isolated from installed skills, `AGENTS.md`, or memory.
- **Isolated roles (ADR 0007)**: rejected. An APFS clone copies the whole repo, the opposite of "a directory with only its input files", and it still inherits skills and context.
- **Judge-gated Fan-out with an inline fallback (ADR 0004)**: rejected. Inline would make the parent, which knows the skill and the expected answer, the subject of its own test.

## Consequences

- A headless run is not a subagent, so it is not Fan-out. Its batch is fixed: no judge, no inline, and no vstack cap. When the user says "sequential" or "no fan-out", the runs go one at a time and stay headless. If `omp` can't run, the step stops.
- ADR 0004's same-model rule still holds, through `--model` and `--thinking`.
- The House style gains a `headless-run` rule, allowlisted to skill-creator. The lint fails on that form anywhere else. The analyzer, which sees both skills and the mapping, stays a normal `vstack-explorer` spawn.
- Runs pass `--approval-mode yolo`, the mode omp subagents always run in. They write only in temp directories, and evaluation.md's approval rule for runs with outside side effects still applies.
- A candidate description can't be tested from a temp `.omp/skills/` copy, because omp lists both same-name copies. It is tested by temporarily editing the skill's own file, and only in homes skill-creator may edit.
