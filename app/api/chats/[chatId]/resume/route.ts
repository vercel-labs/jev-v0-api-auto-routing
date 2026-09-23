import { resumeChat } from "@/lib/v0/chats"
import { toPlainTextStream } from "@/lib/v0/stream"
import { env } from "@/lib/env"

export const dynamic = "force-dynamic"

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ chatId: string }> },
) {
  const { chatId } = await params
  try {
    const result = await resumeChat(env.defaultTenantTeamId(), chatId)
    return toPlainTextStream(result)
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
