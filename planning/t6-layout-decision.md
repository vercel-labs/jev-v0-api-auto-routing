# t6 — DECISION (RESOLVED 2026-09-24): layout

## Resolved in grilling round 2

- **Q1 — `/demo` arrangement**: split view, vibe-coding-platform style —
  chat left (~40%), routing visualizer right (~60%).
- **Q2 — landing hero**: short hero first (one sentence + big Projected
  savings number + CTA), Routing visualizer in Replay mode directly below
  as the page's centerpiece.
- **Q3 — inspector**: slide-over drawer over the diagram pane
  (Vercel-Workflow-run style), opened by clicking a box or a trace-log
  line. Works identically in the split view and on the landing.
- **Q5 — replay driver**: precompute. A script runs the CSV through policy
  v0.3.0 once and emits an events file; the UI plays it back
  deterministically. No live re-run.
- **Q6 — no canned keyless mode**: `.env.local` is gitignored (local only),
  and the Vercel project has all app keys configured (verified on the
  project's Environment Variables page, 2026-09-24). The landing page is
  keyless by design (precomputed playback); only `/demo` live mode needs
  keys, and production has them. Note: the app keys are scoped to
  **Production only** — preview deployments won't have them unless the
  scope is widened; acceptable for the POC (the demo URL is production).
  Side observation: `BLOB_READ_WRITE_TOKEN` shows "Needs Attention" in the
  dashboard — unrelated to this map, but worth a look.

## Resolves

Placement for t3, layout for t4. The remaining arrangement detail (exact
split ratio, drawer width, hero copy) is implementation work, not a
decision.
