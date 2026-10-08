---
name: vstack-fan-out
description: The rubric and judge cell behind every vstack Fan-out gate, and what every vstack subagent prompt carries.
disable-model-invocation: true
---

# vstack-fan-out

A skill step that would run two or more subagents at once is a Fan-out block: a gate line that cites this skill and names the step's parts, a fan-out line, and an inline line. This skill decides which line runs. One subagent alone is not Fan-out: a single-subagent line runs as written.

Skill authors copy the exact lines from [FORMS.md](FORMS.md).

## Decide

Run these checks in order. The first one that decides wins.

1. The user's words. "fan out" or "in parallel" means fan-out. "no fan-out" or "sequential" means inline. Read them in the user's request for this run. In a subagent, read the override words in your prompt.
2. Can you start subagents here? With no eval tool, or when the `task` tool is missing or refuses a vstack agent at this depth, go inline. Exception: when the calling skill forbids doing the work itself (today only ship's verifier), stop instead, and say which parts are left undone and why.
3. The judge. Fill the cell below and run it. Fan out only when it prints `fan-out` (the choice is fan-out with confidence of 0.7 or more). Any other result, or an error, means inline.

Before you act, say the result in one line: `Gate <step>: fan-out` or `Gate <step>: inline`, and what decided it (the user's words, no eval tool, or the judge's choice and confidence).

## The judge cell

Fill `request`, `skill`, `step`, and `parts`. Take one part per unit the gate line names, each with the size the gate line says to count (files, lines, diff lines, sources, PRs, hypotheses). Count sizes; never guess them. Run it as one eval cell and change nothing else.

```python
state = {
    "request": "<the user's words for this run>",
    "skill": "<skill name>",
    "step": "<step name>",
    "parts": [{"label": "<part>", "size": "<countable size>"}],  # one entry per part
}
INSTRUCTIONS = (
    "A vstack skill step can hand its parts to subagents that run at the same time (fan-out), "
    "or the current agent can do every part itself, one after another (inline). Fan-out costs "
    "startup time, tokens on the same model, and a merge step. Judge only from the user's "
    "request and the step's concrete inputs."
)
CRITERIA = {
    "fan-out": (
        "The parts are independent: no part needs another's result, and no two write the same "
        "file, branch, or state. None of them is trivially small. And at least one of these holds: "
        "each part needs substantial reading or running (many files, a long command, a live app, "
        "a large artifact); separate contexts are the point (independent review axes, radically "
        "different designs, competing attempts, per-PR verification); or the parts' raw material "
        "together would crowd one context."
    ),
    "inline": (
        "A part depends on another's result or shares a write target; or every part is small "
        "(a short diff, a few files, a narrow question, one source); or a script could do every "
        "part in one pass; or the whole step fits comfortably in one context. When in doubt, inline."
    ),
}
try:
    a = (await judge(state, {"fanout": {"type": "choice", "instructions": INSTRUCTIONS, "criteria": CRITERIA}}))["fanout"]
    go = a.get("choice") == "fan-out" and a.get("confidence", 0) >= 0.7
    print("fan-out" if go else "inline", "| judge:", a.get("choice"), a.get("confidence"))
except Exception as e:
    print("inline | judge error:", e)
```

## Then

- fan-out: run the block's fan-out line as written, every part in one batch, and wait for all of them. Then merge the results the way the step says.
- inline: do every part yourself, in order, from the brief each subagent would have got. Finish one part before you start the next.

A subagent at its own Fan-out step runs this gate again, with the override words from its prompt. Each subagent returns its open questions in its result, and the top-level agent asks them with `ask`.

A role that runs in its own clone (an isolated eval agent) needs omp's `task.isolation.enabled`. When it is off, stop and point the user at `/skill:setup-vstack`. Never run that role in the shared checkout. The inline line still runs, because it needs no clone.

## What every subagent prompt carries

- The role brief from the skill step.
- The user's override words: the exact words that decided check 1, or `none`. A subagent passes on the words from its own prompt.
- The vstack root, as an absolute path. The top-level agent resolves it once: `<git common dir>/vstack` when `<git common dir>/vstack/config/` exists (Private mode), else the main checkout's root, the path on the first `worktree` line of `git worktree list --porcelain`. A subagent uses the path from its prompt and never resolves the git common dir itself.
- The Scratch dir, when the subagent writes Scratch. The top-level agent runs `bun "$(realpath skill://vstack-tmp/scripts/path.ts)"` once from the repo and passes the dir it prints. A subagent adds its own kind (`<Scratch dir>/<kind>/`) and never runs the script.
