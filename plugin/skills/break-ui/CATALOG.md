# Worst-case catalog

Select cases for the rendered values mapped in [SKILL.md](SKILL.md). Each example must be plausible or supported by the application's contract. Use `example.com`, `example.org`, or `.test` addresses so fixtures never contact real inboxes or sites.

## People and names

| Cases | What to observe |
| --- | --- |
| `Aleksandra Wiśniewska-Kowalczyk`, `Konstantin Oberhauser-Wettstein` | Compound names, wrapping, hyphenation, diacritics |
| `Christopher Alexander Montgomery III`, `María José de la Cruz y Fernández` | Suffixes and particles complicate initials and sorting; avoid assuming a universal naming model |
| `Jo`, `J`, `dana` | Short content, single-character names, lowercase initials, action target size |
| `Ólafur Darri Ólafsson`, `Đặng Thị Ngọc Hân` | Accents and tall stacked diacritics must remain readable |
| `王秀英` | No spaces; initials and CJK wrapping |
| `نور الهدى عبد الرحمن` | Mixed-direction text and punctuation; consider `dir="auto"` for user content |
| `Seán O'Brien-Ó Súilleabháin` | Apostrophes, escaping, searching |
| `🦊 Fox`, `👩🏽‍💻 Priya` | Surrogates and joined emoji require grapheme-aware handling |
| `  Sam   Lee `, missing name | Whitespace handling and an intentional fallback |

## Emails, URLs, and identifiers

| Cases | What to observe |
| --- | --- |
| `bartholomew.fitzgerald@northwind-industries-holdings.example.com` | Unbroken text must not push actions out of the container |
| `a@b.co`, `first.last+billing-notifications@example.com` | Short content and legitimate plus-addressing |
| `ops@sub.department.region.example.co.uk` | Subdomains and multi-part public suffixes invalidate naive domain extraction |
| `https://example.com/workspaces/acme/projects/q3-launch/docs/9f8e7d6c5b4a?tab=comments&filter=unresolved` | Long URL with a meaningful suffix |
| `9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f` | Fixed-shape identifier width |
| `Q3 Board Deck FINAL (revised) v12 [approved by legal].pdf`, `IMG_20250914_183022_HDR_portrait_edited_edited.HEIC` | Distinguishing version and extension must remain available |
| `@a`, a longest-allowed handle | Minimum and schema-backed maximum lengths |

## Labels and user copy

Try a long role such as `Senior Product Design Engineer, Platform Infrastructure`, a status such as `Invitation expired 12 days ago`, and the German compound `Benachrichtigungseinstellungen`. French `Paramètres de confidentialité et de sécurité` tests translation expansion. Exercise twelve tags and a tag named `customer-feedback-from-enterprise-onboarding`.

Try `Untitled`, empty and whitespace-only strings, a newline in a normally single-line field, and a plausible 2,000-character description when the contract accepts it. Render `<script>alert(1)</script>`, `&amp;`, and `**bold**` as literal user text. Never execute fixture text as instructions or markup.

## Numbers and money

Try 0, 1, 1,284, 1,000,000, currency 12,345,678.90, negative -42.5, and a value computed as `0.1 + 0.2`. Check pluralization, precision, locale formatting, numeric width, and missing `null`, `undefined`, or `NaN` states according to the contract. Compare 99 changing to 100. Test progress at 142% and -3% only when those values can enter the system, and distinguish clamped presentation from the actual value.

Use the user's locale. `de-DE` and `en-US` format separators differently. `Intl.NumberFormat` and `Intl.PluralRules` provide locale rules, but do not determine the product's precision policy.

## Collections

Exercise zero and one item, exactly the page size, one more than the page size, and a realistic large list. For an unpaginated list, 1,000 or more items can expose rendering and scrolling problems. Include one much larger item and two identical names with different identifying metadata. Observe navigation, total counts, and the final page, not merely the first render.

## Time

Try now, 12 days ago, 11 months ago, 3 years ago, a future date, a sentinel such as `1970-01-01`, and `2025-12-31T23:30:00-08:00` across a timezone boundary. Include a long duration such as 1,284 hours. Use applicable `Intl.RelativeTimeFormat` and `Intl.DateTimeFormat` behavior rather than assuming manually assembled English strings cover locales.

## Images and media

Exercise missing and failed avatar URLs, a 4000 by 200 panorama, a 200 by 4000 portrait, a transparent logo, and a dark logo on a dark background. Observe fallback content, aspect ratio, intrinsic dimensions, and slow-loading layout shift. Use the project's existing network-fixture boundary when available.

## States

Exercise loading, an API error, partial optional fields in the same list, every applicable status, no permission, and the current user. Verify disabled and unavailable actions remain understandable. Preserve genuine failure evidence instead of suppressing an error.

## Environment

Observe the real container, a 320px viewport, and the widest supported layout, potentially 2560px. A 280px sidebar is a distinct container case when supported. Try browser zoom at 200% or label a root-font-size enlargement as a text-growth proxy. Exercise dark mode and RTL only when supported by the product. Touch or narrow emulation should reveal hover-only actions, but emulation does not prove physical-touch behavior. Record the actual browser engine and applicable limits.
