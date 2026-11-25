---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model or logic feels right, explore what a UI should look like, or find out what code actually does or how fast it runs.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or one question-tool round if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). In a Flow, prefer a declarative demo when its states, values, actions, and transitions express the question. Otherwise keep a real runnable artifact, including for chat runs.
- **"What should this look like?"** → [UI.md](UI.md). Generate several radically different UI variations on a single route, switchable via a URL search param and a floating bottom bar.
- **"What does it actually do, and how fast?"** → [BEHAVIOR.md](BEHAVIOR.md). Write the smallest script that exercises the question and prints the output or the timing.

The three branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend module → logic; a page or component → UI; a runtime or performance claim → behavior) and state the assumption at the top of the prototype.

When the question has more than one plausible answer, build the variants the user did not ask for as well.

## Compare variants

For a comparative prototype, establish a comparable workload or quality target before running the variants. Record each variant's configuration and preparation, including defaults and conversion work that could decide the outcome.

Before recommending a winner, report those differences beside the observed evidence. Distinguish a difference in tool capability from a difference in settings or preparation. If settings remain unmatched or conversion is incomplete, state that as an evidence limitation and limit the recommendation to what the runs establish. Unequal denoising, for example, does not establish an inherent quality difference between renderers.

## The Flow page

Follow `skill://flow-page`'s "Stage entry/exit line" before producing a Result or asking the branch question. A detour retains the Flow identity in its handoff. A prototype for a wayfinder ticket is a nested result-producing run under that ticket's Stage.

In a Flow, publish a `prototype` Result with a declarative `demo` or a runnable `artifact` attachment. Capture a self-contained HTML bundle with `runtime: "html"`, every resource it needs, real launch steps, and its source revision. For app-bound UI variants, preserve the actual application route and `?variant=` keys. Start the app yourself and register its loopback route with `runtime: "local-app"`. Keep terminal and backend-dependent scripts as terminal artifacts with real launch commands and an explicit `unavailable` reason when a runtime is missing. A static description or a simulated backend never replaces the executable.

In a Flow, put the design question, walkthrough steps, observed evidence, limitations, and throwaway notice in a Document Result beside the prototype. Use Comparison for competing variants and Metrics for measurements. Attach the screenshots and raw script output. Keep the actual source and capture paths required below. The Flow page is the reading document, not a second report page or the canonical implementation.

Apply the [Settle-or-ask test](../../rules/vstack-settle-or-ask.md) before asking for a prototype choice. Deliver a remaining question through `ask` under skill://flow-page's "Every ask in a Flow" when enrolled, or plain `ask` in chat. Demo state remains browser-local and authorizes nothing.

## Rules that apply to all three

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or page it's prototyping for) so context is obvious, but name it so a casual reader can see it's a prototype, not production. For throwaway UI routes, obey whatever routing convention the project already uses; don't invent a new top-level structure. In Private mode, the location is different: see [Private mode](#private-mode).
2. **Trivial to run.** A declarative logic demo runs on the Flow page. A runnable UI, HTML demo, or behavior script keeps one real launch command. The page host never starts the app for you.
3. **No application persistence by default.** Use in-memory state. Flow demos may resume browser-local exploration, which is not workflow history. If the question explicitly involves a database, use a scratch DB or local file clearly marked "PROTOTYPE, wipe me".
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Capture it when done.** Fold any validated decision into the real code, then capture the prototype itself as a **primary source**: commit it to a throwaway branch, out of main, and leave a context pointer to that branch on the implementation issue. Capture the answer too (the verdict and the question it settled) in the issue or a commit. The main branch keeps only the validated decision. In Private mode, capture goes to the vstack root instead: see [Private mode](#private-mode).
7. Observe before handover. Do not hand a prototype over until you have seen every variant work yourself. The observation is the test here, not an assertion.
   - UI: open each variant in the omp browser, take a screenshot, and drive the interaction the question is about.
   - LOGIC: outside a Flow, open the standalone HTML artifact directly. In a Flow, open the Flow page's demo or isolated artifact. In both modes, follow every walkthrough and check the visible state after each step.
   - BEHAVIOR: run the script and keep its output or timing.

   Save evidence files (screenshots, output, and timings) in the marked `prototype` session folder from `skill://vstack-tmp`. In Private mode, save the evidence in the prototype's `vstack/artifacts/<topic>/` dir instead.

## Private mode

In Private mode (see the vstack Private-mode rule), every prototype of every branch lives untracked under `<vstack root>/artifacts/<topic>/`. It is never staged, committed, or pushed, and no throwaway branch is made. Where rule 1 or 6, UI.md, or LOGIC.md say "next to the module", "throwaway branch", or "commit", read `<vstack root>/artifacts/<topic>/`. The verdict and the question it settled still go on the issue, with no link to the artifact.

A self-contained prototype (a single HTML file, or a script that needs nothing from the project) runs from that dir. An app-bound prototype is one that cannot run on its own from there: a UI variant in sub-shape A or B, or a script that needs the project's build, runtime, or path aliases. It runs in a detached checkout, and the main checkout is never touched:

1. Open the checkout through the `skill://vstack-worktree` script with purpose `<topic>`, `--commit HEAD`, and `--record <vstack root>/artifacts/<topic>/checkout.json`. Keep its returned path and this durable record with the prototype artifacts. Never use `/wt`, which moves the session. Record the base SHA (`git -C <path> rev-parse HEAD`). Uncommitted work in the main checkout is not included.
2. Only when the record says `backend: "omp-wt"` and `cloned: false`, the fallback has no deps or env files. Remove it through the script's `remove --record <record.json>` command, stop the app-bound flow, and name `worktree.clone` and `/skill:setup-vstack`.
3. Build the route edit, the variants, and the switcher only in the worktree. Never commit or push from it: a detached HEAD does not block `git commit` or `git push origin HEAD:<ref>`. Its changes stay uncommitted until cleanup removes them.
4. Run the dev server from the worktree as a session service: the bash tool with a `name` and a `ready` port. Pick a free port and pass it explicitly (`--port <n>` or `PORT=<n>`). No process outlives the session. Rule 7 runs against this server.
5. Capture at handover, and again at the verdict. Write to `<vstack root>/artifacts/<topic>/`: the variant files, the switcher, `mount.diff` (`git -C <path> diff HEAD` with untracked files added through `git -C <path> add -N .` first), the base SHA, and a note with the question and, once there is one, the verdict. This capture is the primary source; it replaces the throwaway branch.
6. The checkout stays until the verdict, across sessions. Resume it from `checkout.json` instead of opening another checkout. At the verdict, refresh the capture, then run the vstack-worktree script's `remove --record <vstack root>/artifacts/<topic>/checkout.json` command.
7. The winner is rewritten properly in the main checkout as ordinary tracked product code, as in UI.md step 6.

## Reply

In a Flow, publish the following handover parts as Results, then summarize them in the reply without a Flow link. Outside a Flow, deliver every part in chat. Keep the runnable artifact, route, and source capture available through the contracts above.

- Variants: what each variant is and how to open it. For an app-bound prototype, the URL with its `?variant=` keys and the one command that restarts the dev server.
- Evidence: the screenshots for UI, the walkthrough results for LOGIC, or the observed output or timing for BEHAVIOR, with the paths of the evidence files.
- Tradeoffs between the variants.
- Recommendation: the variant you pick, and why.
- Throwaway notice: say plainly that the prototype is throwaway and give its path. For an app-bound prototype in Private mode, also give the base SHA, say that uncommitted work in the main checkout is not included, and print the checkout path with its cleanup command: `bun "$(realpath skill://vstack-worktree/scripts/worktree.ts)" remove --record <vstack root>/artifacts/<topic>/checkout.json`.
