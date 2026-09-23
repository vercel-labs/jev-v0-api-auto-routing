"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type ChatModelId = "v0-mini" | "v0-pro" | "v0-max" | "v0-max-fast"
type ExplicitSelection = ChatModelId | "auto"

export type TemplateOption = {
  id: string
  name: string
}

type RoutingDecision = {
  modelId: ChatModelId
  rule: string
  reason: string
  fallback: boolean
}

type TurnUsage = {
  tokens?: Record<string, number>
  creditsCost?: Record<string, number>
}

type Turn = {
  role: "user" | "assistant"
  text: string
  usage?: TurnUsage
}

const MODEL_LABELS: Record<ExplicitSelection, string> = {
  auto: "Auto (Jev routes)",
  "v0-mini": "v0-mini",
  "v0-pro": "v0-pro",
  "v0-max": "v0-max",
  "v0-max-fast": "v0-max-fast",
}

function turnTotal(usage?: TurnUsage): number {
  const t = usage?.creditsCost?.total
  return typeof t === "number" ? t : 0
}

export default function ChatWorkbench({ templates }: { templates: TemplateOption[] }) {
  const [prompt, setPrompt] = useState("")
  const [selection, setSelection] = useState<ExplicitSelection>("auto")
  const [mountedTemplate, setMountedTemplate] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [decision, setDecision] = useState<RoutingDecision | null>(null)
  const [jevRaw, setJevRaw] = useState<unknown>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [turns])

  async function consumeStream(res: Response, onDelta: (delta: string) => void) {
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No stream body")
    const decoder = new TextDecoder()
    let buffer = ""
    let usage: TurnUsage | undefined

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split("\n\n")
      buffer = parts.pop() ?? ""
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "))
        if (!line) continue
        let payload: Record<string, unknown>
        try {
          payload = JSON.parse(line.slice(6))
        } catch {
          continue
        }
        if (payload.meta && typeof payload.meta === "object") {
          const meta = payload.meta as { chatId?: string; decision?: RoutingDecision; jev?: unknown }
          if (meta.chatId) setChatId(meta.chatId)
          if (meta.decision) setDecision(meta.decision)
          if (meta.jev) setJevRaw(meta.jev)
        }
        if (typeof payload.content === "string") onDelta(payload.content)
        if (payload.usage && typeof payload.usage === "object") {
          usage = payload.usage as TurnUsage
        }
        if (payload.error) throw new Error(String(payload.error))
      }
    }
    return usage
  }

  const startChat = useCallback(async () => {
    if (!prompt.trim() || starting) return
    setStarting(true)
    setError(null)
    setDecision(null)
    setJevRaw(null)
    setTurns([{ role: "user", text: prompt }])
    setChatId(null)
    setEscalated(false)

    try {
      setStreaming(true)
      let text = ""
      setTurns((prev) => [...prev, { role: "assistant", text: "" }])
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelId: selection, template: mountedTemplate ?? "blank" }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const usage = await consumeStream(res, (delta) => {
        text += delta
        setTurns((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", text, usage }
          return next
        })
      })
      setTurns((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: "assistant", text, usage }
        return next
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStreaming(false)
      setStarting(false)
    }
  }, [prompt, starting, selection, mountedTemplate])

  async function sendFollowUp(escalate: boolean) {
    const message = prompt.trim()
    if (!message || !chatId || streaming) return
    setStreaming(true)
    setError(null)
    if (escalate) setEscalated(true)
    setTurns((prev) => [...prev, { role: "user", text: message }])
    setPrompt("")

    try {
      setTurns((prev) => [...prev, { role: "assistant", text: "" }])
      let text = ""
      const res = await fetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, escalate }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${res.status}`)
      }
      const usage = await consumeStream(res, (delta) => {
        text += delta
        setTurns((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "assistant", text, usage }
          return next
        })
      })
      setTurns((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: "assistant", text, usage }
        return next
      })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setStreaming(false)
    }
  }

  function resetChat() {
    setChatId(null)
    setDecision(null)
    setJevRaw(null)
    setTurns([])
    setEscalated(false)
    setError(null)
    setPrompt("")
  }

  const sessionTotal = turns.reduce((sum, t) => sum + turnTotal(t.usage), 0)
  const mounted = templates.find((t) => t.id === mountedTemplate)

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <section className="flex flex-col gap-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 [color-scheme:light]">
          {/* template picker */}
          <div className="mb-3 flex items-center gap-2">
            <span className="text-xs font-medium text-neutral-500">Start from:</span>
            {mounted ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs font-medium text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {mounted.name}
                <button
                  onClick={() => setMountedTemplate(null)}
                  disabled={Boolean(chatId) || streaming}
                  title="Remove template (starts a blank chat)"
                  aria-label="Remove template (starts a blank chat)"
                  className="ml-0.5 text-neutral-400 hover:text-white disabled:opacity-30"
                >
                  ×
                </button>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-neutral-300 px-3 py-1 text-xs text-neutral-500">
                Blank chat
              </span>
            )}
            {chatId && (
              <button onClick={resetChat} className="ml-auto text-xs text-neutral-500 underline">
                New chat
              </button>
            )}
          </div>

          {!mounted && templates.length > 0 && !chatId && (
            <div className="mb-3 flex flex-wrap gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setMountedTemplate(t.id)}
                  className="group inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 hover:border-neutral-900"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded bg-neutral-900 text-[9px] font-bold text-white">
                    {t.name.charAt(0)}
                  </span>
                  Fork {t.name}
                  <span className="text-neutral-400" aria-hidden="true">→</span>
                </button>
              ))}
              <span className="self-center text-[11px] text-neutral-500">
                forks mount the starter repo; small changes route cheap
              </span>
            </div>
          )}

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={
              chatId
                ? mounted
                  ? "Next change for this storefront…"
                  : "Follow-up message for this chat…"
                : mounted
                  ? "What should change in the storefront?"
                  : "Describe the app or change you want to build…"
            }
            rows={3}
            className="w-full resize-y rounded-lg border border-neutral-300 bg-white p-3 text-sm text-neutral-900 outline-none placeholder:text-neutral-500 focus:border-neutral-900"
          />
          <div className="mt-3 flex items-center gap-3">
            <select
              value={selection}
              onChange={(e) => setSelection(e.target.value as ExplicitSelection)}
              disabled={Boolean(chatId)}
              className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50"
            >
              {(Object.keys(MODEL_LABELS) as ExplicitSelection[]).map((id) => (
                <option key={id} value={id}>
                  {MODEL_LABELS[id]}
                </option>
              ))}
            </select>

            <button
              onClick={chatId ? () => sendFollowUp(false) : startChat}
              disabled={streaming || !prompt.trim()}
              className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
            >
              {streaming ? "Streaming…" : chatId ? "Send follow-up" : mounted ? "Fork & run" : "Start chat"}
            </button>

            {chatId && (
              <button
                onClick={() => sendFollowUp(true)}
                disabled={streaming || escalated || !prompt.trim()}
                title="One-way escalation to v0-max. Breaks the prompt cache: expect one cold cache write at max rates."
                className="rounded-lg border border-amber-500 px-3 py-1.5 text-sm text-amber-700 disabled:opacity-40"
              >
                {escalated ? "Escalated to max" : "Escalate to max"}
              </button>
            )}

            <span className="ml-auto font-mono text-xs text-neutral-500">
              session: ${sessionTotal.toFixed(4)}
            </span>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>

        <div
          ref={transcriptRef}
          className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 [color-scheme:light]"
          style={{ minHeight: "20rem", maxHeight: "32rem" }}
        >
          {turns.length === 0 && (
            <p className="text-sm text-neutral-500">
              {mounted
                ? `A change request on the mounted ${mounted.name} template. Jev classifies it; simple diffs run on v0-mini.`
                : "A blank chat starts from scratch. Watch the cost: Jev still routes, but from-scratch builds are expensive."}
            </p>
          )}
          {turns.map((turn, i) => {
            const total = turnTotal(turn.usage)
            return (
              <div
                key={i}
                className={
                  turn.role === "user"
                    ? "ml-auto max-w-[80%] rounded-xl bg-neutral-900 px-3 py-2 text-sm text-white"
                    : "max-w-[90%] rounded-xl border border-neutral-200 px-3 py-2 text-sm"
                }
              >
                <div className="whitespace-pre-wrap">{turn.text || "…"}</div>
                {turn.usage?.creditsCost && (
                  <div className="mt-2 flex items-center gap-2 border-t border-neutral-200 pt-1">
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-neutral-900">
                      ${total.toFixed(4)} this turn
                    </span>
                    <span className="font-mono text-[11px] text-neutral-500">
                      in {turn.usage.creditsCost.input ?? 0} · out {turn.usage.creditsCost.output ?? 0} · cache-r{" "}
                      {turn.usage.creditsCost.cacheRead ?? 0} · cache-w {turn.usage.creditsCost.cacheWrite ?? 0}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      <aside className="flex flex-col gap-4">
        <div className="rounded-xl border border-neutral-200 bg-white p-4 text-neutral-900 [color-scheme:light]">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Routing decision
          </h2>
          {!decision ? (
            <p className="text-sm text-neutral-500">No chat routed yet.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-600 px-2 py-0.5 font-mono text-xs text-white">
                  {decision.modelId}
                </span>
                <span className="font-mono text-xs text-neutral-500">{decision.rule}</span>
              </div>
              <p className="text-neutral-700">{decision.reason}</p>
              {decision.fallback && (
                <p className="text-xs text-amber-700">Fallback decision (Jev unavailable).</p>
              )}
              {jevRaw !== null && (
                <>
                  <button
                    onClick={() => setShowRaw(!showRaw)}
                    className="text-xs text-neutral-500 underline"
                  >
                    {showRaw ? "Hide" : "Show"} raw Jev response
                  </button>
                  {showRaw && (
                    <pre className="max-h-64 overflow-auto rounded-lg bg-neutral-950 p-3 font-mono text-[11px] text-neutral-200">
                      {JSON.stringify(jevRaw, null, 2)}
                    </pre>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}
