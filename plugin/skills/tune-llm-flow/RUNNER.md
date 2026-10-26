# Ratchet runner contract

Use this reference when building or adapting the reusable eval. The host's `xd://eval/ratchet` documentation is authoritative for the installed release.

The runner calls the app's actual entry point. Its command accepts `{variant}` and writes beneath `{flow_dir}/{variant}/`. `check()` resolves those placeholders before execution. The agreed cases, runner, and grader belong in `.omp/ratchet/<flow>/` or at their existing reusable paths, with those dependencies included in the final eval commit.

## Result rows

Append one `results.jsonl` row as each case and repetition finishes:

- `prompt_id`: the stable case id used by `split()`.
- `rep`: the repetition number. Resume by this pair, without duplicate rows.
- `prompt`: the input sent to the real entry point.
- `tags`: the first tag is the primary split stratum.
- `grade`: a boolean, number, or object of numeric property scores. A scalar is the `score` metric. Grade answer quality even when cost or latency is the target.
- `explanation`: the grader's reasoning, required for the pilot cards.
- `status`: `ok` or `truncated`.
- `model`: the served model read from the response, not the requested alias.
- `usage`: the response's token usage, including cache usage when present.
- `latency_s`: measured wall-clock latency.
- `judge_model` and `judge_usage`: the served grader model and token usage when a model grader is used.
- Custom numeric fields: only measured values whose workload and statistic match the agreed metric.

Cost uses the served model's catalog rates and token usage, including grader usage. Supply documented per-million-token price overrides through `plan(prices=...)` for unpriced models. Never invent a zero cost or silently substitute token count for dollars.

## Errors and isolation

An attempt that produces no scorable output goes in `errors.jsonl` with its case id, repetition, and failure class. Examples include an API failure after bounded retries, timeout, grader crash, or served-model mismatch. Do not turn infrastructure failures into zero grades. Preserve retry counts; a pass that needed a retry fails strict scoring unless the grill explicitly chose another policy.

Use fresh app state per trial, a hard per-case wall-clock ceiling, and bounded concurrency appropriate to provider limits. Resume incomplete slots without duplicating completed ones. Hold the workload and scoring rules constant across baseline and candidate runs.

Write full transcripts only for ids in Ratchet's training split, beneath `<variant>/traces/<id>_rep<k>.json`. A transcript is a list of messages with `role` and `content`, and optional `thinking` or `name`. Test transcripts never exist. The gate rejects held-out trace leakage. Use `train()` as the analyzer's input rather than giving it every raw result or case.

Pilot cases run before the split for grader review. Keep their complete outputs and reasoning for the page, but do not persist transcripts for cases that may later become held out. Once split, only the training ids may produce traces. Expected answers remain accessible only to the grader, never to the app's prompt, tools, sandbox, or tuned files.

## Pilot checks

Run five real pilot cases and inspect a complete row with model, usage, latency, output, grade, and reasoning. Test that reference answers score as correct and empty or constant answers fail. A model grader must reject "I don't know" and a confident answer to a different question. Grade the same output twice to check consistency. Induce an API failure and observe an error row rather than a scored result.

Repair the runner or grader before approval when these checks fail. Show the actual pilot observations on the page. A fixture or synthetic example is not proof that the app's real entry point works.
