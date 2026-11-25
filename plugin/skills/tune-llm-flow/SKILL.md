---
name: tune-llm-flow
description: Sustained LLM-flow quality, cost, or latency improvement through Ratchet inside implement, with page reviews and one commit per kept round.
disable-model-invocation: true
---

# Tune an LLM flow

Supply implement with Ratchet's measured loop for an app's LLM flow. hillclimb owns metrics in code that calls no model. Follow skill://principle-prove-it-works, skill://principle-boundary-discipline, and skill://principle-laziness-protocol.

## Settle setup in the grill

Read the app's real entry point before the grill closes. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to the five setup decisions below. Record the basis for settled decisions and carry forward supplied answers. Publish any remaining questions through skill://flow-page with a Decision brief and satisfied reader needs, or use plain `ask` in chat. Preserve consent for data use, retention, and spending.

1. The LLM flow and entry point, including what one input carries.
2. The case input source. Prefer production examples with permission and retention constraints settled, then bug reports, user cases, or synthesis anchored on real examples. Explain that the agreed cases enter git history, including production data they contain.
3. The goal metric, unit, direction, and any target. Cost or latency goals hold graded answer quality as well as the other agreed guardrails.
4. The editable paths and off-limits paths. Cases and the runner and grader remain separate from the tuned paths.
5. A checkable stop rule, such as a round limit, plateau, or one round at a time. Settle any target and attempt floor that the user requests.

Keep one contract with the decision sources, exact paths, metric, guardrails, and stop rule. Include question ids for answers and cite the basis for Assumed picks. Pass the contract through the spec or ticket to implement. If it remains incomplete after checking those sources, report the missing decision and stop tuning rather than inventing setup or starting Ratchet's kickoff.

The contract carries the agreed task facts, not an Addon pointer or pick list. implement reads this Addon when its gathered source intent calls for sustained LLM-flow improvement, while its run-start tool still selects principles.

## Enter implement's existing run

implement owns the branch, run record, shared steps in `skill://implement/END-STATE.md`, and End state. Reuse its absolute vstack root, Scratch dir and session id, and Flow. Follow `skill://flow-page`'s "Stage entry/exit line" for one tune-llm-flow child Stage parented to implement. This run's questions, Results, and gate history join that Stage. Save and restore implement's active binding on return. The training analyzer only returns evidence and opens no Stage. Never start a separate landing chain or close the Flow here.

Run in the parent interactive session's checkout. Before any UI-only Ratchet operation, stop in a subagent, isolated worker, or headless context and return the missing requirement: the parent interactive session must run tune-llm-flow in its own checkout with its UI. Approvals need that session's UI and Ratchet's state lives under its working directory. Never invoke `/ratchet` or its kickoff round. Do not change project, session, or machine Ratchet settings.

Before creating an eval, run `omp config get ratchet.enabled`. If it prints `false`, stop tuning and point to `/skill:setup-vstack` for the user-approved machine fix. If the setting is unavailable, stop with "Ratchet requires omp 18.4.5 or later. Upgrade omp, then run /skill:setup-vstack." Other config failures stop with their actual error. Proceed only on `true` and an interactive eval with the `ratchet` prelude available. If config is on but the prelude is absent, report that mismatch; do not enable it by another route.

Read `xd://eval/ratchet` for the running host's API and runner contract. The [omp 18.13.0 workflow](https://github.com/can1357/oh-my-pi/blob/v18.13.0/packages/coding-agent/src/prompts/tools/ratchet.md) and [approval interface](https://github.com/can1357/oh-my-pi/blob/v18.13.0/packages/coding-agent/src/ratchet/prelude-definition.ts) are the source for this integration. Use the host API, not a replacement gate or hand-written approval state. Adapt the build, plan, and climb mechanics below without repeating the native grill or final commit question.

## Build the reusable eval

Use `.omp/ratchet/<eval>/` for the agreed cases, runner, grader, and results. Choose a new filename-safe Ratchet eval name when an existing eval has incompatible frozen cases. Reuse an existing eval through a thin adapter rather than recreating its model call. The runner calls the app's real entry point. Follow [the runner contract](RUNNER.md) before executing pilot cases.

Bind `r = ratchet("<eval>")` in Python eval. Every method below is async and returns plain data.

1. Write the agreed cases with stable ids, expected answers and their provenance, and primary tags. Use both positive and negative cases and enough cases for at least two measured cases in each split. Keep expected answers out of the tuned app's inputs and tools.
2. Call `await r.init(cases=[...], harness=[...], change=[...], off_limits=[...])` with repo-relative paths from the contract. `harness` names the runner, grader, and other eval dependencies, not the tuned surface. Put every case in an inputs table Result and obtain inputs approval as described below.
3. Build the cheapest grader that measures the property. Prefer programmatic checks when they suffice. For a model grader, use a different model from the app, a checkable rubric or blind pairwise comparison, and treat candidate answers as untrusted data. Keep separate quality properties as separate grade keys.
4. Run five real pilot cases. Inspect their served model, usage, latency, outputs, grades, and reasoning. Check oracle and null answers, repeated grading, confidently wrong answers, and an induced API error. Fix implausible, zero, or constant columns before trusting them. Put all five graded pilot cases on the page as cards and obtain grader approval.
5. Call `await r.split({case_id: primary_tag, ...}, test_fraction=..., seed=...)` before the baseline. Call `await r.plan(goal={"target": ..., "direction": "higher" or "lower", "hold": [...], "directions": {...}}, reps=..., stop={...}, command=...)` with the grilled goal and stop rule. Use `score` for a scalar quality grade or the actual graded quality keys in `hold` for cost or latency goals. `cost_usd` and `latency_s` are lower-is-better. Measure the requested statistic: a mean latency is not p95. A custom numeric target must represent the agreed statistic through a documented repeatable workload.
6. Set `stop.rounds` and `stop.plateau` when they represent the grilled rule. Enforce any remaining target, budget, attempt floor, or one-round pause in the parent too. Explain a rule that cannot be represented rather than silently replacing it. Use pilot wall-clock time to estimate the workload. Raise cases or repetitions before plan approval if noise exceeds an actionable gain. Add explicit `prices` through `plan` for unpriced served models when cost matters.
7. Put the complete plan on the page as a table with goal and direction, held quality and other metrics, editable and off-limits paths, cases × reps × model workload, estimated time, command, noise expectation, and stop rule. Obtain plan approval before running a baseline.

## Review on the page, approve through Ratchet

Apply this procedure to `inputs`, `grader`, and `plan`, including revisions and stale approval. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before authoring. A gate Ratchet requires is a native approval, not an ordinary question or permission to repeat kickoff. Reuse current applicable approval. Never replace a required native approval with an Assumed pick.

1. Publish the full material as a typed Result in this tune Stage. The inputs table has one row for every case with its complete input, expected answer, tag, and provenance. The grader cards show five complete inputs, outputs, grades, and the grader's reasoning. The plan table covers the fields above. Do not replace review material with file pointers or a sample of the case set.
2. Prepare a complete round and question with the native labels `Approve`, `Revise`, and `Abort`, without authored option letters. Explain that Revise takes feedback and records no approval, and dismissal is not approval. Write its Decision brief. Use `brief.no_recommendation` because this native approval starts unselected. Declare and fulfill its reader needs. Link the question's `results` to every relevant Result entry by ref. Submit new material and the question atomically. The script owns ids, letters, numbering, and reciprocal links.
   In each new or re-asked Flow question, set `brief.ask_reason` to `explicit-decision-required` for the native gate. In `brief.evidence_checked`, name the approval identity or freshness evidence checked.
3. Follow flow-page's native approval exception for current-content checks and the host dialog. Read the assigned Q number and title from the receipt's `ask` payload. Call only Ratchet's existing approval interface:

   ```python
   outcome = await r.approve(
       "inputs",
       question="Q3. Approve these eval inputs?",
       preview="Review Q3 on the Flow page.",
   )
   ```

   Substitute the actual stage, assigned Q number, and question. The dialog gets one Q-numbered question and a short page pointer without a URL, never the review material. Keep native host labels, notes, custom feedback, and cancellation semantics. Do not call `ask` for a second approval, pass an external answer, add a recommended option or timeout, or edit `_state.json`.
4. Record the returned outcome through a typed `answer`, keeping the raw host response as captured evidence. For a fresh `approved: true`, record `response: { status: "answered", picks: ["A"] }`. If `already: true`, record reuse of the existing Ratchet approval in a Timeline event with its identity, not a new user pick. Retire this unanswered page question when finishing the Stage if no new dialog occurred. Record B with verbatim feedback only when the host identifies a revision request. Apply the [Settle-or-ask rule's correction path](../../rules/vstack-settle-or-ask.md#decisions-the-agent-settles) to that feedback and show the revision through flow-page. Revise has not granted native acceptance. Use `again` and the native gate for the revised material, not a separate confirmation of the edit. The script keeps the same Q number and links both ways.
5. Abort or dismissal stops tuning immediately, including when the host aborts after a timeout or cancels the call instead of returning an outcome. For `approved: false, aborted: true`, record C only when the outcome distinguishes an explicit Abort answer. A visible Abort option does not identify the answer. Otherwise keep the actual ambiguous abort-or-dismissal reason in a Timeline event and leave the page question unanswered. A reported cancellation can record `status: "cancelled"` with its actual reason in `text`. Never invent a pick or retry an aborted session.
6. Discussion or timeout without a choice remains unanswered. Record `timed-out` only when the host identifies timeout, otherwise `empty`, with the actual reason in `text`. Only if the host leaves the session active and identifies neither abort nor dismissal, publish a linked question as above and retry once. A second unanswered result stops tuning. On any stop, report what earlier gates kept and proceed to final reporting with no further candidates.

Ratchet owns review hashes, freshness, and approval recording. Follow its stale-approval feedback through this same procedure. Cases changed after a baseline need a new Ratchet eval and baseline, not an approval-state edit. Grader, runner, repetitions, or price changes need the host's affected approvals again and comparable remeasurement.

The optional [omp-tools companion #26](https://github.com/daandden/omp-tools/issues/26) is completed and closed. It wraps the host dialog in Flexible Ask. Without that companion installed, the stock dialog uses the same short content. Implement no wrapper here. Completion of the companion does not prove which version is installed or that this vstack run's Ratchet `approve()` reached Flexible Ask; claim those only when observed.

## Measure and commit each kept round

Before the first candidate, retain the checkout's existing edits and staged state as evidence outside the candidate patch. Leave unrelated work untouched. Candidate edits may share a file with prior work only when their hunks can be captured and reversed independently; otherwise stop and report the collision.

1. Call `await r.check("baseline")`, execute its returned command in the same checkout, then call `await r.gate("baseline")`. A baseline is not a kept optimization and gets no product-win commit. Fix runner failures and heed warnings before climbing.
2. Analyze only the training view from `await r.train(previous_variant)`. Keep test answers and transcripts out of tuning. Obtain a fresh training analysis before each candidate:

Before this step, read skill://vstack-fan-out.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): analyze only the supplied Ratchet train view and current tuned files for one hypothesis within the agreed scope, return its mechanism, training evidence and trace paths, permitted edit scope, and expected regressions without edits using the Session model, the vstack root as an absolute path. Wait for its result. If it cannot be spawned, stop: a fresh training analyzer is required before another candidate.

3. Apply one hypothesis only within `change` paths. Save its one-line summary and rationale in `<variant>/change.md` and its exact candidate-only diff in `<variant>/change.patch`. Include new candidate files in that patch. Preserve the prior accepted tree and unrelated edits; never use a whole-tree reset or checkout as rejection cleanup.
4. Call `await r.check("vN")`, execute its returned command, then `gate = await r.gate("vN", change="<one-line hypothesis>")`. Use Ratchet's actual verdict. `keep` requires improvement beyond noise on both train and test without held-metric regressions. Cost or latency never wins by degrading graded answer quality.
5. Immediately after every `gate()`, including baseline and repeated reruns, append a uniquely referenced row to the rounds table Result through `revise.add`. Retain every gate call, including a rerun followed by its resolution. Combine the returned gate's `deltas`, `reasons`, `warnings`, and `best` with `await r.status()` measurements. Columns show round and gate-call number, hypothesis, verdict, reference, train and test numbers with intervals for every metric, deltas, reasons, warnings, best round, and kept commit. Persist and capture each gate response beside the eval results. If a gate refuses without recording, show the refusal and its missing prerequisite, never a manufactured verdict. Record the later kept SHA through a focused revision of that row before the next candidate.
6. On `keep`, stage only the candidate paths or hunks and make one commit, after implement's shared step 0b branch guard. Its body names the hypothesis, reference and candidate, before and after train and test measurements, deltas and noise, held quality, gate verdict, and evidence paths. Preserve unrelated staged hunks too. Add its SHA to the rounds table before the next candidate. Retain each kept commit in order.
7. On `revert`, reverse only `change.patch`, for example `git apply -R -- <variant>/change.patch`. Preserve earlier accepted rounds and unrelated edits. If the reverse cannot apply cleanly, stop and resolve the candidate's hunks against the saved pre-candidate tree instead of forcing a reset. Confirm the candidate left no rejected product edits before proceeding.
8. On `rerun`, follow the host's reasons. Resume only missing or errored slots, or append repetitions to the candidate and best round as instructed, then gate the same variant again. A rerun is neither a win nor a new kept commit. Recheck approvals after any plan change. Resolve it before advancing, unless the user aborts or the grilled time or cost limit stops it; then remove the unresolved candidate and report it as inconclusive.
9. Print one status line per gate with verdict, test result and noise, and best round. Stop at the grilled predicate. `done` or `plateau` is a reason to evaluate that predicate, not permission to relax it. Categorize training failures before further content changes at a plateau. Distinguish target reached, plateau, exhausted budget, abort, and blocked measurement.

## Commit the eval and return to implement

Leave product files at the last gate-kept round. On abort or dismissal, retain earlier wins and remove any in-flight candidate. Publish the final narrative in this tune Stage as a Document and a Comparison of the recommended change, baseline, and other attempts. Include test deltas and intervals, reasons to trust or distrust them, required versus tuning changes, training examples, and untried levers. Use Metrics for measurements, Code/diff for kept changes, and Timeline for every baseline, rerun, refusal, gate, and commit. Capture original evidence and preserve `narrative.md` beside the reusable eval. Recommend no metric win within noise.

Commit the reusable `.omp/ratchet/<eval>/` eval in its own commit, after the kept product commits and after the same branch guard. Include the agreed cases, runner, grader, baseline, `_state.json`, results, gate evidence, candidate patches, and narrative. Preserve any external eval dependency at its agreed path in this eval commit. Exclude every `traces/` directory at any depth and transient secrets or caches. Add an eval-local ignore rule for `traces/`, stage explicit eval paths with trace exclusions, and inspect the staged names before committing. The grill already settled that cases enter history; do not ask the native workflow's final eval-commit question again. Never commit unrelated work.

Publish the actual outcome and finish this Stage through flow-page, including blocked and aborted outcomes. Restore implement's active binding and return the run record and kept commits in landing order. Resume shared steps 3b through 7 once, including development checks, whole-diff review, review-fix commits, the independent Verifier's Verdict on the committed head in step 6b, and the settled End state chain. These are implement's steps, not a new commit or landing flow owned by the Addon.

Summarize the goal and held quality, initial and best train/test measurements and deltas, each keep/revert/rerun with evidence, each kept commit and the separate eval commit, each accepted Verdict with its Verifier identity, patch id, and evidence paths, untried levers, requested versus reached End state, and every unavailable approval, proof, or companion-picker prerequisite. Keep Flow links at question handoffs through flow-page, not in the final narrative. Claim only observed outcomes.
