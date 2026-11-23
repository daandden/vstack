# Compare two versions of vstack-figures

Run the 18 cases in [briefs.json](briefs.json) once per side, then judge each pair twice with [RUBRIC.md](RUBRIC.md), once in each A/B order. A pair is a candidate win only when both verdicts pick the candidate. Keep the candidate when it wins at least 11 of 18 pairs. Report cost separately. Cost does not decide whether to keep the candidate.

When executing this comparison, follow `skill://flow-page`'s "Stage entry/exit line" for the result-producing comparison run. A reference read or one rendering helper creates no Stage. Keep the canonical report under this run's Scratch entry and publish its complete findings and captured evidence as Document, Comparison, Metrics, and Timeline Results before closing the Stage. Workers return their figure evidence to the comparison owner. They publish no separate report page.

A side is skill://vstack-figures at one git ref: its `SKILL.md` and its render script, with the `pele` version that ref pins. One `vstack-worker` per brief per side follows that side's text to write the Mermaid and render it. This procedure does not compare writing models. Read skill://benchmark-checklist before you run it.

## 1. Fix the inputs and models

Choose `baseline` and `candidate` git refs. Both refs must hold `plugin/skills/vstack-figures/scripts/render.ts`. Resolve both to commit ids and record them before extraction. A candidate that is not committed yet is the working tree: copy the same paths from it instead of running `git archive`, and record `git stash create` output and `git status --short` for those paths.

Read `cfg://task`, or the user's omp config, and inspect these `task.agentModelOverrides` keys:

- `vstack-worker`: record its value, or that it is absent and the workers run on the Session model. Both sides use the same value.
- `vstack-explorer` must be `anthropic/claude-opus-5-5:high` while judges run.

Save the explorer key's original value, including whether it was absent. Before judging, apply the session-only override in step 6 if needed, then restore the original value after the judges finish. The `task` tool has no per-item `model` field. Workers and judges select their respective named-agent overrides.

Read `skill://vstack-tmp`. At the top level, open the marked `vstack-figures` session folder with:

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)" vstack-figures
```

In a subagent, open that kind using the explicit mode in `skill://vstack-tmp`. Create `<run-id>/` inside the marked folder, abbreviated `<run>` below. Put every run output under `<run>`, never in tracked files.

Save a `manifest.json` with the refs, resolved commit ids, the worker model and the required judge model, the explorer key's original value and presence, seed `234`, run id, vstack root, Scratch dir and session id, start time, browser version, viewport, device scale factor, and display width. Copy the fixed briefs and rubric into the run folder and record their checksums. Use that same copy for both sides and every judge. Source paths in briefs.json identify the original session JSONL line and task name. They are provenance, not inputs for workers or judges.

The set has 3 simple, 5 normal, and 10 complex cases. Complex cases exercise a larger graph or explicit lanes, rows, or panels. c1 has 12 flowchart nodes. c3 preserves a real two-panel sequence with six lifelines, three repeated roles per panel. It does not claim six distinct participant roles.

## 2. Extract each side's chain

Create `<run>/baseline/chain/` and `<run>/candidate/chain/`. For each side, substitute its ref and directory in:

```sh
git archive <ref> plugin/skills/vstack-figures package.json bun.lock | tar -x -C <run>/<side>/chain
bun install --frozen-lockfile --cwd <run>/<side>/chain
```

The install gives each side the `pele` version its ref pins, so the render script resolves `pele` from the chain. Keep the extracted trees unchanged throughout the run. A side missing any of these paths, or whose install fails, cannot run. Record the failure rather than borrowing files from another ref.

## 3. Draw once per brief per side

Create `<run>/<side>/figures/`. Check `uptime` and the logical core count, `sysctl -n hw.logicalcpu` on macOS or `nproc` on Linux. Record the load and concurrency. Order the 36 items so the two sides interleave, and neither side gets all the quiet or warm starts. Name each item `<side>-<brief id>`, such as `baseline-s1`, so that its transcript is findable. While the workers run, prepare the render records and blind-pair directories.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per brief per side. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-worker"`. Each `task`: write and render its fixed brief's figure from the prompt below and return its SVG path or failure, the vstack root, the Scratch dir and session id. Do not wait; keep working. If they cannot start, stop: record each unstarted worker's side, brief, and failure reason, and report the run as incomplete without parent-drawn replacements.

For each item, use this prompt, with absolute paths substituted:

```text
Draw one figure by following <chain>/plugin/skills/vstack-figures/SKILL.md in place of the installed skill://vstack-figures.

skill://vstack-figures/<path> means <chain>/plugin/skills/vstack-figures/<path>. Run the render script from the chain, so it uses the chain's pele. Never read the installed copy of vstack-figures. Other skill:// URLs resolve to the installed plugin as usual.

Write the Mermaid to <out>/<slug>.mmd and render <out>/<slug>.svg. Draw only what the figure description gives. Return the SVG path, or the failure line the skill asks for.

Figure:

<brief text, with {out} replaced by <run>/<side>/figures/>

vstack root: <absolute vstack root>
Scratch dir and session id: <absolute project Scratch dir and root omp session id>
```

Collect every task result. Preserve the result, the Mermaid source, the SVG, and the subagent transcript path. Inspect the transcript's reads and script paths to confirm that it used its extracted chain. A side that read installed versioned text or ran the installed render script is contaminated, not a valid trial.

Append one JSON object per brief to `<run>/<side>/cost.jsonl`, with these fields:

```json
{
	"id": "s1",
	"task": "baseline-s1",
	"status": "success",
	"wall_seconds": 41,
	"total_tokens": 123456,
	"fresh_tokens": 12345,
	"cache_read_tokens": 111111,
	"turns": 6,
	"renders": 1,
	"transcript": "<absolute transcript path>",
	"svg": "<absolute SVG path>",
	"failure": null
}
```

The values above illustrate the record shape, not a measured draw. Use the task result's `duration` attribute for wall time. Convert values such as `2m16s` to seconds. `renders` counts the render script runs in the transcript, so a Mermaid fix shows as a second run. Locate the subagent transcript at `<parent session dir>/<task name>.jsonl`, under `~/.omp/agent/sessions/<cwd-key>/<parent-session-id>/`.

Sum `.message.usage.totalTokens` across records with usage. Also record fresh tokens as the sum of `input + output`, cache-read tokens, and the turn count. Total tokens include repeated context across turns. Keep fresh tokens separate so that this definition is explicit. This command extracts the token totals:

```sh
jq -s '[.[] | select(.message.usage != null) | .message.usage] | {turns: length, total: (map(.totalTokens) | add), fresh: (map(.input + .output) | add), cacheRead: (map(.cacheRead) | add)}' <transcript.jsonl>
```

Check that `.message.model` is the recorded worker model on every worker model turn. Record a model mismatch as an invalid trial. If the task result also reports usage, retain it beside the transcript totals and explain any difference in definitions.

For failed or unstarted workers, set `status` to `failed` or `not_started`, record the reason, and retain available duration and usage. Use `null` for unavailable values, never zero. Record a render that still fails after the skill's one fix as a failure, even when the worker itself returned. Do not silently retry or omit failed cases.

## 4. Render at the measured display width

The historical comparison used a **1376 CSS pixel** maximum SVG display width at a 1440 by 900 viewport. That was measured on the retired Grilling page on 2026-10-24, not on the Flow renderer. The old SVG parent was 1400px, its viewBox was `0 0 960 600`, its displayed height was 860px, and device scale factor was 1.25. Historical evidence is under `/Users/vanguyen/.vstack/tmp/vstack-a7925b/vstack-figures/display-width-measurement/`. Do not claim those values as a new Flow measurement.

Read `xd://eval/browser` before browser use. Use the same current Flow renderer only for display on both sides, never as either side's figure chain. Open a fresh proof Flow through `flow-page open`, using an isolated `--home`, and put generated media inside that project's Scratch dir. Submit each SVG as a captured `attachment` and a complete question with `needs: [{ need: "<the brief's actual decision distinction>", kind: "context-diagram" }]` and `figures: [{ attachment: "<ref>", kind: "context-diagram" }]`. Record the receipt and use its actual question id, not a guessed anchor. Rendering helpers open no Stage.

Use Chromium at 1440 by 900 and device scale factor 1.25 for both sides, with `app: { tern: false, relay: false }`. Wait for `document.fonts.ready` and the question's `.diagram[data-render="drawn"]`. Historical Pele SVG attachments draw inside that element's shadow root, not an `<img>`. Measure the `.diagram` viewport, its scroll width, and the shadow root SVG's bounding rectangle, and record font availability. A Pele SVG keeps its intrinsic width with local panning when needed. Use this fresh common display measurement in the manifest. A changed renderer or environment needs another documented measurement, never silent scaling. Historical 1376px results are not directly comparable until display conditions match.

Capture the complete drawn SVG, including content beyond the local viewport. Preserve its aspect ratio and height. Do not crop, shrink, edit, or relayout captured SVG bytes to improve a side's score. Use the actual receipt's question id to tag only the display DOM, then capture that drawn shadow-root SVG without page text:

```javascript
await tab.evaluate(() => {
	document.querySelector("#<question-id> .diagram").shadowRoot.querySelector("svg").setAttribute("data-capture-question", "<question-id>");
});
const pngPath = await tab.screenshot({selector: 'pierce/svg[data-capture-question="<question-id>"]', format: "png", silent: true});
const out = "<run>/<side>/renders/<id>/figure.png";
await Bun.write(out, Bun.file(pngPath));
```

Read `figure.png` at full resolution to confirm it contains the complete SVG. Keep scale factor 1.25 for every image. Record missing SVGs, browser failures, unavailable fonts, and clipped captures in a render log. A bad figure stays bad for judging. A failed capture is a measurement failure, not a low-quality drawing.

## 5. Pair and blind

In brief-id order, use `random.Random(234)` in Python. For each pair, shuffle a fresh list `["baseline", "candidate"]`. Copy its first side's PNG to `<run>/pairs/<id>/A.png` and its second side's PNG to `B.png`. Then stage the swapped order: copy the same two PNGs to `<run>/pairs-swapped/<id>/`, with the first side's PNG as `B.png` and the second side's as `A.png`. Copy the fixed brief to both directories as `brief.txt` and the rubric as `RUBRIC.md`.

Write `<run>/key.json` with the seed and each id's A-to-side and B-to-side mapping for both orders. Keep the key, side directories, Mermaid sources, SVGs, transcripts, and cost files outside each judge's working directory and prompt. Use copies, not symlinks that reveal the side. Neutral filenames and identical capture settings keep side identity out of the judge's inputs.

Judges lean toward position A when a pair is close, and one seeded order can put the candidate in A for few pairs. Judging both orders keeps position from deciding a pair.

## 6. Judge the pairs

Read `cfg://task/agentModelOverrides` again before judging. If `vstack-explorer` differs from `anthropic/claude-opus-5-5:high`, write the override record to that path with only this entry changed. Use the session-only scope in omp's approval prompt. Preserve every other entry and do not edit a config file. If the user declines or the write fails, stop without running judges. Record the approved override in the manifest.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per pair directory in `pairs/` and `pairs-swapped/`, 36 in all. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: act as the blind judge, read only the pair directory's `RUBRIC.md`, `brief.txt`, `A.png`, and `B.png`, and return the rubric's JSON verdict for its brief id, the vstack root. Wait for every result. If they cannot start, stop: record each unstarted judge and its failure reason, restore the original explorer override, and report the run as incomplete.

After all started judges settle, restore the original explorer value through `cfg://task/agentModelOverrides`, using session-only scope again. If the original entry was absent, remove the temporary entry. Preserve the other current entries. Restore the value even when judging fails, and record whether restoration succeeded. If a judge cannot read both images, record the failure and no verdict for that pair.

Tell each judge that the images are A and B, with no version names. Tell it to read both images and use only the staged inputs. It must not read the pairing key, side files, or worker transcripts. Confirm from its transcript that it read both image files. Record each judge's actual model values from `.message.model` on its model turns. Check that every value is `claude-opus-5-5`, and mark a mismatch as an invalid trial. Save the model evidence, verdict, and transcript path in the pair directory it judged, `<run>/pairs/<id>/` or `<run>/pairs-swapped/<id>/`.

Validate the verdict shape, all six integer scores in the range 1 to 5, six nonempty evidence lines, the matching id, and one winner A or B. Only after all verdicts are saved, read the key and map scores and winners back to baseline and candidate. A pair whose two verdicts pick the same side counts for that side. A pair whose verdicts disagree is a split and counts for neither side.

A failed render cannot produce a complete visual pair. Do not reduce the denominator below 18, count a missing figure as a win, or manufacture an image. Report the run as incomplete until all 18 real pairs have valid verdicts in both orders. Preserve failures when a maintainer authorizes a new run.

## 7. Report the result

Write `<run>/report.md` with the following evidence:

- Candidate wins, baseline wins, and splits out of 18, followed by keep at 11 or more candidate wins, or reject below 11. An incomplete or contaminated run has an inconclusive keep verdict.
- Mean layout efficiency, fidelity, and readability scores for each side over both orders. Include both verdicts' paired scores and winners for every brief.
- Median and minimum-to-maximum wall time in seconds per side. Report total tokens, fresh tokens, cache-read tokens, and render runs with their medians and ranges. State that these are one draw per brief, not repeated trials of the same brief.
- The count of started, successful, failed, and unstarted workers, failed renders, render-page failures, invalid trials, and missing judge verdicts for each side. Show costs for failed attempts separately from successful draws. Do not let fast failures lower the reported successful-draw median.
- Benchmark checklist question 4, "Did it error?" Answer with those failure counts and SVG inspection results, not just file existence.
- Benchmark checklist question 7, "Did it even happen?" Cite each worker's transcript, Mermaid source, and SVG, its chain and model checks, the rendered image, and evidence that its judge read both images.
- The refs, model ids, seed, display dimensions, browser and font environment, load, concurrency, and absolute run folder path.

The keep decision concerns this fixed set's visual quality. Report time and tokens as observed costs for these cases. Do not call either side faster without the remaining benchmark checklist evidence, including repeated alternating trials and a measured limiter.
