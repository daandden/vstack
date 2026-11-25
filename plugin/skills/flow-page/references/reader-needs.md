# Reader needs and Visual kinds

Prepare each new or re-asked question with this checklist before publication through flow-page's "Every ask in a Flow" contract. This applies to the executing author, including a subagent assigned publication without asking.

1. Put shared scope, boundaries, and option meanings once in the Stage Background. Put concepts used across rounds or Stages in Topic notes and one-line definitions in Term notes. Keep a question's local exceptions beside that question.
2. Write the Decision brief. Use `round.now` for what is true about the work and why this round is needed now. Record why each question passes the [Settle-or-ask test](../../../rules/vstack-settle-or-ask.md) and what you checked first. Say what the answer unblocks and how to undo the decision, or state that it cannot be undone. On every re-ask, say what left it open or changed, even if no answer was recorded. Recommend one option with a reason or explain why you have no recommendation. Use [the round fields](contributions.md) for the exact keys. Keep each question's brief specific to its decision.
3. Draft the title, description, options, and sourced Today facts. The reader must be able to choose from the question and shared Background without consulting a findings table, another question, or the source transcript:
   - Explain today's behavior in plain words and what it means for the user. Define the role of a named file, check, or tool when that role matters to the choice.
   - State the observed evidence, what it establishes, and its limits. Keep qualifications beside the claims they limit. Distinguish observed facts from inference and label authored examples hypothetical. Retain traceable sources in Today facts or the question's evidence.
   - Describe the proposed change and its target. Explain local routing or approval exceptions where they affect the choice. Finding numbers, file names, and Result links identify the work but do not explain it.
   - Make each option's `does`, `gains`, and `costs` specific to this decision. Name the work or behavior it changes, the benefit, and the meaningful cost or risk. Reuse labels for shared choices, but explain their consequences for this question rather than repeating the Background's meanings.
4. Declare one or more `needs`, each `{ need: "<concrete distinction>", kind: "<id>" }`. Name what the reader must recognize, know, or compare to choose between these options. A generic instruction to read the page is not a need.
5. Build the visuals for non-prose needs, with the same `kind` on each question figure or option preview. One concise visual can meet several needs of the same kind.
6. Cut overlapping brief, description, and Today text. Keep any fact or caveat the choice depends on in the description. The reader folds Today facts and citations into **Sources and context**. Check that the choice remains clear before opening that row or any linked Result.
7. For ordinary main-agent delivery, follow [Every ask in a Flow](../SKILL.md#every-ask-in-a-flow). Publish the complete round and its new attachments in one CLI contribution. The shared contract owns the content check, picker handoff, failures, answer recording, and Ratchet's native approval exception.

| Visual kind | `kind` | Reader need and safe representation |
| --- | --- | --- |
| Source view | `source-view` | Recognize the actual floor plan, screen, page, or other artifact. Capture a crop or screenshot, mark the subject, and retain enough surroundings to locate it. Use an image or existing safe SVG attachment. |
| Source excerpt | `source-excerpt` | Read exact code, configuration, or output with its file and line. Use an escaped `text` figure. |
| Context diagram | `context-diagram` | Follow today's steps, branches, states, parts, or time. Capture the Mermaid source as a `mermaid` attachment. |
| Option diagram | `option-diagram` | Compare ownership, handoffs, structure, states, or timing across options in one figure. Capture the Mermaid source as a `mermaid` attachment. |
| Option preview | `option-preview` | See an option's actual output or usage. Use a captured image or SVG, or escaped text. This kind goes only on an option's `preview`. |
| Before and after | `before-after` | See the current state beside the state one option would produce. Capture an image or safe SVG. |
| Comparison table | `comparison-table` | Compare options on shared attributes, one row per option. Capture a safe SVG or image of the table. Keep the complete structured comparison in its typed Result when applicable. |
| Data chart | `data-chart` | Weigh measured cost, time, counts, or other decision numbers. Capture the Mermaid source as a `mermaid` attachment and state the measurement scope and what the values establish. Aggregate counts do not identify particular changed failures. Retain full measurements and uncertainty in a Metrics Result. |
| Scenario walkthrough | `scenario` | Follow one concrete case through each option to see where they part. Capture the Mermaid source as a `mermaid` attachment. |
| Prose | `prose` | Understand a distinction the description's words explain sufficiently. No visual is required. |

Only a visual on this question or its options meets its needs. Background and Result visuals, Result links, and an untyped `example` do not count. Repeat a captured attachment reference when the same bytes already appear elsewhere. Put Context diagrams before Option diagrams. A re-ask preserves earlier needs and updates them when the decision changes.

Draw every diagram through `skill://vstack-figures`, including small boxes, arrows, trees, timelines, axes, and states. The executing caller chooses the Mermaid type from its reference without a model judge. Use unique basenames in the caller's Scratch entry and capture each source as a `mermaid` attachment. The reader draws it with Pele. A captured Pele SVG from an earlier Flow still meets these kinds. Source screenshots, mockups, and tables are not permission to author raw HTML, CSS, or scripts in the Flow.

If a required source cannot be obtained, use `prose` for that need and explain what is missing in the description. Do not invent facts or alter option meanings. An unavailable attachment does not satisfy a visual need.

The authoring interface refuses missing or empty needs, unknown kinds, an unsatisfied non-prose need, a visual with no kind or no declared need, and `option-preview` on a question figure. No part of the contribution commits. Fix the complete contribution and resubmit. Stored pre-contract questions remain readable and answerable without invented needs or kinds. Declared historical metadata survives migration.
