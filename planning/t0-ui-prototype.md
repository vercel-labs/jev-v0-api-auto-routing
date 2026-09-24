# t0 — UI prototype: landing page (throwaway)

Blocked by: —

## Question

What should the landing page look and feel like? Arrangement is settled
(t6); this prototype answers the visual design: hero treatment, how the
replay-mode Routing visualizer reads in dark/neon, and the policy section's
shape.

## Shape (per prototype skill, UI branch, sub-shape B)

- Throwaway route `/prototype/landing`, three structurally different
  variants, `?variant=A|B|C` + floating bottom switcher (arrows + keyboard).
- Each variant shows the same canned replay events (a dozen, not 426) with
  a ticking Projected savings counter; numbers are placeholders pending t1.
- The `/demo` split view is NOT prototyped — that layout was picked
  directly from the vibe-coding-platform reference.

## Status 2026-09-24 — DONE (both verdicts in, captured)

Verdicts: landing **A (Stage)**, workbench **A (Split rail)** with a live
app-preview pane bottom-right. Decisions folded into t3 / t4 / t5. The
prototype code (`app/prototype/`, `components/prototype-switcher.tsx`) now
lives only on the throwaway branch `prototype/t0-ui-variants` — not main. To look again:
`git switch prototype/t0-ui-variants && npm run dev`, then `/prototype/landing` or
`/prototype/workbench`. To lift a file: `git show prototype/t0-ui-variants:<path>`.

## Capture

User picks a variant (or a mix). Winner's structure informs t4 (and the
visualizer look informs t3); the throwaway route + switcher go to a
throwaway branch, not main. Verdict recorded here and on t4.

## Verdict 2026-09-24 — workbench: A (Split rail)

- `/prototype/workbench` verdict: **A (Split rail)** — chat left, visualizer
  + receipt right. Tweak applied: diagram keeps its size but sheds vertical
  padding so the pane below gets more height (`ReplayDiagram` gained a
  `compact` prop that crops the SVG viewBox; workbench A uses it, landing
  untouched).
- Expectation surfaced: the user reads the pane under the diagram as the
  **app preview webview** (v0-style). The prototype holds the routing
  receipt there; a real preview pane is a /demo fold-in decision → t5/t6.
- Entry modes confirmed for the /demo workbench: keep both **Blank chat**
  (greenfield) and **Fork Storefront** (zip in Vercel Blob, presigned at
  fork time — `lib/templates.ts`, `lib/v0/chats.ts createForkedChat`).
- Follow-up tweak (same day): user asked again for more room in the lower
  pane. Compact crop tightened `0 80 1080 280` → `0 96 1080 244` (content
  spans y≈110–333) and the inspect-chip row `py-3`→`py-2`. Diagram width and
  scale unchanged; only its container shrinks vertically.
- **Decision (user, 2026-09-24): the lower-right pane of the /demo workbench
  is the live app-preview webview** of the chat being built — not the
  routing receipt. The prototype still shows the receipt there; at capture,
  fold this into t5 (workbench layout: chat left | diagram top-right |
  preview bottom-right) and re-home the receipt (likely the inspect drawer).
  Feasibility, from types only (not exercised at runtime): `v0` SDK 3.0.7
  has `v0.chats.getPreview({ chatId })` → `{ url, token }` or `null` while
  starting (poll), and a `fetchPreview` helper for an iframe proxy route
  (token via `x-v0-preview-token`); `settings.setPreviewHosts` /
  `TrustedPreviewHosts` also exist and may need configuring.
- **Final workbench verdict (user, 2026-09-24): A** — chat left, compact
  (Y-shrunk) flow diagram top-right, app-preview webview bottom-right.
  Mock applied to the prototype so the layout can be seen: new
  `_lib/mock-preview.tsx` (browser chrome + canned Storefront; states:
  empty → "starting preview…" → app v1, later prompts rebuild over the
  previous version with a progress bar). The receipt moved to a `receipt`
  chip in the inspect row that opens a slide-over drawer (same pattern as
  the stage inspector; opening one closes the other). B and C untouched.
- Final tweak at capture: the "MODEL LOCKED PER CHAT" caption under the
  v0 Platform API frame was removed from the diagram (user, for vertical
  space); workbench A's compact crop tightened again to `0 96 1080 208`
  (content spans y≈100–300 incl. glow).

## Verdict 2026-09-24 — landing: A (Stage)

- `/prototype/landing` verdict: **A (Stage)**, otherwise as built ("the
  rest looks fine"). Details captured on t4.
- Capture run 2026-09-24: `npm run lint`, `npx tsc --noEmit` and
  `npm run build` all exit 0 with the final prototype in place, before the
  move to the branch.
