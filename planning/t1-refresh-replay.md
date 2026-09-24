# t1 — Refresh replay to policy v0.3.0 and serve the summary

Blocked by: —

## Intent

The whole demo stands on one honest number. Recompute the replay of
`data/usage-export.csv` (426 chats, 2775 messages) against the current
policy (`lib/routing/policy.ts`, v0.3.0) and expose the result to the UI.

## Work

1. Run `scripts/replay-usage.mts` against policy v0.3.0; regenerate the
   summary (actualCost, simulatedCost, savings, savingsPct, byModel, byRule).
2. Reconcile with the "17.8% projected savings" comment in `policy.ts`;
   update whichever is wrong so the code and the demo agree.
3. Put the computed summary in a **tracked** location the app can serve
   (`data/` is gitignored — e.g. `lib/routing/replay-summary.json`), plus
   `GET /api/savings` returning it.
4. Also emit a **precomputed events file** for the landing's replay-mode
   playback (t6 Q5): an ordered list of per-chat stage events (prompt →
   Jev answers + confidence → rule fired → model locked → cost delta) that
   the routing visualizer (t3) can play back deterministically with a
   ticking Projected savings counter.
4. Label everywhere as "projected" — this is a simulation over historical
   usage, not measured live spend.

## Acceptance

- `GET /api/savings` returns a fresh summary whose `byRule` keys match
  v0.3.0 rule names (`template-diff-to-mini`, `architecture-to-max`,
  `hard-debug-to-max`, `low-confidence`, …) and whose numbers match a
  reproducible script run.
- The events file exists in a tracked location and its final counter equals
  the summary's Projected savings.
