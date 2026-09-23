import type { V0StreamResult } from "v0"

export type StreamMeta = {
  chatId: string
  decision?: unknown
  jev?: unknown
  messageId?: string
}

/**
 * Re-emits a v0 stream as a simple text/event-stream with plain content
 * deltas, so the demo UI does not need to parse v0's SSE format.
 * First event (if meta given): data: {"meta": {...}} — chat id and routing
 * decision. Then: data: {"content": "..."} (delta) or {"usage": {...}}.
 * Final event: data: {"done": true}.
 */
export function toPlainTextStream(result: V0StreamResult, meta?: StreamMeta): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (meta) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ meta })}\n\n`))
      }
      let last = ""
      try {
        for await (const update of result.stream) {
          const content = update.message?.content ?? ""
          if (content && content !== last) {
            const delta = content.startsWith(last) ? content.slice(last.length) : content
            last = content
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`))
          }
          if (update.usage) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ usage: update.usage })}\n\n`),
            )
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`))
      } catch (error) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ error: (error as Error).message })}\n\n`),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
