# Phase boundaries

A phase is a chunk of work inside a session, such as grilling, implementation, or QA. Its boundary is deliberately fuzzy. A phase ends when you think "ok, we are done with that".

The phase boundary is the gap between phases. Decide here, not mid-phase. Mid-phase, continue or split the remaining work into subagents. Compacting mid-phase makes the agent lose the thread.

## The five options

| Option | What it does |
|---|---|
| Continue | Stay in the session without a context switch. |
| `/new` | Start a new session with an empty context window. |
| `/skill:handoff` | Write a portable Markdown file to seed a session anywhere. |
| Subagent | Send a task to its own context window and receive a report. |
| `/compact` | Compress this context in place. |

## The tree

Work top to bottom at the boundary. The first yes wins.

### 1. Can you continue in this session?

Two things make the answer yes. The next phase needs this phase as a primary source, or enough of the [smart zone](https://www.aihero.dev/ai-coding-dictionary/smart-zone) remains for it to fit. That zone is about 150k tokens on state-of-the-art models. Grilling to implementation is the standard yes. Implementation needs the reasoning verbatim, not a summary. Continue costs nothing and loses nothing, so rule it out first.

### 2. Is the context irrelevant to what comes next?

Are the exploration, decisions, and dead ends disposable? If so, use `/new`. It takes no time and gives you the whole window. It is not terminal. The old session stays resumable through `/resume`.

Getting this wrong loses the why behind what you built from the next session. Reading the diff again cannot recover that reasoning.

### 3. Do you need to hand off?

Use `/skill:handoff` only when you are:

- Swapping to a new harness (Claude → Codex).
- Moving to a new directory or repo.
- Sending work to a colleague.
- Forking a side task mid-phase without derailing the current work.

This is the complete list. Handoff buys portability through a file that travels. If nothing travels, you do not need it.

omp's built-in `/handoff` is not this skill. It summarizes and compacts in place, so it is a variant of option 5, not option 3.

### 4. Can the task be done AFK?

Is it scoped tightly enough to run while you are away, without steering? Send it to a subagent and leave this session untouched. Automated review is the standard case. The agent reads the diff and reports without needing you there.

### 5. Otherwise, use `/compact`

The context matters, the harness and directory stay the same, and you need to remain in the loop. This is where the tree often ends. Pass a focus instruction, such as `/compact we're going to QA this area`, to retain what the next phase needs.

Compact is the default, not the first choice. The four questions above it are cheaper or more precise. Starting here can produce a fresh context that is confidently wrong about a decision the summary flattened.

## Primary and secondary sources

Every move except Continue turns a primary source into a secondary source. It replaces the session as it happened with a summary.

| Source | Information | Noise | Room to move |
|---|---|---|---|
| Primary (Continue) | Full | Lots | Little |
| Secondary (`/compact`, `/skill:handoff`) | Lossy | Less | Lots |

This is why question 1 comes first. Pay the information loss only when staying costs more than it saves.

## These are judgment calls

The questions are not objective. Each needs judgment, and the same boundary can lead to different choices on different days. Consider them in order at the boundary, not in the middle of the work.
