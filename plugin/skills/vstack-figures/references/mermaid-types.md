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

## Binding identities and limits

The optional `--bindings` document resolves the supported identities below from Pele's parsed source model. Flowchart aliases `graph` and `flowchart-elk` share the flowchart contract. Explicit edge ids such as `A link@--> B` are supported where listed. Automatically generated edge ids are not binding identities. Labels are not aliases for declared ids. An id naming distinct source targets is ambiguous. A group assignment colors its own backing and label, not its children.

Flowchart person shapes establish `actor`. Cylinder shapes, including `cyl`, establish `store`. Generic boxes, queue-like symbols, values, and words in labels establish no role. An explicit binding or authored role overrides an intrinsic kind.
Text-only nodes retain accent text without an invented background. An edge binding colors its route, marker, and label without filling the open route.

| Family | Explicit binding targets |
|---|---|
| Flowchart and its aliases | Declared nodes, subgraphs, and explicit edge ids |
| `timeline` | Exact section names and unique period text. Events have no stable individual binding or focus identity. Repeated period text, or a period and section with the same name, is ambiguous. |
| `gantt` | Declared task ids and exact section names. Generated task ids are not binding or focus identities. Section bindings color their visible labels only, not the background bands or their tasks. |
| `journey` | Unique task text, exact section names, and exact participant names. A participant owns every corresponding task dot and legend entry. Collisions between these source identities are ambiguous. Scores, faces, and score routes have no binding identity. |
| `kanban` | Declared column and card ids. Duplicate ids are ambiguous. Columns do not pass their assignments to cards. Priority and assignee metadata have no separate binding identity. |
| `gitGraph` | Exact branch names and explicitly declared commit ids. Generated commit ids and relationship routes are not binding or focus identities. Branch bindings affect their lane, label, and associated routes, not separate commit targets. |
| Native C4, all five views | Declared entity aliases and boundary or deployment-node aliases. The synthetic global boundary and relationship endpoint concatenations are unsupported. |
| `erDiagram` | Source entity names and declared subgraph ids. A display alias and the generated `entity-...` id are not alternative identities. Fields and relationships are unsupported. |
| `classDiagram` | Class ids and explicit namespace ids. Members, methods, notes, and generated relationships are unsupported. |
| `architecture-beta` | Service, junction, and group ids. Generated edge endpoint strings are unsupported. |
| `block-beta` and `block` | Block and composite ids. Spacer cells and generated edges are unsupported. |
| `requirementDiagram` | Requirement and element names. The `id:` field is display data, not a target id. Relations are unsupported. |
| `usecase-beta` | Actor, use-case, system-boundary, and JSON-node ids, plus explicit relationship ids. Notes and generated relationship ids are unsupported. |
| `treeView-beta` | Exact unique basenames, including directory names without the trailing slash. Repeated basenames are ambiguous. Numeric parser ids and invented paths are unsupported. |
| Mindmap | Source node ids, or exact names for bare nodes. Repeated ids or names are ambiguous. Top-level branch names supply category keys to their branch nodes. A role or category override affects only its target node, not its descendants. Text-only nodes keep accent text without an invented backing. |
| Ishikawa and `ishikawa` | Exact category names and the effect name. Repeated names, including an effect/category collision, are ambiguous. Category names supply category keys. Assignments and focus affect the header's own geometry and label, not cause text, bones, or markers. Individual causes have no stable binding or focus identity. |
| `wardley-beta` | Declared component and anchor ids. A component assignment also colors its associated evolution marks, keeping open routes unfilled. Strategy decorators stay neutral. Market components have only a strategy glyph, so their binding colors their loose label and any evolution marks rather than inventing a separate marker. Anchors remain text-only. Anchor syntax does not establish a person, component names do not establish data at rest, and movement on the evolution axis does not establish changed code. Dependency ids, notes, forces, and annotations are unsupported binding targets. |
| `cynefin-beta` | The five domain names, plus unique visible item labels. A domain owns its region and domain text, not its child badges. Domain names supply category keys, not status roles. Repeated item labels or item/domain name collisions are ambiguous. Hidden overflow items refuse as unavailable. A visible count badge does not expose the omitted items' geometry. |
| `quadrantChart` | Exact point names and declared `quadrant-1` through `quadrant-4`. Duplicate point names, or a name colliding with a quadrant identity, are ambiguous. Points and named quadrants derive their category key from their exact source name. Unnamed quadrants stay neutral. |
| `xychart` and `xychart-beta` | Exact nonempty series titles, shared by the series and its legend. Duplicate titles are ambiguous. An unnamed bar plot with a band axis derives each bar's category from its exact band name, but individual bars have no binding or focus id. Unnamed linear-axis bars and unnamed lines stay neutral. Point labels and numeric data labels have no stable series ownership and stay neutral. |
| `pie` | Exact category names, shared by the slice and its legend. Percentage labels have no source id, so they keep their contrast paint without guessed category or focus association. |
| `sankey` and `sankey-beta` | Exact node names, including their labels. Repeated endpoint references identify one node. Link strings such as `A->B` are not binding or focus ids, since endpoint names can make that concatenation ambiguous. |
| `radar-beta` | Declared curve names, shared by the curve and its legend. Axis names and scores do not establish a curve category or a state role. |
| `treemap-beta` and `treemap` | Exact node names, including section headers and leaf values. Repeated names at different depths are ambiguous, not unique paths. A section colors its own header and backing, not its descendants. Zero-sized or collapsed nodes with no emitted marks refuse explicit bindings. |
| `venn-beta` | Exact set names, declared text ids, and intersection identities formed from sorted set names joined by `|`, as Pele emits them. Colliding identities are ambiguous. An intersection with text but no fillable region colors only its text. Missing geometry remains missing. |
| `sequenceDiagram` | Participant ids, including declared actors and database participants. One identity owns header, footer when present, and lifeline. Alias text is not an id. Messages, activations, notes, boxes, and loop or alternative frames have no stable declared identity and refuse binding or focus. |
| `stateDiagram-v2` and `stateDiagram` | Declared and referenced state ids, including composite states and their visible children. Generated transition ids and start or end pseudostates are unsupported binding and focus targets. Labels do not identify a state or establish an outcome. |
| `swimlane-beta` | The flowchart node, lane subgraph, and explicit edge identities. Lane roles do not imply child roles. |
| `agentflow-beta` | Visible task, tool, connector, flow group, and explicit edge ids. Collapsed groups retain their own target, but their children have no visible geometry and refuse binding or focus. Generated edge ids are unsupported. |
| `eventmodeling` | Exact `tf` and `rf` frame ids, including leading zeros. Entity names, lane labels, generated relations, notes, and Given/When/Then cards are not independent binding or focus identities. Repeated frame ids are ambiguous. |
| Packet and `packet-beta` | Unsupported. Bit ranges and labels are not declared semantic ids. Valid figures render neutrally without bindings. |
| `railroad-beta` | Unsupported. Rule names do not expose stable owned SVG targets in pinned Pele. |
| `railroad-ebnf-beta` | Unsupported, with the same rule-target limit. |
| `railroad-abnf-beta` | Unsupported, with the same rule-target limit. |
| `railroad-peg-beta` | Unsupported, with the same rule-target limit. |

Packet and all railroad notations keep neutral paint when semantic identity is unavailable. Do not substitute generated DOM ids, selectors, or a label guessed from visual position. A refusal leaves any previous SVG untouched, and the caller must not publish that old output as the failed render.

Timeline sections supply exact category keys for their own headers and their periods. An unsectioned period uses its exact period text. Individual event boxes stay neutral. Gantt `done` supplies `ok`, and `crit` supplies `warn`, not failure. A task marked both uses `done` precedence. `active`, ordinary tasks, section bands, and names that resemble states establish no role. Explicit role or category bindings replace intrinsic task coloring.

Journey participant names are exact category keys, not proof that a participant is a person. Use an explicit `actor` binding when the source description establishes a person. Task boxes, sections, satisfaction scores, faces, and score routes stay neutral unless their supported target has a binding. A binding on a task does not recolor its participant dots.

Kanban columns and cards stay neutral without bindings. Only the existing priority indicator uses the exact priority value as a category key. Priority does not mean failure, and column labels such as "Done" establish no state. Pele supplies no priority legend or printed priority label here. Coloring adds neither. Explain priority in accompanying text when readers need it.

Git branch names are exact category keys. Commits use their source branch key, and routes use the destination branch, except merge routes use the merged branch. The resolver reads actual branch membership rather than treating a repeated series slot as identity. Merge rings and reverse or cherry-pick cutouts retain their glyphs. These glyphs establish no success, failure, change, or focus role. Labels remain authoritative when keys share an accent.

Native C4 keeps its own syntax. `Person` and `Person_Ext` establish `actor`. Otherwise an external entity establishes `external`, even when it is also a database. An internal `SystemDb`, `ContainerDb`, or `ComponentDb` establishes `store`. Internal software and queue kinds stay neutral. An enclosure never makes its children external.

Architecture `database` and `disk` service icons and block cylinder shapes establish `store`. A requirement element explicitly typed `file` establishes data at rest. Generic ER entities, classes, requirements, use cases, and UML actors stay neutral without a role. In particular, a UML actor may be software. Use an explicit binding for a person or an outside system whose kind is not established by the notation. Labels, risk fields, and queue shapes supply no extra role.
Architecture service labels keep ordinary Text paint. Their existing outline icons use Text strokes against the tinted role backing. Category bindings retain their existing solid backing and label paints.

Tree file kinds color existing file-icon geometry as `store`, while unbound labels remain Text and directories remain neutral. Icons disabled or absent in the source stay absent. An explicit row binding can color its visible label and existing icon without inventing a backing or icon. Focus applies to visible row marks, not a path identity. Repeated basenames therefore cannot be focused independently through the string-id interface.
In sequences, only `actor` declarations establish a person and `database` participant kinds establish stored data. Generic software participants, collections, and queues stay neutral. Role labels keep ordinary Text paint, including labels outside participant icons. Participant headers and footers are one semantic target, not a duplicate assignment.

Agent-flow `refdoc` kinds establish `store`, and source failure relations establish `bad`. Other source vertex kinds use their exact kind key, such as `task`, `tool`, or `decision`, as categorical identity. Software tools are not people and a decision is not a success verdict. Flow containers stay neutral without a binding. Event-model `readmodel` frames establish `store`. Command, event, and processor frames use exact `command`, `event`, and `processor` category keys. UI and reset declarations establish no outcome. An event occurrence does not mean success, a processor is not a person, and a command does not imply changed code.

These interaction and workflow bindings use the shared role, category, kind, and focus precedence. Distinct explicit roles conflict, as do distinct explicit category keys even when a role masks them. Identical repeats are accepted. Unknown elements stay neutral. Palette changes preserve Pele's geometry rather than creating hidden children or fillable regions. Agent-flow role fills use the same 22% tint and Text labels as other families. Category fills stay opaque with their existing labels, and neutral container opacity remains unchanged. Focus on an unsupported or missing sequence, state, agent-flow, or event-model identity exits 1 without publishing an SVG.

Mindmap branch order and spatial position establish no Color role. Ishikawa causes and Cynefin domains do not imply failure or success. Wardley symbols remain neutral unless the caller supplies a role or category. A supported identity can own several marks, such as a Cynefin region and its domain label or a Wardley component and its evolution arrow.

Quantitative category keys retain exact spelling and case. The same key keeps its accent across families, insertion, reordering, and render processes. A binding can replace the key or assign an explicit role. Values, scores, and names such as "Done" establish no success or failure role by themselves. Labels remain authoritative when accents collide.

Sankey keeps the source's `source`, `target`, or `gradient` link-color mode. The renderer supplies a figure-scoped internal prefix so Pele can emit its configured gradients instead of falling back to a source-colored link. Each stop receives its actual endpoint's resolved role or category paint. Stops are literal Mocha colors, although the displayed gradient interpolates between them. A focused node keeps its fill, and does not recolor the link's endpoint paint.

Bindings require one supported stable source identity with visible owned marks. Focus additionally requires a visible owned border mark. Missing, ambiguous, generated, collapsed, or geometry-free explicit targets are refused without creating or replacing output. One semantic target may own several marks. Without an explicit target, valid figures still render, and ambiguous names stay neutral.

## Retained comparison research

The historical complex comparison lives under the project's Scratch path `grilling/vstack-real-questions-mermaid-report/report/`. It contains 39 Mermaid keyword cases and five C4-flowchart variants, which are 44 comparison pairs, not 44 distinct families. Re-asked questions use their latest record as provenance. Historical drawing-agent wording grants no separate drawer: the executing caller chooses the Mermaid type without a model judge.

The prototype observed 13 accents and 9,980 computed paints. Those counts verify neither this renderer nor every possible target. The source notes and corpus selectors remain research, not a product registry. The discarded 50-real-question gallery, its sampling rules, and its source index are not part of the retained deliverable.

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
