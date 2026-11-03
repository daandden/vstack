---
name: to-questionnaire
description: Turn a decision you can't fully answer into a questionnaire for someone else to fill in.
disable-model-invocation: true
---

Turn something the user can't answer alone into a **questionnaire**: a Markdown document they hand to one person to fill in async, or fill out together over a meeting. The recipient holds knowledge the user lacks; the questionnaire pulls it out of them.

**Grill the send, not the subject.** Interview the user through `ask` only about the _send_, which they can always answer: who it goes to, and what they need back. Follow `skill://flow-page`'s "Every ask in a Flow", including Flow CLI publication and a visible current live URL in chat before `ask`, followed by separate answer recording. The questions in the document then target the **gap** between what the recipient knows and what the user needs. A timed-out answer is not the user's. Re-ask once with `again`, and if that times out too, stop without writing the questionnaire and say why. Unavailable questioning leaves the required answers unresolved.

Follow `skill://flow-page`'s "Stage entry/exit line". The recipient and purpose questions below belong to this run.

1. **Who is it going to?** Publish one complete round containing one question each for the recipient's role, expertise, and relationship to the user, then show the current live URL in chat before calling `ask` with the receipt's generated questions. This fixes the questionnaire's tone and how much context it must carry. Done when you know who the recipient is and what they know that the user doesn't.

2. **What do you need back?** Publish one complete round about the specific decisions or facts the user can't resolve alone and needs from this person, then show the current live URL in chat before calling `ask` with the receipt's generated questions. Offer the likely ones as options, and the user types the rest through the picker's custom answer. Done when you have a concrete list of what the user must walk away able to do or decide.

3. **Write and publish the questionnaire.** Draft questions aimed at the gap from steps 1–2, following the Document structure below. Keep the canonical export at `to-questionnaire-<slug>.md` in the current directory. Submit its headed content as a Document Result with `canonical: { "file": "to-questionnaire-<slug>.md" }` and a captured `file` attachment of the export. Finish the owned Stage after publication. Report the canonical path without a Flow link. Done when the file exists, every item from step 2 has a question, and the Flow page contains the captured questionnaire.

## Document structure

Frame the document as a **discovery questionnaire**: the user lacks context, the recipient holds it. Order questions most-important-first, since async means you may only get one pass, and group them under `##` headings by theme once there are more than a handful. Write it using the template below.

<questionnaire-template>

# <Questionnaire title>

**Purpose:** why this questionnaire exists and the decision riding on it.

**From:** <the user>, **To:** <the recipient>, **How your answers will be used:** <where they go>

## Context

One paragraph orienting a recipient who wasn't in the user's head. Enough to answer well, not a page.

## How to answer

Deadline and rough effort. Partial answers and "I don't know" are useful: flag anything you're unsure of rather than skipping it.

## <Theme heading>

One `##` section per theme. Under each, its questions, most-important-first. Every question is one idea, never compound, with an answer stub directly beneath, and a one-line _why this matters_ only where the question could be misread or invite a throwaway answer.

<question-example>
### What load is the system expected to handle at launch?

_Why this matters: it decides whether we provision for burst traffic now or defer it._

>
</question-example>

## Anything else?

A closing catch-all: anything we didn't ask that we should know?

</questionnaire-template>
