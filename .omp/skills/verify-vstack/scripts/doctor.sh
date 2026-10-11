#!/usr/bin/env bash
# Read-only check of one verification run: tools, the checkout build, the throwaway omp home, and live processes.
# Usage: doctor.sh <checkout> <run dir>
# Prints one "ok" or "FAIL" line per check and exits 1 when a check fails. It changes nothing.
set -uo pipefail
if [ $# -ne 2 ]; then echo "usage: doctor.sh <checkout> <run dir>" >&2; exit 2; fi
CHECKOUT=$(builtin cd "$1" && pwd) || exit 2
RUN=$2
HOME_DIR="$RUN/data/home"
OUTSIDE=$(readlink "$RUN/data/outside" 2>/dev/null)
fail=0
ok() { echo "ok   $*"; }
bad() { echo "FAIL $*"; fail=1; }

for tool in omp bun jq git; do
  if command -v "$tool" >/dev/null; then ok "$tool: $("$tool" --version 2>&1 | head -1)"; else bad "$tool is not on PATH"; fi
done

name=$(jq -r .name "$CHECKOUT/plugin/package.json" 2>/dev/null)
version=$(jq -r .version "$CHECKOUT/plugin/package.json" 2>/dev/null)
if [ "$name" = vstack ]; then ok "checkout $CHECKOUT: plugin vstack $version at $(git -C "$CHECKOUT" rev-parse --short HEAD), $(git -C "$CHECKOUT" status --porcelain -- plugin | wc -l | tr -d ' ') uncommitted plugin path(s)"
else bad "$CHECKOUT/plugin/package.json does not name vstack"; fi

if [ -n "$OUTSIDE" ]; then
  case "$OUTSIDE" in
    "$HOME"/*) bad "the project dir $OUTSIDE/proj is under the real home, so omp also loads ~/.claude and ~/.agents skills" ;;
    *) ok "project dir $OUTSIDE/proj is outside the real home" ;;
  esac
fi

if [ ! -d "$HOME_DIR" ]; then
  ok "no throwaway home yet at $HOME_DIR (the first drive creates it)"
else
  target=$(readlink "$HOME_DIR/.omp/plugins/node_modules/vstack" 2>/dev/null)
  if [ "$target" = "$CHECKOUT/plugin" ]; then ok "throwaway home links vstack to $target"
  else bad "throwaway home links vstack to '${target:-nothing}', not $CHECKOUT/plugin"; fi
  listed=$(builtin cd "$OUTSIDE/proj" 2>/dev/null && env -i PATH="$PATH" HOME="$HOME_DIR" TERM=dumb omp plugin list 2>&1 | grep -o 'vstack@[0-9.]*')
  if [ "$listed" = "vstack@$version" ]; then ok "omp in the throwaway home lists $listed"; else bad "omp in the throwaway home lists '${listed:-no vstack}', want vstack@$version"; fi
  base=$(grep -o 'baseUrl: .*' "$HOME_DIR/.omp/agent/models.yml" 2>/dev/null)
  case "$base" in
    "baseUrl: http://127.0.0.1:"*) ok "the only model provider is the local stub ($base), so no real credential is in the home" ;;
    *) bad "models.yml provider is '${base:-missing}', want a 127.0.0.1 stub" ;;
  esac
fi

if [ -f "$RUN/data/pids" ]; then
  while read -r pid label; do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    if [ -n "$OUTSIDE" ] && [ "$cwd" = "$OUTSIDE/proj" ]; then
      ports=$(lsof -nP -a -p "$pid" -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $9}' | tr '\n' ' ')
      echo "live $pid ($label) listening on: ${ports:-nothing}"
    else
      ok "pid $pid ($label) has exited"
    fi
  done <"$RUN/data/pids"
fi
exit $fail
