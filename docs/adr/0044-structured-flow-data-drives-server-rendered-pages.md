# Structured Flow data drives server-rendered pages

> [ADR 0046](0046-a-flow-starts-only-on-request.md) amends enrollment. Result producers follow flow-page's central entry rule before discovery or creation. Description-selected skills can return full answers in chat without a Flow. The authoring, rendering, and publication decisions below still apply within a Flow.

The user chose this design in the Flow page redesign grilling (spec #267). It amends [ADR 0013](0013-a-script-renders-the-grilling-page-from-a-jsonl-state-file.md) and [ADR 0029](0029-a-flow-keeps-one-grilling-page-tabbed-by-stage.md). The implementation targets vstack 8.0.0. The fresh combined proof found a live-selection defect, which the review-fix wave corrected. The corrected product passed browser and native omp proof before this status changed, including observation refresh, captured figures, historical continuation, and shared-worktree recovery. The Verify recipe's `flow-t4` section defines the combined proof. Real authenticated GitHub and GitHub Actions observations remain unexercised by that controlled-adapter proof.

This unpublished decision was renumbered from 0040 to 0044 during upstream reconciliation. Published ADR 0040 covers Mermaid/Pele figures, and published ADRs 0041 through 0043 retain their numbers. The reconciliation carries [ADR 0042](0042-every-grilling-question-declares-its-reader-needs.md)'s reader-needs contract into typed Flow authoring and [ADR 0043](0043-an-independent-verifier-owns-final-proof-at-every-end-state.md)'s independent committed-head proof into centralized progress publication. Earlier proof above describes the pre-reconciliation tree, not proof of the changed tree.

The Grilling page becomes the Flow page. Agents publish structured content through a Stage-bound authoring interface. Code owns validation, identifiers, links, persistence, numbering, rendering, navigation, and presentation. One renderer produces the live page and its static fallback. Agents do not write the page's HTML, CSS, or executable interaction code.

A result-producing run gets its own Stage, including a nested run with its caller as parent. Result blocks replace Report blocks. Result is the authoring short form. They include Document, Comparison, Metrics, Code/diff, and Timeline alongside cards, ledger, and table. Standalone explanations also start a Flow. Internal reference and helper reads create no empty Stage. Triage discovery and model-free Commands attach their results when a Flow exists but do not create administrative Flows by default.

The page script starts a detached local server on demand, normally one per operating-system user. An explicit isolated `--home` namespace has its own host identity. A refusal commits no Flow content, although host lifecycle metadata may be written. The server serves structured Flow content and observes workflow status through read-only adapters for git, the separately configured Code host, and CI. GitHub and GitHub Actions have built-ins. Other configured services use a provider-neutral HTTP JSON contract. GitLab has no built-in native adapter and remains unknown unless configured through that contract. Existing skills retain execution and authorization. The extension presents the bound Flow URL after every turn. Immutable Flow identity keeps live URLs stable when a topic acquires a spec or its folder moves.

## Why

A review of 40 recent Flow pages found investigation and prototype results in question descriptions, Backgrounds, Topic notes, and close bullets. Full reports also lived in separate HTML files. The old model gave agents no common result format beyond cards, ledger, and string tables. Seven of 15 sampled sessions lost the page path in a later reply after grilling. The keyboard handler also selected historical unanswered questions rather than current work.

ADR 0029 rejected separate Stage results to avoid writing them twice. The new design makes the Flow page the primary reading location. Chat summarizes and links it. Canonical files and tracker objects keep their existing ownership. A Result captures a versioned snapshot with its canonical source link, so later source changes do not rewrite the evidence behind an earlier decision.

## Alternatives considered

- Keep separate explanation and report pages. This preserves the fragmented reading experience and separate templates.
- Add a server around the existing JSONL append interface. This leaves storage records, reciprocal links, complete-record rewrites, and concurrency coordination in every caller.
- Use only an explicit contribution interface. It is predictable but repeats context in common calls.
- Expose a flexible publication grammar without session binding. It supports typed content but increases the caller's interface.
- Use Stage-bound authoring with typed content. This is the chosen design. An explicit target remains available for parallel work, and bindings belong to a session and agent rather than to the last active Stage globally.
- Make the server a workflow executor. This would duplicate skill and omp orchestration and move permissions into a second system. The server instead records and observes work.
- Retain every Flow forever or keep ordinary Scratch expiration. Protecting open Flows preserves unfinished work while keeping a cleanup policy for completed history.

## Consequences

- Open Flows, including supported structured historical pages awaiting migration, are protected from automatic cleanup. Discovery checks historical candidates before a new Flow starts. Explicit migration preserves identity, and a retained source cannot resurrect expired content. Closed Flows become eligible after 90 days. Reading a page does not renew its retention.
- The Overview shows progress and distinguishes requested End state, reached End state, task completion, blockers, and observed remote status. Unknown or stale observations are not success.
- `n` prioritizes the newest active Stage. Unresolved questions retire with their old Stage. Still-relevant decisions are asked in the current Stage with a link to the earlier question.
- A note that settles a question can resolve it without another ask. The record preserves the user's response and distinguishes interpretation from an explicit option pick. This does not invent consent or replace existing authorization rules.
- `t` opens a clickable tree of Stages only. Ticket dependencies remain separate result content. Ticket identifiers disambiguate repeated Stage tabs. The Topics tab stays.
- Code-review Results begin with a human-readable summary table linked to detailed findings. Clean, skipped, unavailable, and blocked outcomes remain explicit.
- The renderer supports Quiz and Interactive prototype kinds as well as static Results. Interactive prototypes support both declarative state demos and real runnable HTML or local app artifacts. Supported browser artifacts use an isolated viewer, not the Flow page's origin. Terminal and backend-dependent artifacts retain real launch paths and explicit availability states. No separate figure-motion kind was selected.
- Typed attachments preserve images, videos, figures, files, evidence, and runnable artifacts. Questions and Backgrounds reference captured image/SVG figures, and options reference captured previews with meaningful descriptions and provenance. New page authoring still prohibits raw HTML, CSS, and scripts. A static export retains readable content and supported offline interactions. An unavailable live backend remains unavailable rather than becoming a simulated substitute.
- Fresh and re-asked questions declare nonempty reader needs with Visual kinds before one atomic publication. Matching visuals live on that question or its options, not only in a Background or Result. Safe text figures preserve source excerpts and usage previews. Captured Pele SVGs supply diagrams. Historical records without needs remain readable without invented metadata.
- Quiz attempts and lesson completion persist with the Flow through authenticated progress writes distinct from authoring and real question answers. Offline attempts can synchronize when the server returns. Demo state and playback position remain browser-local. Existing learning documents keep their canonical ownership.
- All result producers use one authoring contract. The cutover removed the grilling-page writer, its visual judge, and the separate explain and how page templates rather than keeping parallel conventions. Structured historical Grilling pages migrate into Flows; handwritten ones stay readable as they are.
- The existing grill-summary confirmation rule remains. Finishing a Stage is not permission to publish or execute downstream work.
