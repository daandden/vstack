
# Evaluating a Skill

Read this when forward-testing a new or changed skill, or when the user asks whether a skill works or whether a revision is better. The goal is evidence that the skill changes outcomes, gathered in a way that cannot contaminate real work.

## Quick Checks

Before a full evaluation, cheaper signals often expose the problem:

- Same input, several runs. Near-identical results mean the skill over-determines the work; wildly different results mean something important is unspecified.
- Very different inputs. Outputs that all look alike mean the template overpowers the input.
- Watch one run. A run marching through numbered steps where a step does not fit means the structure is constraining the agent.

Run the full loop below when these checks pass but confidence still matters, or when the user asks whether the skill works.

## Workspace

Resolve Scratch through skill://vstack-tmp, then create `<Scratch dir>/skill-creator/<skill-name>-workspace/`, unless the user names a place. A subagent uses the Scratch dir its parent passed; it never runs the path script. Keep the workspace outside any git repo and outside `plugin/`. Print its absolute path in the reply. All runs keep the real `HOME`.

```text
<skill-name>-workspace/
|-- evals.json                  prompts, input files, assertions
|-- skill-snapshot/             copy of the skill before editing (updates only)
`-- iteration-1/
    `-- <eval-name>/            descriptive name, e.g. merge-duplicate-rows
        |-- with_skill/outputs/
        `-- baseline/outputs/
```

Create directories as runs need them.

## Test Prompts

Write 2–3 realistic requests, phrased the way a user would type them, with the input files they need. When the user's judgment of realism matters, show them the prompts through `flow_ask` on the evaluation Stage before running. Follow `skill://flow-page`'s "Every ask in a Flow", including separate answer recording. Record each in `evals.json` with the prompt, input files, and a sentence describing the expected result.

- Mid-workflow turns: to test a later step of a multi-turn skill in one run, prefix the request with a bracketed note stating where the workflow stands and what the user already said, for example `[Discovery is done; asked about stakeholders, the user replied: "just me and a PM"]`.
- Non-interactive runs: supply the answers the skill would ask for up front, so the run reaches its deliverable without stopping. When a skill cannot proceed without a live answer, that case needs the user in the loop.

## Runs

Read the Session model and thinking level from the last `model_change.model` and `thinking_level_change.thinkingLevel` records in `$PI_SESSION_FILE`. Stop with the missing prerequisite if either record or the file is unavailable; do not choose a different model. Clear inherited `PI_*` and `OMP_*` session variables from each child environment, while keeping `HOME`, credentials, and PATH.

Headless batch (ADR 0010): one eval cell starts every run at once, with no cap. Per run: `omp -p --model <m> --thinking <t> --approval-mode yolo --cwd <run dir> --session-dir <run dir>/session <isolation> "<prompt>"`, where <m> and <t> are the last `model_change.model` and `thinking_level_change.thinkingLevel` in `$PI_SESSION_FILE`. If `omp` cannot run, stop: report the process error.

For each eval start its with-skill and baseline runs in this batch. For a new skill the baseline prompt names no skill. For an update copy the original to `skill-snapshot/` before editing, then explicitly name that snapshot in the baseline prompt. The with-skill prompt explicitly requests reading the tested skill's absolute `SKILL.md` path. Give both only the task, input paths and their own `outputs/` directory, never expected answers, suspected fixes or prior conclusions. A Headless run has no interactive questioning. Tell it to report any recommended answer as an assumption, not consent, and continue only within the authorized scope. Stop a case that requires live confirmation.

Each fresh run dir holds only input files, `outputs/`, its config overlay, and its session transcript. Use `--no-rules --config <run dir>/isolate.yml`. Write the overlay with `memory.backend: off`, `skills.ignoredSkills: [<name>, "*/<name>"]`, and `skills.includeSkills` containing only the `skill://` targets cited by the tested skill plus competitors staged on purpose. Give both sides the same dependencies and competitors (the union of the old and new versions' citations). If this list is empty add `--no-skills`. Keep plugins and extensions enabled on both sides: removing them also removes vstack agents and breaks skills that depend on them. Before running, inspect the discovered list under that config and ensure the installed skill under test is absent. The explicit path supplies only the selected version. Preserve the session dir as evidence, stdout and stderr, exit status, model, thinking level, prompt and overlay for each run. A failed process makes the case unavailable, not a pass.

For an eval cell in Python, build each command as an argument list and use `subprocess.Popen` for every run before waiting on any, with `stdin=subprocess.DEVNULL`. Await all exits before grading. Use `json.loads` on each session line to find the last model and thinking records, not a first-match search. In a JavaScript cell use `Bun.YAML.stringify` to write overlays; JSON is also valid YAML. Never interpolate prompts into a shell command. Headless print mode reads piped stdin before starting; closing it prevents the process from waiting on the parent kernel.

Keep runs within authorized side effects. Use `flow_ask` before a run touching a live system, needing new authorization, or incurring substantial cost. Without that authorization stop the affected case.

A skill that no longer beats the no-skill baseline has been overtaken by the model; recommend retiring it rather than patching it.

## Assertions

Draft assertions while the runs execute. A good assertion is objectively checkable, named so a reader knows what it tests, and discriminating: it passes when the skill genuinely succeeds and fails when it does not.

- Check assertions with a script whenever the output allows it; scripts are reliable and reusable across iterations.
- Pass an assertion only on evidence of genuine completion. A correctly named file with wrong content fails. When evidence is ambiguous, the assertion fails.
- An assertion that passes for both the with-skill run and the baseline says nothing about the skill; replace it or drop it.
- Judge subjective qualities (writing style, visual design) through the user's review instead of assertions.

Assertions can check the process as well as the output: a required tool call or script appears in the transcript, one step happens before another, an input marked read-only is byte-identical afterwards, or a side log and the artifact agree in both directions. Weak assertions check only that a file exists, use subjective wording, or restate what follows from understanding the prompt.

## Review

Present each eval on the Flow page. Use a Document Result for the prompt, assertion results, changed instructions, user feedback, and unverified work. Use a Comparison Result for with-skill versus baseline outputs, criteria, evidence, and verdict. Attach the redacted outputs, assertions, and transcripts, preserving `evals.json`, skill snapshots, and iteration directories. Use Metrics for measured pass counts, time, or cost with units, samples, uncertainty, and missing values where data is absent. Raw assertion rates alone do not establish a skill's quality. Collect feedback per eval through `flow_ask` on the evaluation Stage. Focus revisions on the evals with specific complaints. Silence or unavailable questioning grants no approval.

## Improve

- Generalize. The skill will run on many prompts beyond these few. Fix the underlying cause of a complaint rather than special-casing the test prompt.
- Read transcripts, not only outputs. Effort spent on unproductive steps points at the instruction that caused it; remove or reword that instruction and rerun. Three shapes are common:
  - Several attempts before one works: the instruction is too vague.
  - An instruction followed where it does not apply: the instruction is too broad.
  - Stalling between alternatives: the skill names no default.
- Bundle repeated work. When several runs independently write the same helper or take the same multi-step approach, add it to `scripts/` and point the skill at it.
- Explain the reason. When a behavior keeps failing, state why it matters instead of escalating to absolute language.

## Iterate

Apply the changes, then rerun every prompt, baselines included, into `iteration-<N+1>/`. For an updated skill, choose whether the baseline stays the original snapshot or becomes the previous iteration, and say which.

- Make one change per iteration when attribution matters, so each result traces to its cause.
- Revert a change that makes any eval worse.
- Scale the number of iterations and the pass bar to the stakes.

Stop when the user is satisfied, every eval is free of complaints, or an iteration brings no meaningful improvement. Report what changed, the with-skill versus baseline results, and anything left unverified.

For a rigorous answer to "is the new version better?" or "does this section earn its place?", use [blind-comparison.md](blind-comparison.md). To test whether the description selects the right requests, use [trigger-evals.md](trigger-evals.md).
