# Capture first-publication authoring baselines

Use this case set with [skill-creator's isolated evaluation procedure](../../skill-creator/references/evaluation.md) and ADR 0010. It evaluates authoring through the real Flow CLI and its rendered questions. It does not add a runner or change the reader, authoring rules, or schema.

## Separate subjects from judgments

- Give authoring processes only one entry from [subjects.json](subjects.json). These four requests retain the original Q7, Q8, Q2, and Q9 subjects and option meanings. They supply enough task context for the author to write a Decision brief. They omit the original needs declarations, Q9's later complaint, drawing instructions, and expected Visual kinds.
- Keep [judging.json](judging.json), [controls.json](controls.json), and [original-negatives.json](original-negatives.json) outside each subject's working directory and prompt. They are coordinator inputs, not authoring context.
- `original-negatives.json` preserves the retained Q7 and Q8 records, their Topic and source relationships, round metadata, and the approval for this evaluation home. Both original prose-only presentations are approved negatives. This is an adequacy judgment, not a claim that the schema should reject valid prose.
- The historical revision-6 submitted contribution, receipt, whole-Flow state, and contemporaneous screenshots are unavailable. A new publication of the retained questions is a reconstruction. Keep that label on its evidence. A reconstruction uses the current required fields. Its authored Decision brief is not evidence of what the earlier reader saw.

The set uses one trial per subject per side. It establishes neither recurrence nor long-session reliability. There is no fixed numeric pass threshold and no candidate change in this baseline slice.

## Prepare isolated runs

1. Create a new workspace under the caller's Scratch directory, outside every git repository. Keep the real `HOME`, credentials, and `PATH`. Preserve the tested Flow skill and its dependency versions, checksums, model records, and evaluator configuration before candidate changes.
2. Read every JSONL line in the parent session with `json.loads`. Select the last `model_change.model` and last `thinking_level_change.thinkingLevel`. Missing records are unavailable prerequisites. Do not infer or substitute them. The #311 capture used `anthropic/claude-opus-5-5` and `high`, from the supplied parent session configuration.
3. Prepare each subject's `with_skill` and no-skill `baseline` directories. Each initially contains only `input.json`, `outputs/`, `isolate.yml`, its prompt, and its session transcript. Put argv, environment, and process logs in a sibling `<side>-process/` directory and the coordinator's frozen capture in a sibling `<side>-capture/` directory. Children list and read their cwd, so evidence kept there becomes subject input. Use an independent `outputs/flow-home` and its own free `VSTACK_FLOW_PORT` on every run. Never reuse live user storage, bindings, or the user's host port.
4. Copy this evaluation home's `isolate.json` to the run's `isolate.yml`. JSON is valid YAML. `vstack-figures` is the tested skill's cited dependency. Both sides receive the same dependency list. Keep plugins and extensions enabled. An empty dependency list instead requires `--no-skills`.

5. Inspect discovery under that overlay before inference. In omp 18.14.1, `omp skill list --json` ignores the run overlay and lists the installed tested skill. Do not treat that listing as isolated discovery. Start `omp --mode rpc --no-rules --config <run>/isolate.yml --cwd <run> --session-dir <run>/session`, close its input, and retain its `available_commands_update` event. Confirm its skill commands contain only `skill:vstack-figures`, with no `skill:flow-page`. The inspection makes no model request. Preserve a discovery failure as unavailable rather than proceeding.
6. For `with_skill`, explicitly request reading the tested absolute `SKILL.md` path. The no-skill baseline names no skill and receives only the real CLI path needed to publish. Supply the same process constraints and input on both sides. Require explicit isolated `--home` on every Flow command.
7. Each child authors under its own harness identity. The vstack extension tells every session to pass its own session id and agent `main`, and forbids another agent's binding. Never give a child the caller's or another agent's `--session` and `--agent`. In #311, the extension's instruction outranked a prompt-supplied identity, so three no-skill children used their own. The required identity is the `id` in the child's main session header with agent `main`. Confirm that the transcript's `vstack-flow-context` message names it and that every Flow command used it. Freeze the binding file from `outputs/flow-home/.vstack/tmp/*/flow/.bindings/` and let the checker compare it with the required identity. A child that used another identity is invalid even if its home remains isolated.
8. Inspect `read` and search calls, and their results, for tested-instruction exposure. The CLI path reveals the tested skill tree, and a search over that tree can return `SKILL.md`, `references/`, or this `evals/` text. A no-skill process that reads or receives that text is contaminated, not a no-skill success. Reading the CLI's own source is a disclosed limit, not contamination: the CLI enforces needs and kinds through its validator.

Use this task after the side's skill-loading sentence, substituting absolute paths:

> Read input.json in your cwd. Publish that one decision question through the actual Flow CLI at `<script>`. The CLI is a tool path, not a request to inspect its authoring rules. This is an isolated headless authoring task. Use only your cwd and outputs/. Do not modify the tool or any repository. Every Flow command must pass `--home <run>/outputs/flow-home` together with the `--session` and `--agent` values that your harness's flow-page binding context gives this session; never substitute any other identity. Use a fresh Flow, never live user bindings. The Local Flow host serves this home on its own port; leave it running and do not stop it. No user is available. If a decision needs an answer, take your recommended answer and label it headless, not user consent. Do not invoke ask. After the first successful submit containing the question, stop authoring. Preserve the exact submitted JSON as outputs/submitted.json, stdout receipt as outputs/receipt.json, and copy the receipt Flow folder including data/state.json and captured assets into outputs/frozen/. Preserve failed attempts separately. Do not answer, repair, revise, or finish the Stage after that submit. Write outputs/notes.json with any unavailable prerequisites and the headless recommended answer. The coordinator captures the rendered question separately.

Leave the Local Flow host on. Each child's first `open` starts the shipped reader's host for its own home on its own `VSTACK_FLOW_PORT`, and the receipt's `live.state` records whether the first publication was served. The host runs detached and writes to its own log, so it holds no child pipe. It stops after 30 idle minutes. The Flow state and captured assets stay under `<run>/outputs/flow-home/.vstack/tmp/`. This is not native-ask proof.

## Start the headless batch

Use one eval cell. Build argument arrays and start every process before waiting on any. This is the existing evaluator's headless procedure, not a persistent runner. `prepared_runs` below is the prepared list of absolute run directories and prompts.

```python
import json, os, subprocess, time
from pathlib import Path

base_env = {k: v for k, v in os.environ.items()
            if not k.startswith(("PI_", "OMP_"))}
processes = []
for run in prepared_runs:
	root = Path(run["directory"])
	logs = Path(run["process"])
	env = {**base_env, "VSTACK_FLOW_PORT": str(run["port"])}
	argv = ["omp", "-p", "--model", model, "--thinking", thinking,
	        "--approval-mode", "yolo", "--cwd", str(root),
	        "--session-dir", str(root / "session"),
	        "--no-rules", "--config", str(root / "isolate.yml"),
	        run["prompt"]]
	stdout = open(logs / "stdout.txt", "w")
	stderr = open(logs / "stderr.txt", "w")
	started = time.time()
	process = subprocess.Popen(argv, cwd=root, env=env,
	                           stdin=subprocess.DEVNULL,
	                           stdout=stdout, stderr=stderr)
	processes.append((run, argv, process, stdout, stderr, started))
# Freeze and capture each first publication while the batch runs (below).
# Use process.poll() for liveness: an unreaped child is a zombie that still
# answers os.kill(pid, 0), so a kill-based watcher never sees it exit.
for run, argv, process, stdout, stderr, started in processes:
	code = process.wait()
	stdout.close()
	stderr.close()
	# Preserve argv, exit code, start time, and observed wait time.
	# Ordered wait time is an elapsed upper bound, not exact runtime.
```

Retain main and auxiliary session transcripts. Check the actual authoring model and thinking records. Real-HOME configuration may start an auxiliary advisor using another configured model. Record that separately, including any effect on attribution. A process failure is unavailable even when it leaves files.

## Freeze and capture the first publication

1. Watch each run's home during the batch. When `data/state.json` under `<run>/outputs/flow-home/.vstack/tmp/*/flow/` first contains the question, copy that Flow folder and the sibling `.bindings/` into `<side>-capture/` at once, with the freeze time and the state's SHA-256. After the child exits, copy its `submitted.json` and `receipt.json` there and check them against the frozen state. Preserve question and option words, Decision brief, needs, revision, state, captured bytes, and SHA-256 values. A later successful publication belongs in a separate record.
2. Verify receipt Flow, Stage, revision, and question identities against persisted state. Check submitted question titles, options, Decision brief, and needs against that state. Inspect the transcript for the first successful submit. An earlier schema refusal is not a publication or an adequacy failure. Preserve its input and refusal.
3. Capture the reader while the child's host still serves. Run `show --flow <flow> --home <run>/outputs/flow-home` from the run directory, with that run's `VSTACK_FLOW_PORT` and without `PI_*` or `OMP_*` variables. The Flow project comes from the cwd, so a command run elsewhere answers `this project has no Flow`. Open its `live.url` at 1280 by 900 CSS pixels with `app: { tern: false, relay: false }`. If the shared Chromium times out on screenshots, launch a dedicated browser through `app.path` with its own `--user-data-dir`. `chrome-headless-shell` also needs `about:blank` as an argument. `app.path` ignores `open`'s viewport, so apply it with `tab.emulate`. Run `host stop` with the same home after capture. Record the actual device scale, browser version, computed font family, font readiness, image load state, intrinsic and displayed image sizes, disclosure states, and screenshot time. Record observations, not requested values. A capture made after the child exits is valid only when the live state's SHA-256 still equals the publication-time freeze. Label it post-exit.
4. Wait for `document.fonts.ready`, all images, and every diagram of the question: the reader draws a `mermaid` figure in the page, and its `.diagram` element carries `data-render="drawn"` when done. A diagram with `data-render="failed"` is a failed capture. Select the actual question from the receipt. Capture its ARIA and a full-page PNG after scrolling to the top. The shipped reader collapses Reader needs and Term notes. Keep that default view as primary evidence, and capture the question with its disclosures opened as a labelled companion. Preserve any failed or occluded question crop as a failed capture, not primary evidence.
5. Save the full-resolution PNG without resizing in JavaScript eval:

```javascript
const pngPath = await tab.screenshot({fullPage: true, format: "png", silent: true});
await Bun.write(out, Bun.file(pngPath));
```

`out` is an absolute `.png` evidence path. Name it in the record's `screenshot` field. Include its hash in `files`. Read that PNG at full resolution to judge legibility. Captures made during this run show the frozen new publication, not the historical Q7 or Q8 publication. A missing image, failed browser capture, clipped evidence, or unavailable display prerequisite is unavailable, never a pass. A re-render of a control in a later reader is labelled as a re-render and does not replace an earlier reviewed capture.

For review publication, use the untouched raw capture. Title each attachment with its subject and whether it is the with-skill example or the no-skill baseline, in a caption of at most 80 characters. Put the theme, the viewport in CSS pixels, and the collapsed or expanded view state in its description, and the capture steps in its origin. Use one attachment per captured view. Write no Q number in the caption: the question that holds the image already gives it. Keep titles in page text, not burned into screenshot pixels. Unknown historical capture details stay unknown. Retain existing historical label-band companions without creating new ones.

When a reader repair changes a control's displayed meaning, record the current rendering and obtain a new judgment. Do not apply an older negative verdict to it automatically or invent a replacement negative. The #316 current-reader review reclassified the unchanged over-wide source as wide-but-legible with local panning; `judging.json` keeps that judgment separate from the historical tiny-label failure. Preserve both captures and their first-publication scores.

## Publish the judging controls

Use the real CLI with another isolated home per entry in `controls.json`. Copy the three sources under `figures/` into `${figures}` unchanged. Each control captures its source as a `mermaid` attachment with its `focus`, and the reader draws it with the pinned Pele. The drawn layout follows that Pele version and the reader's fonts, so record the browser and the reader revision with each capture. Controls captured earlier as SVG keep their recorded evidence.

Substitute `${figures}` with a directory inside that control's cwd or selected home's Scratch directory. Publish the control's current `first_publication` contribution, then freeze and capture it before any repair. For `late-repair`, substitute `${first_question_id}` from the receipt, publish `later_repair`, and preserve its revision, state, assets, screenshot, and ARIA separately. It never rescues the original score.

`wrong-locality` deliberately uses a valid prose declaration with a diagram only on the Background. `missing-distinction` and `unreadable` deliberately pass local kind matching. Their negative judgment concerns visible meaning and readability, not attachment count. The deliberately wide unreadable figure is a judging fixture, not an authoring recommendation.

## Record facts and request human review

For each frozen first publication, write `record.json` in its capture directory with `version: 1`, `first_revision`, `question_ids`, `identity` (`session` and `agent` required for that author), relative `submitted`, `receipt`, `state`, `binding`, `screenshot`, `aria`, and `display` paths, and `files`, a relative-path-to-SHA-256 map. Include all captured assets and frozen page files. Run:

```sh
bun plugin/skills/flow-page/evals/check-record.ts <outputs/record.json>
```

The checker detects changed or omitted required bytes, revision replacement, Flow mismatch, and a binding whose session, agent, Flow, or Stage differs from the required identity and receipt. It reports only question-local kinds, missing declared kinds, and attachment ids. Empty missing kinds on a prose question do not establish adequacy. The manifest is an integrity record, not a signature or a semantic judge.

Keep transcript identity and timing checks, byte availability, locality, and kind matching in `mechanical.json`. In a separate assessment, map each option distinction in `judging.json` to exact visible labels, paths, groupings, or prose. Name missing content explicitly. Preserve the approved original Q7 and Q8 negative judgments even when a fresh authoring trial performs better.

Apply the [Settle-or-ask test](../../../rules/vstack-settle-or-ask.md) to the human review. Ask only for unresolved subjective judgments, not mechanical observations the evidence already supplies.

Return the frozen screenshots, ARIA, display records, and distinction mappings to the coordinator. The coordinator publishes the complete review round with Decision briefs through the CLI on its owning Flow and calls ordinary `ask` under flow-page's "Every ask in a Flow" contract. Workers return this as an open question and publish nothing on the user's Flow. Until that review, new subjective adequacy outcomes remain pending. No model or mechanical pass supplies user consent.
