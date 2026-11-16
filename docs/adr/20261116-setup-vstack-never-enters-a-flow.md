# setup-vstack never enters a Flow

The user chose this in the `setup-vstack-without-flow-cb8449` grill. It amends [ADR 0046](0046-a-flow-starts-only-on-request.md) for one skill. Under ADR 0046, typing `/skill:<name>` puts that run on a Flow page. setup-vstack is typed-only, so every setup opened a Flow, published each question, config draft, and Migration plan there, saved each helper's output to Scratch as evidence, and ended with a Document Result. The user does not want a page for setup.

setup-vstack runs in chat whatever the context, including when a caller supplies a Flow or the user asks for a page in words. It asks through plain `ask` with each question's context in chat. It shows the Migration plan and manual diffs in chat before that approval. Before writing, it shows in full the config drafts it composed beyond a seed template, such as an Other CLI or MCP config, the CI cutover, the GitLab row replacement, and the `## vstack` block, and one line for each template-seeded file. It still writes, commits, and pushes without a write question ([ADR 0068](0068-flow-tracker-and-config-writes-publish-without-approval.md)). Its final reply carries the report that the Document Result held. It no longer saves helper output to Scratch. Its Scratch run entry keeps only the Migration and Private MCP plan files that the helpers read back. Machine check 12, Tern's `vstack-flow` link, stays, because it serves other skills' Flow pages.

## Considered Options

- Drop only the typed trigger, so a request in words or a supplied Flow still enrolls setup. No skill supplies a Flow to setup-vstack, and every question, draft, and report would keep two paths.
- Show every config draft in full in chat. A fresh setup would print about 170 lines of fixed template text that no question acts on.
- Show no drafts. Agent-composed CLI or MCP rows and the CI cutover would land unseen.
