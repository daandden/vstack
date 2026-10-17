# diagram-design ships one fixed Catppuccin style

diagram-design carries one built-in style and never asks which skin to use. Catppuccin Mocha is the default dark palette, Catppuccin Latte is the light palette, and mauve is the focal accent. Titles and callouts use IosevkaTermSlab Nerd Font Mono, and all other text uses IosevkaTerm Nerd Font Mono, from installed fonts only. The style lives in the skill's own `references/style-guide.md`, rewritten in place. Profiles, onboarding, the style gate, the `diagram-profile:` config line, and the shipped example gallery go away. We chose this because the user always wants the same look. The skin question was noise, and the wanted style lived outside the skill in a hand-made profile that a drawer could skip.

## Considered Options

- Keep profiles and drop only the style gate. A saved profile could still select the style, but the profile verbs, the profile library, and the config line stay as text to merge at each Update, and a drawer that skips the profile still falls back to the Upstream skin.
- Put the vstack style in a separate overlay file next to the Upstream style guide. Two files then describe one style, and a drawer can read the wrong one.
- Keep the example files as layout examples, or reskin all of them. Kept files show the old skin and mislead drawers. Reskinning about 210 files costs more than the templates and type references, which already show the layout.
- Embed the fonts in each figure, or load them from a CDN. Embedded fonts make every figure large, and a CDN makes every figure depend on the network.
- Remove the old profile files in the home directory during Migration. vstack never deletes user files, so they stay where they are, and nothing reads them.

## Consequences

- This supersedes the profile, onboarding, and example provisions of [ADR 0011](0011-diagram-design-ships-as-the-diagram-upstream.md): onboarding that saves profiles under `~/.vstack/diagram-design/profiles/`, project selection with a `diagram-profile:` line, Migration of old profiles and markers, and examples shipped with the skill. ADR 0011's other decisions still stand: diagram-design ships inside the plugin as the adapt item of the Diagram upstream, its questions go through `ask`, and its Python runs in omp's eval Python.
- This supersedes the skin-selection provisions of [ADR 0023](0023-figures-are-a-fixed-fan-out-of-diagram-drawers.md): the caller no longer settles a skin, and a caller that runs as a subagent returns no skin question. A figure brief names light or dark. ADR 0023's other decisions still stand: one drawer per figure, no inline drawing, the override key for the drawing model, and the failure behavior.
- vstack-figures, grilling-page, and vstack-diagram-drawer drop their skin and profile wording. The `diagram-profiles` House style row and this repo's `docs/vstack/diagram.md` go away.
