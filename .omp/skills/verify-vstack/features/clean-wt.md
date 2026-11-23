# Clean worktrees

`/skill:clean-wt` inventories native omp entries and `omp-*` ovnfs checkouts across repositories from any directory, including outside Git. It resolves each checkout's source independently of the invocation directory. Its script checks ownership before inspecting inactive contents and reports work state, unique history, integration evidence, and a fingerprint. Its `remove` command removes unused clean checkouts and verified integrated drafts without unique or unverified artifacts. It keeps linked-worktree branches and skips stale, owned, uncertain, unique-history, source-dependent, and unapproved unresolved work.

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
- `cwt-ovnfs` inventories `omp-*` ovnfs checkouts across repositories and follows their source chains. Native `parentRepo`, task-session ancestry, and Git alternates also establish origins. Missing or cyclic origins remain uncertain. Named and verifier entries remain visible but excluded from removal. Private Git state and history override an empty ovnfs diff. Removal uses `ovnfs --json rm --force --sticky-snapshots` and keeps snapshots.
- `cwt-native-completion` native removal can finish before mounted metadata disappears. The script observes bounded directory disappearance without repeating removal and rechecks native identity before reporting success.
- `cwt-discovery` external verifier-session directories reveal saved leased child headers. Git and non-Git invocation directories yield the same global inventory. Native entries outside supported layouts remain visible with protection reasons.
- `cwt-progress` `--progress` writes JSONL diagnostics to stderr while stdout stays JSON. Diagnostics identify the current phase, actual content reads, and ownership blockers.
- `cwt-approval-plan` the approval planner turns investigated eligible targets into bounded Flow contributions and preserves their inspected path and fingerprint. Planning never publishes, selects, or deletes targets.
- `cwt-source-guard` every entry in the full ovnfs listing protects its native, task-wrapper, or ovnfs source, including sources of named and verifier dependents. Removal refreshes this evidence. A stale fingerprint or dirty-work approval cannot override a new dependent.

## How to get to it (user POV)

- Type `/skill:clean-wt` in an omp session. The agent runs `bun "$(realpath skill://clean-wt/scripts/clean-wt.ts)" inventory` and `remove ...` with the bash tool of that session, which sets `PI_SESSION_ID`.

## Driving it with drive.ts

Preconditions:

- The baseline from `README.md`, and Doctor before the drive.
- The script reads the running session's lease, so every drive here uses `--session`, except the one that proves the missing lease.
- Throwaway repo and base: `F="$VERIFY_RUN_DIR/data/cwt"` and `B="$F/wt"`. Never point `--base` at the real omp worktree base. The base does not restrict ovnfs discovery. Remove only this run's explicitly named disposable targets, and preserve unrelated inventory records.

Step `clean-wt-fixture`: Build the fixture. `g` passes a throwaway identity to git:

```sh
g() { git -C "$1" -c user.name=v -c user.email=v@v "${@:2}"; }
git init -q "$F/repo" && g "$F/repo" commit -q --allow-empty -m init
g "$F/repo" worktree add -q -b clean-br "$B/wt-clean"
g "$F/repo" worktree add -q -b dirty-br "$B/wt-dirty" && echo draft > "$B/wt-dirty/draft.txt"
g "$F/repo" worktree add -q --detach "$B/wt-unique" && g "$B/wt-unique" commit -q --allow-empty -m only-here
```

The stub model plays the agent: each `{"tool":"bash"}` reply is one command that the session's bash tool runs. Set every call's `cwd` to the disposable source repository for this legacy removal drive. The global CLI proof below also runs from a disposable non-Git directory. Write the replies with `jq`, so the paths are expanded. `fp <name>` expands to a command substitution that reads that checkout's current fingerprint when the tool runs:

```sh
CW="bun $CHECKOUT/plugin/skills/clean-wt/scripts/clean-wt.ts"
fp() { echo "\$($CW inventory --base $B | jq -r '.checkouts[] | select(.path==\"$B/$1\") | .fingerprint')"; }
jq -n --arg cwd "$F/repo" --arg inv "$CW inventory --base $B" \
  --arg bad "$CW remove --base $B $B/wt-clean=nothex; echo exit=\$?" \
  --arg stale "$CW remove --base $B $B/wt-clean=$(printf '0%.0s' $(seq 64))" \
  --arg mix "$CW remove --base $B $B/wt-clean=$(fp wt-clean) $B/wt-dirty=$(fp wt-dirty) $B/wt-unique=$(fp wt-unique)" \
  --arg appr "$CW remove --base $B --approve $B/wt-dirty $B/wt-dirty=$(fp wt-dirty)" \
  '[{tool:"bash",args:{command:$inv,cwd:$cwd}},{tool:"bash",args:{command:$bad,cwd:$cwd}},{tool:"bash",args:{command:$stale,cwd:$cwd}},{tool:"bash",args:{command:$mix,cwd:$cwd}},{tool:"bash",args:{command:$appr,cwd:$cwd}},{text:"done"}]' \
  > "$VERIFY_RUN_DIR/clean-wt-remove-replies.json"
```

Step `clean-wt-remove`: Run `bun "$SKILL_DIR/scripts/drive.ts" --plugin "$CHECKOUT/plugin" --run "$VERIFY_RUN_DIR" --name clean-wt-remove --session --replies "$VERIFY_RUN_DIR/clean-wt-remove-replies.json" '{"type":"prompt","message":"/skill:clean-wt"}'`. Exit 0 with `model_requests` 6. Save each tool result with `jq -r 'select(.type=="tool_execution_end") | .result.content[0].text' "$VERIFY_RUN_DIR/clean-wt-remove/rpc.jsonl" > "$VERIFY_RUN_DIR/clean-wt-remove-tools.txt"`. The five results, in order:

1. Step `clean-wt-remove-inventory`: Inventory. `evidence_gaps` is `[]`. All three checkouts are `linked-worktree` and `unused`. `wt-clean` is `clean` on `clean-br`. `wt-dirty` is `dirty` with `changes.untracked` `["draft.txt"]`. `wt-unique` is `clean` with `branch` null and one `unique_history` entry with ref `HEAD`.
2. Step `clean-wt-remove-bad-argument`: Bad argument. `clean-wt: <B>/wt-clean=nothex is not <path>=<fingerprint>`, then `exit=2`.
3. Step `clean-wt-remove-stale`: Stale fingerprint. `removed` is `[]`, and `skipped` holds `wt-clean` with the reason `it changed since the inventory`.
4. Step `clean-wt-remove-mixed`: Mixed removal. `removed` holds `wt-clean` with method `git worktree remove`. `skipped` holds `wt-dirty` with `it holds dirty work, and removing it needs --approve`, and `wt-unique` with `it holds commits or stashes that exist nowhere else (HEAD); push or branch them first`.
5. Step `clean-wt-remove-approved`: Approved removal. `removed` holds `wt-dirty` with method `git worktree remove --force`.

Step `clean-wt-remove-after`: Then prove the state outside the session. Save `git -C "$F/repo" worktree list --porcelain | grep '^worktree'`, `git -C "$F/repo" branch --list`, and `ls "$B"` as `$VERIFY_RUN_DIR/clean-wt-remove-after.txt`. Only `repo` and `wt-unique` remain registered, `clean-br` and `dirty-br` still exist, and `$B` holds only `wt-unique`.

Step `clean-wt-session-lease`: Session lease. Make a second base `F2="$VERIFY_RUN_DIR/data/fixture"` with one clean linked worktree at `$F2/wt/wt-clean`. Write `[{"tool":"bash","args":{"command":"bun $CHECKOUT/plugin/skills/clean-wt/scripts/clean-wt.ts inventory --base $F2/wt","cwd":"$F2/repo"}},{"text":"done"}]` with the variables expanded to `$VERIFY_RUN_DIR/clean-wt-replies.json`. Drive `'{"type":"prompt","message":"/skill:clean-wt"}'` with `--session --replies "$VERIFY_RUN_DIR/clean-wt-replies.json" --name clean-wt-session`. The `tool_execution_end` text holds `evidence_gaps: []`, and wt-clean is `unused`. Drive it again without `--session`, as `--name clean-wt-no-session`. `evidence_gaps` then names the missing running-session lease and wt-clean is `uncertain`.

## Drive phased integration

Use disposable inactive checkouts with a real remote whose symbolic HEAD differs from the source checkout branch. Include a clean checkout, a squash-equivalent tracked draft, an untracked file and link copied from that remote tree, and independent unique untracked and ignored artifacts. Keep their source branches and external link targets for after-state checks.

Run these commands through the session's bash tool with the fixture's explicit `--base`. Save each stdout and exit separately.

1. Step `clean-wt-phased-inventory`: Run `inventory`. Only the clean checkout is `automatic`. Dirty records have no `integration` and identify `source_git_dir`.
2. Step `clean-wt-phased-clean`: Run `remove <clean-path>=<discovery-fingerprint>` without approval. Prove the clean checkout is absent before starting remote preparation.
3. Step `clean-wt-phased-source-facts`: Run `inventory --prepare-source <source-git-dir>` once per distinct source, or repeat that flag in one call. Save stdout as `$VERIFY_RUN_DIR/source-facts.json`. Its `source_facts` array contains `{source_git_dir,remote,url,ref,sha}` or `{source_git_dir,reason}`.
4. Step `clean-wt-phased-targeted`: Launch one `inventory --target <path> --source-facts "$VERIFY_RUN_DIR/source-facts.json"` command per remaining checkout separately. Use the same file in all commands. Each returns only its requested checkout and its newly investigated fingerprint. Equivalent tracked drafts and landed untracked copies qualify. Unique or unverified artifacts do not.
5. Step `clean-wt-phased-remove`: Run `remove <path>=<targeted-fingerprint>...` without approval for automatic drafts. Prove that only redundant directories disappear, linked branches remain, and unique artifacts and external link targets retain their bytes.

Step `clean-wt-phased-stale-source`: For stale-source evidence, change the remote's advertised HEAD after targeted comparison. Removal with that old fingerprint must skip the target, even with `--approve`. Passing source facts to inventory never replaces removal's independent remote check.

Step `clean-wt-phased-hidden-index`: For hidden-index safety, make ordinary shared clones with tracked configuration, set each flag on that configuration, and leave a separate integrated tracked draft. Obtain targeted fingerprints while configuration still matches its index. Replace the flagged bytes afterward. Automatic removal must skip both clones and preserve those unique bytes. Repeat initial inventory with unique hidden bytes and with unreadable hidden contents. They must remain nonautomatic or unknown, respectively.

## Drive real ovnfs leftovers

Preconditions: real omp 18.17, an installed ovnfs with its daemon running, and Doctor passing. Start a fresh omp process for this proof. A session started before ovnfs was installed can still use APFS for isolation.

Step `clean-wt-ovnfs-fixture`: Use a disposable source Git repository under `$VERIFY_RUN_DIR/data/`, with a committed tracked file and a separate empty omp base. Create a checkout with `ovnfs --json new <source> --name omp-cwt-<run-id>` and save the returned name and path. This fixture uses omp's naming without creating or deleting another run's checkout. Keep the checkout after creation and write an untracked `draft.txt` there. Then run `ovnfs --json snap omp-cwt-<run-id> -m cwt --wait` and save the snapshot id.

Drive the checkout's clean-wt CLI through `drive.ts --session` in a new omp process. Give each bash call `cwd` set to the disposable source repository, an explicit `--base`, and `timeout: 0`. Capture `ovnfs --json status` under the calling home. Prefix the CLI commands with its `state` as `OVNFS_STATE` and `mount` as `OVNFS_MOUNT`, so the throwaway HOME uses the same running daemon.

1. Step `clean-wt-ovnfs-inventory`: Run `inventory` and save its JSON. The kept checkout is `kind: ovnfs`, `verdict: unused`, `state: dirty`, and `automatic: false`. Its `changes.untracked` contains `draft.txt`, and its `source_git_dir` identifies the disposable source. Before any removal, save the exact commands, stdout, stderr, and exit codes for `cat "<checkout>/.git"`, `git -C "<checkout>" rev-parse --path-format=absolute --git-dir`, and `test -d "<resolved-private-git-dir>"`. Require a `.git` file, a resolved private Git directory distinct from the disposable source's Git directory, and an existence check that exits 0. Preserve that absolute private Git path outside `data/` for the after-removal check.
2. Step `clean-wt-ovnfs-skip`: Run `remove <path>=<fingerprint>` without approval. It reports no removal and skips the dirty checkout. Read `draft.txt` separately to prove its bytes remain.
3. Step `clean-wt-ovnfs-approved`: For this disposable fixture only, run `remove --approve <path> <path>=<fingerprint>` with the same fingerprint. This scripted flag proves the removal command, not human consent or the skill's picker.
4. Step `clean-wt-ovnfs-final`: Save a final inventory, a real `ovnfs --json ls`, and a directory-existence check. The checkout is absent from all three, and removal reports method `ovnfs rm`. Run `test -d "<resolved-private-git-dir>"` against the exact path captured before removal and retain its command, stdout, stderr, and exit code. Require that private Git directory to be absent after removal. The snapshot saved before step 1 remains in the listing's `snapshots`. Drop that snapshot with `ovnfs drop <id>` after saving the evidence. Leave unrelated checkouts, snapshots, and session archives unchanged.

The common CLI suite covers legacy APFS copies and linked worktrees alongside these ovnfs cases. Keep the legacy live recipe above. Never use `omp worktree clear` for this proof.

## Drive a verified squash draft

Step `clean-wt-ovnfs-squash-fixture`: Use a separate disposable fixture under `"$VERIFY_RUN_DIR/data/squash"`. Use a new `NAME=omp-cwt-squash-<run-id>`. Make the established source, a local bare origin, and a standalone checkout under the fixture's omp base:

```sh
	F="$VERIFY_RUN_DIR/data/squash"
	B="$F/wt"
	S="$F/source"
	N="$B/wt-standalone"
	g() { git -C "$1" -c user.name=Verify -c user.email=verify@example.invalid "${@:2}"; }
	mkdir -p "$F" "$B"
	git init -q -b main "$S"
	printf 'base\n' > "$S/content.txt"
	g "$S" add content.txt
	g "$S" commit -qm base
	git clone -q --shared "$S" "$N"
	g "$N" remote remove origin
	git init -q --bare -b main "$F/origin.git"
	g "$S" remote add origin "$F/origin.git"
	ovnfs --json new "$N" --name "$NAME" > "$VERIFY_RUN_DIR/squash-open.json"
	P=$(jq -er .checkout.path "$VERIFY_RUN_DIR/squash-open.json")
	printf 'feature\n' > "$P/content.txt"
	g "$P" commit -qam feature
	g "$S" fetch "$P" HEAD:refs/tags/preserved-draft
	g "$S" merge --squash preserved-draft
	printf 'integrated draft\n' > "$S/draft.txt"
	g "$S" add draft.txt
	g "$S" commit -qm squash
	g "$S" push -q origin main
	cp "$S/draft.txt" "$P/draft.txt"
	ovnfs --json snap "$NAME" -m cwt-squash --wait > "$VERIFY_RUN_DIR/squash-snapshot.json"
```

Preserve the ref outputs: `git -C "$S" rev-parse preserved-draft` equals the checkout's draft commit. `git -C "$N" for-each-ref --contains <draft-commit>` is empty. The established source preserves the exact history under its own tag, while ovnfs checks the direct source. The squash commit on remote `main` independently preserves the contents.

Step `clean-wt-ovnfs-squash-refuses-plain`: Run `ovnfs --json rm --sticky-snapshots "$NAME"` against only this fixture. Require ovnfs to refuse and leave the checkout and snapshot intact. Stop if it does not. Save its exit code and output.

Step `clean-wt-ovnfs-squash-remove`: In a fresh `drive.ts --session`, use the status-derived namespace and `$B` as in the prior ovnfs recipe. Run `inventory --prepare-source "$S/.git"` and save the JSON. Run `inventory --target "$P" --source-facts <saved JSON>` and retain its JSON. Require `kind: ovnfs`, `automatic: true`, `integration.status: verified`, `source_git_dir` equal to `"$S/.git"`, and empty `unique_history`. Run `remove <path>=<targeted-fingerprint>` with no `--approve`. Require a successful removal and a later listing and directory check to show the checkout absent. Require the saved snapshot ID still present and the tag unchanged. Drop only the fixture snapshot after retaining the evidence.

Step `clean-wt-ovnfs-unsupported-flags`: Run `bun test --timeout 30000 tests/clean-wt.test.ts -t 'unsupported ovnfs rm flags'`. The process-boundary fixture rejects the new flags. Require the exact error to reach the `failed` entry, no second removal attempt, and the checkout and snapshot to remain. This does not require an older daemon.

## Drive recovery and bounded approval

Use disposable fixture repositories and native executable stand-ins for these CLI regressions. They exercise the production scripts and real Git. They do not prove that a model follows the skill or that a human consents.

Step `clean-wt-discovery-coverage`: Run `bun test --timeout 30000 tests/clean-wt.test.ts tests/checkout-locator-cleanup.test.ts`. Inspect the named external saved-session, native exclusion, global Git and non-Git inventory, delayed native-directory visibility, and mid-run ownership cases. Owned and uncertain targets remain, excluded entries have protection reasons, snapshots survive delayed completion, and no real checkout is a fixture.

Step `clean-wt-global-source-guard`: Run `bun test --timeout 30000 tests/clean-wt.test.ts -t 'machine-wide inventory|ovnfs origin follows archived sessions|source stays protected by every ovnfs dependent|cyclic or missing origin evidence'`. Retain stdout, stderr, and the exit code. Require these named CLI cases to pass:

- `machine-wide inventory resolves two repositories equally from Git and non-Git directories` proves identical inventories from both repositories and outside Git. Native `parentRepo` establishes each source. Nested ovnfs sources resolve to the correct repository, unknown sources remain uncertain, and progress records one read of each native listing and one inspection per checkout. Removal from outside Git removes only the requested disposable clone.
- `ovnfs origin follows archived sessions across repositories and retains missing sources` proves archived ancestry and cross-repository source resolution. An unreadable removed source without ancestry stays uncertain.
- `a %s source stays protected by every ovnfs dependent, including one added after inventory` covers `linked`, `task`, and `ovnfs` sources. Named and verifier dependents protect their sources, including a nested source inside a task wrapper. A dependent created after inventory blocks removal with the old fingerprint even when `--approve` names that source. Both source and dependent remain, and the linked branch remains.
- `cyclic or missing origin evidence keeps native and ovnfs checkouts uncertain` proves native and ovnfs cycles and missing native origin evidence stay nonautomatic, with no content inspection or fingerprint. Approval does not bypass the uncertainty.

The full CLI suite also retains `a task clone that copied the source repo's git dir is compared with the checkout its parent session ran in` and `a task clone whose parent session's directory was removed takes its source from alternates`. Require both to pass in `clean-wt-discovery-coverage`. These deterministic cases complement, rather than replace, the real session and ovnfs journeys.

Step `clean-wt-task-source-chains`: Run `bun test --timeout 30000 tests/clean-wt.test.ts -t 'a task from an'`. Retain stdout, stderr, and the exit code. All four cases must pass. A task copied from an ovnfs checkout or another task resolves session ancestry and Git alternates to the established repository's `source_git_dir`. Identical ignored `.env` bytes in the immediate parent and child remain clean and automatic, even when the established repository has no copy. Breaking the ultimate source keeps the child uncertain, with no content inspection or fingerprint.

Step `clean-wt-native-completion`: Run `bun test --timeout 30000 tests/clean-wt.test.ts -t 'ovnfs removal waits for mounted directory visibility'`. The native boundary fixture retires the listing before its mounted directory disappears. Cleanup must wait for disappearance, preserve the snapshot, and issue removal only once. The real ovnfs approved/final journey remains required alongside this deterministic regression.

Step `clean-wt-approval-plan`: Run `bun test --timeout 30000 tests/clean-wt-approval.test.ts`. The production planner receives 31 investigated targets and returns contributions with 26 and 5 options. The current Flow CLI validates and submits each contribution in an isolated home. A scripted empty response leaves the first question open. A scripted second-round E pick records target 31's generated label and preserves its original path and fingerprint mapping. These scripted responses are not human consent. Protected, duplicate, noncanonical, or incomplete evidence is rejected without a partial plan. No option is preselected and no target is deleted.

Step `clean-wt-read-budget`: Run `bun test --timeout 30000 tests/clean-wt.test.ts -t 'large ignored trees keep fresh cleanup guards'`. Retain the printed workload and per-operation files, bytes, and elapsed milliseconds. These counters cover script-owned content reads, not Git subprocess I/O. The lifecycle must satisfy the fixture's read budget while retaining final content, ownership, history, and fingerprint checks.

Step `clean-wt-parent-vs-head`: Compare the captured red runs with the passing head CLI cases for machine-wide Git and non-Git inventory, native and ovnfs uncertain origins, and full-list source dependency protection. Retain existing comparison evidence for saved external headers, native exclusions, 31-target approval, and the identical ignored-tree workload. Read the base implementation to establish the changed paths. Preserve source revisions and observations separately. A timing sample alone does not establish a general speedup.

## Gotchas

- Without `--session`, every checkout is `uncertain` and `remove` skips all of them. That proves the lease check, not removal.
- The stub model's replies are fixed before the drive, so a fingerprint cannot come from an earlier tool result. `fp` reads it inside the same bash command.
- The fixture lives under `data/`, so Cleanup deletes it. Save the after listing before Cleanup.
- This feature drives the script through the session. The skill's investigation Fan-out and `ask` step need a model that follows the skill, so report them as skipped.
- The stub driver answers standalone, tool-less omp capability probes for `17 times 23` with `391` without consuming scenario replies. Require actual `tool_execution_end` evidence for the cleanup commands. Transport success alone does not prove that they ran.
