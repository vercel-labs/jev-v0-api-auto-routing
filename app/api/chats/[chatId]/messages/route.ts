import { sendMessage } from "@/lib/v0/chats"
import { toPlainTextStream } from "@/lib/v0/stream"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params

  let body: { message?: string; escalate?: boolean }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const message = body.message?.trim()
  if (!message) {
    return Response.json({ error: "message is required" }, { status: 400 })
  }

  try {
    const { stream } = await sendMessage({
      teamId: env.defaultTenantTeamId(),
      chatId,
      message,
      escalate: Boolean(body.escalate),
    })
    return toPlainTextStream(stream)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
