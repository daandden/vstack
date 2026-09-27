# vstack

vstack is a personal agent-skills pack for omp. It is built on Matt Pocock's skills and adds selected pstack skills, principles, and workflows, and it can be updated from both sources.

## Language

### Sources

**Upstream**:
An external skills repository that vstack derives content from. There are exactly two.
_Avoid_: source repo, origin, vendor

**Base upstream**:
The Upstream vstack is built on: `mattpocock/skills`.
_Avoid_: matt-install, core

**Enhancement upstream**:
The Upstream that vstack adds selectively from: poteto's pstack at `cursor/plugins`, directory `pstack/`.
_Avoid_: pstack fork, plugin

**Upstream item**:
One skill, principle, or workflow published by an Upstream.
_Avoid_: upstream skill (when principles or workflows are meant too)

**Pin**:
The exact Upstream version vstack was last reconciled with: a release tag for the Base upstream, a full commit SHA for the Enhancement upstream.
_Avoid_: lock, version (unqualified)

### Choices

**Disposition**:
What vstack did with an Upstream item: adopt, adapt, merge, or reject.
_Avoid_: verdict, status

**Adopt**:
Ship an Upstream item byte-for-byte as it is at the Pin, under its Upstream name. The one exception is Codex's `agents/openai.yaml`, which vstack never ships.
_Avoid_: copy, vendor

**Adapt**:
Ship a changed copy of an Upstream item. Any change counts, including a rename, a swapped reference, an omp tool name, or a behavior change such as making Fan-out opt-in.
_Avoid_: port, fork

**Merge**:
Combine an item from each Upstream that covers the same ground into one vstack item.
_Avoid_: combine, fold (unqualified)

**Reject**:
Leave an Upstream item out of vstack.
_Avoid_: drop, skip

**Decision register**:
The table listing every Upstream item with its Disposition and a one-line reason, linking an ADR when the choice was a real trade-off.
_Avoid_: manifest (for this table), ADR list

### Behavior

**Fan-out**:
A skill running several subagents at once. In vstack it only happens when the user opts in, and every subagent uses the parent's model.
_Avoid_: swarm, parallelism (unqualified)

**Update**:
The confirmed process of moving one or both Pins forward and adapting vstack to the Upstream changes.
_Avoid_: sync, upgrade

**Migration**:
Moving a project or a machine that is set up for the Base upstream onto vstack.
_Avoid_: conversion, reinstall
