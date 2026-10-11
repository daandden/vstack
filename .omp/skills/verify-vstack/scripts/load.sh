#!/usr/bin/env bash
# Runs the checkout's own load gate (scripts/lib/update-gates.ts loadGate, which runs scripts/load-smoke.sh) for one run.
# Usage: load.sh <checkout> <run dir>
# The smoke's home and project dir go to <outside>/load. <outside> is the run's own temp dir that <run>/data/outside
# links to. The first drive.ts or load.sh of the run makes it with mktemp as <os temp dir>/vstack-verify-XXXXXX.
# It is outside the run dir because omp loads project skills from every parent of the cwd, and the run dir is under
# the real home.
# Writes <run>/plugin-load-gate.json and <run>/plugin-load-summary.json. Exit 0 when the gate passed, else 1.
set -euo pipefail
if [ $# -ne 2 ]; then echo "usage: load.sh <checkout> <run dir>" >&2; exit 2; fi
CHECKOUT=$(builtin cd "$1" && pwd -P)
RUN=$(builtin cd "$2" && pwd)
mkdir -p "$RUN/data"
if [ ! -L "$RUN/data/outside" ]; then
  made=$(mktemp -d "$(builtin cd "${TMPDIR:-/tmp}" && pwd -P)/vstack-verify-XXXXXX")
  # Another drive of this run linked its dir first: use that one.
  ln -s "$made" "$RUN/data/outside" 2>/dev/null || rmdir "$made"
fi
OUTSIDE=$(readlink "$RUN/data/outside")
rm -rf "$OUTSIDE/load"
status=0
# shellcheck disable=SC2016 # the script is TypeScript for bun, not shell
bun -e '
const [root, out, gateFile] = process.argv.slice(-3);
const { loadGate } = await import(`${root}/scripts/lib/update-gates.ts`);
const s = loadGate(root, out);
const gate = { load_gate: "passed", checkout: root, skill_commands: s.skillCommands.length, agents: s.agents, tools: s.tools, warnings: s.warnings };
await Bun.write(gateFile, JSON.stringify(gate, null, 2) + "\n");
console.log(JSON.stringify(gate));
' "$CHECKOUT" "$OUTSIDE/load" "$RUN/plugin-load-gate.json" || status=$?
# Keep the smoke summary as proof even when the gate fails, so the failure can be read.
if [ -f "$OUTSIDE/load/summary.json" ]; then cp "$OUTSIDE/load/summary.json" "$RUN/plugin-load-summary.json"; fi
exit "$status"
