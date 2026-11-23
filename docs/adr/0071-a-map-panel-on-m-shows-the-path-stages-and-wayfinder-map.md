# A Map panel on `m` shows the path, the Stages, and the wayfinder map

> This amends [ADR 0063](0063-the-flow-page-shows-the-matt-flow-path-and-replies-name-no-next-skill.md): the Matt flow path leaves the top of the page.

> [ADR 20261123-the-flow-page-leads-with-the-open-decision](20261123-the-flow-page-leads-with-the-open-decision.md) makes the Stages tab the full Stage list, with Stages that wait first and finished Stages folded by ticket.

The `m` key opens the Map panel. It has one tab for the Matt flow path, one for the Stage tree, and, in a Flow with a wayfinder map, one for the ticket graph with its blocking links and each ticket's state. The `t` key no longer opens the Stage tree, and the path banner above the Flow heading goes away. Inside the panel, `h` and `l` switch tabs, `j` and `k` move between the current tab's items, Enter opens the selected item, and the arrow keys pan a graph larger than the panel, as on the page. wayfinder still resolves one non-research ticket per session; the user's "what next?" prompts came from not seeing the map, and the ticket graph shows what is ready.

## Considered Options

- Let wayfinder take the next ready ticket in the same session. Each ticket would no longer start in a fresh context.
- Put the ticket graph and the Stage tree in one panel under `t`.
- Let `h`/`j`/`k`/`l` pan the graph inside the panel. The keys would mean tabs and stops on the page but panning in the panel.
