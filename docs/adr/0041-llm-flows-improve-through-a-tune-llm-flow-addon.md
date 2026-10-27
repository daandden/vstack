# ADR 0041: LLM flows improve through a tune-llm-flow Addon that drives Ratchet directly

When a change in a user's project improves an LLM flow, a new hidden Addon, tune-llm-flow, runs the loop through omp's Ratchet. hillclimb does not run it, and neither does `/ratchet`. tune-llm-flow covers every metric of an LLM flow: answer quality, cost, and latency. Only Ratchet's gate holds graded quality while cost or latency moves. hillclimb keeps the metrics of code that calls no model.

The grill asks Ratchet's setup questions: the LLM flow, the input source, the goal, the allowed and off-limits paths, and the stop rule. The Addon then drives `ratchet(eval_name)` from eval in the parent session, so Ratchet's kickoff round is never asked a second time. setup-vstack turns `ratchet.enabled` on once per machine with `omp config set`. Ratchet's approval material, the round table after every gate, and the final narrative go on the vstack run's Grilling page as Report blocks in implement's Stage. Each `approve()` dialog carries a one-line question that names the page's Q number. omp-tools' Flexible Ask wraps `ui.askDialog`, so that dialog opens in Flexible Ask when the companion is installed. Companion #26 is completed and closed; this does not establish the installed version or a combined live observation in a particular vstack run. Each round that the gate keeps is one commit, and the eval in `.omp/ratchet/<eval>/` is committed without `traces/`.

## Considered Options

- Add an LLM-flow branch to hillclimb. This keeps one Addon, but hillclimb would hold two loops with different rules.
- Hand off to `/ratchet`. This runs outside implement's End state, and Ratchet's kickoff asks the setup questions a second time.
- Change omp so that `approve()` asks through the registered `ask` tool. This is the supported path, but it waits on the omp maintainer.
- Ask each approval through `ask` first and then call `approve()`. This uses only supported APIs, but the user answers every approval twice.

## Consequences

- The `ui.askDialog` wrap depends on omp internals that omp does not document. An omp update can break it. Without omp-tools, omp's stock dialog shows the same one-line question.
- hillclimb's question in `addon-questions.json` excludes LLM flows, and tune-llm-flow gets its own question and sample prompts.
- Eval cases enter the project's git history, including any production data in them.
- The Addon stops when omp has no `ratchet.enabled` setting. Ratchet first appears in the [omp v18.4.5 release's source](https://github.com/can1357/oh-my-pi/tree/v18.4.5/packages/coding-agent/src/ratchet); v18.4.3 and v18.4.4 do not contain that directory. Source presence does not prove that an installed host exposes the setting or eval prelude.
