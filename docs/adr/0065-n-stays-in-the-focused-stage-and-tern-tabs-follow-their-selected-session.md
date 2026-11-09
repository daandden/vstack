# `n` stays in the Focused Stage, and Tern tabs follow their selected session

The user chose this in the `n-follows-focused-stage-35d716` interview on 2026-11-08. It amends [ADR 0056](0056-flow-questions-show-their-link-in-a-flow-panel.md) and the newest-in-progress-Stage-first `n` order from issue #277. These are accepted design decisions, not a claim that the implementation is complete.

When two Wayfinder ticket grills ran in parallel omp sessions, both Flow panels showed the same bare Flow page URL. That URL opened the newest in-progress Stage, and `n` walked one Flow-wide queue that started there. The session that opened its Stage first always landed on the other ticket's questions.

The Flow page now has a Focused Stage. In any browser it is the Stage tab the page shows. `n` cycles only the Focused Stage's open questions. When that Stage has none, `n` stays put and the page says so. When a new question is published in the Focused Stage, the page moves to it without a key press. On Overview and Topics, `n` keeps the Flow-wide order.

The Flow panel link ends in the first asked question's fragment, such as `#question-7`. Ratchet's approval gate passes no Flow question ids, so its link ends in the bound Stage's fragment.

While a picker is open, the vstack extension keeps a Picker presence on the Local Flow host: the session, its Stage, the asked question ids, and an expiry. Only callers that hold the host's control secret write it. It is not Flow content and takes no revision. A host that is down or a failed write never delays the picker. The page shows no marker for it.

In Tern, the vstack-flow window plugin makes each tab's Flow page follow the omp session selected in that tab. The selected session is the omp pane most recently focused in the tab, and focusing the Flow page keeps it. When the selected session changes, or when it opens a picker, the plugin sends the tab's page of that session's Flow to the asked question, or to the bound Stage when no picker is open. Pages in other tabs never move. The plugin opens no page by itself, and Cmd-click on a Flow link keeps its existing behavior. vstack owns this plugin: it moves from `daandden/tern-plugins` into the vstack repo, and `/skill:setup-vstack` runs `tern plugin link` on vstack's copy when Tern is present.

## Considered options

- A Stage fragment in the panel link alone. The page opens the right tab, but the next `n` still jumps to the newer Stage.
- `n` visits the Focused Stage first, then other Stages. The user chose to stay inside the Focused Stage.
- Keep `n` Flow-wide and add a second key for the Focused Stage. That leaves the reported behavior in place.
- A follow token in the panel link that ties a page to one session. A session switch in a Tern tab would then need a click.
- Follow the Stage tab only, with no Tern integration. Focusing another omp pane would not move the page.
- The vstack extension drives Tern with `tern browser` from its own pane. It cannot see focus changes between panes.
- Keep the Tern plugin in `daandden/tern-plugins` and have vstack publish a query contract for it. The user wanted one repo to own the feature.

## Consequences

- Tern exposes pane focus only to window plugins, not to `tern events`. Several conversations inside one ACP pane get no tab following, because neither Tern nor omp reports which one is selected.
- The plugin maps a pane to its omp session through Tern's `omp_session_file`, not the inherited `TERN_PANE`, because subagents share their parent's pane.
- Pages outside Tern follow only their Stage tab.
