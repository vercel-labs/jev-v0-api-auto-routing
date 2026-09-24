# t7 — STRETCH (parked): live per-chat cost receipts

Blocked by: parked — revisit after t1–t5 land.

## Intent

Show real cost per chat in the workbench as it runs, complementing the
projected replay number with live evidence.

## Why parked

Needs per-chat token/cost usage from the v0 API; not yet wired, and live
behaviors require the real keys. The replay hero (t1) carries the demo
without it.

## Sketch

- v0 chat/message usage → cost per chat → receipt line in the workbench
  ("this chat ran on v0-mini, est. $X vs $Y on pro").
