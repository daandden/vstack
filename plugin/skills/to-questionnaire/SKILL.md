---
name: to-questionnaire
description: Turn a decision you can't fully answer into a questionnaire for someone else to fill in.
disable-model-invocation: true
---

Turn something the user can't answer alone into a **questionnaire**: a Markdown document they hand to one person to fill in async, or fill out together over a meeting. The recipient holds knowledge the user lacks; the questionnaire pulls it out of them.

Grill the send, not the subject. Recover the recipient and requested outcome from the request and earlier decisions. Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) to gaps. Deliver any remaining questions through `ask` under skill://flow-page's "Every ask in a Flow" when enrolled, or plain `ask` in chat. A timeout is not the user's answer. Re-ask an unanswered gate once, using `again` in a Flow. If it times out again, stop without writing the questionnaire and say why. Unavailable questioning leaves the required answers unresolved.

Follow `skill://flow-page`'s "Stage entry/exit line". The recipient and purpose questions below belong to this run.

1. Identify the recipient's role, expertise, and relationship to the user. Ask only about unresolved details that change the questionnaire's tone or context. Finish when you know who the recipient is and what they know that the user doesn't.

2. Identify which decisions or facts the user needs from the recipient. For a choice that still needs an answer, offer likely options and allow Other. Finish when you have a concrete list of what the user must walk away able to do or decide.

3. **Write the questionnaire.** Draft questions for the recipient using the gap from steps 1–2 and the Document structure below. Keep the canonical export at `to-questionnaire-<slug>.md` in the current directory. In a Flow, submit a Document Result with `canonical: { "file": "to-questionnaire-<slug>.md" }`, attach the export, and finish the Stage. Report the canonical path without a Flow link. Finish when the file exists and every item from step 2 has a question, with the captured questionnaire on the Flow page when enrolled.

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
