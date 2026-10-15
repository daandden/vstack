
# Blind Comparison

Read this when the user wants a rigorous answer to whether one version of a skill beats another, or whether a section of a skill earns its place. Most iterations need only the review loop in [evaluation.md](evaluation.md); blind comparison requires independent Headless runs and costs an extra pass per eval.

## Setup

Use outputs from the same eval prompt produced by the two versions. Assign them the labels A and B at random and record the mapping where the comparator cannot read it.

To test whether structure earns its place, make one version the smallest version: about five lines stating the role, the outcome, who consumes it, and any rule whose absence has caused real damage. Compare it with the full skill and read the result:

| Result | Meaning |
|---|---|
| Smallest version wins | The structure constrains the agent; cut it. |
| Tie | The structure is decoration; keep only lines you can defend. |
| Smallest version rougher but recoverable in a turn or two | The structure buys convenience, not quality; keep it knowingly. |
| Smallest version clearly and consistently worse | The structure earns its place. |

To test one section, remove only that section and compare on the dimension it was meant to protect.

## Comparator

Read [evaluation.md](evaluation.md) for Scratch, model and thinking extraction, child environment and failure handling. Stage `<workspace>/compare/<eval>/` with only the prompt, `A/`, `B/`, and assertions. Keep `<workspace>/mapping.json`, both skills and both transcripts outside that cwd, and out of the comparator prompt. Request only those staged paths; do not reveal which label uses a skill. This is blinding, not a filesystem security boundary.

Headless batch (ADR 0010): one eval cell starts every comparator at once, with no cap, as `omp -p --model <m> --thinking <t> --approval-mode yolo --cwd <compare dir> --session-dir <compare dir>/session --no-skills --no-rules --no-extensions --config <compare dir>/isolate.yml "<prompt>"`. Read <m> and <t> from the parent's `$PI_SESSION_FILE`. The per-run overlay sets `memory.backend: off`. If `omp` cannot run, stop: report the process error.

Give a headless run the eval prompt, output A, output B, and any assertions, without the skills, transcripts, or label mapping. Instruct it to:

1. Inspect both outputs fully, including every relevant file in an output directory.
2. Derive a rubric from the task: content criteria (correctness, completeness, accuracy) and structure criteria (organization, formatting, usability), renamed to fit the task, such as field placement for a form or schema correctness for data.
3. Score each criterion 1–5 for both outputs, citing specific evidence.
4. Use assertion pass rates as secondary evidence only.
5. Name a winner, or a tie only when the outputs are genuinely equivalent. When both fail, the winner is the one that fails less.

Request the verdict, per-criterion scores, and reasoning with examples.

## Analyzer

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): the mapping, both skills, both transcripts, the comparator's verdict, and the analyzer brief below, the vstack root. Wait for its result. If it cannot be spawned, stop: report the comparator's verdict with the analysis marked not run.

The analyzer is not blind. Its brief is to explain the result:

- Which skill differences produced the winning behavior: clearer instructions, a bundled script, a better example, missing edge-case guidance.
- How closely each run followed its skill, and where the losing run diverged or improvised.
- Improvements for the losing skill, each tagged `instructions`, `tools`, `examples`, `error_handling`, `structure`, or `references`, and prioritized by whether it would have changed the outcome.

Tell the analyzer to quote the skills and transcripts, and to separate causes from incidental differences.

## Across Many Runs

For several evals with repeated runs, look for patterns the averages hide:

- An assertion that passes or fails in both versions regardless of skill does not measure the skill.
- An assertion that passes only with the skill shows where the skill adds value; one that fails only with it shows harm.
- High variance on one eval suggests a flaky assertion or nondeterministic task.
- Time or token cost that rises sharply with the skill is a tradeoff to report.

Report observations grounded in the run data, and keep improvement proposals for the next iteration.
