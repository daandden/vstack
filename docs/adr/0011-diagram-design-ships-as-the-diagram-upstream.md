# diagram-design ships as the Diagram upstream

vstack ships `cathrynlavery/diagram-design` inside the plugin as a third kind of Upstream, the Diagram upstream. It has a SHA Pin, which the Update moves to the latest commit, and one adapt item: the whole `skills/diagram-design/` directory, 279 files and 5.4 MB, examples included. Seven vstack skills draw their figures through it, so it should install, version, and update with vstack instead of living apart from it.

## Considered Options

- **Outside the plugin, Pin tracked by the Update**: rejected. vstack would ship nothing, `pins.yaml` would hold its SHA, and setup-vstack would install it with the skills CLI. No House style would apply and no merges would be needed, but its version and text would stay outside vstack's control, and a second install path would remain.
- **Outside the plugin, SHA bumped by hand** (the earlier call in the setup and overlap-skill decisions): rejected for the same reason, and the bump depends on someone remembering it.
- **vstack original, copied once**: rejected. Upstream fixes and new diagram types would stop arriving.

## Consequences

- It is adapt from day one. Its "pause and ask the user" text falls under the `required` `ask-tool` rule (ADR 0008). Onboarding has to stop rewriting `references/style-guide.md` inside the vstack clone, and profiles move to `~/.vstack/diagram-design/profiles/`. A project selects one with a `diagram-profile:` line in its vstack config instead of a `.diagram-design` marker (ADR 0006). Python calls run through omp's eval Python.
- Upstream changes several times a week (39 commits under `skills/diagram-design/` in the 30 days before `d1376371`), so most Updates bring merge work for this item. The path change is an `adapted` row and the Python rewrite a House style rule, so `update-plan.ts` applies both to both sides before `git merge-file`. Hold is the relief valve.
- It can't be missing at run time, so explain's mermaid fallback goes away. setup-vstack stops installing it and checks eval Python instead. Migration removes the skills CLI copy and moves old profiles and markers.
- No licence material ships. The MIT notice has to be restored before vstack is shared.
