# Every Grilling question declares its reader needs

> This decision amends [ADR 0013](0013-a-script-renders-the-grilling-page-from-a-jsonl-state-file.md) and [ADR 0040](0040-figures-are-mermaid-rendered-by-pele.md).

Each question record on a Grilling page lists its reader needs: what the reader must recognize, know, or compare to choose between the options. Each need names the Visual kind that shows it: a Source view, a source excerpt, a Context diagram, an Option diagram, an option preview, a Before and after, a comparison table, a Data chart, a Scenario walkthrough, or plain prose. Every kind except prose points at a visual of that kind on the question or on one of its options. A visual in the Stage Background does not meet a question's need. The agent writes and appends a complete question once. `grilling-page.ts` refuses a new question with no needs list, a need whose visual is missing, or a visual that no need asks for. Question records stored before this change keep rendering.

We chose this after two runs reached `ask` without the visual the user needed. In an implement-spec run, eight door-type questions had no view of the floor plan. In a session review, a choice between two checkout models had no Option diagram. Add a round was in context in both runs, with no compaction. Both runs appended each question once and asked. The second append, where Add a round decides visuals, never ran, and the script accepted the questions without it.

## Considered Options

- **A visual checkpoint in each caller skill's ask step**: rejected. Both runs had the guidance in context and skipped it, so another sentence of the same kind would not hold. Every new caller would also have to remember the step.
- **Keep the two-append procedure and make a visual mandatory**: rejected. A text-only decision would get a decorative visual, and a skipped second append would still leave a valid page.
- **Better wording for Add a round only**: rejected. An evaluation in fresh, isolated runs showed that the wording already produced drawing context. The failure happened when a long caller run treated the first append as done.

## Consequences

- The check catches a skipped decision, not a poor one. An agent can still list a wrong need, and the page shows that need to the reader.
- The Flow page redesign (issue #267) must carry the needs contract into its authoring interface.
