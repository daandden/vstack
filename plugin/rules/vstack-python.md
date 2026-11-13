---
description: Run Python in eval, under omp's python.interpreter, and install missing libraries only after `ask` approval
alwaysApply: true
---

# Run Python in eval

Run Python in eval, including existing script files. Default eval cells to `language: "py"`. Eval's interpreter is the one that omp's `python.interpreter` setting names. Bash runs Python only through repo tooling: a command the project defines, such as `uv run …` or the repo's `.venv/bin/python`.

Before `%pip`, `%bun add`, or any shell install of a missing library, get approval through the `ask` tool. The question names the package and the target environment. When bound to a Flow, follow `skill://flow-page`'s "Every ask in a Flow" contract. A subagent returns the install question to its coordinator. Without approval, including a cancelled, timed-out, or empty answer, use the libraries already installed.
