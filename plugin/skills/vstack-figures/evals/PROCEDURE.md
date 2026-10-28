# Compare two versions of the figure drawer

Run the 18 cases in [briefs.json](briefs.json) once per side, then judge each pair twice with [RUBRIC.md](RUBRIC.md), once in each A/B order. A pair is a candidate win only when both verdicts pick the candidate. Keep the candidate when it wins at least 11 of 18 pairs. Report cost separately. Cost does not decide whether to keep the candidate.

This procedure runs the agent file, skill://vstack-figures, and skill://diagram-design at each side's git ref. It does not compare drawing models. Read skill://benchmark-checklist before you run it.

## 1. Fix the inputs and models

Choose `baseline` and `candidate` git refs. Resolve both to commit ids and record them before extraction. For the first comparison for #234, baseline is main before any #234 ticket merged, commit `6b701d2`. A candidate that is not committed yet is the working tree: copy the same three paths from it instead of running `git archive`, and record `git stash create` output and `git status --short` for those paths.

Read `cfg://task`, or the user's omp config, and inspect these `task.agentModelOverrides` keys:

- `vstack-diagram-drawer` must be `openai-codex/gpt-6.1-sol:high`.
- `vstack-explorer` must be `anthropic/claude-opus-5-5:high` while judges run.

Stop if the drawer key is missing or differs. Save the explorer key's original value, including whether it was absent. Before judging, apply the session-only override in step 6 if needed, then restore the original value after the judges finish. The `task` tool has no per-item `model` field. Drawers and judges select their respective named-agent overrides.

Read skill://vstack-tmp. A top-level maintainer's agent obtains the Scratch kind directory with:

```sh
bun "$(realpath skill://vstack-tmp/scripts/path.ts)" vstack-figures
```

Create `<Scratch dir>/vstack-figures/<run-id>/`, abbreviated `<run>` below. A subagent uses the Scratch dir its parent supplied instead of running the path script. Put every run output under `<run>`, never in tracked files.

Save a `manifest.json` with the refs, resolved commit ids, both required model ids, the explorer key's original value and presence, seed `234`, run id, vstack root, Scratch dir, start time, browser version, viewport, device scale factor, and display width. Copy the fixed briefs and rubric into the run folder and record their checksums. Use that same copy for both sides and every judge. Source paths in briefs.json identify the original session JSONL line and task name. They are provenance, not inputs for drawers or judges.

The set has 3 simple, 5 normal, and 10 complex cases. Complex cases exercise a larger graph or explicit lanes, rows, or panels. c1 has 12 flowchart nodes. c3 preserves a real two-panel sequence with six lifelines, three repeated roles per panel. It does not claim six distinct participant roles.

## 2. Extract each side's chain

Create `<run>/baseline/chain/` and `<run>/candidate/chain/`. For each side, substitute its ref and directory in:

```sh
git archive <ref> plugin/agents/vstack-diagram-drawer.md plugin/skills/vstack-figures plugin/skills/diagram-design | tar -x -C <run>/<side>/chain
```

Keep the extracted trees unchanged throughout the run. The chain includes each skill's references, scripts, and assets at that ref. A side missing any of these paths cannot run. Record the extraction failure rather than borrowing files from another ref.

## 3. Draw once per brief per side

Create `<run>/<side>/figures/`. Check `uptime` and the logical core count, `sysctl -n hw.logicalcpu` on macOS or `nproc` on Linux. Record the load and concurrency. Order the 36 items so the two sides interleave, and neither side gets all the quiet or warm starts. Name each item `<side>-<brief id>`, such as `baseline-s1`, so that its transcript is findable. While the drawers run, prepare the render records and blind-pair directories.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per brief per side. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-diagram-drawer"`. Each `task`: draw and export its fixed brief from the prompt below and return its SVG path or failure, the vstack root, the Scratch dir. Do not wait; keep working. If they cannot start, stop: record each unstarted drawer's side, brief, and failure reason, and report the run as incomplete without parent-drawn replacements.

For each item, use this prompt, with absolute paths substituted:

```text
Follow the body of <chain>/plugin/agents/vstack-diagram-drawer.md in place of your own drawer instructions.

For the two versioned skills, resolve these URLs to the extracted chain:
- skill://vstack-figures means <chain>/plugin/skills/vstack-figures/SKILL.md.
- skill://vstack-figures/<path> means <chain>/plugin/skills/vstack-figures/<path>.
- skill://diagram-design means <chain>/plugin/skills/diagram-design/SKILL.md.
- skill://diagram-design/<path> means <chain>/plugin/skills/diagram-design/<path>.
Use these chain paths when following links or running scripts within those two skills. Never read the installed copies of these two skills or the installed drawer agent. Other skill:// URLs, such as skill://good-css and skill://unslop, resolve to the installed plugin as usual.

Figure brief:

<brief text, with {out} replaced by <run>/<side>/figures/>

vstack root: <absolute vstack root>
Scratch dir: <absolute Scratch dir>
```

While drawers run, prepare render records and blind-pair directories. Collect every task result. Preserve the result, source HTML, SVG, and subagent transcript path. Inspect the transcript's reads and script paths to confirm that it used its extracted chain. A side that read installed versioned text is contaminated, not a valid trial.

Append one JSON object per brief to `<run>/<side>/cost.jsonl`, with these fields:

```json
{
	"id": "s1",
	"task": "baseline-s1",
	"status": "success",
	"wall_seconds": 136,
	"total_tokens": 123456,
	"fresh_tokens": 12345,
	"cache_read_tokens": 111111,
	"turns": 12,
	"transcript": "<absolute transcript path>",
	"svg": "<absolute SVG path>",
	"failure": null
}
```

The values above illustrate the record shape, not a measured draw. Use the task result's `duration` attribute for wall time. Convert values such as `2m16s` to seconds. Locate the subagent transcript at `<parent session dir>/<task name>.jsonl`, under `~/.omp/agent/sessions/<cwd-key>/<parent-session-id>/`.

Sum `.message.usage.totalTokens` across records with usage. Also record fresh tokens as the sum of `input + output`, cache-read tokens, and the turn count. Total tokens include repeated context across turns. Keep fresh tokens separate so that this definition is explicit. This command extracts the token totals:

```sh
jq -s '[.[] | select(.message.usage != null) | .message.usage] | {turns: length, total: (map(.totalTokens) | add), fresh: (map(.input + .output) | add), cacheRead: (map(.cacheRead) | add)}' <transcript.jsonl>
```

Check that `.message.model` is `gpt-6.1-sol` on every drawer model turn. Record a model mismatch as an invalid trial. If the task result also reports usage, retain it beside the transcript totals and explain any difference in definitions.

For failed or unstarted drawers, set `status` to `failed` or `not_started`, record the reason, and retain available duration and usage. Use `null` for unavailable values, never zero. Record export failures even when the drawer itself returned successfully. Do not silently retry or omit failed cases.

## 4. Render at the measured display width

Use one measured SVG display width for both sides at a 1440 by 900 viewport. Record it separately from the SVG's viewBox width.

The historical measurement used the installed Grilling page builder on 2026-10-24. A throwaway page held one question with an SVG visual from `grilling/vstack-234/figures/t234-tickets-deps.svg`. This is historical measurement evidence, not the current publication interface.

The browser opened `page.html#q-measure` in Chromium at 1440 by 900. `document.querySelector('#q-measure svg').getBoundingClientRect().width` returned `1376`. The SVG parent measured `1400`, the viewBox was `0 0 960 600`, and the rendered SVG height was `860`. The device scale factor was `1.25`. Historical evidence lives under `/Users/vanguyen/.vstack/tmp/vstack-a7925b/vstack-figures/display-width-measurement/`, including `records.jsonl`, the built page, and `page.webp`. Scratch evidence expires. Preserve these observations without treating them as a measurement of the current renderer.

Read `skill://flow-page` and `xd://eval/browser` before rendering. For each export, open a throwaway Flow with a vstack-figures Stage and submit a typed SVG attachment plus a Document Result with a `figure` block naming it. Keep the receipt and show snapshot under `<run>/<side>/renders/<id>/`. Open the Document's Stage. The renderer is only the display, never the drawer's chain.

Use Chromium, a 1440 by 900 viewport, and device scale factor `1.25` for both sides. In eval, pass `app={"tern": false, "relay": false}` to `browser.open`. Wait for `document.fonts.ready`, and record the SVG's bounding rectangle and font availability. The Flow renderer can differ from the historical Grilling page: measure and document its width before a comparison, use the same width for both sides, and update the run contract rather than silently scaling to 1376.

Capture the complete SVG element, including content below the viewport. Preserve its aspect ratio and height. Do not crop, shrink, edit, or relayout an export to improve a side's score. A selector screenshot avoids page text around the visual:

```javascript
const pngPath = await tab.screenshot({selector: "<Document figure SVG selector>", format: "png", silent: true});
const out = "<run>/<side>/renders/<id>/figure.webp";
await Bun.write(out, await new Bun.Image(await Bun.file(pngPath).bytes()).webp({lossless: true}).bytes());
```

Retain the PNG in the same render directory as `figure.png`. Read the WebP to confirm it contains the complete export. At scale factor 1.25, the historical 1376 CSS-pixel width produced a 1720-pixel image. Keep the current run's measured width and scale for every image. Record missing SVGs, browser failures, unavailable fonts, and clipped captures in a render log. A bad export stays bad for judging. A failed capture is a measurement failure, not a low-quality drawing.

## 5. Pair and blind

In brief-id order, use `random.Random(234)` in Python. For each pair, shuffle a fresh list `["baseline", "candidate"]`. Copy its first side's WebP to `<run>/pairs/<id>/A.webp` and its second side's WebP to `B.webp`. Then stage the swapped order: copy the same two WebPs to `<run>/pairs-swapped/<id>/`, with the first side's WebP as `B.webp` and the second side's as `A.webp`. Copy the fixed brief to both directories as `brief.txt` and the rubric as `RUBRIC.md`.

Write `<run>/key.json` with the seed and each id's A-to-side and B-to-side mapping for both orders. Keep the key, side directories, SVG sources, transcripts, and cost files outside each judge's working directory and prompt. Use copies, not symlinks that reveal the side. Neutral filenames and identical image conversion keep side identity out of the judge's inputs.

Judges lean toward position A when a pair is close, and one seeded order can put the candidate in A for few pairs. Judging both orders keeps position from deciding a pair.

## 6. Judge the pairs

Read `cfg://task/agentModelOverrides` again before judging. If `vstack-explorer` differs from `anthropic/claude-opus-5-5:high`, write the override record to that path with only this entry changed. Use the session-only scope in omp's approval prompt. Preserve every other entry and do not edit a config file. If the user declines or the write fails, stop without running judges. Record the approved override in the manifest.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per pair directory in `pairs/` and `pairs-swapped/`, 36 in all. One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: act as the blind judge, read only the pair directory's `RUBRIC.md`, `brief.txt`, `A.webp`, and `B.webp`, and return the rubric's JSON verdict for its brief id, the vstack root, the Scratch dir. Wait for every result. If they cannot start, stop: record each unstarted judge and its failure reason, restore the original explorer override, and report the run as incomplete.

After all started judges settle, restore the original explorer value through `cfg://task/agentModelOverrides`, using session-only scope again. If the original entry was absent, remove the temporary entry. Preserve the other current entries. Restore the value even when judging fails, and record whether restoration succeeded. If a judge cannot read both images, record the failure and no verdict for that pair.

Tell each judge that the images are A and B, with no version names. Tell it to read both images and use only the staged inputs. It must not read the pairing key, side files, or drawer transcripts. Confirm from its transcript that it read both image files. Record each judge's actual model values from `.message.model` on its model turns. Check that every value is `claude-opus-5-5`, and mark a mismatch as an invalid trial. Save the model evidence, verdict, and transcript path in the pair directory it judged, `<run>/pairs/<id>/` or `<run>/pairs-swapped/<id>/`.

Validate the verdict shape, all six integer scores in the range 1 to 5, six nonempty evidence lines, the matching id, and one winner A or B. Only after all verdicts are saved, read the key and map scores and winners back to baseline and candidate. A pair whose two verdicts pick the same side counts for that side. A pair whose verdicts disagree is a split and counts for neither side.

A failed draw or export cannot produce a complete visual pair. Do not reduce the denominator below 18, count a missing figure as a win, or manufacture an image. Report the run as incomplete until all 18 real pairs have valid verdicts in both orders. Preserve failures when a maintainer authorizes a new run.

## 7. Report the result

Write `<run>/report.md` with the following evidence:

- Candidate wins, baseline wins, and splits out of 18, followed by keep at 11 or more candidate wins, or reject below 11. An incomplete or contaminated run has an inconclusive keep verdict.
- Mean layout efficiency, fidelity, and readability scores for each side over both orders. Include both verdicts' paired scores and winners for every brief.
- Median and minimum-to-maximum wall time in seconds per side. Report total tokens, fresh tokens, and cache-read tokens with their medians and ranges. State that these are one draw per brief, not repeated trials of the same brief.
- The count of started, successful, failed, and unstarted drawers, failed exports, render failures, invalid trials, and missing judge verdicts for each side. Show costs for failed attempts separately from successful draws. Do not let fast failures lower the reported successful-draw median.
- Benchmark checklist question 4, "Did it error?" Answer with those failure counts and export inspection results, not just file existence.
- Benchmark checklist question 7, "Did it even happen?" Cite each drawer's transcript and exported figure, its chain and model checks, the rendered image, and evidence that its judge read both images.
- The refs, model ids, seed, display dimensions, browser and font environment, load, concurrency, and absolute run folder path.

The keep decision concerns this fixed set's visual quality. Report time and tokens as observed costs for these cases. Do not call either side faster without the remaining benchmark checklist evidence, including repeated alternating trials and a measured limiter.
