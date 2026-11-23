---
name: explain
description: Explain existing code, a change, or a subsystem in conversation, combining how it works with evidence for why it exists. Use when the user asks how code works.
---

# Explain

Explain what the thing is, how it works, and why it has that shape. The goal is understanding, not a code change or course workspace.

## Step 1. Orient

Read the conversation to learn why the person asks and what they already know. Skip familiar material and put depth where their question is. Read just enough code to identify the target.
Use the caller's vstack root and project Scratch dir if supplied. Otherwise resolve the root per the Private-mode rule, read `skill://vstack-tmp`, and obtain the project Scratch dir once. Keep figure sources in a distinct `explain/<run-id>/` entry.

Check enrollment through `skill://flow-page`'s "Stage entry/exit line" before any Flow discovery or creation. An explanation outside a Flow stays in chat. Read-only investigators return findings to the coordinator.

## Step 2. Let how and why investigate

For a subsystem, run both. A small change can need just one.

Before this step, read skill://vstack-fan-out.

Fan-out (skill://vstack-fan-out): parts: one per skill (how, why). One `task` call; `tasks[]` has one item per part, each with `agent: "vstack-explorer"`. Each `task`: run `skill://how` or `skill://why` on the target and return its output unedited with citations, inference labels, and any figure points, the vstack root, the Scratch dir. Wait for every result. If they cannot start, stop: report the explanation as not written, because it has no how or why findings.

Wait for both results before blending them. For a single selected skill, read and run it yourself.

## Step 3. Explain

Start with a plain definition and tie it to this code. Then explain the mechanism, deeper reasons, and edge cases. Use cited findings instead of repeating the investigation.
Give the smallest complete answer first. Describe what happens as the person uses the thing when that makes the flow clear. Function lists are reference, not an explanation.
Reword for clarity. Keep cited evidence, labeled inferences, and gaps distinct.

## Step 4. Keep it conversational

No quizzes, pacing labels, or requests to repeat the explanation. Stop at a natural break and let the person respond. Any optional depth choice goes through `ask` under `skill://flow-page`'s "Every ask in a Flow" contract when enrolled, or plain `ask` outside a Flow, never a prose question. In a one-shot run, deliver the complete explanation without an interaction requirement.

## Step 5. Build the picture on one page

In a Flow, publish the explanation as a Document Result through `flow-page submit`. Use headed `sections` with prose, lists, code with source locations, and numbered citations. Keep citations and inference labels beside the claims. Follow-up ad-hoc answers in this Flow are Documents too, not separate report pages. Revise the same explanation with `revises` when correcting or extending it during this run.

Draw every figure through `skill://vstack-figures`. Write each figure's Mermaid in this caller's context. For three or more moving parts, plan a short build-up series: each figure redraws the last one and adds one part. Use this run's Scratch entry and a unique basename per figure. In a Flow, capture each source as a `mermaid` attachment and place `figure` blocks in reading order. The reader draws them with Pele. In chat, include the rendered figures with the explanation. Keep an unavailable figure's reason visible instead of substituting a drawing.

In a Flow, publish the Document before returning. Never open the page automatically.

## Reply

Lead with the main point. In a Flow, summarize what it is, how it works, and why, with the complete explanation and evidence on the Flow page. Outside a Flow, give the complete explanation and evidence in chat.
