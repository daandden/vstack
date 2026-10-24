# Clean worktrees

`/skill:clean-wt` removes unused omp worktrees, clones, and task sandboxes under the omp worktree base. Its script inventories every checkout there with an ownership verdict, work state, unique history, and fingerprint. Its `remove` command removes unused clean checkouts, keeps a linked worktree's branch, and skips anything that changed, holds unique history, or holds work without `--approve`.

## Sub-features

- `cwt-inventory` `inventory` prints `base`, `evidence_gaps`, and one record per checkout with `kind`, `verdict`, `state`, `changes`, `unique_history`, `branch`, and `fingerprint`.
- `cwt-session` from a session with a held lease, `evidence_gaps` is `[]` and an unowned clean checkout is `unused`. Without a held lease, the gap names the lease and the checkout is `uncertain`.
- `cwt-remove-clean` `remove <path>=<fingerprint>` removes an unused clean linked worktree with `git worktree remove` and keeps its branch.
- `cwt-skip-stale` a fingerprint that no longer matches skips the checkout with `it changed since the inventory`.
- `cwt-skip-dirty` dirty work without `--approve` is skipped with `it holds dirty work, and removing it needs --approve`.
- `cwt-skip-unique` a checkout with commits that no other ref holds is skipped, even when it is clean.
- `cwt-approve` `--approve <path>` removes dirty work with `git worktree remove --force` and keeps the branch.
- `cwt-bad-arg` an argument that is not `<path>=<fingerprint>` exits 2 before anything is removed.

## How to get to it (user POV)

- Type `/skill:clean-wt` in an omp session. The agent runs `bun "$(realpath skill://clean-wt/scripts/clean-wt.ts)" inventory` and `remove ...` with the bash tool of that session, which sets `PI_SESSION_ID`.

## Driving it with drive.ts

Preconditions:

- The baseline from `README.md`, and Doctor before the drive.
- The script reads the running session's lease, so every drive here uses `--session`, except the one that proves the missing lease.
- Throwaway repo and base: `F="$VERIFY_RUN_DIR/data/cwt"` and `B="$F/wt"`. Never point `--base` at the real omp worktree base.

Build the fixture. `g` passes a throwaway identity to git:

```sh
g() { git -C "$1" -c user.name=v -c user.email=v@v "${@:2}"; }
git init -q "$F/repo" && g "$F/repo" commit -q --allow-empty -m init
g "$F/repo" worktree add -q -b clean-br "$B/wt-clean"
g "$F/repo" worktree add -q -b dirty-br "$B/wt-dirty" && echo draft > "$B/wt-dirty/draft.txt"
g "$F/repo" worktree add -q --detach "$B/wt-unique" && g "$B/wt-unique" commit -q --allow-empty -m only-here
```

The stub model plays the agent: each `{"tool":"bash"}` reply is one command that the session's bash tool runs. Write the replies with `jq`, so the paths are expanded. `fp <name>` expands to a command substitution that reads that checkout's current fingerprint when the tool runs:

```sh
CW="bun $CHECKOUT/plugin/skills/clean-wt/scripts/clean-wt.ts"
fp() { echo "\$($CW inventory --base $B | jq -r '.checkouts[] | select(.path==\"$B/$1\") | .fingerprint')"; }
jq -n --arg inv "$CW inventory --base $B" \
  --arg bad "$CW remove --base $B $B/wt-clean=nothex; echo exit=\$?" \
  --arg stale "$CW remove --base $B $B/wt-clean=$(printf '0%.0s' $(seq 64))" \
  --arg mix "$CW remove --base $B $B/wt-clean=$(fp wt-clean) $B/wt-dirty=$(fp wt-dirty) $B/wt-unique=$(fp wt-unique)" \
  --arg appr "$CW remove --base $B --approve $B/wt-dirty $B/wt-dirty=$(fp wt-dirty)" \
  '[{tool:"bash",args:{command:$inv}},{tool:"bash",args:{command:$bad}},{tool:"bash",args:{command:$stale}},{tool:"bash",args:{command:$mix}},{tool:"bash",args:{command:$appr}},{text:"done"}]' \
  > "$VERIFY_RUN_DIR/clean-wt-remove-replies.json"
```

Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-wt-remove --session --replies "$VERIFY_RUN_DIR/clean-wt-remove-replies.json" '{"type":"prompt","message":"/skill:clean-wt"}'`. Exit 0 with `model_requests` 6. Save each tool result with `jq -r 'select(.type=="tool_execution_end") | .result.content[0].text' "$VERIFY_RUN_DIR/clean-wt-remove/rpc.jsonl" > "$VERIFY_RUN_DIR/clean-wt-remove-tools.txt"`. The five results, in order:

1. Inventory. `evidence_gaps` is `[]`. All three checkouts are `linked-worktree` and `unused`. `wt-clean` is `clean` on `clean-br`. `wt-dirty` is `dirty` with `changes.untracked` `["draft.txt"]`. `wt-unique` is `clean` with `branch` null and one `unique_history` entry with ref `HEAD`.
2. Bad argument. `clean-wt: <B>/wt-clean=nothex is not <path>=<fingerprint>`, then `exit=2`.
3. Stale fingerprint. `removed` is `[]`, and `skipped` holds `wt-clean` with the reason `it changed since the inventory`.
4. Mixed removal. `removed` holds `wt-clean` with method `git worktree remove`. `skipped` holds `wt-dirty` with `it holds dirty work, and removing it needs --approve`, and `wt-unique` with `it holds commits or stashes that exist nowhere else (HEAD); push or branch them first`.
5. Approved removal. `removed` holds `wt-dirty` with method `git worktree remove --force`.

Then prove the state outside the session. Save `git -C "$F/repo" worktree list --porcelain | grep '^worktree'`, `git -C "$F/repo" branch --list`, and `ls "$B"` as `$VERIFY_RUN_DIR/clean-wt-remove-after.txt`. Only `repo` and `wt-unique` remain registered, `clean-br` and `dirty-br` still exist, and `$B` holds only `wt-unique`.

Session lease. Make a second base `F2="$VERIFY_RUN_DIR/data/fixture"` with one clean linked worktree at `$F2/wt/wt-clean`. Write `[{"tool":"bash","args":{"command":"bun $CHECKOUT/plugin/skills/clean-wt/scripts/clean-wt.ts inventory --base $F2/wt"}},{"text":"done"}]` with the variables expanded to `$VERIFY_RUN_DIR/clean-wt-replies.json`. Drive `'{"type":"prompt","message":"/skill:clean-wt"}'` with `--session --replies "$VERIFY_RUN_DIR/clean-wt-replies.json" --name clean-wt-session`. The `tool_execution_end` text holds `evidence_gaps: []`, and wt-clean is `unused`. Drive it again without `--session`, as `--name clean-wt-no-session`. `evidence_gaps` then holds `the running session's own lease (<session id>) does not show as held under $VERIFY_RUN_DIR/data/home/.omp/run/session-owners`, and wt-clean is `uncertain` with that reason.

## Gotchas

- Without `--session`, every checkout is `uncertain` and `remove` skips all of them. That proves the lease check, not removal.
- The stub model's replies are fixed before the drive, so a fingerprint cannot come from an earlier tool result. `fp` reads it inside the same bash command.
- The fixture lives under `data/`, so Cleanup deletes it. Save the after listing before Cleanup.
- This feature drives the script through the session. The skill's investigation Fan-out and `ask` step need a model that follows the skill, so report them as skipped.
