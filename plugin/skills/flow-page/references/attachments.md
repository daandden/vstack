# Captured attachments, version 1

Read this reference before capturing an attachment, linking a canonical file revision, adding question/Background figures or option previews, or publishing a runnable artifact.

- `attachment`: optional `ref`, `type`, `caption`, and `origin` (what produced it, such as the command or the browser step). `type` is `image` (PNG, JPEG, GIF, or WebP), `video` (MP4 or WebM), `svg`, `file`, `trace`, `evidence`, or `artifact`. Give `path`, the file to capture, or `unavailable`, the reason there is none. An `artifact` instead takes `launch` and `revision`, with the runtime fields below. Name each attachment in a Result's `attachments`, a Document `figure`, a Comparison alternative's `attachments`, a Timeline event's `attachments`, a prototype's `artifact`, a question or Background's `figures`, or an option's `preview` in the same contribution.

## Captured figures

Questions and Backgrounds take `figures: [{ attachment: "<ref or id>" }]`. Options take `preview: { attachment: "<ref or id>" }`. Each reference must resolve to an available, captured `image` or `svg` attachment, in the same contribution or an earlier receipt. The attachment's required `caption` supplies a meaningful description, and its `origin` records provenance. The script assigns figure ids. Wrong-type, unavailable, and missing references are refused atomically. Use these fields when the reader needs a diagram, screenshot, or option preview to decide. Preserve the explanation in text as well. Historical figure formats stay readable but are not new authoring formats.

## Captured revisions

The script reads an attachment's file once, when you submit it, and stores its bytes in the Flow under their sha256. A `{ file }` canonical link records the file's sha256 at that time. Editing a source file later changes nothing on the page. To show the new content, submit the Result again with `revises`.

A `path` is relative to the working directory, or absolute, and must be a regular file inside the project or its Scratch dir. A path that leaves both, directly or through a symlink, is refused. An image or video must be one of the formats above, and an SVG with scripts, event handlers, embedded HTML, or script URLs is refused.

The script stores evidence byte for byte. Redact it as the producing skill's contract requires before you attach it, for example with every secret replaced by `<REDACTED>`.

## Runnable artifacts

An `artifact` attachment always has `launch`, the real commands or steps a reader runs outside the page, and `revision`, the producer's source revision. Add `unavailable` with a reason when a required runtime or dependency is absent.

- `runtime: "html"` captures a bundle with `bundle: { entry, files }`. `entry` is its HTML entry path. Each file is `{ path, source }`, where `path` is its unique relative URL path and `source` is a regular file in the project or its Scratch dir. Register every resource the bundle needs. Use relative resource URLs. Traversal and paths outside those roots are refused. The captured bundle's content hash replaces the supplied source revision as its attachment revision. Editing source files does not change the captured bundle.
- `runtime: "local-app"` takes `url`, an `http://127.0.0.1:<port>/<route>` URL with no credentials. Start the actual app yourself. The host neither launches it nor keeps it alive. On each page read it checks that the route answers with HTML, without following redirects. The route must permit iframe embedding. Its own backend dependencies remain the producer's responsibility. Record an absent one with `unavailable`.
- `runtime: "terminal"` shows launch steps and availability without pretending to provide a terminal. An artifact with no `runtime` also remains launch-only. Its optional HTTP URL is a reference, not proof that an app is running.

A prototype Result names the attachment with `artifact: "<ref or id>"`. The live host runs captured HTML on a separate loopback origin with an artifact-only read capability. Its sandbox permits scripts but blocks top navigation, forms, popups, and access to the parent Flow. Bundle network access stays on the viewer origin. Local app routes run in a sandbox on their own origin, never the Flow host's origin. Neither origin has an authoring or workflow endpoint.

The static export always shows launch instructions and an explicit unavailable state for runnable artifacts, even if a local app happened to be running when the Result was submitted. It embeds no live runtime or viewer URL. Declarative demos remain usable offline.

