# Variant rounds — an array of takes by default

**Default behavior:** a fresh diagram request ships as a **round of 4** — one
self-contained HTML file holding four complete takes, flipped by a fixed
position bar (borrowed from variate's grammar: positions, directions,
tradeoffs). The user keeps one; you then deliver it as a normal single-diagram
file. Skip the round and go straight to a single diagram only when:

- the user asks for one specific result ("just draw it", "single version",
  a redraw/import with a pinned source, an edit to an existing diagram);
- the request pins composition so tightly that four takes could only disagree
  about trivia (§4 wallpaper rule below);
- motion is requested up front (motion binds to one composition — offer the
  round static, animate the kept one);
- the output is an export variant (dark twin, PNG/SVG) of an existing diagram.

The round replaces neither the §0 style-guide gate nor the §3 type routing —
it runs after both. All four variants draw from the same locked tokens.

## The contract (adapted from variate's floor)

1. **Four positions that disagree.** Each variant changes something
   structural — layout axis, emphasis, density tier, or visual type. Four
   tweaked spacings is wallpaper, not a round. Disagreement axes that work
   for diagrams:
   - **composition** — vertical vs horizontal flow, hub-and-spoke vs pipeline
   - **emphasis** — which element is focal (the accent moves)
   - **density** — overview (budget floor) vs detail (budget ceiling)
   - **type** — the same content in a second plausible visual type
2. **Position 4 crosses the type axis** when a second type is plausible
   (flowchart↔swimlane, architecture↔data-flow, timeline↔process). When no
   second type is honest, position 4 takes the density axis instead — never
   force a bad type for variety's sake.
3. **Position 1 is your recommendation** and is pre-selected (`checked`).
   Say why in one line when you hand over.
4. **Every position is a complete §9-compliant diagram.** Own accessible SVG,
   own `<title>`/`<desc>` with position-suffixed IDs
   (`slug-v2-title`), own defs with position-prefixed marker IDs. Each must
   pass the taste gate alone; the round is not an excuse for three
   half-drawn takes. Budget honestly: a round of 4 is 4× drawing and 4× QA.
5. **Name every direction and its cost.** The eyebrow carries
   `N of 4 · direction name`; the tradeoff line under the title says what
   the take emphasizes and what it gives up. Talk in positions ("2 of 4"),
   never in internal terms.
6. **A round narrows, it never accumulates.** When the user picks (or says
   "2 but calmer"), deliver the kept take as a normal single-diagram file
   named without any variant suffix, keep the round file as
   `<slug>-round.html` beside it unless asked to delete, and do further
   refinement on the kept file. Never grow a round file past 4.

## Mechanics — template-variants.html

Use `assets/template-variants.html`. The switcher is **pure CSS radio
grouping — zero JavaScript**, so it passes the one-controller lint and works
printed (position bar hides; the checked variant prints), emailed, and
double-clicked:

- Four visually-hidden radios precede the panels; `:checked ~` reveals one.
- The position bar is `<label>`s: click to flip; once any position has
  focus, native radio-group behavior makes ←/→ flip without any script.
- Keep the radios and `.vbar` labels adjacent siblings of the `.variant`
  sections — the CSS combinators depend on document order.
- Replace `[diagram-slug]` everywhere; suffix every ID with the position
  (`-v1` … `-v4`) so the four SVGs never collide.

**Motion never rides in a round.** Rounds are static; `data-motion-*`
attributes and the controller are absent by construction. When the user
keeps a position and wants reveal, rebuild the kept take on
`template-motion.html`.

**Dark rounds:** the round inherits the active style guide like any diagram.
For an explicitly dark round, swap the `:root` block per the style guide's
dark column — all four variants share the one token block.

## Verification

Run the full pipeline on the round file — the checks see four accessible
SVGs and no scripts, all green paths:

```
python3 scripts/self_check.py <round>.html
python3 scripts/verify-geometry.py <round>.html
python3 scripts/verify_browser.py <round>.html --out /tmp/qa-<slug>
```

The browser gate screenshots only the checked variant. Screenshot each
position with the radio pre-checked by rewriting `checked` per shot, or
review positions 2–4 via vision on per-position screenshots before handing
over. Do not claim all four passed rendered QA if only position 1 was
looked at.

## Handoff message shape

One short block, then stop:

> Round of 4 at `<file>` — flip with the bar or arrow keys.
> 1 **pipeline** (recommended): straight left-to-right; cost: long file.
> 2 **hub**: the queue is focal; cost: edge crossings.
> 3 **overview**: half the nodes; cost: hides retry logic.
> 4 **swimlane** (different type): actors visible; cost: weaker sequence.
> Keep one by number, or steer ("2 but calmer", "1's layout with 3's density").

A steer naming several positions is a merge: each part comes whole from one
position, never averaged.
