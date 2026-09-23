# Components: the contract every drawing library implements

This file names the component vocabulary and defines each component's
contract: its slots, the semantic tokens it must consume, the Layer-1
invariants it must satisfy, and what it may NOT define. The contract is
descriptive; no code moves. The inline-SVG conventions woven through
SKILL.md and the type references are declared library v0, identifier
`inline-svg@1`. A future library (for example an animation library) swaps
in by meeting the same contract, not by matching v0's markup.

Two layers govern every rule here (issue 03 audit):

- **Layer 1, invariants.** Measurable, style-agnostic, script-enforced. A
  diagram violating one is objectively worse in any style. No profile may
  override them.
- **Layer 2, profile opinions.** Shadows, radius, font families, accent
  budget, fill/stroke treatments, dark palettes. These flow in from the
  active profile (references/profiles.md, style-guide.md). A component
  contract never hardcodes them; that is what "may NOT define" means below.

Tokens are always semantic roles from style-guide.md (`paper`, `ink`,
`muted`, `soft`, `rule`, `accent`, `accent-tint`, `link`), never hardcoded
hex. A component that inlines a hex value has broken its contract.

## Declaring the library

The diagram's SVG root carries a data attribute naming the library that
drew it:

```svg
<svg viewBox="..." role="img" aria-labelledby="..." data-component-library="inline-svg@1">
```

The value is `<library-id>@<major-version>`. Machine-readable at zero
visual cost: verify.py reads the attribute from the input file and records
it in verify.json's `component_library` field (null when absent), so tier
reports can distinguish contract implementations once a second library
exists. The attribute goes on the diagram SVG root only, not on decorative
or icon SVGs.

## Component contracts

### Node card

- **Slots:** paper mask (opaque rect under everything), styled rect, type
  tag, node name, technical sublabel.
- **Required tokens:** `paper` for the mask; fill and stroke from the
  active profile's node-type treatment table; `ink` for the name; `muted`
  for the sublabel.
- **Layer-1 invariants:** the paper mask paints first so arrows never
  bleed through transparent fills; rendered clearance between card content
  and card edge is at least 8px (12px warning threshold); copy budgets
  hold (at most 3 supporting lines, at most 5 total); the card is painted
  after arrows so lines sit behind nodes.
- **May NOT define:** shadow policy, corner radius values, font families
  and sizes, the fill/stroke treatment per node type, which nodes get
  accent. All of that is the active profile's voice.

### Connector

- **Slots:** path, marker reference, label plus label mask.
- **Required tokens:** `muted` for default strokes, `accent` for the focal
  path, `link` for HTTP/API and external calls. Dash patterns signal
  semantics (optional, async, transit), not taste.
- **Layer-1 invariants:** all seven SKILL.md §6 rules. No diagonal
  connectors between off-axis nodes; 6-10px label-to-stroke gap; no
  overlapping or stacked paths; fanned attach points at least 12px apart
  on a shared edge; no transit behind a non-endpoint box except the
  dashed-transit case; the label mask must not be clipped by a later node;
  at least 48px of straight terminal approach before the arrowhead.
  Connectors paint before boxes.
- **May NOT define:** stroke hues outside the semantic roles, elbow radius
  taste beyond the geometric minimum, label typography.

### Marker (arrowhead)

- **Slots:** marker definition, filled polygon.
- **Required tokens:** the fill matches the stroke's semantic role
  (`muted`, `accent`, or `link`); one marker per role, defined up front.
- **Layer-1 invariants:** marker color matches stroke semantics; the
  marker resolves at the true destination only, never on an intervening
  box; the arrowhead lands at the end of a visible terminal approach.
- **May NOT define:** its own hue outside the semantic roles, or marker
  proportions that the active profile declares.

### Label mask

- **Slots:** opaque rect, label text on top.
- **Required tokens:** `paper` for the rect fill; `soft` or `muted` for
  the text.
- **Layer-1 invariants:** every arrow label has one; the mask keeps a
  visible 6-10px gap to its connector stroke and never touches it; the
  mask must not overlap a node painted after it; no vertical
  writing-mode text.
- **May NOT define:** label font family, size, or tracking; those come
  from the profile's type ramp.

### Zone container

- **Slots:** container rect, zone label, optional boundary stroke style.
- **Required tokens:** low-opacity `ink` or `paper-2` fills; `rule` for
  boundary hairlines; `soft` for zone labels.
- **Layer-1 invariants:** zones paint first, before arrows and nodes, so
  label masks may legally overlap them; a zone is never treated as a
  connector endpoint unless a connector actually terminates on it.
- **May NOT define:** fill treatment, dash pattern, or radius; the profile
  owns the boundary's voice.

### Legend

- **Slots:** hairline separator, legend eyebrow, horizontal item row.
- **Required tokens:** `rule` for the hairline; `muted` for text; item
  swatches reuse the roles they explain.
- **Layer-1 invariants:** the legend must not collide with nodes; it sits
  as a horizontal strip after the diagram area, with the viewBox expanded
  to hold it (about 60px).
- **May NOT define:** legend typography or spacing taste; whether a
  diagram needs a legend at all is a drawing decision, not a component
  one.

### Eyebrow

- **Slots:** one uppercase tracked microcopy run, middot-separated.
- **Required tokens:** `muted` or `soft`.
- **Layer-1 invariants:** no vertical writing-mode; text passes the
  anti-slop punctuation gate (middots are house style and stay).
- **May NOT define:** font family, size, weight, or tracking; the
  profile's type ramp owns those.

### Type tag

- **Slots:** tag rect, tag text.
- **Required tokens:** the parent node's stroke role at reduced opacity
  for the outline and text.
- **Layer-1 invariants:** the tag sits fully inside its node card (a mask
  fully inside a node is a badge chip and legal); tag text passes the
  anti-slop gate.
- **May NOT define:** tag radius or pill-versus-rectangle shape; the
  default profile says rectangular rx=2, another profile may differ.

### Callout

- **Slots:** editorial text, dashed leader path, landing dot.
- **Required tokens:** `ink` for neutral asides, `accent` for focal,
  `muted` for tertiary; leader at reduced opacity of the text role.
- **Layer-1 invariants:** the leader is dashed so it cannot read as a flow
  arrow; the leader must not cross primary connectors; callouts sit in
  margins, never inside the active diagram area; text passes the
  anti-slop gate.
- **May NOT define:** the italic-serif voice; that pairing is the default
  profile's editorial register, and another profile may declare its own.

### Tradeoff line

- **Slots:** one line under a variant's title naming what the take
  emphasizes and what it gives up.
- **Required tokens:** `muted`.
- **Layer-1 invariants:** passes the anti-slop gate; names a real cost
  ("Costs: hides retry logic"), not a vague one.
- **May NOT define:** typography; the profile's type ramp owns it.

### Motion primitive

- **Slots:** `data-motion-root` on the figure, `data-motion-item` groups
  with integer `data-step`, playback controls, a live-status region.
- **Required tokens:** the motion clock custom properties
  (`--motion-fast`, `--motion-step`, `--motion-hold`, `--motion-total`).
- **Layer-1 invariants:** the complete static frame works without
  JavaScript; `prefers-reduced-motion: reduce` shows the static frame and
  disables playback; connectors step with their destination node; motion
  groups carry descriptive aria-labels; the accessible SVG contract
  (role, aria-labelledby, title first) holds throughout.
- **May NOT define:** easing or duration taste beyond the clock caps;
  motion never changes the static meaning or raises the complexity
  budget.

## Library v0: inline-svg@1

The current conventions in SKILL.md §5-§8 and the primitive-*.md and
type-*.md references are the first implementing library, `inline-svg@1`.
Nothing is extracted into templates: the patterns stay as prose plus
inline SVG examples, because they are woven through 30 plus type
references and extraction before a second library exists would be a large
refactor with regression risk across every example asset. Extraction is
the second library's first task, against this contract plus the verify.py
gates.

## Swap criterion for a future library

A future library (animation or otherwise) may replace `inline-svg@1` when
it:

1. implements every component above with the same slots,
2. satisfies every Layer-1 invariant, enforced by the same check scripts,
3. consumes the same semantic tokens from style-guide.md, with Layer-2
   opinions still flowing in from the active profile,
4. declares its own identifier in `data-component-library` on the SVG
   root, and
5. passes the same `scripts/verify.py` run at the same tier as the
   inline-svg output it replaces.

Same contract, different hands. Anything less is a fork, not a swap.
