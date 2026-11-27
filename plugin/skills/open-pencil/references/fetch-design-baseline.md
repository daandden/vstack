# Fetch and verify a Design baseline

## Fetch for implement or Verify

Use the PikPak file ID and full SHA-256 in the spec. Use the official PikPak CLI with the same `Read & write files` Personal Access Token as handoff. Supply it privately as `PIKPAK_TOKEN` to the CLI process only. Keep it out of command arguments, logs, transcripts, and vstack files. Use no cached login or other store. The token can write, but this fetch authorizes only a download.

PikPak accepted a file upload with a `Read files` token in the live proof, so a second token did not enforce write protection. Verify integrity using the exact file ID and agreed SHA-256.

```sh
pikpak download "$file_id" -o "$downloaded_fig"
shasum -a 256 "$downloaded_fig"
```

Download to a new path and compare the full SHA-256 with the spec before using the `.fig`. Stop if the token is missing or expired, PikPak is unreachable, the download fails, or the hash differs. Name the failing step and file ID when known. On a mismatch, include both hashes. The user regenerates an expired token. Do not substitute the active document, regenerate the baseline, or obtain a copy from another store. Fetch does not require the OpenPencil desktop app or MCP server.

## Verify renders and checks the build

Verify needs the official PikPak CLI, the OpenPencil CLI, the token and access to the PikPak file, and the required fonts. After the byte check, export each agreed frame by its exact node ID. Pass the verified file path to select file mode.

```sh
openpencil export "$downloaded_fig" --node "$node_id" -f png --font-policy strict -o "$frame_png"
```

If strict resolution fails, name the missing faces and stop the render. Use `openpencil fonts "$downloaded_fig" --json` to identify unresolved faces if needed. Do not relax the font policy or switch to the live document. Compare each rendered frame with a browser capture at the same viewport and theme. Record the node ID, viewport, theme, and differences. Drive keyboard, focus, and form behavior separately against the spec. A matching image does not prove behavior.

If a UI SDK beta breaks an agreed behavior, keep the last proven package lock and report the failure to the current owner. Do not switch to Reka.
