# Clean worktrees

`/skill:clean-wt` removes unused omp worktrees, clones, and task sandboxes under the omp worktree base. Its script checks ownership before inspecting inactive checkouts and reports work state, unique history, integration evidence, and a fingerprint. Its `remove` command removes unused clean checkouts and verified integrated drafts without unique or unverified artifacts. It keeps linked-worktree branches and skips stale, owned, uncertain, unique-history, and unapproved unresolved work.

## Sub-features

- `cwt-inventory` `inventory` prints `base`, `evidence_gaps`, and one record per checkout with `kind`, `verdict`, `state`, `changes`, `unique_history`, `branch`, and `fingerprint`.
- `cwt-session` from a session with a held lease, `evidence_gaps` is `[]` and an unowned clean checkout is `unused`. Without a held lease, the gap names the lease and the checkout is `uncertain`.
- `cwt-remove-clean` `remove <path>=<fingerprint>` removes an unused clean linked worktree with `git worktree remove` and keeps its branch.
- `cwt-skip-stale` a fingerprint that no longer matches skips the checkout with `it changed since the inventory`.
- `cwt-skip-dirty` unresolved dirty work without `--approve` is skipped. The untracked draft fixture below remains unresolved.
- `cwt-skip-unique` a checkout with commits that no other ref holds is skipped, even when it is clean.
- `cwt-approve` `--approve <path>` removes dirty work with `git worktree remove --force` and keeps the branch.
- `cwt-bad-arg` an argument that is not `<path>=<fingerprint>` exits 2 before anything is removed.
- `cwt-integrated` targeted inventory can qualify dirty tracked contents and untracked files or links for automatic removal when their bytes and modes match the fetched remote HEAD commit, including squash-equivalent changes. Unique or unverified artifacts remain protected. Remote HEAD can differ from the branch checked out in the source repository.
- `cwt-phases` plain inventory discovers inactive work without remote comparisons. Clean automatic removal finishes before source-fact preparation. Separate targeted comparisons share the same prepared source facts.
- `cwt-hidden-index` skip-worktree and assume-unchanged cannot hide unique tracked bytes or post-inventory replacements from inspection or fingerprints. Unavailable verification protects the checkout.

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

## Drive phased integration

Use disposable inactive checkouts with a real remote whose symbolic HEAD differs from the source checkout branch. Include a clean checkout, a squash-equivalent tracked draft, an untracked file and link copied from that remote tree, and independent unique untracked and ignored artifacts. Keep their source branches and external link targets for after-state checks.

Run these commands through the session's bash tool with the fixture's explicit `--base`. Save each stdout and exit separately.

1. Run `inventory`. Only the clean checkout is `automatic`. Dirty records have no `integration` and identify `source_git_dir`.
2. Run `remove <clean-path>=<discovery-fingerprint>` without approval. Prove the clean checkout is absent before starting remote preparation.
3. Run `inventory --prepare-source <source-git-dir>` once per distinct source, or repeat that flag in one call. Save stdout as `$VERIFY_RUN_DIR/source-facts.json`. Its `source_facts` array contains `{source_git_dir,remote,url,ref,sha}` or `{source_git_dir,reason}`.
4. Launch one `inventory --target <path> --source-facts "$VERIFY_RUN_DIR/source-facts.json"` command per remaining checkout separately. Use the same file in all commands. Each returns only its requested checkout and its newly investigated fingerprint. Equivalent tracked drafts and landed untracked copies qualify. Unique or unverified artifacts do not.
5. Run `remove <path>=<targeted-fingerprint>...` without approval for automatic drafts. Prove that only redundant directories disappear, linked branches remain, and unique artifacts and external link targets retain their bytes.

For stale-source evidence, change the remote's advertised HEAD after targeted comparison. Removal with that old fingerprint must skip the target, even with `--approve`. Passing source facts to inventory never replaces removal's independent remote check.

For hidden-index safety, make ordinary shared clones with tracked configuration, set each flag on that configuration, and leave a separate integrated tracked draft. Obtain targeted fingerprints while configuration still matches its index. Replace the flagged bytes afterward. Automatic removal must skip both clones and preserve those unique bytes. Repeat initial inventory with unique hidden bytes and with unreadable hidden contents. They must remain nonautomatic or unknown, respectively.

## Gotchas

- Without `--session`, every checkout is `uncertain` and `remove` skips all of them. That proves the lease check, not removal.
- The stub model's replies are fixed before the drive, so a fingerprint cannot come from an earlier tool result. `fp` reads it inside the same bash command.
- The fixture lives under `data/`, so Cleanup deletes it. Save the after listing before Cleanup.
- This feature drives the script through the session. The skill's investigation Fan-out and `ask` step need a model that follows the skill, so report them as skipped.
