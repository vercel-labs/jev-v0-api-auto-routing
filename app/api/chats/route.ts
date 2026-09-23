import { createForkedChat, createRoutedChat, resumeChat } from "@/lib/v0/chats"
import { toPlainTextStream } from "@/lib/v0/stream"
import { getTemplate } from "@/lib/templates"
import { env } from "@/lib/env"
import type { ExplicitSelection } from "@/lib/routing/policy"

export const dynamic = "force-dynamic"

const MODEL_IDS = ["v0-mini", "v0-pro", "v0-max", "v0-max-fast"] as const

/**
 * Starts a chat and streams the first turn as SSE.
 * First event: {"meta": {chatId, decision, jev}} — routing provenance.
 * Then: {"content": ...} deltas and {"usage": ...} per turn.
 * Final event: {"done": true}.
 *
 * Two flows:
 * - template ("storefront"): createFromZip seeds the chat, Jev classifies
 *   the change request, the routed model rides the first message.
 * - blank: createAsync with the routed model at creation, then attach via
 *   resume() to stream the first turn.
 */
export async function POST(request: Request) {
  let body: { prompt?: string; modelId?: string; template?: string }
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

  const teamId = env.defaultTenantTeamId()

  try {
    if (body.template && body.template !== "blank") {
      const template = getTemplate(body.template)
      if (!template) {
        return Response.json({ error: `Unknown or unconfigured template: ${body.template}` }, { status: 400 })
      }
      const forked = await createForkedChat({ teamId, prompt, template, explicitModelId: explicit })
      if (!forked.stream) {
        throw new Error("Fork flow did not return a generation stream")
      }
      return toPlainTextStream(forked.stream, {
        chatId: forked.chatId,
        decision: forked.decision,
        jev: forked.jev,
      })
    }

    const created = await createRoutedChat({ teamId, prompt, explicitModelId: explicit })
    const resumed = await resumeChat(teamId, created.chatId)
    return toPlainTextStream(resumed, {
      chatId: created.chatId,
      messageId: created.messageId,
      decision: created.decision,
      jev: created.jev,
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
