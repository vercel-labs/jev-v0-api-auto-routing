# Browser QA gate — rendered, not source

Static checks cannot see padding, overflow, contrast, or motion state. When `agent-browser` is on PATH this gate is **mandatory** before declaring any diagram done; without it, fall back to `self_check.py` plus manual `?motion=static` and print checks, and disclose that the rendered gate did not run — never claim it passed.

## Run

From the skill directory:

```bash
python3 scripts/verify_browser.py path/to/diagram.html [--dark] [--out DIR]
```

Pass `--dark` when the diagram claims dark-mode support. The script automates:

- console and page errors on load and after operating controls;
- rendered card clearance via `getBBox()` — fails <8px, warns <12px (thresholds owned by [quality-hardening.md](quality-hardening.md) §2);
- horizontal overflow at 320/375/414/768/1440px, with screenshots at each width;
- for animated diagrams: `?motion=static` sets `data-frame="static"`, reduced-motion hides playback controls (via emulation when the agent-browser version supports it, otherwise a stylesheet-level check plus one manual browser pass), and play/pause/replay operate without errors.

## Review

Exit 0 means the deterministic half passed. The gate is complete only after you review the captured screenshots against [quality-hardening.md](quality-hardening.md) §7 (paragraph-cards, untraceable arrows, marker-only corridors, wrong destination ports, accidental blank space, accent creep, the 15-second scan).

Manual remainder for animated diagrams: keyboard operation — Tab reaches each native control, Enter/Space operates it, Left/Right/Home/End step without moving focus.

## Variants

When a variant tool (e.g. variate) produces several versions of one diagram file, run the static checks (`self_check.py`, `verify-geometry.py`, and `verify-motion.py` if animated) on **every** variant, and this full gate on the **kept** file only, after the keep.

Exports inherit a passed HTML gate; the export pipeline in [export.md](export.md) needs no separate rendered QA.
