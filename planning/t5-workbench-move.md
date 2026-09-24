# t5 — Move workbench to `/demo`, demote orgs, leftover polish

Blocked by: —

## Intent

Free `/` for the landing page without losing anything that works today.

## Work

1. Move the chat workbench from `app/page.tsx` to `app/demo/page.tsx`;
   keep the policy version badge.
2. Demote the Organizations link from the header to a footer link; keep
   `app/orgs/page.tsx` working as-is (it provisioned the tenant keys this
   demo runs on).
3. Fold in the leftover polish from the handoff: uppercase tracked headings
   → sentence case; textarea gets a `focus-visible` ring.

## Acceptance

- `/demo` behaves exactly as today's `/`; `/orgs` unchanged functionally;
  `npm run build` passes.

## Layout from the t0 verdict (2026-09-24): workbench A — "Split rail"

Reference: `app/prototype/workbench/_variants/variant-a.tsx` and
`_lib/mock-preview.tsx` on branch `prototype/t0-ui-variants`. This **extends step 1**: `/demo`
does not stay "exactly as today's `/`" — it takes this layout.

- **Left (~40%)**: the chat (history + composer). Entry modes kept: **Blank
  chat** (greenfield) and **Fork Storefront** (zip in Vercel Blob,
  presigned at fork time — `lib/templates.ts`, `lib/v0/chats.ts`
  `createForkedChat`).
- **Right, top**: header "Life of a request" with the policy badge and a
  `locked: <model>` chip once routed; the t3 diagram in **compact** mode
  (width kept, height cropped to content); the inspect / receipt chip row.
- **Right, bottom (takes the remaining height)**: the **live app-preview
  webview** of the chat being built (user decision). Prototype states:
  empty ("send a prompt — the app preview appears here") → "starting
  preview…" → app, address bar showing version + "built with <model>";
  later prompts keep the old version visible under a progress bar until the
  rebuild lands.
- The routing receipt is no longer a pane: it opens from the `receipt` chip
  in a slide-over drawer (t3).

Preview wiring — unverified, from the `v0` SDK 3.0.7 types only:
`v0.chats.getPreview({ chatId })` → `{ url, token }`, or `null` while
starting (poll); `fetchPreview` helps build an iframe proxy route (token via
the `x-v0-preview-token` header); `settings.setPreviewHosts` /
`TrustedPreviewHosts` may need configuring. Spike this before building the
pane.

Acceptance (revised): `/demo` renders the split layout above with a working
preview for a real chat; `/orgs` unchanged; `npm run build` passes.
