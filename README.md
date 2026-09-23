# Jev → v0 model routing POC

Demonstrates routing v0 Platform API chats to the right model using Jev
(TypeSafe System One models) as a per-chat classifier, plus Vercel
Organizations provisioning. Research background: `jev-v0-model-routing.md`.

## Core design decisions

- **Route once per chat.** Jev classifies the first prompt; the chosen model
  is fixed for the chat's lifetime. Switching models mid-chat breaks v0
  prompt caching (cache read/write was 86% of measured customer spend).
- **Fail-safe default is `v0-pro`** — the customer's status-quo model — when
  confidence is low or Jev is unavailable.
- **`v0-max-fast` is never auto-selected**; latency preference is a user
  choice, exposed through the manual model picker.
- **Escalation is one-way and manual** ("Escalate to max"), priced as one
  cold cache write.

## Layout

- `lib/jev/` — AI Gateway TypeSafe-compatible client and question definitions
- `lib/routing/policy.ts` — the routing policy (versioned, plain module)
- `lib/v0/chats.ts` — v0 Platform API chat operations with routing metadata
- `lib/orgs/` — Organizations API provisioning (child team + v0 key)
- `app/api/` — route handlers (`/api/chats`, `/api/chats/[chatId]/{resume,messages}`, `/api/orgs/teams`)
- `app/page.tsx` — demo UI: chat, decision panel, orgs provisioning
- `data/` — gitignored; holds `tenant-keys.json` for provisioned teams and
  the usage export CSV for the savings replay (pending)

## Running

```bash
cp .env.example .env.local   # fill in the keys
npm run dev
```

Requires: `AI_GATEWAY_API_KEY` (Jev via AI Gateway), `ROOT_ORGS_ID`,
`VERCEL_ORGS_TOKEN` (org access), `ROOT_V0_KEY` (v0 key for the root org /
default team), `DEFAULT_TEAM_ID`.

## Verification status

- Build and lint must pass (run `npm run build`).
- Live behaviors (Jev classification, chat creation under the commercetools
  team, orgs provisioning, cache-cost spike) require the real keys and are
  **not yet verified**.
