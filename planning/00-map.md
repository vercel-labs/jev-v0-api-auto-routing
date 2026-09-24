# Wayfinder map: Jev → v0 cost-savings demo

Label: `wayfinder:map` (local-markdown tracker)

## Destination

Pivot the app from an Orgs-provisioning showcase into a **customer-facing demo
of smart v0 model routing**: "your v0 usage, X% cheaper with prompt-based
routing." One narrative landing page carries the projected savings and the
policy story; the chat workbench moves behind it; a routing visualizer shows
Jev's structured parse (answers + confidence → rule → model) at request time.

## Decisions settled (2026-09-24 session)

- Audience/story: customers and prospects; savings replay is the hero asset.
- Numbers on screen: replay of the 426-chat usage export against policy
  v0.3.0, labeled "projected." Live per-chat receipts are stretch (t7).
- Landing: narrative single page at `/`; workbench moves to `/demo`.
- Policy explainability: kept diagram from the round + rules as plain cards.
- Orgs provisioning stays at `/orgs`, demoted from the header.
- Out of scope: auth, multi-user, new v0 API surface beyond serving replay
  data **and the chat preview** (preview wiring un-parked 2026-09-24: the
  user put a live app-preview webview in the `/demo` layout — see t5).
- Prototype verdicts (t0, 2026-09-24): landing **A "Stage"** (→ t4),
  workbench **A "Split rail"** + preview pane bottom-right (→ t5, t3).
  Prototype code parked on branch `prototype/t0-ui-variants`.

## Open decisions

None. t6 resolved 2026-09-24 (grilling round 2): split view in `/demo`
(chat left, visualizer right); short hero then replay-mode visualizer on
the landing; slide-over inspector; precomputed replay playback; no canned
keyless mode (keys confirmed on the Vercel project). t2 cancelled — the
animated visualizer covers "how routing works".

## Known data problem

`data/replay-summary.json` is stale: pre-v0.3 rules (`simple-edit-to-mini`),
5.5% savings. `policy.ts` v0.3.0 claims 17.8% over the same 426 chats. t1
recomputes and reconciles. Also: `data/` is gitignored, so the summary the UI
serves must live in a tracked location.

## Tickets

| ID | Title | Blocked by |
|----|-------|-----------|
| t0 | ~~UI prototype~~ — DONE 2026-09-24 (landing A, workbench A; code on `prototype/t0-ui-variants`) | — |
| t1 | Refresh replay to policy v0.3.0 + summary API + events file | — |
| t2 | ~~Diagram pick~~ — CANCELLED (round file stays as reference) | — |
| t3 | Routing visualizer: animated SVG + stage inspector | — |
| t4 | Narrative landing page at `/` (layout: t0 verdict A) | t1, t3 |
| t5 | Move workbench to `/demo` (split rail + preview pane), demote orgs, leftover polish | — |
| t6 | ~~DECISION: layout~~ — RESOLVED 2026-09-24 | — |
| t7 | STRETCH: live per-chat cost receipts | parked |

Trunk of the tree: **t1** — the savings number everything else displays.
