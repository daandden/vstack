#!/usr/bin/env python3
"""Check diagram HTML safety and SVG bounds without rendering."""

from __future__ import annotations

import argparse
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
MOTION_TEMPLATE = SKILL_DIR / "assets" / "template-motion.html"
CSS_ESCAPE_RE = re.compile(
    r"\\(?:([0-9a-fA-F]{1,6})[ \t\r\n\f]?|(.))", re.DOTALL
)
CSS_IMPORT_RE = re.compile(r"@import\b", re.IGNORECASE)
CSS_URL_RE = re.compile(r"url\(\s*([^)]+?)\s*\)", re.IGNORECASE)
CSS_IMAGE_SET_RE = re.compile(r"(?:-webkit-)?image-set\s*\(", re.IGNORECASE)
CSS_REMOTE_RE = re.compile(r"(?:https?:)?//", re.IGNORECASE)
CSS_REFERENCE_ATTRS = {
    "style",
    "fill",
    "stroke",
    "filter",
    "clip-path",
    "mask",
    "marker",
    "marker-start",
    "marker-mid",
    "marker-end",
    "cursor",
}
REFERENCE_ATTRS = {
    "src",
    "href",
    "xlink:href",
    "poster",
    "srcset",
    "action",
    "formaction",
}
VIEWBOX_TOLERANCE = 2.0
SVG_NUMBER = r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?"
SVG_NUMBER_RE = re.compile(SVG_NUMBER)
SVG_PLAIN_NUMBER_RE = re.compile(rf"^\s*{SVG_NUMBER}\s*$")
TRANSLATE_RE = re.compile(rf"^\s*translate\(\s*({SVG_NUMBER})(?:[\s,]+({SVG_NUMBER}))?\s*\)\s*$")
# Their children are not painted where they are declared, or use another coordinate system.
UNPAINTED_TAGS = {
    "defs",
    "symbol",
    "marker",
    "pattern",
    "clippath",
    "mask",
    "foreignobject",
    "svg",
}
# CSS that can move, hide or clip an element, so its painted position is not its attributes.
UNSTATIC_CSS_PROPERTIES = {
    "transform",
    "translate",
    "rotate",
    "scale",
    "display",
    "visibility",
    "x",
    "y",
    "cx",
    "cy",
    "r",
    "rx",
    "ry",
    "width",
    "height",
}
UNSTATIC_CSS_PREFIXES = ("animation", "offset", "clip", "mask")
CSS_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
CSS_KEYFRAMES_RE = re.compile(
    r"@(?:-[a-z]+-)?keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}", re.IGNORECASE
)
CSS_RULE_RE = re.compile(r"([^{}]+)\{([^{}]*)\}")
CSS_STRING_RE = re.compile(r"\"[^\"]*\"|'[^']*'")
CSS_PARENS_RE = re.compile(r"\([^()]*\)")
CSS_COMBINATOR_RE = re.compile(r"\s*[>+~]\s*|\s+")
CSS_TAG_RE = re.compile(r"^[a-zA-Z][\w-]*")
CSS_CLASS_RE = re.compile(r"\.([\w-]+)")
CSS_ID_RE = re.compile(r"#([\w-]+)")
CSS_ATTRIBUTE_RE = re.compile(r"\[\s*([\w:-]+)")
GEOMETRY_ATTRS = {
    "rect": ("x", "y", "width", "height"),
    "line": ("x1", "y1", "x2", "y2"),
    "circle": ("cx", "cy", "r"),
    "ellipse": ("cx", "cy", "rx", "ry"),
    "polygon": ("points",),
    "polyline": ("points",),
    "text": ("x", "y"),
}


class DiagramParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.scripts: list[dict[str, object]] = []
        self.styles: list[str] = []
        self.css_attributes: list[str] = []
        self.unsafe: list[str] = []
        self.references: list[tuple[str, str]] = []
        self._current_script: dict[str, object] | None = None
        self._in_style = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        normalized_attrs = [(key.casefold(), value or "") for key, value in attrs]
        data: dict[str, str] = {}
        for key, value in normalized_attrs:
            data.setdefault(key, value)
        if tag in {"base", "embed", "object", "iframe"}:
            self.unsafe.append(f"<{tag}> is not allowed in a diagram file")
        for key, value in normalized_attrs:
            if key.startswith("on"):
                self.unsafe.append(f"executable attribute {key} on <{tag}>")
            if key == "srcdoc":
                self.unsafe.append(f"srcdoc attribute on <{tag}>")
            if key in REFERENCE_ATTRS:
                self.references.append((tag, value))
            if key in CSS_REFERENCE_ATTRS:
                self.css_attributes.append(value)
        if tag == "script":
            self._current_script = {
                "attrs": data,
                "attr_names": [name for name, _value in normalized_attrs],
                "body": [],
                "closed": False,
            }
            self.scripts.append(self._current_script)
        if tag == "style":
            self._in_style = True

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        if tag == "script" and self._current_script is not None:
            self._current_script["closed"] = True
            self._current_script = None
        if tag == "style":
            self._in_style = False

    def handle_data(self, data: str) -> None:
        if self._current_script is not None:
            body = self._current_script["body"]
            assert isinstance(body, list)
            body.append(data)
        if self._in_style:
            self.styles.append(data)


class SvgExtent:
    def __init__(self, attrs: dict[str, str]) -> None:
        self.attrs = attrs
        self.points: list[tuple[float, float, str]] = []


def svg_length(attrs: dict[str, str], name: str, default: float | None = None) -> float | None:
    value = attrs.get(name)
    if value is None:
        return default
    return float(value) if SVG_PLAIN_NUMBER_RE.match(value) else None


def painted_points(tag: str, attrs: dict[str, str]) -> list[tuple[float, float]]:
    if tag == "rect":
        x, y = svg_length(attrs, "x", 0.0), svg_length(attrs, "y", 0.0)
        width, height = svg_length(attrs, "width"), svg_length(attrs, "height")
        if x is None or y is None or width is None or height is None:
            return []
        if width <= 0 or height <= 0:
            return []
        return [(x, y), (x + width, y + height)]
    if tag == "line":
        ends = [
            (svg_length(attrs, "x1", 0.0), svg_length(attrs, "y1", 0.0)),
            (svg_length(attrs, "x2", 0.0), svg_length(attrs, "y2", 0.0)),
        ]
        return [(x, y) for x, y in ends if x is not None and y is not None]
    if tag in {"circle", "ellipse"}:
        cx, cy = svg_length(attrs, "cx", 0.0), svg_length(attrs, "cy", 0.0)
        rx = svg_length(attrs, "r" if tag == "circle" else "rx")
        ry = svg_length(attrs, "r" if tag == "circle" else "ry")
        if cx is None or cy is None or rx is None or ry is None:
            return []
        if rx <= 0 or ry <= 0:
            return []
        return [(cx - rx, cy - ry), (cx + rx, cy + ry)]
    if tag in {"polygon", "polyline"}:
        numbers = [float(value) for value in SVG_NUMBER_RE.findall(attrs.get("points", ""))]
        return list(zip(numbers[0::2], numbers[1::2]))
    if tag == "text":
        x, y = svg_length(attrs, "x"), svg_length(attrs, "y")
        return [] if x is None or y is None else [(x, y)]
    return []


def declares_unstatic_css(declarations: str) -> bool:
    for declaration in declarations.split(";"):
        name = declaration.split(":", 1)[0].strip().casefold()
        if name in UNSTATIC_CSS_PROPERTIES or name.startswith(UNSTATIC_CSS_PREFIXES):
            return True
    return False


def selector_subjects(selector: str) -> list[tuple[str, set[str], set[str], set[str]]]:
    """Tag, classes, IDs and attribute names a selector's last compound requires."""
    subjects = []
    for alternative in CSS_PARENS_RE.sub("", CSS_STRING_RE.sub("", selector)).split(","):
        parts = [part for part in CSS_COMBINATOR_RE.split(alternative.strip()) if part]
        if not parts:
            continue
        compound = parts[-1].split("::", 1)[0]
        tag = CSS_TAG_RE.match(compound)
        subjects.append((
            tag.group(0).casefold() if tag else "",
            set(CSS_CLASS_RE.findall(compound)),
            set(CSS_ID_RE.findall(compound)),
            {name.casefold() for name in CSS_ATTRIBUTE_RE.findall(compound)},
        ))
    return subjects


def unstatic_css_subjects(source: str) -> list[tuple[str, set[str], set[str], set[str]]]:
    """Selector subjects of stylesheet rules that move, hide or clip what they match.

    Matching keeps only the last compound and drops pseudo-classes, so it can match more
    elements than the browser does. That only skips checks; it never adds a finding.
    """
    styles = re.findall(r"<style\b[^>]*>(.*?)</style\s*>", source, re.IGNORECASE | re.DOTALL)
    sheet = CSS_KEYFRAMES_RE.sub("", CSS_COMMENT_RE.sub("", "\n".join(styles)))
    subjects = []
    for selector, declarations in CSS_RULE_RE.findall(sheet):
        if declares_unstatic_css(declarations):
            subjects.extend(selector_subjects(selector))
    return subjects


def matches_subject(
    tag: str, attrs: dict[str, str], subject: tuple[str, set[str], set[str], set[str]]
) -> bool:
    subject_tag, classes, ids, attribute_names = subject
    if subject_tag not in {"", "*", tag}:
        return False
    if not classes <= set(attrs.get("class", "").split()):
        return False
    if not ids <= {attrs.get("id", "")}:
        return False
    return attribute_names <= set(attrs)


def child_offset(
    tag: str,
    attrs: dict[str, str],
    parent: tuple[float, float] | None,
    css_subjects: list[tuple[str, set[str], set[str], set[str]]],
) -> tuple[float, float] | None:
    """Offset of an element in viewBox units, or None when its paint is not static."""
    if parent is None or tag in UNPAINTED_TAGS:
        return None
    if declares_unstatic_css(attrs.get("style", "")):
        return None
    if attrs.get("display", "").strip().casefold() == "none":
        return None
    if attrs.get("visibility", "").strip().casefold() in {"hidden", "collapse"}:
        return None
    if attrs.get("clip-path", "none").strip().casefold() != "none":
        return None
    if attrs.get("mask", "none").strip().casefold() != "none":
        return None
    if any(matches_subject(tag, attrs, subject) for subject in css_subjects):
        return None
    transform = attrs.get("transform")
    if transform is None:
        return parent
    match = TRANSLATE_RE.match(transform)
    if match is None:
        return None
    return parent[0] + float(match.group(1)), parent[1] + float(match.group(2) or 0)


class ViewBoxParser(HTMLParser):
    def __init__(self, css_subjects: list[tuple[str, set[str], set[str], set[str]]]) -> None:
        super().__init__(convert_charrefs=True)
        self.svgs: list[SvgExtent] = []
        self._css_subjects = css_subjects
        self._frames: list[tuple[str, tuple[float, float] | None]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.casefold()
        data = {key.casefold(): value or "" for key, value in attrs}
        if not self._frames:
            if tag == "svg":
                self.svgs.append(SvgExtent(data))
                self._frames.append((tag, (0.0, 0.0)))
            return
        offset = child_offset(tag, data, self._frames[-1][1], self._css_subjects)
        self._frames.append((tag, offset))
        if offset is None:
            return
        label = " ".join(
            [f"<{tag}"]
            + [f'{name}="{data[name]}"' for name in GEOMETRY_ATTRS.get(tag, ()) if name in data]
        ) + ">"
        for x, y in painted_points(tag, data):
            self.svgs[-1].points.append((x + offset[0], y + offset[1], label))

    def handle_endtag(self, tag: str) -> None:
        tag = tag.casefold()
        for index in range(len(self._frames) - 1, -1, -1):
            if self._frames[index][0] == tag:
                del self._frames[index:]
                return


def normalized_controller(body: str) -> str:
    return body.replace("\r\n", "\n").replace("\r", "\n").strip()


def parsed_document(source: str) -> DiagramParser:
    parser = DiagramParser()
    parser.feed(source)
    parser.close()
    return parser


def reference_error(tag: str, value: str) -> str | None:
    stripped = value.strip()
    lowered = stripped.casefold()
    if not stripped or stripped.startswith("#"):
        return None
    if lowered.startswith("javascript:") or lowered.startswith("data:text/html"):
        return f"executable URL on <{tag}>: {stripped[:80]}"
    remote = lowered.startswith(("http://", "https://", "//")) or (
        ":" in stripped.split("/", 1)[0] and not lowered.startswith("data:")
    )
    if not remote:
        if lowered.startswith("data:") and not lowered.startswith("data:image/"):
            return f"non-image data URL on <{tag}>: {stripped[:80]}"
        return None
    return f"remote reference on <{tag}>: {stripped[:80]}"


def normalize_css_escapes(source: str) -> str:
    source = source.replace("\r\n", "\n").replace("\r", "\n").replace("\f", "\n")

    def replace(match: re.Match[str]) -> str:
        if match.group(1) is None:
            escaped = match.group(2)
            return "" if escaped == "\n" else escaped
        codepoint = int(match.group(1), 16)
        if codepoint == 0 or codepoint > 0x10FFFF:
            return "\N{REPLACEMENT CHARACTER}"
        return chr(codepoint)

    return CSS_ESCAPE_RE.sub(replace, source)


def check_css_references(parser: DiagramParser, errors: list[str]) -> None:
    # Match the repository linter's fail-closed treatment of CSS loader syntax.
    source = normalize_css_escapes("\n".join(parser.styles + parser.css_attributes))
    found_loader = False
    if CSS_IMPORT_RE.search(source):
        errors.append("CSS @import is not allowed")
        found_loader = True
    for match in CSS_URL_RE.finditer(source):
        value = match.group(1).strip().strip("'\"").strip()
        if not value.startswith("#"):
            errors.append("non-fragment CSS url() is not allowed")
            found_loader = True
    if CSS_IMAGE_SET_RE.search(source):
        errors.append("CSS image-set() is not allowed")
        found_loader = True
    if CSS_REMOTE_RE.search(source) and not found_loader:
        errors.append("remote reference in CSS is not allowed")


def canonical_controller() -> str:
    if not MOTION_TEMPLATE.is_file():
        raise RuntimeError(
            f"cannot find the canonical controller at {MOTION_TEMPLATE}; "
            "run self_check.py from its shipped location inside the skill"
        )
    parser = parsed_document(MOTION_TEMPLATE.read_text(encoding="utf-8"))
    if len(parser.scripts) != 1 or not parser.scripts[0]["closed"]:
        raise RuntimeError("template-motion.html must contain one closed controller")
    body = parser.scripts[0]["body"]
    assert isinstance(body, list)
    return normalized_controller("".join(body))


def check_viewbox(source: str, errors: list[str]) -> None:
    parser = ViewBoxParser(unstatic_css_subjects(source))
    parser.feed(source)
    parser.close()
    checkable = [
        svg for svg in parser.svgs if svg.attrs.get("aria-hidden", "").casefold() != "true"
    ]
    for number, svg in enumerate(checkable, 1):
        box = [float(value) for value in SVG_NUMBER_RE.findall(svg.attrs.get("viewbox", ""))]
        if len(box) != 4 or box[2] <= 0 or box[3] <= 0:
            continue
        left, top, width, height = box
        worst: dict[str, tuple[float, str]] = {}
        for x, y, label in svg.points:
            for side, overshoot in (
                ("left", left - x),
                ("top", top - y),
                ("right", x - (left + width)),
                ("bottom", y - (top + height)),
            ):
                if overshoot > VIEWBOX_TOLERANCE and overshoot > worst.get(side, (0.0, ""))[0]:
                    worst[side] = (overshoot, label)
        for side, (overshoot, label) in worst.items():
            errors.append(
                f"svg {number}: {label} paints {overshoot:g}px past the viewBox {side} edge "
                "and is clipped; grow the viewBox or move the content inside it"
            )


def check_scripts(parser: DiagramParser, errors: list[str]) -> None:
    if not parser.scripts:
        return
    if len(parser.scripts) > 1:
        errors.append(f"at most one script is allowed; found {len(parser.scripts)}")
    for number, script in enumerate(parser.scripts, 1):
        attrs = script["attrs"]
        attr_names = script["attr_names"]
        body = script["body"]
        assert isinstance(attrs, dict) and isinstance(attr_names, list) and isinstance(body, list)
        if not script["closed"]:
            errors.append(f"script {number} must have a closing script tag")
        if attr_names != ["data-diagram-controls"] or attrs.get("data-diagram-controls") != "":
            errors.append(f"script {number} must carry only the canonical data-diagram-controls attribute")
            continue
        try:
            if normalized_controller("".join(body)) != canonical_controller():
                errors.append(f"script {number} must exactly match the controller in template-motion.html")
        except RuntimeError as exc:
            errors.append(str(exc))


def verify(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    parser = parsed_document(source)
    errors: list[str] = []
    errors.extend(parser.unsafe)
    check_css_references(parser, errors)
    for tag, value in parser.references:
        finding = reference_error(tag, value)
        if finding:
            errors.append(finding)
    check_viewbox(source, errors)
    check_scripts(parser, errors)
    return errors


def main() -> int:
    argument_parser = argparse.ArgumentParser(description=__doc__)
    argument_parser.add_argument("files", nargs="+", type=Path)
    args = argument_parser.parse_args()
    failed = False
    for path in args.files:
        try:
            errors = verify(path)
        except (OSError, UnicodeError) as exc:
            errors = [str(exc)]
        if errors:
            failed = True
            print(f"FAIL {path}")
            for error in errors:
                print(f"  - {error}")
        else:
            print(f"OK {path}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
