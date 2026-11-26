# Run the PikPak proof

The driver creates one uniquely named folder in the PikPak root. It records the folder ID, name, and parent from the `mkdir` response in `runtime/folder-receipt.json`. The remove request accepts no ID. Before calling `rm`, the driver checks that the parent listing contains the recorded ID and name. It calls `rm` with that ID alone, then checks exit status, one-item acceptance, and absence from a fresh paginated parent listing. It never lists account-wide trash or prints the parent inventory. The consumer launcher cannot create or remove a folder.

## Stage the launcher

1. Record approval for the account operations and fresh native sessions, including reading the root parent for cleanup verification. If approval is missing, follow `skill://tdd`'s Costly seam rule. Use `ask` under `skill://flow-page`'s "Every ask in a Flow" contract, or plain `ask` outside a Flow. Workers return the question to the coordinator. Do not start the live drive without approval. Create a private run directory separate from the checkout and captured evidence. Copy `driver`, `scope.ts`, and `pikpak-rw` into it. Check that the copies match the source bytes and contain no NULs. Keep the directory writable only by the trusted driver operator.
2. Create a mode `0700` directory named `private` next to the launcher. Set `private/pikpak-cli` to the absolute path of the official PikPak CLI v0.6.0 binary. Set `private/rw-token` to `$HOME/.config/vstack-pikpak/rw-token`. Symlinks are fine. Keep token bytes outside Scratch and out of command arguments.
3. Check that the token file belongs to the operator and has mode `0600`, without reading its contents. The launcher needs one nonempty printable `Read & write files` Personal Access Token. Allow Bun on the trusted launcher `PATH`. Call the launcher by absolute path.
4. Create a separate disposable fixture directory. For live OpenPencil saves, use a directory within the approved editor root. Pass the directory's canonical path. The launcher rejects paths outside that directory, including traversal and escaping symlinks. It accepts regular single-link `.fig` uploads and new `.fig` download destinations with no existing `.part` sibling. Make the handoff copy in a private subdirectory of the fixture and verify its SHA-256 before uploading only that copy.

## Run the native cases

```sh
/path/to/install/driver run --preflight /path/to/fixture -- /path/to/trusted-proof-command
```

The proof command runs after the driver confirms the new folder is empty. It receives `PIKPAK_RUN_FOLDER_ID`, `PIKPAK_FIXTURE_DIR`, `PIKPAK_RW`, `PIKPAK_DRIVER`, and `PIKPAK_STATE`, without `PIKPAK_TOKEN`. Give each native consumer only the `PIKPAK_RW` launcher path and the relevant fixture details. For file-mode consumption, request only the exact-ID download and local checks. The token can write, but that does not authorize the consumer to write.

Before starting the file-mode consumer, finish the handoff and all writable checks. Run `"$PIKPAK_DRIVER" download-only "$file_id"` and retain its receipt, including the recorded empty initial CLI home. The launcher then accepts only downloads of that ID to a new `.fig` destination in the fixture directory. The launcher refuses non-download calls before the CLI starts. The driver can still perform receipt-bound cleanup.

The launcher accepts `ls ID [-t CURSOR] -F json`, `get ID -F json`, `upload PATH -p ID -n NAME -w -F json`, and `download ID -o PATH`. The `ls` cursor must come from an in-scope listing. A completed upload registers its file ID before returning so the consumer can download it by exact ID. A listing registers only file entries whose `parent_id` matches the owned folder.

The driver creates distinct empty CLI homes under `runtime/rw-home` for writable and driver commands and `runtime/download-home` for the download-only consumer. Both use the same token. The launcher sets `PIKPAK_DIR`, `PIKPAK_PAT_PATH`, and `PIKPAK_CREDENTIALS` within the selected home. It also sets `HOME`, `XDG_CONFIG_HOME`, and `TMPDIR` to that home. Only the official CLI child gets `PIKPAK_TOKEN`. The launcher disables CLI diagnostic logging, update checks, and skill sync. It redacts the token on stdout and stderr and preserves the CLI exit status.

The driver archives `runtime/state.jsonl` to `last-state.jsonl` and removes both CLI homes after the proof command ends. It attempts receipt-bound remote cleanup even if the archive fails. Retain both outcomes, then remove the private installation. If cleanup fails, preserve the report and exact owned folder ID. The driver cannot clean up after `SIGKILL` or identify a folder if creation succeeded on the server but returned no usable receipt.

## Confirm the live CLI contract

- Record the installed CLI version and help before account operations. With `--preflight`, the driver requests a root page limited to one item and follows the next cursor if present. It never prints the root inventory. If no cursor is returned, record that pagination was not exercised.
- v0.6.0 prints `Move-to-trash request accepted for 1 items` with recovery instructions even with `-F json`. Keep that line with the driver result for the single ID passed to `rm`. Exit 0, one-item acceptance, and absence from a fresh parent listing are all required. Do not query account-wide trash.
- The launcher is a scoped procedure, not isolation from other same-user processes. The stub suite does not establish live provider behavior or native model instruction following.

Run the stub suite with `bun --no-env-file test-launchers.ts suite /absolute/path/to/empty-evidence-dir`. It uses a separate installation with a generated dummy token and `stub-pikpak`. It saves `cases.log` and removes the dummy token after collecting evidence.
