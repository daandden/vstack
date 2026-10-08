
# Testing Skill Selection

Read this when writing or changing a model-invoked skill's description, when the skill fires on the wrong requests or misses the right ones, or when its description competes with a neighboring skill. The description is the only part of the skill visible during selection, so it alone decides these cases.

## Build the Query Set

Write 16–20 queries, roughly half that should select the skill and half that should not. Make each one realistic: concrete details such as file paths, column names, company or project context, a little backstory, varied length, casual phrasing, and the occasional typo.

**Should select** (8–10): cover every distinct branch the skill handles, with different phrasings of each. Include requests that never name the skill or its file type but clearly need it, uncommon uses, and requests where a neighboring skill also applies but this one should win.

**Should not select** (8–10): use **near misses**, requests that share keywords or concepts with the skill but need something else: adjacent domains, ambiguous wording where a keyword match would mislead, and cases where another skill or plain tools fit better. A query from an unrelated domain tests nothing.

Make queries substantive enough that consulting a skill would help. An agent may handle a trivial one-step request directly regardless of any description, so such queries measure nothing.

Review the set through `ask` before running it; a weak set produces a misleading description.

## Hold Out a Test Set

Split the queries about 60/40 into train and test sets, keeping the should/should-not balance in each. Revise the description only against failures in the train set, and judge each revision by its test-set score. Choosing by train score overfits the description to the examples.

## Run the Queries

Read [evaluation.md](evaluation.md) for Scratch, the parent's model/thinking extraction, child environment, process evidence and fail-stop behavior. Trigger runs keep the real environment in their own initially empty workspace subdir. Their per-run `--config` overlay disables memory and adds the origin project's skill directories to `skills.customDirectories`, so project skills and installed neighbors remain listed. Do not use the with-skill filtering flags here.

Headless batch (ADR 0010): one eval cell starts every query × three runs at once, with no cap, as `omp -p --model <m> --thinking <t> --approval-mode yolo --cwd <run dir> --session-dir <run dir>/session --config <run dir>/trigger.yml "<prompt>"`. Use the parent's model and thinking level from `$PI_SESSION_FILE`. If the user said "sequential" or "no fan-out", start one at a time. If `omp` cannot run, stop: report the process error.

- Selection-only (default): include the request and instruct the run to read `SKILL.md` for every skill it would use, then stop before acting. Do not supply the expected selection.
- Full run: send the raw request in its own workspace; observe the first skill load in the session. Use `ask` before requests with external side effects. Stop the run when the selection is visible.

Score actual successful load events: a `read` tool call resolving `skill://<name>` (including `tool.read` inside eval) or the tested skill's absolute `SKILL.md`, paired with a non-error result. Inspect tool calls and results in the JSONL session, including eval calls that contain the read. A name in prose, the initial skill list, or an unsuccessful read is not a load. Record per-query successes/trials and the first load for full runs. Preserve the load evidence and transcript paths so another reader can reproduce the score.

For a candidate description, copy the complete skill to `<workspace>/candidate/<name>/`, change only that copy's description, and put that directory first in `skills.customDirectories`, before the origin project directories. Set `skills.ignoredSkills: ["*/<name>"]` to hide displaced installs while keeping the bare candidate. Inspect the list under the overlay and confirm exactly one bare candidate with its candidate file path. The installed file is never touched while testing. An accepted description still follows the allowed homes in SKILL.md; refuse adopt items and third-party installs.

## Apply the Result

Show the user the old and new descriptions with train and test scores. Keep the revision only when the test score improves without new misfires on near misses. Keep one trigger per branch; each added word is loaded on every turn.
