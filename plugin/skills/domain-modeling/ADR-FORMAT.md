# ADR format

New ADRs use `YYYYMMDD-slug.md`, such as `20261111-event-sourced-orders.md`, in `docs/adr/`. Use the local creation date, not UTC or the landing date. The date must be a real calendar date. Use lowercase letters and digits in the slug, with single hyphens between words.

Create the directory only when the first ADR is needed. In Private mode, keep the project's existing ADR location under the vstack root's `domain/adr/`. The naming rule applies to new ADRs in every project using the plugin. Do not rename existing records or disclose private records.

## Template

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

That's it. An ADR can be a single paragraph. The value is in recording *that* a decision was made and *why*, not in filling out sections.

## Optional sections

Only include these when they add genuine value. Most ADRs won't need them.

- **Status** frontmatter (`proposed | accepted | deprecated | superseded by ADR <full-stem>`): useful when decisions are revisited
- **Considered Options**: only when the rejected alternatives are worth remembering
- **Consequences**: only when non-obvious downstream effects need to be called out

## Identity and citations

Cite a new ADR by its full filename stem without `.md`, such as `ADR 20261111-event-sourced-orders`. Keep its creation date when the branch lands on a later day. Once landed, its filename is stable.

If two branches choose the same date and slug, the branch that lands second chooses a different slug before landing. Update that branch's references to its new stem. Do not rename the landed record or reserve every name with a push.

Existing numbered ADRs keep their filenames and citations.

Keep ordinary lexical filename order. No global sequence, random-id resolver, or citation rewrite is needed.

## When to record an ADR

All three of these must be true:

1. **Hard to reverse**: the cost of changing your mind later is meaningful
2. **Surprising without context**: a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off**: there were genuine alternatives and you picked one for specific reasons

If a decision is easy to reverse, skip it: you'll just reverse it. If it's not surprising, nobody will wonder why. If there was no real alternative, there's nothing to record beyond "we did the obvious thing."

### What qualifies

- **Architectural shape.** "We're using a monorepo." "The write model is event-sourced, the read model is projected into Postgres."
- **Integration patterns between contexts.** "Ordering and Billing communicate via domain events, not synchronous HTTP."
- **Technology choices that carry lock-in.** Database, message bus, auth provider, deployment target. Not every library: just the ones that would take a quarter to swap out.
- **Boundary and scope decisions.** "Customer data is owned by the Customer context; other contexts reference it by ID only." The explicit no-s are as valuable as the yes-s.
- **Deliberate deviations from the obvious path.** "We're using manual SQL instead of an ORM because X." Anything where a reasonable reader would assume the opposite. These stop the next engineer from "fixing" something that was deliberate.
- **Constraints not visible in the code.** "We can't use AWS because of compliance requirements." "Response times must be under 200ms because of the partner API contract."
- **Rejected alternatives when the rejection is non-obvious.** If you considered GraphQL and picked REST for subtle reasons, record it; otherwise someone will suggest GraphQL again in six months.
