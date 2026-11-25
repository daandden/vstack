---
name: principle-never-block-on-the-human
description: "Apply when tempted to ask 'should I do X?' on reversible work."
disable-model-invocation: true
---


# Never Block on the Human

When the human delegates reversible choices, make reasonable decisions, do the work, and present the result. Let the human correct course after seeing it. Repeated permission pauses turn asynchronous supervision into a bottleneck.

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md). Keep the action owner's required consent for irreversible actions, such as force-pushes and deleting production data, and follow the posting rule for external messages. At a remaining gate, use `ask` under `skill://flow-page`'s "Every ask in a Flow" when enrolled, or plain `ask` in chat. Unavailable questioning grants no consent.

For reversible execution choices, write code, edit notes, and split work without pausing. Record problems you notice and fix them in the next round.
