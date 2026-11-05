# Figure captions are short titles, with their source behind a disclosure

The user chose this in the `flow-diagram-fit-width-d865de` interview on 2026-11-06, in Stage 1's questions 3, 5, 6, 7, 8, and 10. It amends [ADR 0044](0044-structured-flow-data-drives-server-rendered-pages.md) and [ADR 0050](0050-the-flow-reader-draws-diagrams-from-mermaid-source-with-pele.md) where they describe figure captions. These are accepted design decisions, not a claim that the implementation is complete.

An attachment's `caption` is a title of one line and at most 80 characters. The flow-page script refuses a longer caption, or a caption with a line break, and commits nothing. `caption` stays required, and it stays the accessible name of the image, diagram, video, or artifact viewer. A new optional `description` holds everything else the reader needs to know about the figure. It takes the same plain-text formatting as other text fields: paragraphs, `- ` bullet blocks, code, and links. `origin` stays required.

Every figure uses one presentation, whether it sits in a question, an option preview, a Background, a Result, a Document, a Comparison, or a Timeline. The caption comes first, in the slab heading font, in the main text color, at weight 650 and body size. The description follows in the secondary text color. Both sit on the page background above the media. Only the media has a background box, and that box is as wide as the media, up to the column width. The reader adds no `Q<n> ·` prefix to a caption. A closed disclosure labelled `Source` holds the origin, the attachment's type, availability, revision, source path, and capture time, and the note that an image's example identity is unrecorded.

Stored attachments are not checked again or split. A Flow written before this change shows its long caption as the title. The reader drops a leading `Q<n> · ` from a stored caption, because earlier evaluation captions carried the question number that the reader no longer adds.

## Considered Options

- **Add an optional `title` and keep `caption` as the description.** No author is refused, but an author can leave out the title, and the field named `caption` would hold a description.
- **Ask for short captions in the docs only.** Long captions still pass when an author misses the guidance.
- **Keep the caption inside a background box that is as wide as the diagram.** A narrow diagram squeezes its caption into many short lines.
- **Remove the origin from the page.** Evidence in a Result would no longer show where it came from.
- **Keep the origin and attachment meta in Results only.** The page would then show figures in two ways.
- **Make diagrams denser with smaller Pele spacing and padding.** The user declined. Pele fixes the padding inside a node, and that padding is the part the user wanted smaller.

## Consequences

- Every skill and reference that tells an author how to write `caption` changes in the same cutover, including flow-page's attachment reference, vstack-figures, and the flow-page evaluation procedure.
- The reader's figure components share one caption, description, and `Source` block instead of the separate caption markup they use today.
