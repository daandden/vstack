#!/usr/bin/env bash
# vstack load smoke: link a plugin dir into a throwaway omp home and dump what a new session loads.
# Usage: [SMOKE_HOME_SEED=<dir>] load-smoke.sh <plugin-dir> [out-dir]
#   SMOKE_HOME_SEED: optional dir copied into the temp home first (e.g. containing .agents/skills/<name>/SKILL.md
#   to prove plugin skills shadow same-name ~/.agents/skills).
# Prints one JSON object (also saved to <out-dir>/summary.json):
#   listedSkills   - skills in the system prompt <skills> list (model-invocable)
#   skillCommands  - every /skill:<name> command (includes hidden skills)
#   hiddenSkills   - skillCommands minus listedSkills
#   extensionCommands - names of Commands with source "extension": vstack's and omp's builtin ones such as autoresearch
#   skillList      - `omp skill list --json` (name, source, hide, filePath, ...)
#   genericRules   - text of <generic-rules> (always-apply rules, full bodies)
#   agents         - names under "# Available Agents" in the task tool description
#   tools          - top-level tool names; xdDevices - tools mounted as xd://<name>
#   warnings       - skill collision warnings
# Needs: omp, jq. Never touches ~/.omp: HOME is a temp dir and the cwd is outside the real home.
set -euo pipefail
PLUGIN=$(cd "$1" && pwd)
OUT=${2:-$(mktemp -d /tmp/vstack-load-smoke.XXXXXX)}
H="$OUT/home"; P="$OUT/proj"
mkdir -p "$H/.omp/agent" "$P"
trap 'rm -rf "$H/.omp/natives"' EXIT
# Clean env: no inherited PI_*/OMP_* vars from a parent omp session, real HOME hidden.
run() { env -i PATH="$PATH" HOME="$H" TERM=dumb "$@"; }
if [ -n "${SMOKE_HOME_SEED:-}" ]; then cp -R "$SMOKE_HOME_SEED"/. "$H"/; fi

(cd "$P" && run omp plugin link "$PLUGIN" >"$OUT/link.txt")
# A session needs some default model to start; this offline stub is never called by the smoke.
cat >"$H/.omp/agent/models.yml" <<'YAML'
providers:
  smoke:
    baseUrl: http://127.0.0.1:9/v1
    apiKey: smoke-dummy-key
    api: openai-completions
    models:
      - id: smoke-model
        name: Smoke Model
        input: [text]
        contextWindow: 200000
        maxTokens: 8192
YAML

printf '%s\n' '{"id":"s","type":"get_state"}' '{"id":"c","type":"get_available_commands"}' |
  (cd "$P" && run omp --mode rpc --no-session --no-title --model smoke/smoke-model >"$OUT/rpc.jsonl" 2>"$OUT/rpc.err")
(cd "$P" && run omp skill list --json >"$OUT/skills.json" 2>>"$OUT/rpc.err")

jq -s --slurpfile sl "$OUT/skills.json" '
  (map(select(.type=="response" and .id=="s"))[0].data) as $st
  | (map(select(.type=="response" and .id=="c"))[0].data.commands) as $cmds
  | ($st.systemPrompt | join("\n")) as $sp
  | ($sp | capture("<skills>\n(?<b>[\\s\\S]*?)</skills>").b // "") as $skb
  | ([$skb | split("\n")[] | capture("^- (?<n>[^:]+):").n]) as $listed
  | ([$cmds[] | select(.source=="skill") | .name | ltrimstr("skill:")]) as $skc
  | ([$st.dumpTools[] | select(.name=="task") | .description][0] // "") as $task
  | {
      listedSkills: $listed,
      skillCommands: $skc,
      hiddenSkills: ($skc - $listed),
      extensionCommands: [$cmds[] | select(.source=="extension") | .name],
      skillList: $sl[0].skills,
      genericRules: ($sp | capture("<generic-rules>\n(?<b>[\\s\\S]*?)</generic-rules>").b // ""),
      agents: [$task | split("# Available Agents")[1] // "" | split("\n")[] | capture("^- `(?<n>[^`]+)`").n],
      tools: [$st.dumpTools[].name],
      xdDevices: [$sp | split("\n")[] | capture("^- xd://(?<n>[^ ]+) ").n],
      warnings: [$sl[0].warnings[]?.message]
    }' "$OUT/rpc.jsonl" | tee "$OUT/summary.json"
