---
description: Run Python in eval and distinguish locked restores, task-required dependencies, and installs needing approval
alwaysApply: true
---

# Run Python in eval

Run Python in eval, including existing script files. Default eval cells to `language: "py"`. Eval's interpreter is the one that omp's `python.interpreter` setting names. Bash runs Python only through repo tooling: a command the project defines, such as `uv run …` or the repo's `.venv/bin/python`.

Checkout permissions. Locked restores and task-required additions below apply only when your role permits checkout changes. Read-only agents and the Verifier keep their role's restrictions.

Locked restore. When a package recorded in the checkout's lockfile is missing, restore it without asking in the checkout you work in. Use the project's package manager in its lockfile-preserving mode: `bun install --frozen-lockfile`, `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, or `uv sync --locked`. Run the restore only when the intended lockfile exists. Bun's frozen flag can resolve from package.json without a lockfile. If the lockfile is missing or the manifest needs packages the lockfile lacks, stop and report the failure. Never retry in a mode that rewrites or bypasses the lockfile. Never create a lockfile to make a restore pass. Report the restore and any failure.

Task-required additions. When the task requires adding a project dependency, install it with the project's package manager in the working checkout without a separate approval question. Include its required peer and type packages, and keep the manifest and lockfile changes with the work. Leave unrelated packages at their locked versions rather than updating them to latest.

Other installs. Before `%pip` or `%bun add`, and for every install outside the two project cases, get approval through the `ask` tool. This includes libraries for the agent's own tooling, global installs, and installs into another checkout. The question names the package and the target environment. When bound to a Flow, follow `skill://flow-page`'s "Every ask in a Flow" contract. A subagent returns the install question to its coordinator. Without approval, including a cancelled, timed-out, or empty answer, use the libraries already installed.
