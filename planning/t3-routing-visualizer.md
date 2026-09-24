# t3 — Routing visualizer: animated "life of a request" diagram

Blocked by: — (placement settled by t6: split view in `/demo`, chat left /
diagram right; inspector is a slide-over drawer over the diagram pane)

## Intent

When a request flows, make the routing *visible as motion*: a dark-mode SVG
diagram of the pipeline whose boxes and cables light up in neon as each
stage fires — modeled directly on DropMate's `public/index.html` +
`diagram.js` (v2.1). Not a static card: the diagram is alive.

## DropMate mechanics to copy

- Static inline SVG, semantic ids (`box-*`, `cable-*`), cables drawn before
  boxes; idle gray (`#707090`, AA-checked) on near-black (`#07070d`).
- Per-kind neon accents with `drop-shadow` glow on `.ignite`, `.hold` for
  sustained stages, `cable.run` animated dash-flow on the active cable.
- A `STAGE_PLAN` map: stage event → box(es) + one primary cable.
- **Badges inside a frame that ignite independently** — DropMate lights
  gemini vs claude badges inside its AI Gateway box; ours lights
  `v0-mini` / `v0-pro` / `v0-max` badges inside a "v0 Platform API" box.
  This is where the locked model becomes visible.
- Right-side trace log + footer legend + connection status.

## Stage inspector (Vercel Workflow pattern)

Selecting (or igniting) a box opens a detail panel the way the Vercel
Workflow run view does: span selected → right panel with that stage's
Created/Started/Completed timings and collapsible **Input** / **Output**
sections rendered as syntax-highlighted JSON (mono font, key/string/literal
colors on dark, copy button). Per stage:

- **Jev classify** — Input: the prompt + question definitions sent.
  Output: the structured answers — `taskType` (choice + confidence),
  `complexity` (score 1–5), `proceed` (noul) — this is the "structured
  output with confidence" display.
- **Policy** — Input: the Jev answers + explicit selection. Output: the
  `RoutingDecision` (`modelId`, `rule`, `reason`, `fallback`).
- **v0 chat create** — Input: model + template. Output: chat id, locked
  model, tenant/team.
- **Escalation / fallback** — shown as its own event state with the reason.

DropMate's trace log and this inspector combine: log lines are clickable
and focus the matching box + panel.

## Our pipeline (boxes)

User prompt → API route → Jev classify (AI Gateway, `typesafe/v1/systemone`)
→ policy `routeChat` v0.3.0 → v0 chat create (model badges) → response.
Accents per stage-kind; error flash on classification failure / fallback.

## Drivers (two modes, one component)

- **Live mode** (`/demo`): staged events from the workbench's own
  `/api/chats` lifecycle — sent → classifying → answers+confidence → rule
  fired → model locked → created. Client-driven; no SSE infra needed for
  the POC (DropMate uses SSE because its pipeline is async; ours is
  request/response).
- **Replay mode** (landing, ties t1): stream the 426-chat replay through the
  same diagram — prompts flow, model badges ignite, savings counter ticks
  up. This is the user's "background task runs the dump CSV and shows
  savings with a given policy," made visible.

## Acceptance

- One reusable diagram component; in `/demo` it animates a real chat's
  stages end-to-end including the fallback path; on the landing it can
  replay the export. Selecting any stage shows its Input/Output JSON in the
  inspector panel. Dark mode with neon highlights; idle/label contrast
  keeps the AA standard DropMate set (≥ 3:1 non-text, ≥ 4.5:1 labels).

## Prototype capture (t0, 2026-09-24)

Visual reference on branch `prototype/t0-ui-variants`:
`app/prototype/landing/_lib/replay-diagram.tsx` (the diagram both verdicts
use), `app/prototype/workbench/_lib/inspector.tsx` (drawer + JSON view),
`app/prototype/workbench/_lib/receipt-panel.tsx` (answers + confidence
meters + decision).

- **Boxes as prototyped**: Prompt → Jev (`typesafe/v1/systemone`) → Policy
  (`routeChat v0.3.0`) → "V0 PLATFORM API" frame with `v0-mini` / `v0-pro`
  / `v0-max` badges; only the badge for the locked model ignites. (The
  prototype skipped the "API route" and "response" boxes listed above — it
  read fine without them.)
- **No caption under the frame** — "MODEL LOCKED PER CHAT" was removed
  (user, for vertical space).
- **Compact mode** is a requirement: in `/demo` the diagram keeps its width
  and scale but its box hugs the content (prototype: `compact` prop crops
  the viewBox to `0 96 1080 208`), so the preview pane below gets the
  height. The landing uses the full-size framing.
- **Inspector entry**: a chip row under the diagram — `inspect: Jev
  classify · policy · v0 create` — plus a `receipt` chip (right-aligned)
  that opens the structured-output receipt in the same slide-over drawer.
  One drawer at a time. Chips are disabled until a request has a receipt.
  Clickable boxes / trace-log lines from the plan above still apply.
