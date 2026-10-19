# Style Guide

**The single source of truth for colors, typography, and tokens.** Every diagram draws from this file, not from hex values inlined in other reference files.

The skill has one built-in style, Catppuccin Mocha, so every figure is dark. The focal accent is mauve. Text uses two installed faces: IosevkaTermSlab Nerd Font Mono and IosevkaTerm Nerd Font Mono. Every figure in every project uses this style, so a drawer never chooses a skin.

---

## Tokens

### Semantic roles

Every token is referred to by **semantic role**, not by its hex value. Type references (`type-*.md`) and SKILL.md say `accent`, not `#cba6f7`. The parenthesized names are the Catppuccin color names.

| Role | Purpose | Mocha |
|---|---|---|
| `paper` | Page background, default node fill | `#1e1e2e` (base) |
| `paper-2` | Diagram container bg, secondary fill | `#181825` (mantle) |
| `ink` | Primary text, primary stroke | `#cdd6f4` (text) |
| `ink-strong` | High-contrast text on accent fills | `#11111b` (crust) |
| `muted` | Secondary text, default arrow stroke | `#bac2de` (subtext1) |
| `soft` | Sublabels, boundary labels | `#a6adc8` (subtext0) |
| `rule` | Hairline borders | `rgba(205,214,244,0.12)` |
| `rule-solid` | Stronger borders, baselines | `rgba(186,194,222,0.25)` |
| `accent` | Focal / 1–2 max per diagram | `#cba6f7` (mauve) |
| `accent-tint` | Fill for accent-bordered boxes | `rgba(203,166,247,0.10)` |
| `link` | HTTP/API calls, external arrows | `#89b4fa` (blue) |
| `series-1` | Non-focal chart series | `#a6e3a1` (green) |
| `series-2` | Non-focal chart series | `#94e2d5` (teal) |
| `series-3` | Non-focal chart series | `#fab387` (peach) |
| `series-4` | Non-focal chart series | `#eba0ac` (maroon) |
| `series-5` | Non-focal chart series | `#74c7ec` (sapphire) |

### Flavor palette

Every color of Catppuccin Mocha is on-palette, not only the role values above. The table gives all 26 Mocha colors by their Catppuccin names.

A figure draws from the role table first. A type reference can name another Mocha color by its Catppuccin name, for example a custom component color or a band fill. An `rgba()` value of an on-palette color is on-palette at any opacity. A color from another Catppuccin flavor is off-palette.

| Color | Mocha |
|---|---|
| `rosewater` | `#f5e0dc` |
| `flamingo` | `#f2cdcd` |
| `pink` | `#f5c2e7` |
| `mauve` | `#cba6f7` |
| `red` | `#f38ba8` |
| `maroon` | `#eba0ac` |
| `peach` | `#fab387` |
| `yellow` | `#f9e2af` |
| `green` | `#a6e3a1` |
| `teal` | `#94e2d5` |
| `sky` | `#89dceb` |
| `sapphire` | `#74c7ec` |
| `blue` | `#89b4fa` |
| `lavender` | `#b4befe` |
| `text` | `#cdd6f4` |
| `subtext1` | `#bac2de` |
| `subtext0` | `#a6adc8` |
| `overlay2` | `#9399b2` |
| `overlay1` | `#7f849c` |
| `overlay0` | `#6c7086` |
| `surface2` | `#585b70` |
| `surface1` | `#45475a` |
| `surface0` | `#313244` |
| `base` | `#1e1e2e` |
| `mantle` | `#181825` |
| `crust` | `#11111b` |

### Measured contrast

No script checks contrast. The table gives WCAG 2.x ratios against `paper` (`#1e1e2e`), measured on 2026-10-18. It leaves out the translucent roles, which are decorative.

| Role | On `#1e1e2e` |
|---|---|
| `ink` | 11.34:1 |
| `muted` | 9.26:1 |
| `soft` | 7.37:1 |
| `accent` | 8.07:1 |
| `link` | 7.79:1 |
| `ink-strong` on `accent` at 0.85 | 7.13:1 |
| `series-1` | 11.03:1 |
| `series-2` | 11.01:1 |
| `series-3` | 9.27:1 |
| `series-4` | 7.93:1 |
| `series-5` | 8.69:1 |

The targets are 4.5:1 for regular text, 3:1 for large text (24px+, or 18.7px+ at weight 600+), and 3:1 for lines, arrows, borders, and data marks. Every value clears them. On `paper-2` and inside `accent-tint` boxes every ratio drops, so measure text placed there against that surface.

### Series tokens (charts and data-type chips)

The `series-*` rows above are for chart types that must distinguish several overlapping entities (currently: **radar**). The "1-focal" rule still holds: `accent` is reserved for the focal series, and the series tokens cover the rest.

In a chart, fills sit at `0.22` opacity and strokes use the full color.

Data-flow and process figures are the one non-chart exception. Their data-type chips take one fixed series token per payload code at full color, as §8 of [`type-data-flow.md`](type-data-flow.md) and §8 of [`type-process.md`](type-process.md) list. Do not backfill these tokens to any other non-chart type. Architecture, swimlane, and the other schematic types keep the `ink`, `muted`, and `soft` roles. The series tokens are opt-in for diagrams where overlapping shapes need distinguishable color, not a license to add color elsewhere.

### Terminal skin (opt-in alternate)

The terminal-window primitive (see [primitive-terminal.md](primitive-terminal.md)) keeps its own fixed chrome palette, a CLI register for dev-tool posts and technical social cards. It is a variant that a figure opts into, not a second skin to choose between.

| Token | Hex | Purpose |
|---|---|---|
| `terminal-page` | `#0a0a0a` | Page background behind the window |
| `terminal-paper` | `#141414` | Window body, node fill |
| `terminal-bar` | `#1b1b1b` | Titlebar strip |
| `terminal-border` | `#2b2b2b` | Window border, hairlines |
| `terminal-ink` | `#f5f5f5` | Primary text, primary stroke |
| `terminal-muted` | `#9a9a9a` | Secondary text, sublabels, ring stroke |
| `terminal-soft` | `#5c5c5c` | Tertiary — inactive dots, spokes |
| `terminal-accent` | `#ff5a36` | The one accent — focal station, prompt sign, active dot |
| `terminal-accent-tint` | `rgba(255,90,54,0.12)` | Fill for accent-bordered boxes |
| `terminal-grid` | `rgba(255,255,255,0.08)` | Background dot grid, at 0.06–0.08 opacity |

**1-accent rule still holds.** Everything that isn't `terminal-ink` or `terminal-muted`/`terminal-soft` should be `terminal-accent` — never introduce a second hue.

---

## Typography

| Role | Family | Size | Weight | Usage |
|---|---|---|---|---|
| `title` | `'IosevkaTermSlab Nerd Font Mono', ui-monospace, monospace` | 1.75rem | 400 | Page H1 |
| `node-name` | `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace` | 12px | 600 | Human-readable labels |
| `sublabel` | `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace` | 9px | 400 | Port, protocol, URL, field type |
| `eyebrow` | `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace` | 7–8px | 500, tracked 0.18em, uppercase | Type tags, axis labels |
| `arrow-label` | `'IosevkaTerm Nerd Font Mono', ui-monospace, monospace` | 8px | 400, tracked 0.06em | Arrow annotations |
| `callout` | `'IosevkaTermSlab Nerd Font Mono', ui-monospace, monospace` | 14px | 400 italic | Editorial asides only |

**Two-face rule.** `title` and `callout` use IosevkaTermSlab Nerd Font Mono, and the callout is italic. Every other role uses IosevkaTerm Nerd Font Mono. Both faces are monospaced, so the whole figure is mono. The slab title and the italic slab callout carry the editorial contrast. Use no third family, and use the stacks above as written.

### Installed faces

Both faces come from the viewer's installed fonts. A figure has no font `<link>`, no `@font-face`, and no `@import`, so it makes no network request for type. Each stack ends in `ui-monospace, monospace`. A viewer without Iosevka gets the platform's monospace face, which runs wider (see the width budget). Both faces ship in the Nerd Fonts `IosevkaTerm` and `IosevkaTermSlab` releases. Besides the stacks above, `scripts/lint-skin.py` also accepts the generic families `sans-serif`, `serif`, and `system-ui` and the CJK system faces Apple SD Gothic Neo, Malgun Gothic, PingFang TC, PingFang SC, Microsoft JhengHei, Microsoft YaHei, Hiragino Sans, and Yu Gothic.

### Width budget

Measure per character, not per script: **every Unicode wide or full-width character costs 1em, and every other character costs 0.50em**. Nonspacing and enclosing marks cost nothing. A tracked role adds its letter-spacing once per character. Sum over the string and multiply by the font size for the text width. Then add padding and round the box up to the next multiple of 4. No script checks this budget, so holding it is the drawer's job.

The 0.50em value is the measured IosevkaTerm Nerd Font Mono advance. On 2026-10-18, on a Mac (Darwin 25.5, arm64), the installed font files gave every tested Latin, digit, punctuation, and Cyrillic glyph an advance of 500 units of a 1000-unit em. That held at Regular, Medium, and SemiBold, and in IosevkaTermSlab Regular and Italic. Chrome 150 `measureText` gave the same 0.50em for both faces at weights 400 and 600. In the same browser, Menlo and the generic `monospace` measured 0.60em. A viewer who falls back to those faces sees text about 20% wider than the budget, so keep the 8px label padding intact.

Counting by script is the trap. `주문 v2.1` is two full-width syllables and five narrow characters. A formula that tallies Hangul, Latin letters, and spaces drops `2`, `.`, and `1`, and sizes the box for four of its seven characters. Every rendered character costs something.

### Korean labels

The Iosevka faces carry no Hangul. A Korean `<text>` element keeps its role's stack as written and sets `lang="ko"`. The stack ends in the generic families, so the viewer's system picks an installed Hangul face for the glyphs that Iosevka lacks. The `lang` value tells it to prefer a Korean face. Name no system face in the stack:

```svg
<text lang="ko" font-family="'IosevkaTerm Nerd Font Mono', ui-monospace, monospace">결제 서비스</text>
```

A Korean page title keeps the `title` stack and sets `lang="ko"` the same way.

Three rules follow from Hangul metrics:

- **Sublabels stay Latin.** Ports, protocols, field types, and URLs are Latin anyway. Keep them in the `sublabel` role and don't translate them. Hangul in a 9px sublabel is unreadable.
- **Floor of 12px.** Hangul goes muddy below 12px. If a Korean name doesn't fit at 12px, cut the name. Don't shrink the type.
- **Arrow labels, eyebrows, and legend text switch register.** Those slots are 7–8px, uppercase, and tracked, and Hangul has no legibility at that size. A Korean label in one of those slots becomes 12px at weight 500 in the `node-name` stack, with no tracking and no uppercase transform. Its mask rect grows to match (16px tall, width from the budget above, still rounded to a multiple of 4). Latin labels in the same diagram keep the small tracked treatment.

### Traditional Chinese labels

The Iosevka faces carry no Han. A Traditional Chinese `<text>` element keeps its role's stack as written and sets `lang="zh-Hant"`. The system picks an installed Han face for the missing glyphs, and the `lang` value makes it prefer Traditional forms. Name no system face in the stack:

```svg
<text lang="zh-Hant" font-family="'IosevkaTerm Nerd Font Mono', ui-monospace, monospace">請求項比對</text>
```

A Traditional Chinese page title keeps the `title` stack and sets `lang="zh-Hant"` the same way.

**Width budget.** The per-character contract above is unchanged. Full-width punctuation (`（）「」，。：`) is wide and costs 1em as well, which is the part most often dropped. `請求項 v2.1` is three full-width characters and five narrow ones. A formula that tallies Han and Latin letters drops `2`, `.`, and `1`, and sizes the box for six of its nine characters.

Three rules follow from Han metrics, mirroring the Hangul ones:

- **Sublabels stay Latin.** Ports, protocols, field types, and URLs are Latin anyway. Keep them in the `sublabel` role and don't translate them. A sublabel that is prose rather than a value can be Chinese, but it then switches register by the third rule below.
- **Floor of 12px.** Han packs more strokes than Hangul into the same em box, so the 12px floor binds at least as hard here. If a Chinese name doesn't fit at 12px, cut the name. Don't shrink the type.
- **Arrow labels, eyebrows, and legend text switch register.** A Chinese label in one of those slots becomes 12px at weight 500 in the `node-name` stack, with no tracking and no uppercase transform. Its mask rect grows to match (16px tall, width from the budget above, still rounded to a multiple of 4). Latin labels in the same diagram keep the small tracked treatment.

Simplified Chinese takes the same three rules with `lang="zh-Hans"`.

### Cyrillic labels

Both Iosevka faces carry Cyrillic, so names, sublabels, arrow labels, eyebrows, legend text, and titles in Bulgarian, Russian, Ukrainian, or Serbian keep the Latin treatment: same faces, sizes, tracking, and uppercase. There is no register switch and no stack change.

**Width budget.** A Cyrillic glyph advances 0.50em, exactly as far as a Latin one (measured with `Ж`, `ш`, and `Шкаф ODF-2`). Size Cyrillic labels and their mask rects as for Latin. Counting by script is still the trap. `Шкаф ODF-2` is four Cyrillic letters, a space, three Latin letters, a hyphen, and a digit. A formula that tallies Cyrillic letters, Latin letters, and spaces drops `-` and `2`, and sizes the box for eight of its ten characters.

**Preserve printed labels.** A label the reader matches against a physical thing (a cabinet, a splice closure, a port map) carries the exact printed string. Don't transliterate it and don't re-case it. If one has to sit in an uppercase slot such as an eyebrow, drop the transform for that label rather than re-case the printed string. `Шкаф ODF-2` stays `Шкаф ODF-2`, not `Shkaf ODF-2`.

---

## Stroke, radius, spacing

| Token | Value | Use |
|---|---|---|
| `stroke-thin` | `0.8` | Tag-box outlines, leaf nodes |
| `stroke-default` | `1` | Most strokes |
| `stroke-strong` | `1.2` | Emphasis strokes |
| `radius-sm` | `4` | Small tags |
| `radius-md` | `6` | Node boxes |
| `radius-lg` | `8` | Containers, rings |
| `grid` | `4` | Every coord, size, and gap is divisible by 4 (hard rule) |

---

## Node type → treatment

Semantic role combinations — reference these by name in type specs.

| Type | Fill | Stroke |
|---|---|---|
| `focal` (1–2 max) | `accent-tint` | `accent` |
| `backend` | `paper` | `ink` |
| `store` | `ink @ 0.05` | `muted` |
| `external` | `ink @ 0.03` | `ink @ 0.30` |
| `input` | `muted @ 0.10` | `soft` |
| `optional` | `ink @ 0.02` | `ink @ 0.20` dashed `4,3` |
| `security` | `accent @ 0.05` | `accent @ 0.50` dashed `4,4` |

---

## Constraints (don't break these)

- **Contrast**: no script checks it. Use the [measured contrast](#measured-contrast) table, and measure text on `paper-2` or `accent-tint` against that surface.
- **One accent**: `accent` is mauve. A second accent color erases the focal signal.
- **No rainbow palette**: schematic types use `paper`, `ink`, `muted`, `soft`, `accent`, and `link`. Only multi-series charts and the data-type chips of data-flow and process figures use the `series-*` tokens. Other [flavor colors](#flavor-palette) appear only where a type reference names them.
- **Two faces**: IosevkaTermSlab Nerd Font Mono for `title` and `callout`, IosevkaTerm Nerd Font Mono for everything else. No third family.
- **Paper is Mocha base** `#1e1e2e`. Never pure white or pure black.
- A figure uses one palette. It takes every color from the Mocha tables above. If it uses the terminal skin, it takes every color from the terminal table instead. `scripts/lint-skin.py` fails a color outside the palette the figure uses, so white fails in a Mocha figure.
- **Dot pattern is optional, not default**: the 22×22 dot pattern is an opt-in "dotted paper" variant (good for long-form editorial hero diagrams). The default background is a clean `paper` fill, no pattern. When the pattern is enabled, it should sit at ~10% opacity of `ink` on `paper` — visible but quiet.
- **Container is clean by default**: the diagram sits directly on the page paper, no secondary container background or border. A framed variant (`paper-2` bg + `rule` border + 8px radius + padding) is available as an opt-in for card-heavy layouts, but don't reach for it by default — the extra chrome fights the figure.
