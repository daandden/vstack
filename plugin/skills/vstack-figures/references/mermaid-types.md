# Mermaid type reference

Pele 1.12.0 renders the 32 visualization families below and targets Mermaid 12.1.0 built-ins. A Mermaid type is a syntax family, not a Visual kind. A Context diagram, an Option diagram, a Data chart, or a Scenario walkthrough can use any family that fits its purpose.

Each keyword links to a minimal `.mmd` source example. `scripts/render.ts` renders these sources with Catppuccin Mocha. They contain no theme directives, `classDef`, or `style` lines, so the renderer owns the colors. `tests/figure-types.test.ts` renders every example as a process and checks the keywords against an independent list.

## Visualization families

1. [flowchart](examples/flowchart.mmd) shows steps, decisions, branches, and loops, or connected parts grouped by `subgraph`. A large architecture uses one `subgraph` per zone.
2. [sequenceDiagram](examples/sequenceDiagram.mmd) shows messages between parts in time order, including requests, replies, and who waits.
3. [stateDiagram-v2](examples/stateDiagram-v2.mmd) shows the states of one thing and the events that move it. Composite states group a larger model.
4. [swimlane-beta](examples/swimlane-beta.mmd) shows steps in lanes, one per team or role, and handoffs between lanes.
5. [erDiagram](examples/erDiagram.mmd) shows entities, fields, relationships, and cardinality. Keep it under about 15 entities and split a larger schema by zone.
6. [classDiagram](examples/classDiagram.mmd) shows classes or types, fields, methods, inheritance, ownership, and use.
7. [architecture-beta](examples/architecture-beta.mmd) shows services in groups and their connections, up to about 10 services. Above that, use `flowchart`.
8. [block-beta](examples/block-beta.mmd) shows blocks in rows and columns, such as stacked layers, grids, or matrices.
9. [timeline](examples/timeline.mmd) shows dated events in order, grouped by period.
10. [gantt](examples/gantt.mmd) shows tasks with dates, durations, overlap, and dependencies.
11. [journey](examples/journey.mmd) shows one person's steps through a task, grouped by stage, with a satisfaction score per step.
12. [mindmap](examples/mindmap.mmd) shows one root topic broken into smaller parts.
13. [kanban](examples/kanban.mmd) shows work items in status columns.
14. [quadrantChart](examples/quadrantChart.mmd) places items by two measures on two axes, split into four quadrants.
15. [xychart](examples/xychart.mmd) shows bars or lines of values over categories or time.
16. [pie](examples/pie.mmd) shows shares of one whole.
17. [sankey](examples/sankey.mmd) shows quantities that flow through stages, split, or merge.
18. [radar-beta](examples/radar-beta.mmd) compares items scored on the same axes.
19. [treemap-beta](examples/treemap-beta.mmd) shows nested shares of a whole, sized by value.
20. [venn-beta](examples/venn-beta.mmd) shows sets, their overlap, and the members of each overlap.
21. [ishikawa-beta](examples/ishikawa-beta.mmd) shows possible causes of one effect, grouped by category.
22. [wardley-beta](examples/wardley-beta.mmd) places components by visibility to the user and evolution, from novel to commodity.
23. C4 has five views within one family:
    - [C4Context](examples/C4Context.mmd) shows one system, the people who use it, and external systems around it.
    - [C4Container](examples/C4Container.mmd) shows applications and data stores within a system and their connections.
    - [C4Component](examples/C4Component.mmd) shows components within one container and their responsibilities and connections.
    - [C4Dynamic](examples/C4Dynamic.mmd) shows an ordered interaction between C4 elements for one scenario.
    - [C4Deployment](examples/C4Deployment.mmd) shows deployment nodes, such as zones and hosts, and what runs on each.
24. [gitGraph](examples/gitGraph.mmd) shows branches, commits, and merges in a Git history.
25. [treeView-beta](examples/treeView-beta.mmd) shows a file and folder tree.
26. [agentflow-beta](examples/agentflow-beta.mmd) shows agent tasks, tools, decisions, and reference flows with semantic node and edge roles.
27. [cynefin-beta](examples/cynefin-beta.mmd) groups situations by decision domain: clear, complicated, complex, chaotic, or confusion.
28. [eventmodeling](examples/eventmodeling.mmd) shows a business scenario through UI or automation, commands or read models, and events.
29. [packet](examples/packet.mmd) shows a protocol's bit fields and their positions in a packet.
30. [requirementDiagram](examples/requirementDiagram.mmd) shows requirements, their properties, and traceability to elements. The header is `requirementDiagram`, not bare `requirement`.
31. [usecase-beta](examples/usecase-beta.mmd) shows actors, use cases, system boundaries, and their relationships.
32. Railroad has four notations within one family:
    - [railroad-beta](examples/railroad-beta.mmd) shows grammar rules written as explicit terminal, nonterminal, sequence, and choice expressions.
    - [railroad-ebnf-beta](examples/railroad-ebnf-beta.mmd) shows grammar rules written in EBNF with optional and repeated parts.
    - [railroad-abnf-beta](examples/railroad-abnf-beta.mmd) shows grammar rules written in ABNF, such as protocol productions.
    - [railroad-peg-beta](examples/railroad-peg-beta.mmd) shows grammar rules written in PEG with ordered choices and predicates.

## Alias spellings

These keywords name an existing family, not an additional visualization family. Their examples use the same minimal content as their canonical spelling.

| Alias example | Existing family |
|---|---|
| [graph](examples/graph.mmd) | `flowchart` |
| [flowchart-elk](examples/flowchart-elk.mmd) | `flowchart` |
| [stateDiagram](examples/stateDiagram.mmd) | `stateDiagram-v2` |
| [xychart-beta](examples/xychart-beta.mmd) | `xychart` |
| [sankey-beta](examples/sankey-beta.mmd) | `sankey` |
| [block](examples/block.mmd) | `block-beta` |
| [packet-beta](examples/packet-beta.mmd) | `packet` |
| [treemap](examples/treemap.mmd) | `treemap-beta` |
| [ishikawa](examples/ishikawa.mmd) | `ishikawa-beta` |

## Utility

[info](examples/info.mmd) displays renderer information. It is a utility, not a figure or a visualization family.

## Pinned syntax sources

The [Pele 1.12.0 README](https://unpkg.com/pele@1.12.0/README.md) states the Mermaid 12.1.0 compatibility target. The [lazy registry](https://unpkg.com/pele@1.12.0/dist/esm/lazy.js) lists all families. The [type detector](https://unpkg.com/pele@1.12.0/dist/esm/chunks/2U463FD2.js) identifies keyword spellings. The pinned parser implementations define the rarer syntax used by these examples:

- [C4 views](https://unpkg.com/pele@1.12.0/dist/esm/chunks/4WR52FRP.js) share element and relationship calls, with deployment-node blocks for deployment views.
- [Railroad notations](https://unpkg.com/pele@1.12.0/dist/esm/chunks/F4O23KYR.js) use `=` for explicit railroad, EBNF, and ABNF rules, `<-` for PEG, and a terminating semicolon in all four examples.
- [Agentflow](https://unpkg.com/pele@1.12.0/dist/esm/chunks/XQ5S3AI3.js) accepts a direction and connected task nodes.
- [Tree view](https://unpkg.com/pele@1.12.0/dist/esm/chunks/DDVFZY3L.js) accepts indented names, with a trailing slash for a directory.
- [Cynefin](https://unpkg.com/pele@1.12.0/dist/esm/chunks/TK23BXEA.js) accepts named domains and quoted items.
- [Event modeling](https://unpkg.com/pele@1.12.0/dist/esm/chunks/DO6ND2WD.js) accepts `tf` frames with numeric ids, entity types, and entity names.
- [Packet](https://unpkg.com/pele@1.12.0/dist/esm/chunks/BK7N5KMP.js) accepts contiguous bit ranges and quoted labels.
- [Requirements](https://unpkg.com/pele@1.12.0/dist/esm/chunks/EI4VGK5C.js) requires the `requirementDiagram` header before requirement blocks.
- [Use cases](https://unpkg.com/pele@1.12.0/dist/esm/chunks/42UK3TL6.js) accepts actor declarations and relationships to named use cases.
