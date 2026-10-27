---
status: accepted
---

# Main-agent tools pick Addons from gathered intent

A Matt run started with only an issue number gives the Addon judge no ticket content. The main agent already knows how to load the issue, the map Notes, and the selected ticket. It gathers that context first, then passes the user's intent to an extension tool that asks the Addon judge. The extension no longer judges main-session prompts or asks smol to restate a run start.

## Two tools

- `inject_principles` asks only the principle questions. implement and implement-spec use it when their source already carries non-principle Addon pointers.
- `inject_addons` asks the whole catalog, including principles. Every other Matt skill uses it. implement and implement-spec also use it when their source has no non-principle Addon pointer, so a hand-written issue still gets fitting Addons.

Both tools take `intent: string`. The main agent supplies the intent gathered from the actual source, not just an issue number or the skill-start words.

At each typed Matt run start, including a bare start, the extension adds a displayed, agent-readable message instructing the main agent to gather the intent before calling the appropriate tool. For implement and implement-spec, the message explains the conditional choice based on the source's pointers. The instruction belongs in this message, not in each Matt skill or an always-on rule. The agent loads matching returned `skill://` pointers before the work that needs them. A later change in the kind of work calls for another tool call. No main-session prompt triggers a judge call automatically.

The tools clean the supplied intent and limit it to 10,000 characters, following the existing subagent Brief path. They return matching `skill://` pointers and save the picks as `vstack-addons` session entries. Delivered-Addon dedup stays session-wide across saved messages and entries, including after a resume and across branches. A second call asks only questions whose Addons have not been delivered.

## Pointers and subagents

Principles remain Addons, as ADR 0018 defines them. to-spec and to-tickets stop writing principle pointers into specs and tickets. Build sessions pick principles fresh. Non-principle Addon pointers still follow ADR 0015 and must be read when the source supplies them.

Subagent Brief principle picks remain unchanged under ADR 0025, including the 20 principle questions that exclude never-block-on-the-human. Their automatic hook is separate from the removed main-session prompt judging. The main tools' principle scope includes every principle question.

The native judge role, catalog, 0.70 selection threshold, usage accounting, and shared judgment cache remain as ADR 0036 defines them. Main-session tool selection has a four-second judge deadline and aborts at that deadline. There is no smol call or 25-second restatement cap. This redesign changes when selection runs and what input it reads, not the selection criteria.

## Accepted trade-offs

The agent can skip the call. There is no writing-tool gate, no prompt-time fallback, and no claim that every run receives picks. We accept this dependence on the agent following a displayed instruction, reversing ADR 0021's objection to an agent-called tool. The instruction tells the agent to gather context before starting the work that needs the Addons.

Fetching tracker issues in the extension would deliver picks before the first agent turn, but it would add tracker-specific access and fetch time to the hook. We rejected that route. We also rejected a pointer-only fix because existing and hand-written issues can lack pointers.

A displayed run-start instruction keeps Matt skill text close to the Base upstream and applies only when a Matt run starts. An always-on rule would appear outside Matt runs, and per-skill instructions would add changes to maintain across Updates.

## Earlier decisions

This decision supersedes the automatic main-session selection of [ADR 0002](0002-principles-are-selected-per-prompt-by-jev.md) and the run-start selection parts of ADRs [0018](0018-principles-are-addons-and-the-running-skill-wins.md), [0021](0021-a-mid-session-matt-run-start-sends-a-smol-restatement-to-jev.md), and [0026](0026-every-matt-run-start-sends-a-smol-restatement-to-jev.md). It also removes automatic selection on later main-session prompts. The shared-state and dedup rules of [ADR 0024](0024-shared-judge-text-goes-in-the-jev-state-once.md) remain, but its main-session input now comes from the tools. The four-second tool deadline replaces ADR 0036's restatement deadline.

It amends [ADR 0015](0015-matt-skills-are-the-core-and-addons-supplement-them.md)'s pointer rule to exclude principles. It amends [ADR 0032](0032-the-grill-closes-with-its-summary-and-no-ask.md) by introducing these two selection tools while keeping its summary-only grill close. The former `vstack_pick_addons` tool remains removed, and the new tools do not run from a closing ask. [ADR 0025](0025-subagents-get-principle-picks-from-their-own-brief.md)'s subagent selection stays unchanged.
