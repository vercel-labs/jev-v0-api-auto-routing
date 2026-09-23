# Quality hardening after the first render

Load when a diagram is technically complete but feels crowded or mechanically generated; when copy overflows, padding is weak, arrows read as cramped, or color meaning is unclear; when an architecture map exceeds nine nodes or several bounded contexts; or when the diagram claims products, ownership, deployment surfaces, or sources of truth.

The governing lesson: **semantic completeness is not visual completion, and source checks overestimate quality — trust rendered, not source.**

## 1. Deletion-first copy budgets

Do not solve crowded cards by reducing font size. Delete or move copy first.

| Card kind | Budget (excluding tag/title) |
|---|---|
| Overview node | ≤2 semantic claim lines + ≤1 technical proof line (max 3) |
| Detail node | 1 semantic line + 1 implementation/state line |
| Fact/exception callout | ≤2 body lines + 1 proof or limitation line |
| Product/SKU coverage card | 1 evidence line — what is used and why it matters |

Retry intervals, credential details, model names, error variants, and store names never share one overview card; they belong in a detail diagram or caption. A callout needing four or more facts becomes a legend strip, a table outside the SVG, a second diagram, or a prose note.

## 2. Rendered clearance

The 4px grid is necessary but not sufficient — a value can sit on-grid and still look cramped. `getBBox()` is authoritative; string-length estimates are pre-render guesses only.

| Clearance | Hard minimum | Preferred |
|---|---:|---:|
| Left/right text | 8px | 16–24px |
| Top text below tags | 12px | 16px |
| Bottom after final baseline | 8px | 12–16px |
| Title → first body line | 16px | 20–24px |
| Body → technical proof | 16px | 20–28px |

Fail a card below 8px on any side; flag for visual review below 12px. The hard minimum is not the target. The rendered check runs inside the browser gate ([verify-browser.md](verify-browser.md)).

Use left-aligned text (24px side padding) when a card is wider than 240px, contains a list, or carries title/body/proof hierarchy readers scan across siblings; centered text is for short process nodes only.

Correction order when a card fails: delete words → split a long line → widen or heighten the card → move proof into a legend/caption → only then a smaller type ramp. Never shrink 12px node names or 9–12px technical labels to preserve an overcrowded layout.

## 3. Terminal approach

An arrow that is technically present can still read as only an arrowhead. The final straight segment after the last bend is the **terminal approach**.

| Terminal approach | Status |
|---|---|
| <32px | Automatic fail |
| 32–47px | Cramped; redesign preferred |
| 48px | Hard minimum |
| 64–96px | Preferred for architecture diagrams |
| >120px | Fine when it communicates a boundary crossing |

Applies to every marked path — horizontal, vertical, solid, dashed, accent, link, return, with or without earlier bends. Never place arrow-connected cards into a corridor narrower than 48px: a ~12px marker plus strokes and anti-aliasing consumes a 24px gap entirely.

The final segment defines perceived direction and must enter the natural destination edge: horizontal relationship → left/right edge, vertical → top/bottom. Marker family must match stroke semantics (accent stroke → accent marker; never `class="flow-accent" marker-end="url(#arrow-muted)"`). Arrows terminate at the card edge; if the marker collides with the border, adjust `refX` or shorten the endpoint 1–2px — do not float the whole connector away from the card.

## 4. Recompose, don't patch

When corridors fall below 48px, change the layout instead of nudging paths:

- **Two-lane snake** — 7–10 ordered stages: `1→2→3→4` over `8←7←6←5` with one explicit vertical turn; the second lane can carry a different owner or phase.
- **Vertical convergence stack** — fallback tiers or fan-in: tiers share vertical alignment, each enters the merge node at a distinct y, the merge approach stays ≥48px, and downstream stores stack vertically.
- **Channel lanes around a core** — one component with several channels/tool surfaces gets a distinct corridor per relationship; never route all channel arrows through one gap.
- **Outer side-channel** — notifications, audit writes, and passive side effects route around the outside, dashed, visibly secondary.
- **Split** — overview + detail, or by bounded context, or collapse leaf components. The complexity budget (§7 of SKILL.md) is a quality boundary, not a node-count suggestion.

## 5. Color semantics are stated, never inferred

- Separate **status** from **emphasis** and say so in the legend: prefer `orange = confirmed active · load-bearing / neutral = confirmed active · supporting / callout = unconfirmed or not asserted` over `accent = important`.
- A normal card in a coverage section reads as "used" — so normal/focal cards must be source-confirmed active; unconfirmed tiers and available-but-unused products are explicit callouts.
- Do not invent provisioning: using a managed service does not prove the marketplace path that provisioned it. Label what the source proves.
- **Contrast thresholds:** graphical strokes and boundaries ≥3:1 against the paper, text ≥4.5:1. Audit the *resolved* colors numerically rather than by eye — alpha-blended strokes (`rgba(…, 0.1–0.35)`) are the usual failures, especially on dark paper.

## 6. Ownership and deployment reality

Before drawing a system with an agent, service, or platform at its center, distinguish: core/runtime, primary deployed channel, secondary channels, credential provider, evidence APIs, session state. Then ask: where does this component actually run; what does a user interact with; is this a product, framework, runtime, channel, store, or credential source; is the drawn primary path the operational primary path; does the diagram imply ownership the source does not? Source, deployment configuration, and user correction are authoritative. Prefer human-readable operational labels (`Eve Agent · Slack App`) over internal shorthand (`eve`).

## 7. Screenshot review

For each rendered diagram, answer against the screenshot, not the source:

- Does any node read like a paragraph?
- Can every arrow be traced tail to head — or is one mostly a marker?
- Does the last turn agree with the destination port?
- Are cards optically centered in their zones; is blank space intentional?
- Does accent still identify a small focal set?
- Could a manager explain the diagram after a 15-second scan?

## 8. Hardening workflow

For complex or `faithful` diagrams, order the work so the budgets bind early:

1. Build the semantic inventory: separate sources of truth, projections, runtimes, channels, users.
2. Choose overview versus detail boundaries; the whole repository never fits one canvas.
3. Write card copy before assigning coordinates, enforcing the §1 line budgets immediately.
4. Reserve ≥48px connector corridors before placing boxes; pick the §4 lane pattern.
5. Draw zones and connectors first, then nodes and labels.
6. Run `python3 scripts/verify.py <file>` (SKILL.md §14) and fix within the bounded loop.
7. Review the screenshots per §7 and the color semantics per §5–6.
8. Delete more copy before final handoff.

## 9. Done

A complex diagram is done only when the semantic model is correct; the overview scans without reading sublabels; no card exceeds its copy budget; every card shows visible internal whitespace; every arrow has a traceable tail, natural final direction, and matching marker; crowded flows use lanes, not compressed rails; accent semantics are explained; status claims are evidence-backed; the static frame is complete; and the browser gate passed — or the inability to render is disclosed, never claimed.
