#!/usr/bin/env bash
# Tears down one verification run: stops the processes this run recorded in data/pids, deletes the temp dir that
# data/outside links to, then deletes data/.
# Usage: cleanup.sh <run dir>
# It refuses a run dir that is not under a vstack Scratch verify/ dir. Evidence and notes at the top of the run dir stay.
set -euo pipefail
if [ $# -ne 1 ]; then echo "usage: cleanup.sh <run dir>" >&2; exit 2; fi
RUN=$(builtin cd "$1" && pwd)
case "$RUN" in
  "$HOME"/.vstack/tmp/*/verify/????????-????-????-????-????????????/vstack-*) ;;
  *) echo "cleanup.sh: $RUN is not a run dir under ~/.vstack/tmp/<repo-key>/verify/<session-id>/" >&2; exit 2 ;;
esac
OUTSIDE=$(readlink "$RUN/data/outside" 2>/dev/null || true)
if [ -f "$RUN/data/pids" ]; then
  while read -r pid label; do
    # A recorded PID counts as this run's process only while its cwd is still this run's project dir.
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' || true)
    if [ -n "$OUTSIDE" ] && [ "$cwd" = "$OUTSIDE/proj" ]; then kill "$pid" && echo "stopped $pid ($label)"; fi
  done <"$RUN/data/pids"
fi
if [ -n "$OUTSIDE" ]; then
  case "$OUTSIDE" in
    "$HOME"/*) echo "cleanup.sh: kept $OUTSIDE, it is under the real home" >&2 ;;
    */vstack-verify-??????) rm -rf "$OUTSIDE" && echo "removed $OUTSIDE" ;;
    *) echo "cleanup.sh: kept $OUTSIDE, it is not a vstack-verify-XXXXXX temp dir" >&2 ;;
  esac
fi
rm -rf "$RUN/data"
echo "removed $RUN/data; kept: $(builtin cd "$RUN" && ls -A | tr '\n' ' ')"
