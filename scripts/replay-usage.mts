/**
 * Replays the customer usage export through the routing policy.
 *
 * For each chat in data/usage-export.csv:
 *   1. fetch the chat's first user message from the v0 API
 *   2. classify it with Jev (same questions as the live app)
 *   3. apply the routing policy -> the model this chat WOULD have run on
 *   4. re-price every message of the chat at that model's rate card
 *
 * Actual cost is recomputed from the same rate card for consistency.
 * Models outside the rate card (opus-5-fast, kimi-k3, gpt-5.6-sol, blank)
 * are kept at actual cost and marked unrouteable.
 *
 * Run: node --env-file=.env.local ../../node_modules/.bin/tsx scripts/replay-usage.ts
 * (or: npx tsx scripts/replay-usage.ts with .env.local loaded)
 * Output: data/replay-summary.json + console table
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { evaluateQuestions } from "../lib/jev/client"
import { routingQuestions } from "../lib/jev/questions"
import { routeChat } from "../lib/routing/policy"

const RATE_CARD: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  "v0-mini": { input: 0.2, cacheWrite: 0.25, cacheRead: 0.02, output: 1.2 },
  "v0-pro": { input: 2.0, cacheWrite: 2.5, cacheRead: 0.2, output: 10.0 },
  "v0-max": { input: 5.0, cacheWrite: 6.25, cacheRead: 0.5, output: 25.0 },
  "v0-max-fast": { input: 10.0, cacheWrite: 12.5, cacheRead: 1.0, output: 50.0 },
}

const CSV_PATH = new URL("../data/usage-export.csv", import.meta.url)
const OUT_DIR = new URL("../data/", import.meta.url)
const V0_BASE = "https://api.v0.dev"
const JEV_STATE_LIMIT = 8000
const CONCURRENCY = 10

type Row = Record<string, string>

function rate(modelId: string) {
  return RATE_CARD[modelId] ?? null
}

function costOf(row: Row, rates: { input: number; cacheWrite: number; cacheRead: number; output: number } | null): number {
  const imageCost = Number(row["Image Generation Cost"] || 0)
  if (!rates) return imageCost
  return (
    (Number(row["Input Tokens"]) / 1e6) * rates.input +
    (Number(row["Output Tokens"]) / 1e6) * rates.output +
    (Number(row["Cache Read Tokens"]) / 1e6) * rates.cacheRead +
    (Number(row["Cache Write Tokens"]) / 1e6) * rates.cacheWrite +
    imageCost
  )
}

async function mapLimit<T, R>(items: T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    for (;;) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return results
}

// --- main ---

const teamId = process.env.DEFAULT_TEAM_ID
if (!teamId) throw new Error("DEFAULT_TEAM_ID is not set")
const keys = JSON.parse(readFileSync(new URL("../data/tenant-keys.json", import.meta.url), "utf8"))
const v0Key = keys[teamId] as string | undefined
if (!v0Key) throw new Error(`No v0 key for ${teamId} in data/tenant-keys.json`)

const csv = readFileSync(CSV_PATH, "utf8").trim()
const lines = csv.split("\n")
const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""))
const rows: Row[] = lines.slice(1).map((line) => {
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []
  const values = cells
    .filter((c) => c !== "")
    .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'))
  const row: Row = {}
  header.forEach((h, i) => (row[h] = values[i] ?? ""))
  return row
})

const chats = new Map<string, Row[]>()
for (const row of rows) {
  const list = chats.get(row["Chat ID"]) ?? []
  list.push(row)
  chats.set(row["Chat ID"], list)
}
const chatIds = [...chats.keys()]
console.log(`Loaded ${rows.length} messages across ${chatIds.length} chats`)

async function firstUserMessage(chatId: string): Promise<string | null> {
  const res = await fetch(`${V0_BASE}/v2/chats/${chatId}/messages?limit=10`, {
    headers: { Authorization: `Bearer ${v0Key}` },
  })
  if (!res.ok) return null
  const body = (await res.json()) as { messages?: Array<{ role: string; content?: string }> }
  const userMsg = (body.messages ?? []).find((m) => m.role === "user" && m.content)
  return userMsg?.content?.slice(0, JEV_STATE_LIMIT) ?? null
}

async function classifyChat(chatId: string, messages: Row[]) {
  const actual = messages.reduce((sum, r) => sum + costOf(r, rate(r["Model ID"])), 0)
  const entry = {
    chatId,
    messages: messages.length,
    actualCost: actual,
    simulatedCost: actual,
    modelId: null as string | null,
    rule: null as string | null,
    taskType: null as string | null,
    confidence: null as number | null,
    complexity: null as number | null,
    proceed: null as number | null,
    unrouteable: false,
    noPrompt: false,
  }

  const prompt = await firstUserMessage(chatId)
  if (!prompt) {
    entry.noPrompt = true
    return entry
  }

  try {
    const evaluation = await evaluateQuestions({
      state: prompt,
      questions: routingQuestions(),
      model: process.env.JEV_MODEL || "jev-latest",
    })
    const decision = routeChat({ answers: evaluation.answers, explicitModelId: "auto" })
    entry.modelId = decision.modelId
    entry.rule = decision.rule
    entry.taskType = (evaluation.answers.taskType as { choice?: string } | undefined)?.choice ?? null
    entry.confidence = (evaluation.answers.taskType as { confidence?: number } | undefined)?.confidence ?? null
    entry.complexity = (evaluation.answers.complexity as { score?: number } | undefined)?.score ?? null
    entry.proceed = (evaluation.answers.proceed as { noul?: number } | undefined)?.noul ?? null
    const rates = rate(decision.modelId)
    if (!rates) {
      entry.unrouteable = true
      return entry
    }
    entry.simulatedCost = messages.reduce((sum, r) => sum + costOf(r, rates), 0)
  } catch (error) {
    entry.rule = `classify-failed: ${(error as Error).message.slice(0, 120)}`
  }
  return entry
}

console.log("Fetching first prompts and classifying chats…")
const results = await mapLimit(
  chatIds.map((id) => ({ id, messages: chats.get(id)! })),
  CONCURRENCY,
  ({ id, messages }) => classifyChat(id, messages),
)

const actualTotal = results.reduce((s, r) => s + r.actualCost, 0)
const simulatedTotal = results.reduce((s, r) => s + r.simulatedCost, 0)
const classified = results.filter((r) => r.modelId)
const savings = actualTotal - simulatedTotal

const byModel = new Map<string, { chats: number; messages: number }>()
for (const r of classified) {
  const agg = byModel.get(r.modelId!) ?? { chats: 0, messages: 0 }
  agg.chats += 1
  agg.messages += r.messages
  byModel.set(r.modelId!, agg)
}
const byRule = new Map<string, number>()
for (const r of classified) byRule.set(r.rule!, (byRule.get(r.rule!) ?? 0) + 1)

const summary = {
  generatedAt: new Date().toISOString(),
  messages: rows.length,
  chats: chatIds.length,
  actualCost: actualTotal,
  simulatedCost: simulatedTotal,
  savings,
  savingsPct: (savings / actualTotal) * 100,
  chatsRouted: classified.length,
  chatsWithoutPrompt: results.filter((r) => r.noPrompt).length,
  classificationFailures: results.filter((r) => r.rule?.startsWith("classify-failed")).length,
  byModel: Object.fromEntries(byModel),
  byRule: Object.fromEntries(byRule),
  notes: [
    "Simulation keeps token counts per message fixed and re-prices them at the routed model's rate card.",
    "Routing decision is per chat (first user message); the model is fixed for the whole chat.",
    "Models outside the rate card keep their actual cost (unrouteable).",
  ],
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(
  new URL("./replay-summary.json", OUT_DIR),
  JSON.stringify({ ...summary, perChat: results }, null, 2) + "\n",
)

console.log("\n=== Replay summary ===")
console.log(`Chats: ${chatIds.length} (routed: ${classified.length})`)
console.log(`Actual cost:   $${actualTotal.toFixed(2)}`)
console.log(`Simulated cost: $${simulatedTotal.toFixed(2)}`)
console.log(`Savings: $${savings.toFixed(2)} (${summary.savingsPct.toFixed(1)}%)`)
console.log("Routed chats by model:", Object.fromEntries(byModel))
console.log("Decisions by rule:", Object.fromEntries(byRule))
console.log(`Chats with no retrievable prompt: ${summary.chatsWithoutPrompt}`)
console.log("Wrote data/replay-summary.json")
