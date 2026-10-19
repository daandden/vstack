# diagram-design ships one fixed Catppuccin style

diagram-design carries one built-in style and never asks which skin to use. Catppuccin Mocha is the only palette, and mauve is the focal accent. Titles and callouts use IosevkaTermSlab Nerd Font Mono, and all other text uses IosevkaTerm Nerd Font Mono, from installed fonts only. The style lives in the skill's own `references/style-guide.md`, rewritten in place. Profiles, onboarding, the style gate, the `diagram-profile:` config line, and the shipped example gallery go away. We chose this because the user always wants the same look. The skin question was noise, and the wanted style lived outside the skill in a hand-made profile that a drawer could skip.

The first version of this decision also kept Catppuccin Latte as a light palette, and a figure brief named light or dark. The user then chose Mocha only: the skill has no light variant, and a figure brief names no variant.

The static checkers that a drawer runs on a figure ship in the skill's `scripts/` folder, and the ones imported from the Upstream repository are Upstream contributions. Each imported checker is its own adapt row that shares the diagram-design artifact, with a blob item matcher in pins.yaml. The imported checkers are `scripts/verify-geometry.py`, row `diagram/verify-geometry`, and the style checker `scripts/lint-skin.py`, row `diagram/lint-skin`. Commit discovery for the Diagram upstream covers the whole repository, so a script-only Upstream commit moves the Pin. We chose this because a drawer in a vstack install has no repository checkout to run the checkers from, and a copied checker that no row tracks would miss Upstream fixes.

## Considered Options

- Keep profiles and drop only the style gate. A saved profile could still select the style, but the profile verbs, the profile library, and the config line stay as text to merge at each Update, and a drawer that skips the profile still falls back to the Upstream skin.
- Put the vstack style in a separate overlay file next to the Upstream style guide. Two files then describe one style, and a drawer can read the wrong one.
- Keep the example files as layout examples, or reskin all of them. Kept files show the old skin and mislead drawers. Reskinning about 210 files costs more than the templates and type references, which already show the layout.
- Embed the fonts in each figure, or load them from a CDN. Embedded fonts make every figure large, and a CDN makes every figure depend on the network.
- Remove the old profile files in the home directory during Migration. vstack never deletes user files, so they stay where they are, and nothing reads them.
- Copy each checker into the skill as vstack text with no register row. An Update then shows no Upstream change to the checker.
- Take each checker with `check --take`. A take ships only a skill or principle directory or an agent file, so it rejects a blob of kind skill.
- Keep Catppuccin Latte as a light variant beside Mocha. A light page or print gets a figure in the same palette family, but every type reference carries two sets of values and contrast notes, a brief has to pick one, and each Update merges both.

## Consequences

- This supersedes the profile, onboarding, and example provisions of [ADR 0011](0011-diagram-design-ships-as-the-diagram-upstream.md): onboarding that saves profiles under `~/.vstack/diagram-design/profiles/`, project selection with a `diagram-profile:` line, Migration of old profiles and markers, and examples shipped with the skill. ADR 0011's other decisions still stand: diagram-design ships inside the plugin as the adapt item of the Diagram upstream, its questions go through `ask`, and its Python runs in omp's eval Python.
- Light pages and print get no matching light figure. A Mocha figure on a light page keeps its dark paper, and the user accepts that.
- This supersedes the skin-selection provisions of [ADR 0023](0023-figures-are-a-fixed-fan-out-of-diagram-drawers.md): the caller no longer settles a skin, a figure brief names no variant, and a caller that runs as a subagent returns no skin question. ADR 0023's other decisions still stand: one drawer per figure, no inline drawing, the override key for the drawing model, and the failure behavior.
- vstack-figures, grilling-page, and vstack-diagram-drawer drop their skin and profile wording. The `diagram-profiles` House style row and this repo's `docs/vstack/diagram.md` go away.
- The Diagram upstream has more than the one adapt item that ADR 0011 names: the skill directory and each imported checker. Each Update of the Diagram upstream shows Upstream changes to an imported checker in that checker's row. The decisions file maps the Upstream file into the skill's `scripts/` folder with `file_maps`, keyed by the row id and the file's base name.
- lint-skin checks a figure against one palette: the Mocha tables of the style guide, or the terminal skin table for a terminal figure. A color passes only when that table lists it, so white and Latte colors fail in a Mocha figure. A font family passes when the style guide's Typography table names it, when it is a generic family (`ui-monospace`, `monospace`, `sans-serif`, `serif`, `system-ui`), or when it is one of eight CJK system faces.
