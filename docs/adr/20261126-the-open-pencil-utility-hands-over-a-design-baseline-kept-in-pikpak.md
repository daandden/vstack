# The open-pencil Utility hands over a Design baseline kept in PikPak

The user chose this in the grill of the Flow `ui-sdk-openpencil-design` on 2026-11-26, after three independent architecture attempts and a prototype on the user's machine. vstack adds a vstack-original visible Utility skill, `open-pencil`, that owns every use of the OpenPencil MCP server: designing in an explicit document, page, and frames, and turning the agreed frames into a Design baseline. The Design baseline is the agreed .fig file itself, not PNG exports. The skill uploads it once to the user's PikPak storage with the official PikPak CLI, named by its SHA-256 and reused when that name already exists, and the spec records the PikPak file ID, the SHA-256, and the agreed frame node IDs. implement and Verify download it by file ID with a read-only Personal Access Token, check the SHA-256, and render the frames with the OpenPencil CLI. They need neither the desktop app nor the MCP server. The handoff uses a separate read-write token.

The spec carries the handoff, so grill-with-docs, to-spec, to-tickets, implement, Verify, and setup-vstack keep their text. The skill reads OpenPencil's behaviour annotations as design intent and maps them to the project's UI SDK components, per [ADR 20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now](20261126-web-fullstack-recommends-ui-sdk-and-the-reader-keeps-reka-for-now.md), instead of following OpenPencil's own Reka recipe.

## Considered Options

- **A Design tool section in setup-vstack, read live by each Matt stage**: rejected. MCP details would spread into four Matt skills, Verify would depend on a running editor, and a project config cannot say which revision a change accepted.
- **PNG exports as the baseline, or the baseline committed to the target repo's Git**: rejected. The user holds the .fig file to be the agreed understanding and keeps it in PikPak.
- **rclone, either its pikpak backend or `rclone serve s3` behind OpenPencil's S3 storage**: rejected after the prototype. OpenPencil's editor never completed an upload to the bridge, and rclone's password login ended the official CLI's session.
- **One read-write token for every step**: rejected. A leaked Verifier token could then change or trash baselines.

## Consequences

- vstack stores no PikPak credential. `PIKPAK_TOKEN` comes from the user's environment, and a missing or expired token is a blocker, not a fallback.
- PikPak keeps no file versions, so baselines are create-only and never overwritten.
- OpenPencil's desktop app cannot write into dot directories such as omp worktrees or Scratch, so the skill saves designs to an ordinary folder or uses the document's existing path.
- The Flow reader's Doop compact design is unaffected.
