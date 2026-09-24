# t4 — Narrative landing page at `/`

Blocked by: t1 (summary + events file), t3 (visualizer component). (t0 verdict in: A.)
Layout settled by t6: short hero (sentence + Projected savings number +
CTA) → visualizer in replay mode as the centerpiece → policy cards → CTA.
The page is keyless by design: everything it shows comes from precomputed
files, so it renders identically on any deployment.

## Intent

Replace the workbench-as-homepage with a narrative page that doubles as the
demo script: a visitor understands the savings story before touching a chat.

## Sections (top to bottom)

1. **Hero** — the projected savings number ($ and %, from t1), one sentence
   of story: "Jev classifies each v0 chat once and routes it to the cheapest
   model that can do the job."
2. **Savings viz** — the t3 diagram in **replay mode** as the centerpiece:
   the 426-chat export streams through the pipeline, model badges ignite,
   and a projected-savings counter ticks up to the t1 number; then the
   static breakdown by model and by rule (which rules save the money).
3. **How routing works** — the kept diagram (t2) plus the v0.3.0 policy
   rules rendered as plain-language cards: explicit picker wins; architecture
   or hard debugging → max; template diffs up to complexity 3 → mini;
   low confidence or unclear requirements → pro (fail-safe); max-fast is
   never auto-selected.
4. **CTA** — "Try the workbench" → `/demo`; orgs link lives in the footer.

## Acceptance

- `/` loads as the narrative page with real replay numbers (labeled
  projected); the visual language matches the Vercel skin; a11y contrast
  holds to the standard set in the previous session (4.5:1 text on cards).

## Prototype verdict (t0, 2026-09-24): A — "Stage"

Reference: `app/prototype/landing/_variants/variant-a.tsx` on branch
`prototype/t0-ui-variants`. The replay diagram *is* the first viewport:

- **Slim top bar**: wordmark ("Jev → v0 routing", mono, tracked), policy
  version badge, cyan CTA "Try the workbench →" (prototype links to `/`;
  the real one goes to `/demo`).
- **Hero**: one centered sentence above the diagram — "Every v0 chat,
  classified once and routed to the cheapest model that can do the job."
- **Savings counter overlaid** top-right of the stage: big emerald $ figure
  ticking with the replay + "sample savings · X% projected over N chats".
- **Diagram** full width (max-w-6xl), full-size framing, replay mode; a
  status line under it (current event, progress) and a "replay" link when
  playback ends.
- **Policy rules as a bottom strip**: horizontal, scrollable footer of
  `rule-name` + plain-language text, instead of cards.
- Dark `#07070d` ground, neon accents per t3.

Open for implementation (not decided by the verdict): A is a single
viewport, so sections 2's static breakdown (by model / by rule) and the
section 3 policy cards have no slot in it — either put them below the fold
or let the rules strip stand in for the cards. Ask the user during t4.
