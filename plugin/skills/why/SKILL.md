---
name: why
description: Investigate why existing code has its shape. Profile the repo and consult its VCS, code host, issue tracker, and configured MCPs.
disable-model-invocation: true
---

# Why

Investigate motivation and intent, not runtime behavior. For runtime behavior, read `skill://how`.
Read `references/epistemics.md` before investigating. Keep Direct, Supported, Inferred, Speculative, and Unknown claims separate. Preserve confidence language when presenting results.

## Step 1. Understand the target

Identify the code, pattern, feature, or decision and the rationale the question seeks. If the target is vague, infer it from the conversation, state your interpretation, and proceed.

## Step 2. Profile the repo and establish the code anchor

Build the profile yourself before the code anchor:

1. Run `git rev-parse --is-inside-work-tree`. If the directory is not a git repo, stop and report that prerequisite.
2. Use the supplied vstack root under a caller. Otherwise resolve it once per the Private-mode rule. Read the Code host from `<vstack root>/docs/vstack/code-host.md` in Standard mode or `<vstack root>/config/code-host.md` in Private mode. Read its host, tool, and project facts, including the review reference in commit titles. For a CLI config, use its `read-pr` and `review-threads` command rows. For an MCP config, select tools for those operation ids from the named server's current descriptions and parameter schemas, using the recorded facts. No operation rows are needed. If the file is missing, use git only, record review history as a gap, and say that `/skill:setup-vstack` adds the Code host. Record an unreachable server, failed discovery, unsupported operation, or unauthenticated tool as a gap, naming the server and failure.
3. Read the tracker from `<vstack root>/docs/vstack/issue-tracker.md` in Standard mode or `<vstack root>/config/issue-tracker.md` in Private mode. GitHub Issues uses `gh issue`; GitLab Issues uses `glab issue`; local markdown uses the named files. For an MCP tracker such as Jira, read the named server's current tool list, descriptions, and parameter schemas. Select search and full issue and comment reads using the recorded project facts and original issue keys, without per-operation config rows or assumed tool names. Adapt the source playbook to that profile rather than copy its example tool names. A no-tool prose config keeps its stated workflow. If no tracker configuration exists, infer the tracker from the Code host in `code-host.md` and state the inference in Sources consulted. Without a known host or reachable tracker, or when discovery or a needed capability fails, name the server and record the gap.
4. List the MCP servers this session reaches: tools named `mcp__<server>_<tool>`, top-level or under `xd://`, and the MCP server instructions in your system prompt. The same tools reach investigators. Map each server to its primary evidence category. Record ambiguous classifications.

Evidence is limited to git, the Code host's tool from `code-host.md`, the configured issue tracker, and configured MCPs. Anything else is a gap in Sources consulted.

Build the anchor yourself with relevant file paths and line ranges, key symbols, the last commits touching the target, review references, and linked ticket IDs. Use `git blame -L <start>,<end> <file>`, `git log --follow -p -- <file>`, `git log --oneline -20 -- <file>`, and `git log -1 --format=%B <commit>`. For substantive commits, read the PR's description, reviews, and comments through the profile's `read-pr` and `review-threads` operations. Follow the profile rather than assume GitHub. Put the complete profile in the anchor and every investigator and synthesizer brief.

## Step 3. Investigate reachable categories

Read `references/source-playbook.md`. Make a coverage map for all seven categories:

1. Source control history, including git, the profile's review CLI, comments, tests, ADRs, and release notes.
2. Issue / ticket tracker, through the profile's CLI, files, or MCP.
3. Long-form documents, through configured MCPs.
4. Real-time team chat, through configured MCPs.
5. Infrastructure observability, through configured MCPs.
6. Error / exception tracking, through configured MCPs.
7. Product analytics warehouse, through configured MCPs.

Each reachable category gets a brief from `references/investigator-prompt.md` and its single source playbook. Include `references/sources/incident-postmortem.md` for defensive code such as retries, timeouts, null guards, feature flags, or rate limits. Include the profile, code anchor, and original question. Use one category per part. Each investigator owns exactly one source. Keep additional reachable sources in that category visible in the coverage map and investigate them in a later wave. Never silently drop a reachable source.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per evidence category the profile and the MCP map can reach (source control always). One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: investigate its one category and source from the base prompt and category playbook with the profile, anchor, and original question, the vstack root. Wait for every result. If they cannot start, stop: report the question as not answered, with the profile, the anchor, and the coverage map.

Keep one findings section per category. Record cross-source leads instead of chasing another investigator's source. Wait for all findings before synthesis.
If only one category is reachable, investigate it yourself. A batch of one is not Fan-out.

Skip a category only with an explicit written justification in Sources consulted. Valid reasons are no reachable source or proven irrelevance. An unavailable source is a gap, not a choice. Caller-scoped omissions also stay visible with the caller's narrowing as the reason. Record null searches and their actual queries.

For a trivial single-commit target, answer directly from the anchor only after confirming all seven category searches are redundant. State the reason. This shortcut skips further investigation, not the fresh synthesis in Step 4.

## Step 4. Synthesize in a fresh context

On every path, use `references/synthesizer-prompt.md`. Supply all findings, null results, skips with reasons, the full profile and anchor, the question, and `references/epistemics.md`. A fresh context protects the confidence tiers.

Spawn one `vstack-explorer` via `task` (`agent: "vstack-explorer"`): synthesize the evidence with the confidence framework and spot-check citations without modifying files or external state, the vstack root. Wait for its result. If it cannot be spawned, stop: report the question as not answered, with the findings unsynthesized.

## Step 5. Present

Under a calling skill or parent agent, return the output unedited. For a direct invocation, light clarity edits are allowed without rewriting confidence language.
Keep The question, The code in question, What we found, What we can reasonably infer, Competing hypotheses, What we do not know, Sources consulted, and Confidence summary. Drop optional empty sections but retain gaps and one coverage line per category, including null or skipped sources.
If the user or caller says a change follows, append a Preserve / Change / Avoid / Risk constraint set after Sources consulted. An explain caller does not request this tail.

Investigators and the synthesizer modify no product files or external state. Cite explicit historical evidence for intent. Code demonstrates mechanics, not its own motivation. Trace earlier decisions instead of assuming the latest commit explains the present shape.
