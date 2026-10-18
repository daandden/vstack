#!/usr/bin/env python3
"""Check diagram figures against the colors and fonts in the style guide.

A figure uses one Catppuccin flavor, Latte or Mocha. Every hex or rgba() color
must come from the palette tables in references/style-guide.md, at any opacity.
Every named font family must appear in that file's Typography table: the two
Iosevka faces and their generic fallbacks. A remote resource (a font <link>,
a CSS @import, a non-fragment url(), an http(s) src), pure black, and an
executable attribute or URL fail as well.

The checker reads text only. It never renders the figure, runs its scripts, or
fetches a URL. It skips HTML comments, because a browser draws nothing in them.
It does not check accessibility attributes or motion markup.

Usage (in omp's eval Python; see SKILL.md "Running the bundled scripts"):
    <skill-dir>/scripts/lint-skin.py <figure.html> [<figure.html> ...]
"""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent  # the skill directory
STYLE_GUIDE = ROOT / "references/style-guide.md"

FLAVORS = ("Latte", "Mocha")
PALETTE_TABLES = ("### Semantic roles", "### Flavor palette", "### Terminal skin")

HEX_RE = re.compile(
    r"(?<![\w-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])"
)
RGBA_RE = re.compile(
    r"rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([^)]+)\)",
    re.IGNORECASE,
)
BLACK_RGB_RE = re.compile(r"rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)", re.IGNORECASE)
SRC_HTTP_RE = re.compile(r"\bsrc\s*=\s*(['\"])\s*(?:https?:)?//", re.IGNORECASE)
IMPORT_ANY_RE = re.compile(r"@import\b", re.IGNORECASE)
URL_ANY_RE = re.compile(r"url\(\s*([^)]+?)\s*\)", re.IGNORECASE)
LINK_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE | re.DOTALL)
HREF_RE = re.compile(r"\bhref\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL)
FONT_CSS_RE = re.compile(r"font-family\s*:\s*([^;}]+)", re.IGNORECASE)
FONT_ATTR_RE = re.compile(
    r"\bfont-family\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL
)
# An unterminated comment runs to the end of the file, as it does in a browser.
HTML_COMMENT_RE = re.compile(r"<!--.*?(?:-->|\Z)", re.DOTALL)

CSS_FONT_KEYWORDS = {"inherit", "initial", "revert", "revert-layer", "unset"}


class ResourceParser(HTMLParser):
    """Collect remote resource dependencies without executing the document."""

    RESOURCE_ATTRS = {
        "base": ("href",),
        "link": ("href",),
        "script": ("src",),
        "img": ("src", "srcset"),
        "iframe": ("src",),
        "object": ("data",),
        "embed": ("src",),
        "image": ("href", "xlink:href"),
        "use": ("href", "xlink:href"),
        "video": ("src", "poster"),
        "audio": ("src",),
        "source": ("src", "srcset"),
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.remote: list[tuple[int, str, str, str]] = []
        self.executable: list[tuple[int, str, str]] = []

    @staticmethod
    def is_remote(value):
        try:
            parsed = urlparse(value.strip())
        except ValueError:
            return True
        return bool(parsed.scheme) or bool(parsed.netloc)

    def handle_starttag(self, tag, attrs):
        tag = tag.casefold()
        data = {name.casefold(): value or "" for name, value in attrs}
        line, _column = self.getpos()
        for name, value in data.items():
            compact = "".join(character for character in value if ord(character) > 32).casefold()
            if (
                name.startswith("on")
                or name == "srcdoc"
                or tag == "base"
                or compact.startswith("javascript:")
                or compact.startswith("data:text/html")
            ):
                self.executable.append((line, tag, name))
        for attr in self.RESOURCE_ATTRS.get(tag, ()):
            value = data.get(attr, "").strip()
            candidates = (
                [item.strip().split()[0] for item in value.split(",") if item.strip()]
                if attr == "srcset"
                else [value]
            )
            for candidate in candidates:
                if not candidate or not self.is_remote(candidate):
                    continue
                self.remote.append((line, tag, attr, candidate))


def style_guide_families():
    """Read only the Family cells in the style guide's Typography table."""
    markdown = STYLE_GUIDE.read_text(encoding="utf-8")
    match = re.search(
        r"^## Typography\s*$.*?^\| Role \| Family \|.*?\n(?P<rows>.*?)(?=^### |^## |\Z)",
        markdown,
        re.MULTILINE | re.DOTALL,
    )
    if not match:
        raise ValueError(f"missing the '## Typography' table in {STYLE_GUIDE}")
    families = set()
    for line in match.group("rows").splitlines():
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 2 or not cells[0].startswith("`"):
            continue
        family_stack = re.sub(r"\s*\([^)]*\)\s*$", "", cells[1]).strip(" `*")
        family_stack = re.sub(r"\s+\*[^*]+\*\s*$", "", family_stack).strip()
        for family in family_stack.split(","):
            family = family.strip().strip("'\"")
            if family:
                families.add(family.casefold())
    return families


def normalize_hex(value):
    value = value.lower()
    if len(value) == 4:
        return "#" + "".join(character * 2 for character in value[1:])
    return value


def table_rows(markdown, heading):
    """Return the cells of each row of the first Markdown table after *heading*, header row first."""
    start = markdown.find(heading)
    if start < 0:
        raise ValueError(f"missing {heading!r} in {STYLE_GUIDE}")

    rows = []
    for line in markdown[start:].splitlines()[1:]:
        if line.startswith("|"):
            cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
            if not all(set(cell) <= set("-: ") for cell in cells):
                rows.append(cells)
        elif rows:
            break
    return rows


def flavor_palettes():
    """Return {flavor: (hex colors, rgb triplets)} from the style guide's palette tables.

    A table with a Latte and a Mocha column gives each flavor only its own column.
    A table without them, such as the terminal skin, gives its colors to both.
    """
    markdown = STYLE_GUIDE.read_text(encoding="utf-8")
    palettes = {flavor: (set(), set()) for flavor in FLAVORS}
    for heading in PALETTE_TABLES:
        header, *rows = table_rows(markdown, heading)
        for flavor, (colors, rgb_triplets) in palettes.items():
            columns = [index for index, name in enumerate(header) if flavor in name]
            for row in rows:
                for index in columns or range(len(row)):
                    cell = row[index] if index < len(row) else ""
                    colors.update(normalize_hex(match.group()) for match in HEX_RE.finditer(cell))
                    rgb_triplets.update(
                        tuple(int(match.group(group)) for group in (1, 2, 3))
                        for match in RGBA_RE.finditer(cell)
                    )
    for colors, rgb_triplets in palettes.values():
        rgb_triplets.update(
            tuple(int(color[offset : offset + 2], 16) for offset in (1, 3, 5))
            for color in colors
            if len(color) == 7
        )
    return palettes


def line_number(text, offset):
    return text.count("\n", 0, offset) + 1


def display_path(path):
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def named_families(value, allowed_fonts):
    families = []
    for raw_family in value.split(","):
        family = raw_family.strip().strip("'\"").strip()
        lowered = family.casefold()
        if not family or lowered in CSS_FONT_KEYWORDS or lowered.startswith("var("):
            continue
        if lowered not in allowed_fonts:
            families.append(family)
    return families


def without_comments(text):
    """Blank every HTML comment, keeping its line breaks so that line numbers and offsets stay."""
    return HTML_COMMENT_RE.sub(lambda match: re.sub(r"[^\n]", " ", match.group()), text)


def lint_text(text, palettes):
    findings = []
    allowed_fonts = style_guide_families()
    text = without_comments(text)

    resources = ResourceParser()
    resources.feed(text)
    resources.close()
    for line, tag, attr, _value in resources.remote:
        findings.append(
            (
                line,
                0,
                "external-asset",
                f"external resource in <{tag}> {attr} is not allowed",
            )
        )
    for line, tag, attr in resources.executable:
        findings.append(
            (
                line,
                0,
                "script",
                f"executable attribute {attr} on <{tag}> is not allowed",
            )
        )

    def add(offset, category, message):
        findings.append((line_number(text, offset), offset, category, message))

    # (offset, as written, hex or rgb triplet) for every color the figure names
    used = []
    for match in HEX_RE.finditer(text):
        value = match.group()
        normalized = normalize_hex(value)
        if normalized == "#000000":
            add(match.start(), "pure-black", f"pure black {value} is not allowed")
        else:
            used.append((match.start(), value, normalized))
    for match in RGBA_RE.finditer(text):
        rgb = tuple(int(match.group(index)) for index in (1, 2, 3))
        used.append((match.start(), match.group(), rgb))

    def off_palette(flavor):
        colors, rgb_triplets = palettes[flavor]
        return [
            (offset, value)
            for offset, value, key in used
            if key not in (colors if isinstance(key, str) else rgb_triplets)
        ]

    # The figure's flavor is the one that fits most of its colors; a tie goes to Mocha, the default.
    flavor = min(("Mocha", "Latte"), key=lambda name: len(off_palette(name)))
    for offset, value in off_palette(flavor):
        add(offset, "color", f"{value} is not in the Catppuccin {flavor} palette")

    for match in BLACK_RGB_RE.finditer(text):
        add(match.start(), "pure-black", "pure black rgb(0,0,0) is not allowed")

    for match in SRC_HTTP_RE.finditer(text):
        add(match.start(), "external-asset", "external HTTP(S) src is not allowed")

    for match in IMPORT_ANY_RE.finditer(text):
        add(match.start(), "external-asset", "CSS @import is not allowed")

    for match in URL_ANY_RE.finditer(text):
        value = match.group(1).strip().strip("'\"").strip()
        if value.startswith("#"):
            continue
        add(match.start(), "external-asset", "non-fragment CSS url() is not allowed")

    for link_match in LINK_RE.finditer(text):
        href_match = HREF_RE.search(link_match.group())
        if not href_match:
            continue
        href = href_match.group(2).strip()
        parsed_href = urlparse(href)
        if parsed_href.scheme.casefold() in {"http", "https"} or parsed_href.netloc:
            href_offset = link_match.start() + href_match.start(2)
            add(href_offset, "external-asset", "external HTTP(S) <link> is not allowed")

    for match in FONT_CSS_RE.finditer(text):
        unsupported = named_families(match.group(1), allowed_fonts)
        if unsupported:
            add(
                match.start(),
                "font-family",
                "unsupported font family: " + ", ".join(unsupported),
            )

    for match in FONT_ATTR_RE.finditer(text):
        unsupported = named_families(match.group(2), allowed_fonts)
        if unsupported:
            add(
                match.start(),
                "font-family",
                "unsupported font family: " + ", ".join(unsupported),
            )

    findings.sort(key=lambda finding: (finding[0], finding[1], finding[2]))
    return findings


def parse_args():
    parser = argparse.ArgumentParser(
        description="Check diagram figures against the colors and fonts in style-guide.md."
    )
    parser.add_argument("files", nargs="+", type=Path, help="HTML figures to lint")
    parser.add_argument(
        "--quiet", action="store_true", help="print only the summary line"
    )
    return parser.parse_args()


def main():
    args = parse_args()
    palettes = flavor_palettes()

    total_findings = 0
    for path in args.files:
        try:
            text = path.read_text(encoding="utf-8")
            findings = lint_text(text, palettes)
        except OSError as error:
            findings = [(0, 0, "read-error", str(error))]

        total_findings += len(findings)
        if not args.quiet:
            shown_path = display_path(path)
            for line, _offset, category, message in findings:
                print(f"{shown_path}:{line}: {category}: {message}")

    print(f"Summary: {len(args.files)} file(s) checked, {total_findings} finding(s).")
    return 1 if total_findings else 0


if __name__ == "__main__":
    sys.exit(main())
