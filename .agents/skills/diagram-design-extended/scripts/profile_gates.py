#!/usr/bin/env python3
"""Layer-2 opinion gates parameterized by the active profile, no third-party deps.

Layer-1 invariants live in the other check scripts (self_check.py,
check_slop.py, verify-geometry.py, verify-motion.py, verify_browser.py) and
always block; this gate enforces only the profile-controlled opinions read
from the active profile's fenced YAML block (issue 11 format):

* accent_budget  - max accent-colored focal (node-sized) elements
* radius_range   - legal corner radius bounds; pill/stadium shapes exempt
* shadow_policy  - "none" forbids box-shadow, text-shadow, drop-shadow,
                   feDropShadow
* dark_mode/glow - the "profile may, drawer may not" guard: dark surfaces
                   and glow are legal only when the active profile declares
                   them

Profile resolution, in issue-08 order:

1. an explicitly passed --profile (a path to a profile .md, or a library
   slug under ~/.diagram-design/profiles/)
2. the nearest project marker file `.diagram-design` walking up from the
   diagram's directory (grammar: exactly one `profile: <slug>` line)
3. the shipped default, references/style-guide.md

The YAML block is parsed with a small stdlib-only reader (plain scalars,
flow lists, one level of nested mapping, comments); PyYAML is not required.
A field the active profile does not state inherits the default profile's
value, per references/profiles.md.

    python3 scripts/profile_gates.py my-diagram.html [--profile SLUG_OR_PATH]

Exit 0 = every opinion gate passed. Exit 1 = findings or resolution failure.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
DEFAULT_PROFILE = SKILL_DIR / "references" / "style-guide.md"
PROFILE_LIBRARY = Path.home() / ".diagram-design" / "profiles"

SLUG_RE = re.compile(r"[a-z0-9][a-z0-9-]{0,63}")
MARKER_RE = re.compile(r"^[ \t]*profile[ \t]*:[ \t]*([a-z0-9][a-z0-9-]{0,63})[ \t]*\n?$")
YAML_BLOCK_RE = re.compile(r"```yaml[ \t]*\n(.*?)```", re.S)
HEADER_RE = re.compile(r"<!--\s*diagram-design-profile\s*\n(.*?)-->", re.S)

HEX_RE = re.compile(r"#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b")
PAPER_VAR_RE = re.compile(r"--(?:color-)?paper\s*:\s*([^;}]+)")
ACCENT_VAR_RE = re.compile(r"--(?:color-)?accent\s*:\s*([^;}]+)")
FULLBLEED_RECT_RE = re.compile(
    r'<rect\b[^>]*width="100%"[^>]*height="100%"[^>]*fill="(#[0-9a-fA-F]{3,6})"', re.I
)
BODY_BG_RE = re.compile(
    r"(?:^|[}\s])(?:html|body)\s*{[^}]*?background(?:-color)?\s*:\s*([^;}]+)", re.S
)
STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)
RECT_TAG_RE = re.compile(r"<rect\b[^>]*>", re.I)
ATTR_RE = re.compile(r'([a-zA-Z_:.-]+)\s*=\s*"([^"]*)"')
BOX_SHADOW_RE = re.compile(r"box-shadow\s*:\s*([^;}]+)")
TEXT_SHADOW_RE = re.compile(r"text-shadow\s*:\s*([^;}]+)")
CSS_RADIUS_RE = re.compile(r"border-radius\s*:\s*([^;}]+)")
CSS_GLOW_RE = re.compile(r"(?<!backdrop-)filter\s*:[^;}]*blur\(")
PX_RE = re.compile(r"(-?[\d.]+)px")

NODE_MIN_W = 60.0
NODE_MIN_H = 40.0

GATE_FIELDS = ("accent_budget", "radius_range", "shadow_policy", "dark_mode", "glow")


class GateError(Exception):
    """Profile resolution or block parsing failed; the gate cannot run."""


# --- tiny YAML reader (the opinion block only: scalars, flow lists, one nested map)

def _strip_comment(line: str) -> str:
    out: list[str] = []
    quote: str | None = None
    for ch in line:
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
        elif ch in "\"'":
            quote = ch
            out.append(ch)
        elif ch == "#":
            break
        else:
            out.append(ch)
    return "".join(out).rstrip()


def _scalar(token: str) -> object:
    token = token.strip()
    if len(token) >= 2 and token[0] in "\"'" and token[-1] == token[0]:
        return token[1:-1]
    lowered = token.casefold()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    if lowered in {"null", "~", ""}:
        return None
    try:
        return int(token)
    except ValueError:
        pass
    try:
        return float(token)
    except ValueError:
        pass
    return token


def _value(text: str) -> object:
    text = text.strip()
    if text.startswith("[") and text.endswith("]"):
        inner = text[1:-1].strip()
        if not inner:
            return []
        return [_scalar(part) for part in inner.split(",")]
    return _scalar(text)


def parse_yaml_block(block: str) -> dict[str, object]:
    data: dict[str, object] = {}
    nested_key: str | None = None
    for raw in block.splitlines():
        line = _strip_comment(raw)
        if not line.strip():
            continue
        indent = len(line) - len(line.lstrip(" "))
        stripped = line.strip()
        if ":" not in stripped:
            raise GateError(f"unparseable opinion-block line: {stripped!r}")
        key, _, rest = stripped.partition(":")
        key = key.strip()
        rest = rest.strip()
        if indent == 0:
            if rest:
                data[key] = _value(rest)
                nested_key = None
            else:
                data[key] = {}
                nested_key = key
        else:
            if nested_key is None:
                raise GateError(f"indented opinion-block line without a parent mapping: {stripped!r}")
            mapping = data[nested_key]
            assert isinstance(mapping, dict)
            mapping[key] = _value(rest)
    return data


def opinion_block(profile_path: Path) -> dict[str, object] | None:
    """The parsed fenced YAML block of a profile file, or None when absent."""
    text = profile_path.read_text(encoding="utf-8")
    match = YAML_BLOCK_RE.search(text)
    if match is None:
        return None
    return parse_yaml_block(match.group(1))


def profile_header(profile_path: Path) -> dict[str, str]:
    """name/slug from the leading diagram-design-profile comment, best effort."""
    try:
        text = profile_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    match = HEADER_RE.match(text)
    if match is None:
        return {}
    fields: dict[str, str] = {}
    for line in match.group(1).splitlines():
        key, _, rest = line.partition(":")
        if _ and key.strip() in {"name", "slug"}:
            fields[key.strip()] = rest.strip()
    return fields


# --- profile resolution (issue 08 order)

def _parse_marker(marker: Path) -> str | None:
    """The marker slug, or None when the marker is invalid and must be ignored."""
    try:
        content = marker.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None
    match = MARKER_RE.fullmatch(content)
    return match.group(1) if match else None


def resolve_profile(diagram_path: Path, explicit: str | None) -> tuple[str, Path]:
    """(source, profile_path) where source is explicit | marker | default."""
    if explicit:
        candidate = Path(explicit).expanduser()
        if candidate.is_file():
            return "explicit", candidate.resolve()
        if SLUG_RE.fullmatch(explicit):
            if explicit == "default":
                return "explicit", DEFAULT_PROFILE
            library_file = PROFILE_LIBRARY / f"{explicit}.md"
            if library_file.is_file():
                return "explicit", library_file
        raise GateError(
            f"explicit profile {explicit!r} is neither a readable file nor a library slug"
        )
    directory = diagram_path.resolve().parent
    for candidate_dir in [directory, *directory.parents]:
        marker = candidate_dir / ".diagram-design"
        if not marker.is_file():
            continue
        slug = _parse_marker(marker)
        if slug is None:
            print(f"NOTE ignoring invalid project marker {marker} (grammar is 'profile: <slug>')")
            break
        if slug == "default":
            return "marker", DEFAULT_PROFILE
        library_file = PROFILE_LIBRARY / f"{slug}.md"
        if not library_file.is_file():
            raise GateError(
                f"project marker {marker} names profile {slug!r} but "
                f"{library_file} does not exist; not falling back silently"
            )
        return "marker", library_file
    return "default", DEFAULT_PROFILE


def effective_opinions(profile_path: Path) -> tuple[dict[str, object], list[str]]:
    """Gate values from the active profile's block, inheriting from the default.

    Returns (opinions, inherited_field_names). The default profile's block is
    the base; a field the active profile does not state inherits from it.
    """
    base = opinion_block(DEFAULT_PROFILE)
    if base is None:
        raise GateError(f"default profile {DEFAULT_PROFILE} has no fenced YAML opinion block")
    if profile_path.resolve() == DEFAULT_PROFILE.resolve():
        active: dict[str, object] = dict(base)
        overlay: dict[str, object] = base
    else:
        overlay = opinion_block(profile_path) or {}
        active = dict(base)
        active.update(overlay)
    missing = [field for field in GATE_FIELDS if field not in base]
    if missing:
        raise GateError(f"default opinion block is missing gate field(s): {', '.join(missing)}")
    inherited = [field for field in GATE_FIELDS if field not in overlay]
    return active, inherited


# --- diagram measurements

def _hex_luma(color: str) -> float:
    digits = color.lstrip("#")
    if len(digits) == 3:
        digits = "".join(ch * 2 for ch in digits)
    r, g, b = (int(digits[i : i + 2], 16) for i in (0, 2, 4))
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255


def _first_hex(text: str) -> str | None:
    match = HEX_RE.search(text)
    return match.group(0) if match else None


def _css_text(source: str) -> str:
    return "\n".join(match.group(1) for match in STYLE_BLOCK_RE.finditer(source))


def _rect_attrs(source: str) -> list[dict[str, str]]:
    rects = []
    for tag in RECT_TAG_RE.finditer(source):
        rects.append({key.casefold(): value for key, value in ATTR_RE.findall(tag.group(0))})
    return rects


def _float(value: str | None) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None


def detect_background(source: str, css: str) -> str | None:
    """The page/diagram background hex, or None when undeterminable."""
    for regex, text in ((PAPER_VAR_RE, css), (FULLBLEED_RECT_RE, source), (BODY_BG_RE, css)):
        match = regex.search(text)
        if match:
            color = _first_hex(match.group(1))
            if color:
                return color
    return None


def detect_accent(css: str) -> str | None:
    match = ACCENT_VAR_RE.search(css)
    if match:
        return _first_hex(match.group(1))
    return None


# --- the gates

def evaluate(source: str, opinions: dict[str, object]) -> list[str]:
    findings: list[str] = []
    css = _css_text(source)
    rects = _rect_attrs(source)

    # dark_mode guard: dark surfaces only when the profile declares them.
    background = detect_background(source, css)
    if opinions.get("dark_mode") is False and background is not None:
        if _hex_luma(background) < 0.5:
            findings.append(
                f"dark_mode: background {background} is a dark surface but the active "
                "profile declares dark_mode: false (profile may, drawer may not)"
            )

    # glow guard: blur-based glow only when the profile declares it.
    if opinions.get("glow") is False:
        if "feGaussianBlur" in source:
            findings.append(
                "glow: SVG blur filter present but the active profile declares glow: false"
            )
        elif CSS_GLOW_RE.search(css):
            findings.append(
                "glow: CSS filter blur() present but the active profile declares glow: false"
            )

    # shadow_policy: "none" forbids shadows entirely.
    if opinions.get("shadow_policy") == "none":
        for regex, label in ((BOX_SHADOW_RE, "box-shadow"), (TEXT_SHADOW_RE, "text-shadow")):
            for match in regex.finditer(css):
                if match.group(1).strip().casefold() != "none":
                    findings.append(
                        f"shadow_policy: {label} '{match.group(1).strip()[:60]}' but the "
                        "active profile declares shadow_policy: none"
                    )
        if "drop-shadow(" in css:
            findings.append(
                "shadow_policy: CSS drop-shadow() but the active profile declares shadow_policy: none"
            )
        if "feDropShadow" in source:
            findings.append(
                "shadow_policy: SVG feDropShadow but the active profile declares shadow_policy: none"
            )

    # radius_range: rect rx and CSS border-radius inside [min, max];
    # pill/stadium shapes (2*rx >= height, or CSS >= 999px) are shapes, not corners.
    radius_range = opinions.get("radius_range")
    if isinstance(radius_range, list) and len(radius_range) == 2:
        low, high = float(radius_range[0]), float(radius_range[1])
        for rect in rects:
            rx = _float(rect.get("rx"))
            height = _float(rect.get("height"))
            if rx is None:
                continue
            if height is not None and 2 * rx >= height:
                continue  # pill/stadium shape
            if not low <= rx <= high:
                findings.append(
                    f"radius_range: rect rx={rx:g} outside the active profile's [{low:g}, {high:g}]"
                )
        for match in CSS_RADIUS_RE.finditer(css):
            for value in PX_RE.findall(match.group(1)):
                radius = float(value)
                if radius >= 999:
                    continue  # pill convention
                if not low <= radius <= high:
                    findings.append(
                        f"radius_range: border-radius {radius:g}px outside the active "
                        f"profile's [{low:g}, {high:g}]"
                    )

    # accent_budget: node-sized rects painted with the accent color.
    budget = opinions.get("accent_budget")
    accent = detect_accent(css)
    if isinstance(budget, int) and accent is not None:
        accent_forms = {accent.casefold(), "var(--accent)", "var(--color-accent)"}
        focal = 0
        for rect in rects:
            width = _float(rect.get("width"))
            height = _float(rect.get("height"))
            if width is None or height is None or width < NODE_MIN_W or height < NODE_MIN_H:
                continue
            paint = {rect.get("fill", "").casefold(), rect.get("stroke", "").casefold()}
            if paint & accent_forms:
                focal += 1
        if focal > budget:
            findings.append(
                f"accent_budget: {focal} accent-colored focal element(s) exceed the "
                f"active profile's budget of {budget}"
            )

    return findings


def run(diagram_path: Path, explicit: str | None) -> tuple[dict[str, object], list[str]]:
    """(profile_report, findings) for one diagram file.

    profile_report is the verify.json `profile` field: which profile
    parameterized this run, how it was resolved, and the effective values.
    """
    source, profile_path = resolve_profile(diagram_path, explicit)
    opinions, inherited = effective_opinions(profile_path)
    header = profile_header(profile_path)
    report: dict[str, object] = {
        "source": source,
        "path": str(profile_path),
        "name": header.get("name"),
        "slug": header.get("slug"),
        "opinions": {field: opinions.get(field) for field in GATE_FIELDS},
        "inherited": inherited,
    }
    findings = evaluate(diagram_path.read_text(encoding="utf-8"), opinions)
    return report, findings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", type=Path, help="diagram HTML file")
    parser.add_argument(
        "--profile",
        default=None,
        metavar="SLUG_OR_PATH",
        help="explicit active profile: a profile .md path or a library slug (wins over the marker file)",
    )
    args = parser.parse_args()
    path = args.file.resolve()
    if not path.is_file():
        print(f"ERROR {path}: not a file")
        return 1
    try:
        report, findings = run(path, args.profile)
    except GateError as exc:
        print(f"ERROR profile gates could not run: {exc}")
        return 1
    label = report["slug"] or report["name"] or Path(str(report["path"])).stem
    print(f"Active profile: {label} ({report['source']}) at {report['path']}")
    if report["inherited"]:
        print(f"Inherited gate fields: {', '.join(str(f) for f in report['inherited'])}")
    for finding in findings:
        print(f"FAIL {finding}")
    if not findings:
        print("OK all profile-parameterized opinion gates passed")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
