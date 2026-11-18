---
description: Run Python in eval under omp's python.interpreter setting
alwaysApply: true
---

# Run Python in eval

Run Python in eval, including existing script files. Default eval cells to `language: "py"`. Eval's interpreter is the one that omp's `python.interpreter` setting names. Bash runs Python only through repo tooling: a command the project defines, such as `uv run …` or the repo's `.venv/bin/python`.
