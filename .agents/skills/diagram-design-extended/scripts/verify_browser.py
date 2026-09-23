#!/usr/bin/env python3
"""Rendered browser QA gate for diagram HTML, driven through agent-browser.

Automates the deterministic half of references/verify-browser.md: console
errors, rendered card clearance (getBBox), horizontal overflow, multi-viewport
screenshots, and — for animated diagrams — the static override, reduced-motion
emulation, and control operation. Screenshot *review* stays with the agent:
run this first, then answer the screenshot questions in
references/quality-hardening.md §7 against the captured images.

Usage:
    python3 scripts/verify_browser.py path/to/diagram.html [--dark] [--out DIR]

Before anything is rendered, the single-file safety contract
(self_check.safety_errors: no non-canonical scripts, executable attributes,
iframes/objects, or remote references in markup or CSS) must pass — the gate
refuses to open unchecked HTML in the browser. --unsafe-allow-unchecked
skips that preflight for debugging only.

Exit 0 = gate passed (screenshots still need review). Exit 1 = findings.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import self_check  # noqa: E402  sibling stdlib-only helper

VIEWPORTS = [(320, 480), (375, 667), (414, 896), (768, 1024), (1440, 900)]

CLEARANCE_JS = """
(() => {
  const findings = [];
  const groups = document.querySelectorAll("svg g");
  for (const group of groups) {
    const rect = group.querySelector(":scope > rect");
    if (!rect) continue;
    const card = rect.getBBox();
    if (card.width < 60 || card.height < 40) continue;
    const texts = [...group.querySelectorAll(":scope > text")];
    if (!texts.length) continue;
    const boxes = texts.map((t) => t.getBBox());
    const minX = Math.min(...boxes.map((b) => b.x));
    const maxX = Math.max(...boxes.map((b) => b.x + b.width));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxY = Math.max(...boxes.map((b) => b.y + b.height));
    const c = {
      left: minX - card.x,
      right: card.x + card.width - maxX,
      top: minY - card.y,
      bottom: card.y + card.height - maxY,
    };
    for (const [side, value] of Object.entries(c)) {
      if (value < 8) findings.push(`FAIL clearance ${side}=${value.toFixed(1)}px < 8px: "${texts[0].textContent.trim().slice(0, 40)}"`);
      else if (value < 12) findings.push(`WARN clearance ${side}=${value.toFixed(1)}px < 12px: "${texts[0].textContent.trim().slice(0, 40)}"`);
    }
  }
  return JSON.stringify(findings);
})()
"""

OVERFLOW_JS = (
    "JSON.stringify({scrollW: document.documentElement.scrollWidth,"
    " clientW: document.documentElement.clientWidth})"
)

# Rendered T1 geometry checks (issues 02/03, Layer-1 invariants): card-vs-card
# overlap, connector transit through a non-endpoint card, and label collisions
# (label-vs-card and label-vs-label). All geometry is getBBox mapped into each
# SVG root's user space via getScreenCTM, so transformed groups and CSS scaling
# are handled. Containment is legal (zones, nested diagrams, badge chips);
# only partial intersections fail. Dashed connectors keep the SKILL.md §6
# dashed-transit exemption.
GEOMETRY_JS = """
(() => {
  const result = {"card-overlap": [], "connector-transit": [], "label-collision": []};
  const svgs = [...document.querySelectorAll("svg")].filter(
    (s) => !s.ownerSVGElement && !s.closest("defs, marker")
  );
  svgs.forEach((svg, svgIndex) => {
    const screen = svg.getScreenCTM();
    if (!screen) return;
    const inv = screen.inverse();
    const userBox = (el) => {
      const m = el.getScreenCTM();
      if (!m) return null;
      let b;
      try { b = el.getBBox(); } catch { return null; }
      const local = inv.multiply(m);
      const corners = [
        [b.x, b.y], [b.x + b.width, b.y],
        [b.x, b.y + b.height], [b.x + b.width, b.y + b.height],
      ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(local));
      const xs = corners.map((p) => p.x);
      const ys = corners.map((p) => p.y);
      return {x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xs), b: Math.max(...ys)};
    };
    const vb = svg.viewBox && svg.viewBox.baseVal;
    const svgArea = vb && vb.width ? vb.width * vb.height : null;
    const where = svgs.length > 1 ? ` [svg #${svgIndex + 1}]` : "";
    const describe = (box) =>
      `(${box.x.toFixed(0)},${box.y.toFixed(0)} ${(box.r - box.x).toFixed(0)}x${(box.b - box.y).toFixed(0)})`;

    // Node cards: rect/polygon at least 60x40 in user units, excluding
    // full-bleed backgrounds and coincident paper-mask duplicates.
    const cards = [];
    for (const el of svg.querySelectorAll("rect, polygon")) {
      if (el.ownerSVGElement !== svg || el.closest("defs, marker")) continue;
      const box = userBox(el);
      if (!box) continue;
      const w = box.r - box.x, h = box.b - box.y;
      if (w < 60 || h < 40) continue;
      if (svgArea && w * h >= 0.85 * svgArea) continue;
      if (cards.some((c) =>
        Math.abs(c.box.x - box.x) < 1 && Math.abs(c.box.y - box.y) < 1 &&
        Math.abs(c.box.r - box.r) < 1 && Math.abs(c.box.b - box.b) < 1)) continue;
      cards.push({box});
    }

    const contains = (outer, inner, eps) =>
      inner.x >= outer.x - eps && inner.y >= outer.y - eps &&
      inner.r <= outer.r + eps && inner.b <= outer.b + eps;

    // Card-vs-card overlap: partial bounding-box intersection > 2px both axes.
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const a = cards[i].box, b = cards[j].box;
        const dx = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        const dy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        if (dx <= 2 || dy <= 2) continue;
        if (contains(a, b, 0.5) || contains(b, a, 0.5)) continue;
        result["card-overlap"].push(
          `FAIL card-overlap${where}: card ${describe(a)} overlaps card ${describe(b)} by ${dx.toFixed(1)}x${dy.toFixed(1)}px`);
      }
    }

    // Connector transit: sample each solid stroked line/polyline/path; any
    // sample strictly inside a card that holds neither endpoint is a transit.
    const near = (p, box, pad) =>
      p.x > box.x - pad && p.x < box.r + pad && p.y > box.y - pad && p.y < box.b + pad;
    for (const el of svg.querySelectorAll("line, polyline, path")) {
      if (el.ownerSVGElement !== svg || el.closest("defs, marker")) continue;
      const cs = getComputedStyle(el);
      if (!cs.stroke || cs.stroke === "none") continue;
      if (el.tagName.toLowerCase() === "path" && cs.fill !== "none") continue;
      if (cs.strokeDasharray && cs.strokeDasharray !== "none") continue;
      let total;
      try { total = el.getTotalLength(); } catch { continue; }
      if (!isFinite(total) || total < 24) continue;
      const m = el.getScreenCTM();
      if (!m) continue;
      const local = inv.multiply(m);
      const at = (d) => {
        const p = el.getPointAtLength(d);
        return new DOMPoint(p.x, p.y).matrixTransform(local);
      };
      const start = at(0), end = at(total);
      const targets = cards.filter((c) => !near(start, c.box, 8) && !near(end, c.box, 8));
      if (!targets.length) continue;
      const steps = Math.max(16, Math.min(240, Math.round(total / 6)));
      for (const c of targets) {
        for (let i = 1; i < steps; i++) {
          const p = at((total * i) / steps);
          if (p.x > c.box.x + 2 && p.x < c.box.r - 2 && p.y > c.box.y + 2 && p.y < c.box.b - 2) {
            result["connector-transit"].push(
              `FAIL connector-transit${where}: <${el.tagName.toLowerCase()}> crosses non-endpoint card ${describe(c.box)} at (${p.x.toFixed(0)},${p.y.toFixed(0)})`);
            break;
          }
        }
      }
    }

    // Labels: text whose bbox center sits outside every card (card copy is
    // covered by the clearance check). Label-vs-card and label-vs-label
    // intersections > 2px on both axes fail (the slack absorbs font-metric
    // variance; real collisions are far larger).
    const labels = [];
    for (const el of svg.querySelectorAll("text")) {
      if (el.ownerSVGElement !== svg || el.closest("defs, marker")) continue;
      if (!(el.textContent || "").trim()) continue;
      const box = userBox(el);
      if (!box) continue;
      const cx = (box.x + box.r) / 2, cy = (box.y + box.b) / 2;
      if (cards.some((c) => cx > c.box.x - 2 && cx < c.box.r + 2 && cy > c.box.y - 2 && cy < c.box.b + 2)) continue;
      labels.push({box, text: el.textContent.trim().slice(0, 40)});
    }
    for (const label of labels) {
      for (const c of cards) {
        const dx = Math.min(label.box.r, c.box.r) - Math.max(label.box.x, c.box.x);
        const dy = Math.min(label.box.b, c.box.b) - Math.max(label.box.y, c.box.y);
        if (dx > 2 && dy > 2) {
          result["label-collision"].push(
            `FAIL label-collision${where}: label "${label.text}" intersects card ${describe(c.box)} by ${dx.toFixed(1)}x${dy.toFixed(1)}px`);
        }
      }
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i].box, b = labels[j].box;
        const dx = Math.min(a.r, b.r) - Math.max(a.x, b.x);
        const dy = Math.min(a.b, b.b) - Math.max(a.y, b.y);
        if (dx > 2 && dy > 2) {
          result["label-collision"].push(
            `FAIL label-collision${where}: label "${labels[i].text}" overlaps label "${labels[j].text}" by ${dx.toFixed(1)}x${dy.toFixed(1)}px`);
        }
      }
    }
  });
  return JSON.stringify(result);
})()
"""

RENDERED_CHECK_NAMES = ("card-overlap", "connector-transit", "label-collision")


def ab(*args: str) -> str:
    result = subprocess.run(
        ["agent-browser", *args], capture_output=True, text=True, timeout=120
    )
    if result.returncode != 0:
        raise RuntimeError(f"agent-browser {' '.join(args)}: {result.stderr.strip()}")
    return result.stdout.strip()


def ab_eval(js: str) -> str:
    out = ab("eval", js)
    # agent-browser may quote the JSON string result
    if out.startswith('"') and out.endswith('"'):
        out = json.loads(out)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("file", help="diagram HTML file")
    parser.add_argument("--dark", action="store_true", help="also render with prefers-color-scheme: dark emulation")
    parser.add_argument("--out", default=None, help="screenshot output dir (default: temp dir, path printed)")
    parser.add_argument(
        "--unsafe-allow-unchecked",
        action="store_true",
        help="debug only: render even when the single-file safety preflight fails",
    )
    args = parser.parse_args()

    if shutil.which("agent-browser") is None:
        print("SKIP: agent-browser not on PATH — gate unavailable; fall back to self_check plus manual ?motion=static and print checks. Do not claim the gate passed.")
        return 1

    path = Path(args.file).resolve()
    if not path.exists():
        print(f"FAIL: {path} not found")
        return 1

    if args.unsafe_allow_unchecked:
        print("WARNING: --unsafe-allow-unchecked — rendering WITHOUT the single-file safety preflight.")
    else:
        try:
            safety = self_check.safety_errors(path)
        except (OSError, UnicodeError) as exc:
            print(f"FAIL safety preflight could not read {path}: {exc}")
            return 1
        if safety:
            print("FAIL safety preflight (self_check): refusing to open unchecked HTML in the browser.")
            for finding in safety:
                print(f"  - {finding}")
            return 1

    url = path.as_uri()
    out_dir = Path(args.out) if args.out else Path(tempfile.mkdtemp(prefix="diagram-qa-"))
    out_dir.mkdir(parents=True, exist_ok=True)

    findings: list[str] = []
    warnings: list[str] = []

    ab("open", url)
    ab("wait", "svg")
    ab_eval("document.fonts.ready.then(() => 'ok')")

    errors = ab("errors")
    if errors and "No errors" not in errors and errors.strip():
        findings.append(f"FAIL console/page errors:\n{errors}")

    animated = ab_eval("String(!!document.querySelector('[data-motion-root]'))") == "true"

    for line in json.loads(ab_eval(CLEARANCE_JS)):
        (findings if line.startswith("FAIL") else warnings).append(line)

    geometry = json.loads(ab_eval(GEOMETRY_JS))
    for name in RENDERED_CHECK_NAMES:
        lines = geometry.get(name, [])
        findings.extend(lines)
        print(f"[{'FAIL' if lines else 'PASS'}] rendered {name} ({len(lines)} finding(s))")
    # Machine-readable line for verify.py: per-check findings keyed by name.
    print("RENDERED_CHECKS_JSON: " + json.dumps(
        {name: geometry.get(name, []) for name in RENDERED_CHECK_NAMES}
    ))

    for w, h in VIEWPORTS:
        ab("set", "viewport", str(w), str(h))
        overflow = json.loads(ab_eval(OVERFLOW_JS))
        if overflow["scrollW"] > overflow["clientW"]:
            wrapped = ab_eval(
                "String(!!document.querySelector('svg')?.closest('[style*=overflow],figure,.diagram-scroll'))"
            )
            note = f"{'WARN' if wrapped == 'true' else 'FAIL'} horizontal overflow at {w}px: scrollWidth {overflow['scrollW']} > {overflow['clientW']}"
            (warnings if wrapped == "true" else findings).append(note)
        ab("screenshot", str(out_dir / f"{path.stem}-{w}w.png"))

    if args.dark:
        ab("set", "media", "dark")
        ab("screenshot", str(out_dir / f"{path.stem}-dark.png"))
        ab("set", "media", "light")

    if animated:
        ab("open", url + "?motion=static")
        ab("wait", "svg")
        frame = ab_eval("document.querySelector('[data-motion-root]')?.dataset.frame || document.documentElement.dataset.frame || ''")
        if "static" not in frame:
            findings.append(f"FAIL ?motion=static did not set data-frame=static (got '{frame}')")
        ab("screenshot", str(out_dir / f"{path.stem}-static.png"))

        ab("set", "media", "reduced-motion")
        ab("open", url)
        ab("wait", "svg")
        engaged = ab_eval(
            "String(matchMedia('(prefers-reduced-motion: reduce)').matches)"
        )
        if engaged == "true":
            controls_visible = ab_eval(
                "String([...document.querySelectorAll('[data-motion-action]')].some(el => el.offsetParent !== null))"
            )
            if controls_visible == "true":
                findings.append("FAIL reduced-motion: playback controls still visible")
            ab("screenshot", str(out_dir / f"{path.stem}-reduced-motion.png"))
        else:
            # agent-browser 0.20.0 engages color-scheme but not reduced-motion.
            # Fall back to a CSS-level check: a reduce block must hide the controls.
            css_ok = ab_eval(
                "String([...document.styleSheets].some(s => { try { return [...s.cssRules].some(r =>"
                " r.media && r.media.mediaText.includes('prefers-reduced-motion') &&"
                " [...r.cssRules].some(i => /data-motion-controls|data-motion-action/.test(i.selectorText || '') &&"
                " /display:\\s*none|visibility:\\s*hidden/.test(i.cssText))); } catch { return false; } }))"
            )
            if css_ok == "true":
                warnings.append("WARN reduced-motion emulation unavailable in this agent-browser version; CSS reduce-block hides controls — verify manually in a real browser once")
            else:
                findings.append("FAIL no prefers-reduced-motion CSS block hides the playback controls (emulation unavailable; checked stylesheets)")
        ab("set", "media")  # clear emulation

        ab("open", url)
        ab("wait", "svg")
        for action in ("play", "pause", "replay"):
            sel = f"[data-motion-action='{action}']"
            if ab_eval(f"String(!!document.querySelector(\"{sel}\"))") == "true":
                try:
                    ab("click", sel)
                except RuntimeError as exc:
                    findings.append(f"FAIL control '{action}' not clickable: {exc}")
        post_errors = ab("errors")
        if post_errors and "No errors" not in post_errors and post_errors.strip():
            findings.append(f"FAIL errors after operating controls:\n{post_errors}")

    ab("close")

    for line in warnings:
        print(line)
    for line in findings:
        print(line)
    print(f"Screenshots: {out_dir}")
    print(f"Summary: {len(findings)} failure(s), {len(warnings)} warning(s). Review the screenshots against quality-hardening.md §7 before declaring done.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
