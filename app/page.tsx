"use client"

import { useCallback, useEffect, useRef, useState } from "react"

type ChatModelId = "v0-mini" | "v0-pro" | "v0-max" | "v0-max-fast"
type ExplicitSelection = ChatModelId | "auto"

type RoutingDecision = {
  modelId: ChatModelId
  rule: string
  reason: string
  fallback: boolean
}

type CreateChatResponse = {
  chatId: string
  messageId: string
  decision: RoutingDecision
  jev?: { model: string; raw: unknown }
  error?: string
}

type OrgTeam = {
  teamId: string
  slug: string
  name: string
  billingPlan?: string
}

type Turn = {
  role: "user" | "assistant"
  text: string
  usage?: {
    tokens?: Record<string, number>
    creditsCost?: Record<string, number>
  }
}

const MODEL_LABELS: Record<ExplicitSelection, string> = {
  auto: "Auto (Jev routes)",
  "v0-mini": "v0-mini",
  "v0-pro": "v0-pro",
  "v0-max": "v0-max",
  "v0-max-fast": "v0-max-fast",
}

export default function Home() {
  const [prompt, setPrompt] = useState("")
  const [selection, setSelection] = useState<ExplicitSelection>("auto")
  const [starting, setStarting] = useState(false)
  const [chatId, setChatId] = useState<string | null>(null)
  const [decision, setDecision] = useState<RoutingDecision | null>(null)
  const [jevRaw, setJevRaw] = useState<unknown>(null)
  const [showRaw, setShowRaw] = useState(false)
  const [turns, setTurns] = useState<Turn[]>([])
  const [streaming, setStreaming] = useState(false)
  const [escalated, setEscalated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [newTeamName, setNewTeamName] = useState("")
  const [orgsMessage, setOrgsMessage] = useState<string | null>(null)

  const transcriptRef = useRef<HTMLDivElement>(null)

  const refreshTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/orgs/teams")
      const data = await res.json()
      setTeams(data.teams ?? [])
    } catch {
      setTeams([])
    }
  }, [])

  useEffect(() => {
    // Initial load on mount; the rule flags the state updates this triggers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTeams()
  }, [refreshTeams])

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight })
  }, [turns])

  async function consumeStream(res: Response, onDelta: (delta: string) => void) {
    const reader = res.body?.getReader()
    if (!reader) throw new Error("No stream body")
    const decoder = new TextDecoder()
    let buffer = ""
    let usage: Turn["usage"] | undefined

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split("\n\n")
      buffer = parts.pop() ?? ""
      for (const part of parts) {
        const line = part.split("\n").find((l) => l.startsWith("data: "))
        if (!line) continue
        try {
          const payload = JSON.parse(line.slice(6))
          if (typeof payload.content === "string") onDelta(payload.content)
          if (payload.usage) {
            usage = {
              tokens: payload.usage.tokens,
              creditsCost: payload.usage.creditsCost,
            }
          }
          if (payload.error) throw new Error(payload.error)
        } catch (parseError) {
          if (parseError instanceof SyntaxError) continue
          throw parseError
        }
      }
    }
    return usage
  }

  async function startChat() {
    if (!prompt.trim() || starting) return
    setStarting(true)
    setError(null)
    setDecision(null)
    setJevRaw(null)
    setTurns([{ role: "user", text: prompt }])
    setChatId(null)
    setEscalated(false)

    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, modelId: selection }),
      })
      const data: CreateChatResponse = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`)

      setChatId(data.chatId)
      setDecision(data.decision)
      if (data.jev) setJevRaw(data.jev.raw)

      setStreaming(true)
      let text = ""
      setTurns((prev) => [...prev, { role: "assistant", text: "" }])
      const streamRes = await fetch(`/api/chats/${data.chatId}/resume`, { method: "POST" })
      if (!streamRes.ok) {
        const err = await streamRes.json().catch(() => ({}))
        throw new Error(err.error ?? `HTTP ${streamRes.status}`)
      }
      const usage = await consumeStream(streamRes, (delta) => {
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
      setStreaming(false)
    } catch (e) {
      setError((e as Error).message)
      setStreaming(false)
    } finally {
      setStarting(false)
    }
  }

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

  async function provisionTeam() {
    if (!newTeamName.trim()) return
    setOrgsMessage("Provisioning…")
    try {
      const res = await fetch("/api/orgs/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setOrgsMessage(
        `${data.created ? "Created" : "Reused"} team ${data.link.teamId} (${data.link.slug}) · v0 key ${data.stored ? "already stored" : "minted and stored"}.`,
      )
      setNewTeamName("")
      refreshTeams()
    } catch (e) {
      setOrgsMessage(`Failed: ${(e as Error).message}`)
    }
  }

  const modelBadge = decision?.modelId ?? "—"

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 font-sans">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jev → v0 Model Routing</h1>
          <p className="text-sm text-neutral-500">
            One Jev classification per chat. Model fixed for the chat lifetime. Escalation costs one
            cold cache write.
          </p>
        </div>
        <span className="rounded-md bg-neutral-900 px-2 py-1 font-mono text-xs text-white">
          policy v0.1.0
        </span>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col gap-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                chatId
                  ? "Follow-up message for this chat…"
                  : "Describe the app or change you want to build…"
              }
              rows={3}
              className="w-full resize-y rounded-lg border border-neutral-300 p-3 text-sm outline-none focus:border-neutral-900"
            />
            <div className="mt-3 flex items-center gap-3">
              <select
                value={selection}
                onChange={(e) => setSelection(e.target.value as ExplicitSelection)}
                disabled={Boolean(chatId)}
                className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm disabled:opacity-50"
              >
                {(Object.keys(MODEL_LABELS) as ExplicitSelection[]).map((id) => (
                  <option key={id} value={id}>
                    {MODEL_LABELS[id]}
                  </option>
                ))}
              </select>

              {chatId ? (
                <button
                  onClick={() => sendFollowUp(false)}
                  disabled={streaming || !prompt.trim()}
                  className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  {streaming ? "Streaming…" : "Send follow-up"}
                </button>
              ) : (
                <button
                  onClick={startChat}
                  disabled={starting || !prompt.trim()}
                  className="rounded-lg bg-neutral-900 px-4 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  {starting ? "Routing…" : "Start chat"}
                </button>
              )}

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
            </div>
            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          </div>

          <div
            ref={transcriptRef}
            className="flex-1 space-y-3 overflow-y-auto rounded-xl border border-neutral-200 p-4"
            style={{ minHeight: "20rem", maxHeight: "32rem" }}
          >
            {turns.length === 0 && (
              <p className="text-sm text-neutral-400">
                Start a chat to see Jev classify it and route it to a v0 model.
              </p>
            )}
            {turns.map((turn, i) => (
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
                  <div className="mt-2 border-t border-neutral-200 pt-1 font-mono text-[11px] text-neutral-500">
                    credits: in {turn.usage.creditsCost.input ?? 0} · out{" "}
                    {turn.usage.creditsCost.output ?? 0} · cache-read{" "}
                    {turn.usage.creditsCost.cacheRead ?? 0} · cache-write{" "}
                    {turn.usage.creditsCost.cacheWrite ?? 0}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <div className="rounded-xl border border-neutral-200 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Routing decision
            </h2>
            {!decision ? (
              <p className="text-sm text-neutral-400">No chat routed yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-blue-600 px-2 py-0.5 font-mono text-xs text-white">
                    {modelBadge}
                  </span>
                  <span className="font-mono text-xs text-neutral-500">{decision.rule}</span>
                </div>
                <p className="text-neutral-700">{decision.reason}</p>
                {decision.fallback && (
                  <p className="text-xs text-amber-600">Fallback decision (Jev unavailable).</p>
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

          <div className="rounded-xl border border-neutral-200 p-4">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
              Organizations
            </h2>
            <ul className="mb-3 space-y-1 text-sm">
              {teams.length === 0 && <li className="text-neutral-400">No teams loaded.</li>}
              {teams.map((team) => (
                <li key={team.teamId} className="flex justify-between gap-2">
                  <span className="truncate">{team.name}</span>
                  <span className="font-mono text-xs text-neutral-500">{team.billingPlan ?? "—"}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New tenant name"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <button
                onClick={provisionTeam}
                className="rounded-lg border border-neutral-900 px-3 py-1.5 text-sm"
              >
                Provision
              </button>
            </div>
            {orgsMessage && <p className="mt-2 text-xs text-neutral-600">{orgsMessage}</p>}
          </div>
        </aside>
      </div>
    </main>
  )
}