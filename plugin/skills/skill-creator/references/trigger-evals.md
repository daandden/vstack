
# Testing Skill Selection

Read this when writing or changing a model-invoked skill's description, when the skill fires on the wrong requests or misses the right ones, or when its description competes with a neighboring skill. The description is the only part of the skill visible during selection, so it alone decides these cases.

## Build the Query Set

Write 16–20 queries, roughly half that should select the skill and half that should not. Make each one realistic: concrete details such as file paths, column names, company or project context, a little backstory, varied length, casual phrasing, and the occasional typo.

Should select (8–10): cover every distinct branch the skill handles, with different phrasings of each. Include requests that never name the skill or its file type but clearly need it, uncommon uses, and requests where a neighboring skill also applies but this one should win.

Should not select (8–10): use near misses, requests that share keywords or concepts with the skill but need something else: adjacent domains, ambiguous wording where a keyword match would mislead, and cases where another skill or plain tools fit better. A query from an unrelated domain tests nothing.

Make queries substantive enough that consulting a skill would help. An agent may handle a trivial one-step request directly regardless of any description, so such queries measure nothing.

Review the set through `flow_ask` on the evaluation Stage before running it, following `skill://flow-page`'s "Every ask in a Flow", including separate answer recording. A weak set produces a misleading description.

## Hold Out a Test Set

Split the queries about 60/40 into train and test sets, keeping the should/should-not balance in each. Revise the description only against failures in the train set, and judge each revision by its test-set score. Choosing by train score overfits the description to the examples.

## Run the Queries

Create the workspace under Scratch as [evaluation.md](evaluation.md) describes. Write the queries to `queries.json` in the workspace: an array of objects with `id`, `split` (`train` or `test`), `request`, and `expected`. `expected` maps each tested skill name to `true` if the query must select the skill and `false` if it must not. The `id` names the run directories of the query. It uses only lowercase letters, digits, and hyphens, and each `id` is unique. Otherwise the script exits before it writes anything.

Resolve the script path relative to this skill's directory. Pass each skill directory of the origin project with its own `--skills-dir`, so project skills and installed neighbors stay listed:

```bash
bun scripts/trigger-evals.ts <workspace>/queries.json <workspace>/iteration-<N> --skills-dir <dir> [--candidate <workspace>/candidate/<name>] [--runs 3] [--full]
```

Give each batch a new `iteration-<N>` dir. If the run dir exists, the script exits before it writes anything, so old sessions never mix into new scores.

Headless batch (ADR 0010): the script starts every query × three runs at once, with no cap, and waits for all of them. Each run is an `omp -p` process with the Session model and thinking level from `$PI_SESSION_FILE`. It runs in its own empty `workspace/` subdir, and its `trigger.yml` overlay turns memory off. Runs keep the real environment, `HOME` included, without the inherited `PI_*` and `OMP_*` variables. If the session file has no model or thinking record, or `omp` cannot start, the script exits with the reason. Report it and stop.

- Selection-only (default): the script adds an instruction to read `SKILL.md` for every skill that applies to this request, then stop before acting. It never supplies the expected selection.
- Full run (`--full`): the script sends the raw request. Use `flow_ask` on the evaluation Stage before requests with external side effects. Without authorization, stop the affected case. When the session shows the selection, stop the run through its pid in `commands.json`.

The script scores successful load events. A load is a `read` tool call that resolves `skill://<name>` or the tested skill's `SKILL.md` path against the run cwd (absolute or relative) and gets a non-error result. A `tool.read` inside eval is a load only when the eval result's `details.statusEvents` records that read with its path and no error. A name in prose, the initial skill list, eval source text, or an unsuccessful read is not a load. A trial is correct when the run loads the skill exactly when `expected` says it must. The script writes three files to the run dir:

- `commands.json`: the argv, cwd, and pid of each run.
- `results.json`: the exit code of each run and the loads in order, with the session file and line numbers of each call and result. The first load of a full run is the first entry.
- `scores.json`: correct trials per tested skill for all queries, train, and test.

A selection-only run with a nonzero `exit_code` did not finish. `scores.json` leaves it out, and `results.json` keeps it. Rerun its query in a new `iteration-<N>` before you use the score. A full run stays in the score, because a stop through its pid gives it a nonzero `exit_code`. Keep the run dir so another reader can reproduce the score.

For a candidate description, copy the complete skill to `<workspace>/candidate/<name>/` and change only that copy's description. Pass that directory with `--candidate`. The overlay lists `<workspace>/candidate` first in `skills.customDirectories`, before the origin project directories, and sets `skills.ignoredSkills: ["*/<name>"]` to hide displaced installs while keeping the bare candidate. After the batch, open the result line of one candidate load from `results.json` and confirm that its `Skill file:` path is the candidate's `SKILL.md`. The installed file is never touched while testing. Apply an accepted description by the home rules in step 2 of SKILL.md, the rules for a vstack target included.

## Apply the Result

Show the user the old and new descriptions with train and test scores. Keep the revision only when the test score improves without new misfires on near misses. Keep one trigger per branch; each added word is loaded on every turn.

In a Flow, publish the old and new descriptions as Code Results with their source paths and revisions. A Comparison Result records the description alternatives, held-out criteria, misfires, evidence, and keep or reject verdict. A Metrics Result separates all, train, and test scores with numeric correct and completed trial counts, units, and run counts. Keep unfinished selection-only trials excluded and explicit, never successful zero-cost runs. Attach redacted `queries.json`, `commands.json`, `results.json`, and `scores.json`, preserving their canonical workspace files and successful-load session line citations. Record unavailable trials and missing evidence in the Document Result. Outside a Flow, deliver the full comparison, scores, and gaps in chat and preserve the same files. Use `SKILL.md` for enrollment, delivery, and completion.
