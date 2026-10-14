# Code Archaeology (git + in-repo)

## What this source contains

- Commit history (messages, dates, authors, diffs)
- PR descriptions, review comments, and discussion threads (via the profile's code-host CLI)
- Inline code comments, TODOs, FIXMEs, deprecation notes
- ADRs (architectural decision records) if the repo keeps them
- Tests, whose names and assertions often encode the edge cases that motivated a change
- Related files modified in the same commits (co-change signal)
- CHANGELOG entries and release notes in the repo
- Issue/ticket IDs in commit messages and PR bodies

The most trustworthy source, tied directly to the code, and the most complete. Everything that went through the repo should be here.

## How to search it

Expand the seed commit list:

```bash
# History through renames
git log --follow --oneline -- <file>

# Pickaxe: commits that added or removed this exact text
git log -S '<exact_string_from_code>' -- <file>

# Or for patterns:
git log -G '<regex>' -- <file>

# Who wrote each line and when
git blame -L <start>,<end> <file>

# One commit's full diff
git show <hash>

# Commits between two points affecting this file
git log <old>..<new> -p -- <file>
```

For each substantive commit, follow the repo profile:

| Code host | Review reference | Read review context |
|---|---|---|
| GitHub | `(#1234)` | `gh pr view <number> --json title,body,author,createdAt,mergedAt,labels,closingIssuesReferences,comments,reviews,files` |
| GitLab, including self-hosted | `!1234` | `glab mr view <iid> --comments` |
| Other or no remote | Commit hash | Git only. Record unavailable review history as a gap. |

An unavailable or unauthenticated CLI is a gap, not an empty search. Use the profile's host for the CLI commands.

Look for out-of-band docs:

Use `find` for ADRs and related tests, then `grep` for known symbols and nearby TODO, FIXME, HACK, XXX, or NOTE text. Read the matching files with `read`.