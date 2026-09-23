/**
 * Prices alternative routing policies using the Jev answers already captured
 * in data/replay-summary.json (perChat: taskType, complexity, proceed,
 * confidence) plus the raw usage CSV. No Jev calls are made.
 *
 * Run: npx tsx scripts/policy-variants.mts
 */

import { readFileSync } from "node:fs"

const RATE_CARD: Record<string, { input: number; cacheWrite: number; cacheRead: number; output: number }> = {
  "v0-mini": { input: 0.2, cacheWrite: 0.25, cacheRead: 0.02, output: 1.2 },
  "v0-pro": { input: 2.0, cacheWrite: 2.5, cacheRead: 0.2, output: 10.0 },
  "v0-max": { input: 5.0, cacheWrite: 6.25, cacheRead: 0.5, output: 25.0 },
  "v0-max-fast": { input: 10.0, cacheWrite: 12.5, cacheRead: 1.0, output: 50.0 },
}

const replay = JSON.parse(readFileSync(new URL("../data/replay-summary.json", import.meta.url), "utf8"))
const csv = readFileSync(new URL("../data/usage-export.csv", import.meta.url), "utf8").trim()
const lines = csv.split("\n")
const header = lines[0].split(",").map((h) => h.replace(/^"|"$/g, ""))
const rows: Record<string, string>[] = lines.slice(1).map((line) => {
  const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) ?? []
  const values = cells
    .filter((c) => c !== "")
    .map((c) => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"'))
  const row: Record<string, string> = {}
  header.forEach((h, i) => (row[h] = values[i] ?? ""))
  return row
})

const byChat = new Map<string, Record<string, string>[]>()
for (const row of rows) {
  const list = byChat.get(row["Chat ID"]) ?? []
  list.push(row)
  byChat.set(row["Chat ID"], list)
}

function costAt(rows: Record<string, string>[], modelId: string | null): number {
  return rows.reduce((sum, row) => {
    const image = Number(row["Image Generation Cost"] || 0)
    // null model = keep the row's actual model (used for actual totals and
    // for chats we could not classify)
    const effective = modelId ?? row["Model ID"]
    const rates = RATE_CARD[effective]
    if (!rates) return sum + image
    return (
      sum +
      (Number(row["Input Tokens"]) / 1e6) * rates.input +
      (Number(row["Output Tokens"]) / 1e6) * rates.output +
      (Number(row["Cache Read Tokens"]) / 1e6) * rates.cacheRead +
      (Number(row["Cache Write Tokens"]) / 1e6) * rates.cacheWrite +
      image
    )
  }, 0)
}

type Decision = {
  taskType: string | null
  complexity: number | null
  proceed: number | null
  confidence: number | null
}

function pickModel(d: Decision, variant: string): string | null {
  if (d.taskType === null || d.complexity === null) return null
  const confidence = d.confidence ?? 0
  const proceed = d.proceed ?? 0
  if (confidence < 0.5) return "v0-pro"
  if (d.taskType === "architecture") return "v0-max"
  if (d.taskType === "debugging" && d.complexity >= 4) return "v0-max"
  if (d.taskType === "unclear" && proceed < 0.5) return "v0-pro"
  if (d.taskType === "styling-copy" && d.complexity <= 2 && proceed >= 0.5) return "v0-mini"

  // variants beyond the current policy
  if (variant === "v0.1.0") {
    if (d.taskType === "unclear" && proceed < 0.5) return "v0-pro"
    return "v0-pro"
  }
  if (variant === "v0.2-mini-cx2") {
    if (d.complexity <= 2 && proceed >= 0.5) return "v0-mini"
    return "v0-pro"
  }
  if (variant === "v0.2-mini-cx1") {
    if (d.complexity <= 1 && proceed >= 0.5) return "v0-mini"
    return "v0-pro"
  }
  if (variant === "v0.2-mini-clear-cx2") {
    if (d.taskType !== "unclear" && d.complexity <= 2 && proceed >= 0.5) return "v0-mini"
    return "v0-pro"
  }
  if (variant === "v0.2-mini-cx3") {
    if (d.complexity <= 3 && proceed >= 0.5) return "v0-mini"
    return "v0-pro"
  }
  return "v0-pro"
}

const variants = ["v0.1.0", "v0.2-mini-cx2", "v0.2-mini-cx3", "v0.2-mini-cx1", "v0.2-mini-clear-cx2"]
const decisions: Record<string, Decision> = {}
for (const chat of replay.perChat) {
  decisions[chat.chatId] = {
    taskType: chat.taskType,
    complexity: chat.complexity,
    proceed: chat.proceed,
    confidence: chat.confidence,
  }
}

const actualTotal = [...byChat.keys()].reduce((sum, id) => sum + costAt(byChat.get(id)!, null), 0)
console.log(`Actual cost (rate-card recomputed): $${actualTotal.toFixed(2)}\n`)

for (const variant of variants) {
  let total = 0
  const modelCounts: Record<string, { chats: number; messages: number }> = {}
  for (const [chatId, msgs] of byChat) {
    const modelId = pickModel(decisions[chatId], variant)
    total += costAt(msgs, modelId)
    if (modelId) {
      const agg = (modelCounts[modelId] ??= { chats: 0, messages: 0 })
      agg.chats += 1
      agg.messages += msgs.length
    }
  }
  const savingsPct = ((actualTotal - total) / actualTotal) * 100
  console.log(`${variant.padEnd(22)} simulated $${total.toFixed(2)}  savings $${(actualTotal - total).toFixed(2)} (${savingsPct.toFixed(1)}%)`)
  console.log(`  ${JSON.stringify(modelCounts)}`)
}
