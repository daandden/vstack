# Capture first-publication authoring baselines

Use this case set with [skill-creator's isolated evaluation procedure](../../skill-creator/references/evaluation.md) and ADR 0010. It evaluates authoring through the real Flow CLI and its rendered questions. It does not add a runner or change the reader, authoring rules, or schema.

## Separate subjects from judgments

- Give authoring processes only one entry from [subjects.json](subjects.json). These four requests retain the original Q7, Q8, Q2, and Q9 subjects and option meanings. They omit the original needs declarations, Q9's later complaint, drawing instructions, and expected Visual kinds.
- Keep [judging.json](judging.json), [controls.json](controls.json), and [original-negatives.json](original-negatives.json) outside each subject's working directory and prompt. They are coordinator inputs, not authoring context.
- `original-negatives.json` preserves the retained Q7 and Q8 records, their Topic and source relationships, round metadata, and the approval for this evaluation home. Both original prose-only presentations are approved negatives. This is an adequacy judgment, not a claim that the schema should reject valid prose.
- The historical revision-6 submitted contribution, receipt, whole-Flow state, and contemporaneous screenshots are unavailable. A new publication of the retained questions is a reconstruction. Keep that label on its evidence.

The set uses one trial per subject per side. It establishes neither recurrence nor long-session reliability. There is no fixed numeric pass threshold and no candidate change in this baseline slice.

## Prepare isolated runs

1. Create a new workspace under the caller's Scratch directory, outside every git repository. Keep the real `HOME`, credentials, and `PATH`. Preserve the tested Flow skill and its dependency versions, checksums, model records, and evaluator configuration before candidate changes.
2. Read every JSONL line in the parent session with `json.loads`. Select the last `model_change.model` and last `thinking_level_change.thinkingLevel`. Missing records are unavailable prerequisites. Do not infer or substitute them. The #311 capture used `anthropic/claude-opus-5-5` and `high`, from the supplied parent session configuration.
3. Prepare each subject's `with_skill` and no-skill `baseline` directories. Each initially contains only `input.json`, `outputs/`, `isolate.yml`, its prompt, and its session transcript. Put process logs and argv beside them as evidence. Use an independent `outputs/flow-home` on every run. Never reuse live user storage or bindings.
4. Copy this evaluation home's `isolate.json` to the run's `isolate.yml`. JSON is valid YAML. `vstack-figures` is the tested skill's cited dependency. Both sides receive the same dependency list. Keep plugins and extensions enabled. An empty dependency list instead requires `--no-skills`.

5. Inspect discovery under that overlay before inference. In omp 18.14.1, `omp skill list --json` ignores the run overlay and lists the installed tested skill. Do not treat that listing as isolated discovery. Start `omp --mode rpc --no-rules --config <run>/isolate.yml --cwd <run> --session-dir <run>/session`, close its input, and retain its `available_commands_update` event. Confirm its skill commands contain only `skill:vstack-figures`, with no `skill:flow-page`. The inspection makes no model request. Preserve a discovery failure as unavailable rather than proceeding.
6. For `with_skill`, explicitly request reading the tested absolute `SKILL.md` path. The no-skill baseline names no skill and receives only the real CLI path needed to publish. Supply the same process constraints and input on both sides. Require explicit isolated `--home` and the caller's supplied `--session` and `--agent` on every Flow command. A child that substitutes another identity is invalid even if its home remains isolated. Inspect both `read` and search calls for tested-skill exposure. A no-skill process that reads the tested instructions is contaminated, not a no-skill success.

Use this task after the side's skill-loading sentence, substituting absolute paths and the caller's supplied identity:

> Read input.json. Publish that one decision question through the actual Flow CLI at `<script>`. This is an isolated headless task. Write only in your cwd and outputs, and never modify the tool or repository. Every Flow command must pass `--home <run>/outputs/flow-home --session <session> --agent <agent>`. Use a fresh Flow, never live user bindings. No user is available. Take a recommended answer only as a headless choice, not consent, and do not invoke ask. After the first successful question submit, stop authoring. Preserve its exact JSON as outputs/submitted.json, actual receipt as outputs/receipt.json, and `show --flow <flow>` output as outputs/show.json. Preserve failed attempts separately. Do not answer, repair, revise, or finish the Stage. Record prerequisites and any headless recommendation in outputs/notes.json. The coordinator captures the rendered question separately.

Set `VSTACK_FLOW_HOST=off` for this authoring baseline. This keeps each isolated namespace from competing for the user's live host port. The Flow state and captured assets stay under `<run>/outputs/flow-home/.vstack/tmp/`. It is not live-host or native-ask proof.

## Start the headless batch

Use one eval cell. Build argument arrays and start every process before waiting on any. This is the existing evaluator's headless procedure, not a persistent runner. `prepared_runs` below is the prepared list of absolute run directories and prompts.

```python
import json, os, subprocess, time
from pathlib import Path

env = {k: v for k, v in os.environ.items()
       if not k.startswith(("PI_", "OMP_"))}
env["VSTACK_FLOW_HOST"] = "off"
processes = []
for run in prepared_runs:
	root = Path(run["directory"])
	argv = ["omp", "-p", "--model", model, "--thinking", thinking,
	        "--approval-mode", "yolo", "--cwd", str(root),
	        "--session-dir", str(root / "session"),
	        "--no-rules", "--config", str(root / "isolate.yml"),
	        run["prompt"]]
	stdout = open(root / "stdout.txt", "w")
	stderr = open(root / "stderr.txt", "w")
	started = time.time()
	process = subprocess.Popen(argv, cwd=root, env=env,
	                           stdin=subprocess.DEVNULL,
	                           stdout=stdout, stderr=stderr)
	processes.append((run, argv, process, stdout, stderr, started))
for run, argv, process, stdout, stderr, started in processes:
	code = process.wait()
	stdout.close()
	stderr.close()
	# Preserve argv, exit code, start time, and observed wait time.
	# Ordered wait time is an elapsed upper bound, not exact runtime.
```

Retain main and auxiliary session transcripts. Check the actual authoring model and thinking records. Real-HOME configuration may start an auxiliary advisor using another configured model. Record that separately, including any effect on attribution. A process failure is unavailable even when it leaves files.

## Freeze and capture the first publication

1. Read the actual successful receipt, not a guessed Flow id or anchor. Freeze `submitted.json`, `receipt.json`, and the Flow's folder under `<run>/outputs/flow-home/.vstack/tmp/*/flow/` immediately. Preserve question and option words, needs, revision, state, captured bytes, and SHA-256 values. A later successful publication belongs in a separate record.
2. Verify receipt Flow, Stage, revision, and question identities against persisted state. Check submitted question titles, options, and needs against that state. Inspect the transcript for the first successful submit. An earlier schema refusal is not a publication or an adequacy failure. Preserve its input and refusal.
3. Start the reader for that isolated home without `VSTACK_FLOW_HOST=off`: run `show --flow <flow> --home <run>/outputs/flow-home` with `VSTACK_FLOW_PORT` set to a free port, and open its `live.url` in managed Chromium at 1280 by 900 CSS pixels. Run `host stop` with the same home after capture. Use `app: { tern: false, relay: false }`. Record the actual device scale, browser version, computed font family, font readiness, image load state, intrinsic and displayed image sizes, and screenshot time. The #311 environment reported scale 1.25, despite requesting 1. Record observations, not requested values.
4. Wait for `document.fonts.ready` and all images. Select the actual question from the receipt. Capture its ARIA and a full-page PNG after scrolling to the top. Full-page evidence avoids the sticky navigation obscuring a tall question's title and needs. Preserve any failed or occluded question crop as a failed capture, not primary evidence.
5. Convert without resizing in JavaScript eval, then read the WebP:

```javascript
const pngPath = await tab.screenshot({fullPage: true, format: "png", silent: true});
await Bun.write(out, await new Bun.Image(await Bun.file(pngPath).bytes()).webp({lossless: true}).bytes());
```

`out` is an absolute `.webp` path. Retain the PNG. Captures made during this run show the frozen new publication, not the historical Q7 or Q8 publication. A missing image, failed browser capture, clipped evidence, or unavailable display prerequisite is unavailable, never a pass.

## Publish the judging controls

Use the real CLI with another isolated home per entry in `controls.json`. Render the three sources under `figures/` through the existing `vstack-figures` Pele render script. Use `--focus a2 --focus b2` for `stream-versus-tabs.mmd`, `--focus R` for `missing-distinction.mmd`, and `--focus a1` for `unreadable.mmd`. Keep the SVG bytes and embedded styles unchanged.

Substitute `${figures}` with a directory inside that control's cwd or selected home's Scratch directory. Publish `first_publication`, then freeze and capture it before any repair. For `late-repair`, substitute `${first_question_id}` from the receipt, publish `later_repair`, and preserve its revision, state, assets, screenshot, and ARIA separately. It never rescues the original score.

`wrong-locality` deliberately uses a valid prose declaration with a diagram only on the Background. `missing-distinction` and `unreadable` deliberately pass local kind matching. Their negative judgment concerns visible meaning and readability, not attachment count. The deliberately wide unreadable figure is a judging fixture, not an authoring recommendation.

## Record facts and request human review

For each new first-publication `outputs/` directory, write `record.json` with `version: 1`, `first_revision`, `question_ids`, relative `submitted`, `receipt`, `state`, `screenshot`, `aria`, and `display` paths, and `files`, a relative-path-to-SHA-256 map. Include all captured assets and frozen page files. Run:

```sh
bun plugin/skills/flow-page/evals/check-record.ts <outputs/record.json>
```

The checker detects changed or omitted required bytes, revision replacement, and Flow mismatch. It reports only question-local kinds, missing declared kinds, and attachment ids. Empty missing kinds on a prose question do not establish adequacy. The manifest is an integrity record, not a signature or a semantic judge.

Keep transcript identity and timing checks, byte availability, locality, and kind matching in `mechanical.json`. In a separate assessment, map each option distinction in `judging.json` to exact visible labels, paths, groupings, or prose. Name missing content explicitly. Preserve the approved original Q7 and Q8 negative judgments even when a fresh authoring trial performs better.

Return the frozen screenshots, ARIA, display records, and distinction mappings to the coordinator. The coordinator uses `ask` on its owning Flow to request user review of clarity, readability, completeness, and prose suitability. Workers return this as an open question and publish nothing on the user's Flow. Until that review, new subjective adequacy outcomes remain pending. No model or mechanical pass supplies user consent.
