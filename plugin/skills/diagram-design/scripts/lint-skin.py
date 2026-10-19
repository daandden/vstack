#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
STYLE_GUIDE = ROOT / "references/style-guide.md"

# A figure takes its colors from one palette: the Catppuccin Mocha style or the terminal skin.
PALETTES = {
    "Catppuccin Mocha": ("### Semantic roles", "### Flavor palette"),
    "Terminal skin": ("### Terminal skin",),
}
GENERIC_FONTS = {"ui-monospace", "monospace", "sans-serif", "serif", "system-ui"}
CJK_SYSTEM_FONTS = {
    "apple sd gothic neo",
    "malgun gothic",
    "pingfang tc",
    "pingfang sc",
    "microsoft jhenghei",
    "microsoft yahei",
    "hiragino sans",
    "yu gothic",
}

HEX_RE = re.compile(
    r"(?<![\w-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])"
)
RGB_RE = re.compile(
    r"(?<![\w-])rgba?\(\s*(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*(?:,\s*|\s+)(\d{1,3})\s*"
    r"(?:[,/]\s*([^)]+))?\)",
    re.IGNORECASE,
)
COLOR_FUNCTION_RE = re.compile(
    r"(?<![\w-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(", re.IGNORECASE
)
SRC_HTTP_RE = re.compile(r"\bsrc\s*=\s*(['\"])\s*(?:https?:)?//", re.IGNORECASE)
IMPORT_ANY_RE = re.compile(r"@import\b", re.IGNORECASE)
URL_ANY_RE = re.compile(r"url\(\s*([^)]+?)\s*\)", re.IGNORECASE)
LINK_RE = re.compile(r"<link\b[^>]*>", re.IGNORECASE | re.DOTALL)
HREF_RE = re.compile(r"\bhref\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL)
FONT_CSS_RE = re.compile(r"font-family\s*:\s*([^;}]+)", re.IGNORECASE)
FONT_ATTR_RE = re.compile(
    r"\bfont-family\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL
)
VAR_REF_RE = re.compile(r"var\(\s*(--[\w-]+)", re.IGNORECASE)
STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)(?:</style>|\Z)", re.IGNORECASE | re.DOTALL)
STYLE_ATTR_RE = re.compile(r"(?<![\w-])style\s*=\s*(['\"])(.*?)\1", re.IGNORECASE | re.DOTALL)
CSS_DECLARATION_RE = re.compile(r"(?<![\w-])(-?-?[a-zA-Z][\w-]*)\s*:\s*([^;{}]+)")
PRESENTATION_ATTR_RE = re.compile(
    r"(?<![\w-])(fill|stroke|color|stop-color|flood-color|lighting-color|font)\s*=\s*(['\"])(.*?)\2",
    re.IGNORECASE | re.DOTALL,
)
QUOTED_RE = re.compile(r"'[^']*'|\"[^\"]*\"")
WORD_RE = re.compile(r"(?<![\w#-])[a-zA-Z]+(?![\w(-])")
FONT_SIZE_RE = re.compile(
    r"(?:^|\s)(?:[\d.]+(?:px|r?em|r?lh|pt|pc|%|ex|ch|vw|vh|vmin|vmax|cm|mm|in|q)"
    r"|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger"
    r"|(?:calc|var|clamp|min|max)\([^)]*\))(?![\w-])"
    r"(?:\s*/\s*\S+)?\s+(?P<families>\S.*)$",
    re.IGNORECASE | re.DOTALL,
)
# An unterminated comment runs to the end of the file, as it does in a browser.
HTML_COMMENT_RE = re.compile(r"<!--.*?(?:-->|\Z)", re.DOTALL)

CSS_FONT_KEYWORDS = {"inherit", "initial", "revert", "revert-layer", "unset"}
COLOR_PROPERTIES = {
    "fill",
    "stroke",
    "background",
    "outline",
    "box-shadow",
    "text-shadow",
    "text-decoration",
    "column-rule",
}
# CSS Color 4 named colors; keywords such as none, transparent, and currentColor are absent.
CSS_NAMED_COLORS = set(
    """
    aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue
    blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk
    crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki
    darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen
    darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue
    dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite
    gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki
    lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
    lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen
    lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen
    magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen
    mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream
    mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid
    palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
    powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown
    seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen
    steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow
    yellowgreen
    """.split()
)


class ResourceParser(HTMLParser):

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


def palettes_from_style_guide():
    markdown = STYLE_GUIDE.read_text(encoding="utf-8")
    palettes = {}
    for name, headings in PALETTES.items():
        colors, rgb_triplets = palettes[name] = (set(), set())
        for heading in headings:
            for row in table_rows(markdown, heading)[1:]:
                for cell in row:
                    colors.update(normalize_hex(match.group()) for match in HEX_RE.finditer(cell))
                    rgb_triplets.update(
                        tuple(int(match.group(group)) for group in (1, 2, 3))
                        for match in RGB_RE.finditer(cell)
                    )
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
    return HTML_COMMENT_RE.sub(lambda match: re.sub(r"[^\n]", " ", match.group()), text)


def declarations(text):
    spans = [(match.start(1), match.group(1)) for match in STYLE_BLOCK_RE.finditer(text)]
    spans += [(match.start(2), match.group(2)) for match in STYLE_ATTR_RE.finditer(text)]
    for start, css in spans:
        for match in CSS_DECLARATION_RE.finditer(css):
            yield start + match.start(), match.group(1).casefold(), match.group(2)
    for match in PRESENTATION_ATTR_RE.finditer(text):
        yield match.start(3), match.group(1).casefold(), match.group(3)


def is_color_property(name):
    return (
        name in COLOR_PROPERTIES
        or name.endswith("color")
        or name.startswith("border")
        or name.startswith("--")
    )


def lint_text(text, palettes):
    findings = []
    allowed_fonts = style_guide_families() | GENERIC_FONTS | CJK_SYSTEM_FONTS
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

    used = []
    for match in HEX_RE.finditer(text):
        value = match.group()
        normalized = normalize_hex(value)
        if normalized == "#000000":
            add(match.start(), "pure-black", f"pure black {value} is not allowed")
        else:
            used.append((match.start(), value, normalized))
    for match in RGB_RE.finditer(text):
        rgb = tuple(int(match.group(index)) for index in (1, 2, 3))
        if rgb == (0, 0, 0) and match.group(4) is None:
            add(match.start(), "pure-black", f"pure black {match.group()} is not allowed")
        else:
            used.append((match.start(), match.group(), rgb))
    parsed_rgb = {match.start() for match in RGB_RE.finditer(text)}
    for match in COLOR_FUNCTION_RE.finditer(text):
        if match.start() not in parsed_rgb:
            add(
                match.start(),
                "color",
                f"{match.group(1)}() is not a palette color; write the palette hex or rgba()",
            )

    def off_palette(name):
        colors, rgb_triplets = palettes[name]
        return [
            (offset, value)
            for offset, value, key in used
            if key not in (colors if isinstance(key, str) else rgb_triplets)
        ]

    palette = min(palettes, key=lambda name: len(off_palette(name)))
    for offset, value in off_palette(palette):
        add(offset, "color", f"{value} is not in the {palette} palette")

    custom_properties = {}
    font_values = []
    for offset, name, value in declarations(text):
        if name.startswith("--"):
            custom_properties.setdefault(name, []).append((offset, value))
        if is_color_property(name):
            for word in WORD_RE.finditer(QUOTED_RE.sub(lambda m: " " * len(m.group()), value)):
                if word.group().casefold() in CSS_NAMED_COLORS:
                    add(
                        offset,
                        "color",
                        f"named color {word.group()} is not in the Catppuccin palette",
                    )
        elif name == "font":
            font_values.append(value)
            shorthand = FONT_SIZE_RE.search(value.strip())
            unsupported = named_families(shorthand.group("families"), allowed_fonts) if shorthand else []
            if unsupported:
                add(offset, "font-family", "unsupported font family: " + ", ".join(unsupported))

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
        font_values.append(match.group(1))
        unsupported = named_families(match.group(1), allowed_fonts)
        if unsupported:
            add(
                match.start(),
                "font-family",
                "unsupported font family: " + ", ".join(unsupported),
            )

    for match in FONT_ATTR_RE.finditer(text):
        font_values.append(match.group(2))
        unsupported = named_families(match.group(2), allowed_fonts)
        if unsupported:
            add(
                match.start(),
                "font-family",
                "unsupported font family: " + ", ".join(unsupported),
            )

    # A font declaration's var() takes its families from the custom property's definitions.
    pending = [ref.casefold() for value in font_values for ref in VAR_REF_RE.findall(value)]
    font_properties = set()
    while pending:
        name = pending.pop()
        if name in font_properties:
            continue
        font_properties.add(name)
        for offset, value in custom_properties.get(name, ()):
            pending += [ref.casefold() for ref in VAR_REF_RE.findall(value)]
            unsupported = named_families(value, allowed_fonts)
            if unsupported:
                add(offset, "font-family", f"unsupported font family in {name}: " + ", ".join(unsupported))

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
    palettes = palettes_from_style_guide()

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
