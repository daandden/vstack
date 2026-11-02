# Reader needs and Visual kinds

Prepare each new or re-asked question completely before publication through flow-page's "Every ask in a Flow" contract. This applies to the executing author, including a subagent assigned publication without asking. List what the reader must recognize, know, or compare to choose between the options, not a generic instruction to read the page.

1. Write the title, description, options, and sourced Today facts.
2. Declare one or more `needs`, each `{ need: "<concrete distinction>", kind: "<id>" }`.
3. Build the visuals for non-prose needs, with the same `kind` on each question figure or option preview. One concise visual can meet several needs of the same kind.
4. Cut overlapping description and Today text, retaining what the decision changes and why it matters. Preserve source qualifications, unresolved choices, and evidence limits. Label authored examples hypothetical.
5. For ordinary main-agent delivery, include the complete question and its new attachments in one contribution to `flow_ask`. Follow the common owner for publication-only work, failures, picker delivery, and Ratchet's native approval exception.

| Visual kind | `kind` | Reader need and safe representation |
| --- | --- | --- |
| Source view | `source-view` | Recognize the actual floor plan, screen, page, or other artifact. Capture a crop or screenshot, mark the subject, and retain enough surroundings to locate it. Use an image or existing safe SVG attachment. |
| Source excerpt | `source-excerpt` | Read exact code, configuration, or output with its file and line. Use an escaped `text` figure. |
| Context diagram | `context-diagram` | Follow today's steps, branches, states, parts, or time. Capture a Pele SVG. |
| Option diagram | `option-diagram` | Compare ownership, handoffs, structure, states, or timing across options in one figure. Capture a Pele SVG. |
| Option preview | `option-preview` | See an option's actual output or usage. Use a captured image or SVG, or escaped text. This kind goes only on an option's `preview`. |
| Before and after | `before-after` | See the current state beside the state one option would produce. Capture an image or safe SVG. |
| Comparison table | `comparison-table` | Compare options on shared attributes, one row per option. Capture a safe SVG or image of the table. Keep the complete structured comparison in its typed Result when applicable. |
| Data chart | `data-chart` | Weigh measured cost, time, counts, or other decision numbers. Capture a Pele SVG and state the measurement scope and what the values establish. Aggregate counts do not identify particular changed failures. Retain full measurements and uncertainty in a Metrics Result. |
| Scenario walkthrough | `scenario` | Follow one concrete case through each option to see where they part. Capture a Pele SVG. |
| Prose | `prose` | Understand a distinction the description's words explain sufficiently. No visual is required. |

Only a visual on this question or its options meets its needs. Background and Result visuals, Result links, and an untyped `example` do not count. Repeat a captured attachment reference when the same bytes already appear elsewhere. Put Context diagrams before Option diagrams. A re-ask preserves earlier needs and updates them when the decision changes.

Draw every diagram through `skill://vstack-figures`, including small boxes, arrows, trees, timelines, axes, and states. The executing caller chooses the Mermaid type from its reference without a model judge. Use unique basenames in the caller's Scratch entry, render through Pele, then capture the real output. Source screenshots, mockups, and tables are not permission to author raw HTML, CSS, or scripts in the Flow.

If a required source cannot be obtained, use `prose` for that need and explain what is missing in the description. Do not invent facts or alter option meanings. An unavailable attachment does not satisfy a visual need.

The authoring interface refuses missing or empty needs, unknown kinds, an unsatisfied non-prose need, a visual with no kind or no declared need, and `option-preview` on a question figure. No part of the contribution commits. Fix the complete contribution and resubmit. Stored pre-contract questions remain readable and answerable without invented needs or kinds. Declared historical metadata survives migration.
