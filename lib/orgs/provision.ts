import { env } from "../env"
import { readTenantKeys, saveTenantKey } from "./tenant-keys"/**
 * Vercel Organizations API — only the operations this demo needs, with the
 * same shapes as the private-beta docs (docs/vercel-organizations-api.md in
 * coole-studio) and the public docs page.
 *
 * Auth: a Vercel access token with access to the organization's teams.
 */

const ORGS_API_BASE_URL = "https://api.vercel.com/v1/organizations"
const V0_KEY_URL = "https://v0.app/api/v2/organizations"

function headers(): HeadersInit {
  return {
    Authorization: `Bearer ${env.vercelToken()}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  }
}

async function parseJson(res: Response, what: string): Promise<unknown> {
  try {
    return await res.json()
  } catch (cause) {
    throw new Error(`${what}: Organizations API returned invalid JSON`, { cause })
  }
}

function fail(what: string, status: number, body: unknown): never {
  throw new Error(`${what}: HTTP ${status} ${JSON.stringify(body).slice(0, 300)}`)
}

export type OrgTeamLink = {
  organizationId: string
  teamId: string
  slug: string
  name: string
  billingPlan?: string
  createdAt?: string
  updatedAt?: string
}

export async function listOrgTeams(): Promise<OrgTeamLink[]> {
  const orgId = env.rootOrgsId()
  const res = await fetch(`${ORGS_API_BASE_URL}/${orgId}/teams`, { headers: headers() })
  const body = (await parseJson(res, "list org teams")) as { teams?: OrgTeamLink[] }
  if (!res.ok) fail("list org teams", res.status, body)
  return body.teams ?? []
}

/**
 * Check-then-create: if a child team with this slug already exists, return
 * the existing link instead of failing. Keeps live-demo provisioning
 * idempotent.
 */
export async function createChildTeamIfAbsent(input: {
  slug: string
  name: string
}): Promise<{ link: OrgTeamLink; created: boolean }> {
  const orgId = env.rootOrgsId()
  const existing = await listOrgTeams()
  const found = existing.find((t) => t.slug === input.slug)
  if (found) return { link: found, created: false }

  const res = await fetch(`${ORGS_API_BASE_URL}/${orgId}/teams`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ mode: "create", slug: input.slug, name: input.name }),
  })
  const body = (await parseJson(res, "create child team")) as OrgTeamLink
  if (!res.ok) fail("create child team", res.status, body)
  return { link: body, created: true }
}

export async function mintV0Key(teamId: string): Promise<{ id: string; apiKey: string }> {
  const orgId = env.rootOrgsId()
  const rootKey = env.v0RootKey()
  if (!rootKey) {
    throw new Error("ROOT_V0_KEY is required to mint v0 API keys for child teams.")
  }
  const res = await fetch(`${V0_KEY_URL}/${orgId}/teams/${teamId}/api-keys`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${rootKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Jev Routing Demo" }),
  })
  const body = (await parseJson(res, "mint v0 key")) as { id?: string; apiKey?: string }
  if (!res.ok) fail("mint v0 key", res.status, body)
  if (!body.apiKey || !body.id) fail("mint v0 key", res.status, "missing id/apiKey in response")
  return { id: body.id, apiKey: body.apiKey }
}

/**
 * Full tenant provisioning: child team (idempotent) + v0 API key, persisted
 * locally so the chat layer can use it immediately.
 */
export async function provisionTenant(input: { slug: string; name: string }) {
  const { link, created } = await createChildTeamIfAbsent(input)
  const existing = readStoredKey(link.teamId)
  if (existing) {
    return { link, created, key: { id: "stored", apiKey: masked(existing) }, stored: true }
  }
  const key = await mintV0Key(link.teamId)
  saveTenantKey(link.teamId, key.apiKey)
  return { link, created, key: { id: key.id, apiKey: masked(key.apiKey) }, stored: false }
}

function readStoredKey(teamId: string): string | undefined {
  return readTenantKeys()[teamId]
}

function masked(key: string): string {
  return key.slice(0, 6) + "…" + key.slice(-4)
}
