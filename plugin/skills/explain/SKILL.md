---
name: explain
description: Explain existing code, a change, or a subsystem in conversation, combining how it works with evidence for why it exists. Use when the user asks how code works.
---

# Explain

Explain what the thing is, how it works, and why it has that shape. The goal is understanding, not a code change or course workspace.

## Step 1. Orient

Read the conversation to learn why the person asks and what they already know. Skip familiar material and put depth where their question is. Read just enough code to identify the target.
Use the caller's vstack root and project Scratch dir if supplied. Otherwise resolve the root per the Private-mode rule, read `skill://vstack-tmp`, and obtain the project Scratch dir once. Create one distinct `explain/<run-id>/` entry for the explanation page and figure sources.

## Step 2. Let how and why investigate

For a subsystem, run both. A small change can need just one. Keep why narrow unless the reasons are the question. Put the narrowing in its brief so its coverage map records the skipped categories. Do not request a Preserve / Change / Avoid / Risk tail for an explanation.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per skill (how, why). One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: run `skill://how` or `skill://why` on the scoped target and return its output unedited with citations and confidence language, the vstack root, the Scratch dir. Wait for every result. If they cannot start, stop: report the explanation as not written, because it has no how or why findings.

Wait for both results before blending them. For a single selected skill, read and run it yourself.

## Step 3. Explain

Start with a plain definition and tie it to this code. Then explain the mechanism, deeper reasons, and edge cases. Use cited findings instead of repeating the investigation.
Give the smallest complete answer first. Describe what happens as the person uses the thing when that makes the flow clear. Function lists are reference, not an explanation.
Reword freely, except for why's confidence language. Keep its hedges and separate evidence from inference.

## Step 4. Keep it conversational

No quizzes, pacing labels, or requests to repeat the explanation. Stop at a natural break and let the person respond. Any optional depth choice goes through `ask`, never a prose question. In a one-shot run, deliver the complete explanation without an interaction requirement.

## Step 5. Build the picture on one page

Use `templates/explain.html` for one HTML page in `explain/<run-id>/`. Keep that same page across the conversation. Add each new explanation section and figure below the last. Print the plain absolute path of the page with the explanation, with no `file://` prefix.

Draw every figure through `skill://vstack-figures`. Fix each figure's type, size, and content from the explanation. For three or more moving parts, plan a short build-up series: each figure redraws the last one and adds one part. The out dir is this run's Scratch entry, with a unique figure slug. Write the explanation while the drawers run. Collect the figures before you write them into the page, inlined under the last figure. Use no external image files or diagram renderer. There is no generated-image or mermaid fallback.

Open the page in the browser on its first figure. Keep appending without reopening it on later turns. The page contains the explanation and cited evidence, not just the figures. All figures appear in reading order and the HTML is self-contained.

## Reply

Return the explanation itself, never a report about the steps. Lead with the main point, then explain what it is, how it works, and why. Include the page path and keep evidence and uncertainty visible.
