# The installed Flow host replaces itself on update

The user chose this in the `vstack-session-health-review-fa87f3` grill. It implements and extends the host ownership that [ADR 0047](0047-flow-questions-require-a-live-page-and-recoverable-stages.md) accepted but left unbuilt. The host and every CLI must match exactly on flow-page scripts, reader files, and Bun version. Any difference committed content but left the page unavailable until someone stopped the shared host: for about 13 hours in one reviewed session, whose agent ran its worktree's copy of the script, and again after a plugin update during this grill.

The normal Local Flow host follows the installed plugin only. Every copy of the CLI, including one run from a worktree, writes through the installed plugin's code. A worktree that changes flow-page code tests it on an explicitly isolated host. When the installed plugin changes, the host prepares the new version while the last good one keeps serving, then swaps on the same port, credentials, and links. A candidate that fails to start leaves the last good host serving. Open pages save Reader comment drafts and their reading position, then reload to the new reader by themselves. Picker presence may be missing for up to one renewal interval, about ten seconds, after a swap and is not handed over.

Agents still do not restart the shared host as routine repair; the host's own replacement is product behavior, not an agent action.

## Alternatives rejected

- Versioned compatibility instead of exact bytes. Reader changes would stay invisible until a restart, and every format change would need a version decision.
- One host per code version. One Flow would get several links, and two hosts could still read it with different code. ADR 0047 rejected this for normal use.
- A CLI that restarts the host when no other session has a question open. Racing CLIs could restart each other, and open pages with no picker would still be disrupted.
- Let worktree code drive the normal host. One broken build would break every session's page.
- An "Update available" button instead of automatic reload. Pages left open would keep the old reader.
- Hand picker presence over during a swap. Presence is advisory and returns at its next renewal.
