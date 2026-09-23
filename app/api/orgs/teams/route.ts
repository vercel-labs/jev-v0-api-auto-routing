import { listOrgTeams, provisionTenant } from "@/lib/orgs/provision"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const teams = await listOrgTeams()
    return Response.json({ teams })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  let body: { slug?: string; name?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const name = body.name?.trim()
  const slug = (body.slug?.trim() || (name ? slugify(name) : "")).trim()
  if (!slug || !name) {
    return Response.json({ error: "name (and optional slug) are required" }, { status: 400 })
  }

  try {
    const result = await provisionTenant({ slug, name })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
