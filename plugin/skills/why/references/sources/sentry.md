# Sentry Error History

## How to search it

Use the Sentry MCP.

1. Orient. If you don't know the project slug and organization:

   ```
   find_organizations
   find_projects
   ```

2. Search for issues related to the target.

   ```
   search_issues (natural language, e.g., "errors in PaymentService timeout", "unhandled exceptions in uploadFile")
   ```

   Build queries from the exception class names the target handles, its function or class name, the error message strings it checks for, and its file path.

3. Narrow by release and time window.

   ```
   search_issue_events (filter by release, time, environment, trace ID, tags)
   get_issue_tag_values (for an issue, see distribution across versions, users, environments)
   ```

   For a suspected issue, check first seen and last seen (does the stop line up with the target's ship date?), the affected releases (which saw it, and which was the fix?), and the frequency trajectory (did it spike, then get resolved?).

4. Pull the full event for context.

   ```
   get_sentry_resource (pass a Sentry URL or type+ID)
   ```

   Does the stack trace pass through the target code? Do the tags and breadcrumbs match the conditions the target defends against?

5. Check releases that landed near the target.

   ```
   find_releases (around the commit date of the target)
   ```

   Cross-reference release version with the PR's merge date.

6. Use Seer sparingly.

   ```
   analyze_issue_with_seer
   ```

   Seer's AI root-cause analyses are a hypothesis generator. Treat them as inference, not authoritative. The actual events and stack traces are the primary evidence.

## Common pitfalls

- Grouping drift. Sentry groups errors by fingerprint. Refactors or renames can track the "same" error under a new issue ID. If an issue ends abruptly, the error may have just been regrouped. Check for new issues immediately after.
- Release correlation is noisy. A release contains many commits. An issue stopping at v2.14.0 doesn't prove the target fixed it. Another change in the same release might have. Cross-reference with the target's exact commit.
- Silent fixes. Sometimes the error stops because upstream changed, not because of the defensive code. The correlation suggests the fix. It doesn't prove authorship.
- Resolved != fixed. Issues can be marked "resolved" manually without any code change. Treat `resolved` as a human marker, not evidence that code fixed it.
- Seer hallucinations. Seer can generate confident-sounding explanations that aren't right. Fall back to the actual events, stack traces, and timestamps when making claims.
- Sampling. Some projects sample events aggressively. A low event count may just mean high sampling, not a rare error. If in doubt, note the gap.

## What to return

For each relevant issue:
- Issue ID and title
- Project and organization
- First seen / last seen timestamps
- Event count (and sampling rate if known)
- Affected releases
- A representative stack trace snippet showing relevance to the target (verbatim excerpt, not summary)
- First/last-seen correlation with the target's ship date
- Link to the issue
- Any author comments or resolution notes
