# Reader comments are saved to the Flow and never answer

The user chose this in the `ak-render-flow-page-75092c` interview on 2026-11-10. These are accepted design decisions, not a claim that the implementation is complete.

A reader can attach a Reader comment to text or a block of one Result revision and copy all comments as one prompt for the agent, an idea borrowed from ak-render's feedback block. Comments go to their own authenticated endpoint, modeled on Quiz progress writes, and are stored apart from authored Flow records. A comment stays attached to the revision it was written on. The agent reads comments through `show` when the user points at them; nothing adds them to the agent's context unasked. A Reader comment never answers a question, never counts as consent, and never changes authored content or workflow progress. Only observed `ask` responses answer questions, as flow-page's "Every ask in a Flow" says.

## Considered Options

- **Browser-only with Copy feedback**, as ak-render does: rejected. Comments would vanish on another browser, and the agent would see nothing until the user pasted them.
- **Saved and announced to the agent's next turn by the omp extension**: rejected. Unasked comments could redirect the agent mid-task.
- **Let ak-render's decision block answer questions**: rejected. It starts recommended options checked, so a copied pick does not show a deliberate choice.
