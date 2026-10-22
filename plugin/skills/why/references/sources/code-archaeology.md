# Code Archaeology (git + in-repo)

## What this source contains

- Commit history (messages, dates, authors, diffs)
- PR descriptions, review comments, and discussion threads (through the profile's Code host tool)
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

For each substantive commit, find its review reference in the commit title, in the form that the profile's `code-host.md` names. Read its review context through `read-pr` and `review-threads`. For a CLI config, run its command rows. For an MCP config, choose tools from the named server's current descriptions and parameter schemas, using the profile's project facts; operation rows are not required. Without a `code-host.md`, use git only and record review history as a gap. If the named server is unreachable or no tool supports an operation, record the server and missing review evidence as a gap.

An unavailable or unauthenticated tool is a gap, not an empty search.

Look for out-of-band docs:

Use `find` for ADRs and related tests, then `grep` for known symbols and nearby TODO, FIXME, HACK, XXX, or NOTE text. Read the matching files with `read`.