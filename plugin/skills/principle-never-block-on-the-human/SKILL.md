---
name: principle-never-block-on-the-human
description: "Apply when tempted to ask 'should I do X?' on reversible work. Proceed, present the result, let the human course-correct after the fact; reserve confirmation for irreversible actions."
disable-model-invocation: true
---


# Never Block on the Human

When the human delegates reversible choices, make reasonable decisions, do the work, and present the result. Let the human correct course after seeing it. Repeated permission pauses turn asynchronous supervision into a bottleneck.

A skill that requires a human decision wins over "proceed, then present". Use `ask` at that gate and wait for the answer. Irreversible actions, including force-pushes, deleting production data, and external messages, need confirmation through `ask` too. Product direction stays with the human.

For reversible execution choices, write code, edit notes, and split work without pausing. Record problems you notice and fix them in the next round.
