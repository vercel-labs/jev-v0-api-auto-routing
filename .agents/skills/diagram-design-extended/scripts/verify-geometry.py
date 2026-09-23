#!/usr/bin/env python3
"""Verify no diagram label mask is clipped by a node painted after it.

SKILL.md §6 keeps an arrow label 6-10px clear of its connector, and §5 fixes the
paint order as background -> zones -> arrows -> labels -> nodes. Nothing keeps a
label mask off a *node*, so a label whose mask lands partly inside a node
rectangle that is painted later gets covered by the node fill: the text renders
as a fragment sitting on the node border.

Paint order is what makes this a defect rather than a stylistic choice:

* A mask overlapping a zone container is fine - zones are painted before labels,
  so the label stays on top. Zone eyebrows rely on this.
* A mask overlapping a node declared *later* in the document is clipped by that
  node. That is the failure this check reports.

Shape heuristics follow the shipped templates:

* A node is a `<rect>` at least 60x40 - large enough for a title and sublabel.
* A label mask is a `<rect>` 20-200 wide and 8-14 tall - the masking plate that
  SKILL.md prescribes for arrow labels and zone eyebrows. The width cap covers
  the long mono plates shipped in example-sequence-oauth.html (128px) and the
  wider plates CJK labels need at the same glyph count.
* A mask fully contained in a node is a badge chip (`EXT`, `EDGE`, `ORIG`) and
  is legal.

With --card-lines the script instead runs the static card copy-budget check
(a Layer-1 invariant, issues 02/03): every node card holds at most 5 total
content lines (the >5 gate; the <=3 supporting-line budget needs semantics a
static pass cannot see and stays self-audit). A node card is a rect 60x40 up
to 160 tall - the title + sublabel + tag shape from components.md; taller
rects are panels or containers, not copy-budgeted cards. Zone containers
(rects that fully contain another card) and table cards (rects striped by
two or more near-full-width row rects, e.g. the db-schema tables) are
exempt, coincident paper-mask duplicates collapse, and text inside a badge
chip (a small mask-size rect within the card) is not card copy. Lines are
the distinct text baselines anchored inside the card.

Usage:
    python3 scripts/verify-geometry.py --all
    python3 scripts/verify-geometry.py skills/diagram-design-extended/assets/example-x.html
    python3 scripts/verify-geometry.py --card-lines diagram.html
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSET_DIR = ROOT / "assets"

RECT_RE = re.compile(
    r"<rect\b[^>]*?"
    r'\bx="(?P<x>-?[\d.]+)"\s+'
    r'y="(?P<y>-?[\d.]+)"\s+'
    r'width="(?P<w>[\d.]+)"\s+'
    r'height="(?P<h>[\d.]+)"',
    re.IGNORECASE,
)

TEXT_TAG_RE = re.compile(r"<text\b[^>]*>", re.IGNORECASE)
ATTR_X_RE = re.compile(r'\bx="(-?[\d.]+)"')
ATTR_Y_RE = re.compile(r'\by="(-?[\d.]+)"')

NODE_MIN_W = 60.0
NODE_MIN_H = 40.0
MASK_MIN_W = 20.0
MASK_MAX_W = 200.0
MASK_MIN_H = 8.0
MASK_MAX_H = 14.0
EPSILON = 0.5


class Rect:
    __slots__ = ("x", "y", "w", "h", "line", "offset")

    def __init__(self, x, y, w, h, line, offset) -> None:
        self.x, self.y, self.w, self.h = x, y, w, h
        self.line, self.offset = line, offset

    @property
    def right(self) -> float:
        return self.x + self.w

    @property
    def bottom(self) -> float:
        return self.y + self.h

    def __repr__(self) -> str:
        return f"({self.x:g},{self.y:g} {self.w:g}x{self.h:g})"


def parse_rects(source: str) -> list[Rect]:
    rects: list[Rect] = []
    for match in RECT_RE.finditer(source):
        rects.append(
            Rect(
                float(match.group("x")),
                float(match.group("y")),
                float(match.group("w")),
                float(match.group("h")),
                source.count("\n", 0, match.start()) + 1,
                match.start(),
            )
        )
    return rects


def overlap(a: Rect, b: Rect) -> tuple[float, float]:
    return (
        min(a.right, b.right) - max(a.x, b.x),
        min(a.bottom, b.bottom) - max(a.y, b.y),
    )


def contained(inner: Rect, outer: Rect) -> bool:
    return (
        inner.x >= outer.x - EPSILON
        and inner.y >= outer.y - EPSILON
        and inner.right <= outer.right + EPSILON
        and inner.bottom <= outer.bottom + EPSILON
    )


def check(path: Path) -> list[str]:
    source = path.read_text(encoding="utf-8")
    rects = parse_rects(source)
    nodes = [r for r in rects if r.w >= NODE_MIN_W and r.h >= NODE_MIN_H]
    masks = [
        r
        for r in rects
        if MASK_MIN_W <= r.w <= MASK_MAX_W and MASK_MIN_H <= r.h <= MASK_MAX_H
    ]

    findings: list[str] = []
    for mask in masks:
        for node in nodes:
            if node.offset <= mask.offset:
                continue  # painted before the label; the label stays on top
            dx, dy = overlap(mask, node)
            if dx <= 1.0 or dy <= 1.0 or contained(mask, node):
                continue
            findings.append(
                f"{path.name}:{mask.line}: label mask {mask} is clipped by node "
                f"{node} declared later at line {node.line} (overlap {dx:g}x{dy:g}px)"
                f" - move the label onto a free segment of its connector"
            )
            break
    return findings


CARD_MAX_LINES = 5  # copy budget: at most 5 total content lines per card
CARD_MAX_H = 160.0  # taller rects are panels/containers, not copy-budgeted cards


def check_card_lines(path: Path) -> list[str]:
    """Static card copy-budget check: >5 distinct text baselines in one card."""
    source = path.read_text(encoding="utf-8")
    rects = parse_rects(source)
    cards = [r for r in rects if r.w >= NODE_MIN_W and NODE_MIN_H <= r.h <= CARD_MAX_H]

    # Collapse coincident duplicates (paper mask under the styled rect).
    unique: list[Rect] = []
    for card in cards:
        if any(
            abs(card.x - u.x) < 1 and abs(card.y - u.y) < 1
            and abs(card.w - u.w) < 1 and abs(card.h - u.h) < 1
            for u in unique
        ):
            continue
        unique.append(card)

    def inside(inner: Rect, outer: Rect) -> bool:
        return contained(inner, outer) and (inner.w < outer.w - 1 or inner.h < outer.h - 1)

    # Zone containers fully contain another card; their texts are card copy of
    # the inner cards, not their own.
    zones = {id(c) for c in unique for other in unique if c is not other and inside(other, c)}

    # Table cards (db-schema style) are striped by >=2 near-full-width row
    # rects; their rows are structured fields, not prose lines.
    tables = set()
    for card in unique:
        stripes = sum(
            1
            for r in rects
            if r is not card
            and r.h < NODE_MIN_H
            and r.w >= card.w - 2
            and contained(r, card)
        )
        if stripes >= 2:
            tables.add(id(card))

    texts: list[tuple[float, float]] = []
    for match in TEXT_TAG_RE.finditer(source):
        tag = match.group(0)
        mx, my = ATTR_X_RE.search(tag), ATTR_Y_RE.search(tag)
        if mx and my:
            texts.append((float(mx.group(1)), float(my.group(1))))

    # Badge chips: small mask-size rects; text anchored inside one is a chip
    # label, not a card copy line.
    chips = [
        r
        for r in rects
        if MASK_MIN_W <= r.w <= MASK_MAX_W and r.h <= 2 * MASK_MAX_H
    ]

    def in_chip(x: float, y: float) -> bool:
        return any(c.x <= x <= c.right and c.y <= y <= c.bottom for c in chips)

    findings: list[str] = []
    for card in unique:
        if id(card) in zones or id(card) in tables:
            continue
        baselines = sorted(
            {
                round(y, 1)
                for x, y in texts
                if card.x <= x <= card.right
                and card.y <= y <= card.bottom
                and not in_chip(x, y)
            }
        )
        if len(baselines) > CARD_MAX_LINES:
            findings.append(
                f"{path.name}:{card.line}: card {card} holds {len(baselines)} content"
                f" lines > budget of {CARD_MAX_LINES} - cut copy or split the node"
            )
    return findings


def targets(args: argparse.Namespace) -> list[Path]:
    if args.all:
        return sorted(ASSET_DIR.glob("*.html"))
    return [Path(p) for p in args.files]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="HTML diagrams to check")
    parser.add_argument("--all", action="store_true", help="check every shipped asset")
    parser.add_argument(
        "--card-lines",
        action="store_true",
        help="run the static card copy-budget check (>5 content lines per card) instead of the mask-clip check",
    )
    args = parser.parse_args()

    paths = targets(args)
    if not paths:
        parser.error("pass one or more files, or --all")

    findings: list[str] = []
    for path in paths:
        if not path.exists():
            findings.append(f"{path}: file not found")
            continue
        findings.extend(check_card_lines(path) if args.card_lines else check(path))

    for finding in findings:
        print(finding)
    print(f"Summary: {len(paths)} file(s) checked, {len(findings)} finding(s).")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
