import { createRoutedChat } from "@/lib/v0/chats"
import { env } from "@/lib/env"
import type { ExplicitSelection } from "@/lib/routing/policy"

const MODEL_IDS = ["v0-mini", "v0-pro", "v0-max", "v0-max-fast"] as const

export async function GET() {
  try {
    const chats = await listChatsSafe()
    return Response.json({ chats })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

async function listChatsSafe() {
  const { listChats } = await import("@/lib/v0/chats")
  return listChats(env.defaultTenantTeamId())
}

export async function POST(request: Request) {
  let body: { prompt?: string; modelId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 })
  }

  const explicit =
    body.modelId && body.modelId !== "auto" && (MODEL_IDS as readonly string[]).includes(body.modelId)
      ? (body.modelId as Exclude<ExplicitSelection, "auto">)
      : "auto"

  try {
    const result = await createRoutedChat({
      teamId: env.defaultTenantTeamId(),
      prompt,
      explicitModelId: explicit,
    })
    return Response.json(result)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
