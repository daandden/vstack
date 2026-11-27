# The open-pencil Utility hands over a Design baseline kept in PikPak

> Amended by [ADR 20261127-vstack-designs-with-openpencil-and-the-reader-theme-holds-the-compact-design](20261127-vstack-designs-with-openpencil-and-the-reader-theme-holds-the-compact-design.md). vstack no longer uses Doop, and a later change to the Flow reader's design goes through this Utility.

The user chose this in the grill of the Flow `ui-sdk-openpencil-design` on 2026-11-26, after three independent architecture attempts and a prototype on the user's machine. vstack adds a vstack-original visible Utility skill, `open-pencil`, that owns every use of the OpenPencil MCP server. It works on an explicit document, page, and frames. The Design baseline is the agreed saved `.fig` file, not a PNG export. The skill creates or reuses the file in the user's PikPak storage with the official CLI, named by its SHA-256. The spec records the PikPak file ID, SHA-256, and agreed frame node IDs. Implement and Verify download it by file ID and check the SHA-256. Verify renders the frames with the OpenPencil CLI. Neither needs the desktop app nor the MCP server.

The spec carries the handoff, so grill-with-docs, to-spec, to-tickets, implement, Verify, and setup-vstack keep their text. The skill reads OpenPencil's behaviour annotations as design intent and maps them to the project's UI SDK components, per [ADR 20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now](20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md), instead of following OpenPencil's own Reka recipe.

## Considered Options

- **A Design tool section in setup-vstack, read live by each Matt stage**: rejected. MCP details would spread into four Matt skills, Verify would depend on a running editor, and a project config cannot say which revision a change accepted.
- **PNG exports as the baseline, or the baseline committed to the target repo's Git**: rejected. The user holds the .fig file to be the agreed understanding and keeps it in PikPak.
- **rclone, either its pikpak backend or `rclone serve s3` behind OpenPencil's S3 storage**: rejected after the prototype. OpenPencil's editor never completed an upload to the bridge, and rclone's password login ended the official CLI's session.
- **One read-write token for every step**: initially rejected because a leaked Verifier token could change or trash baselines. The amendment below supersedes that decision.

## Consequences

- vstack stores no PikPak credential. Supply `PIKPAK_TOKEN` privately to the PikPak CLI process only. A missing or expired token is a blocker, not a fallback.
- PikPak keeps no file versions, so baselines are create-only and never overwritten.
- OpenPencil's desktop app cannot write into dot directories such as omp worktrees or Scratch, so the skill saves designs to an ordinary folder or uses the document's existing path.
- The Flow reader's Doop compact design is unaffected.

## 2026-11-26 amendment: one PikPak token

The maintainer reversed the token split in Flow `ui-sdk-openpencil-design-a255d8`, question 26. In the #621 live proof, the official PikPak CLI v0.6.0 completed an upload with the `Read files` token in an isolated CLI home. A fresh folder listing showed the new file ID. The second token did not enforce write protection in that run.

Use one `Read & write files` Personal Access Token for handoff, implement, and Verify. Fetching from the spec authorizes a download, not a remote write. The token still has write access. Integrity checks use the exact file ID and the SHA-256 of the saved file the user agreed to. Handoff does not resave the file. The remote name remains create-only.
