#!/usr/bin/env node
/**
 * Mints a v0 API key for the default team (commercetools child team) via the
 * v0 Organizations endpoint and stores it in data/tenant-keys.json.
 *
 * Requires in .env.local: ROOT_ORGS_ID, DEFAULT_TEAM_ID, ROOT_V0_KEY
 * Run: node --env-file=.env.local scripts/mint-team-key.mjs
 *
 * The full key is never printed to stdout; it is written to the gitignored
 * data/tenant-keys.json file only.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"

const orgId = process.env.ROOT_ORGS_ID
const teamId = process.env.DEFAULT_TEAM_ID
const rootKey = process.env.ROOT_V0_KEY

if (!orgId || !teamId || !rootKey) {
  console.error("Missing ROOT_ORGS_ID, DEFAULT_TEAM_ID, or ROOT_V0_KEY in .env.local")
  process.exit(1)
}

const res = await fetch(
  `https://v0.app/api/v2/organizations/${orgId}/teams/${teamId}/api-keys`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rootKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Jev Routing Demo" }),
  },
)

const body = await res.json().catch(() => ({}))

if (!res.ok || !body.apiKey) {
  console.error(`Mint failed: HTTP ${res.status}`, JSON.stringify(body).slice(0, 300))
  process.exit(1)
}

const keysFile = new URL("../data/tenant-keys.json", import.meta.url)
let keys = {}
try {
  keys = JSON.parse(readFileSync(keysFile, "utf8"))
} catch {}
keys[teamId] = body.apiKey
mkdirSync(new URL("../data/", import.meta.url), { recursive: true })
writeFileSync(keysFile, JSON.stringify(keys, null, 2) + "\n")

console.log(`Minted v0 key ${body.id} for team ${teamId}`)
console.log(`Stored in data/tenant-keys.json (masked): ${body.apiKey.slice(0, 6)}…${body.apiKey.slice(-4)}`)
console.log("Copy the same value into DEFAULT_TEAM_V0_KEY for production.")
