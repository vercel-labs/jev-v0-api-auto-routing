/**
 * Policy unit check — verifies the routing table without any network access.
 * Run: npx tsx scripts/policy-check.ts
 */
import { routeChat } from "../lib/routing/policy"

const mk = (
  choice: string,
  confidence: number,
  score: number,
  noul: number,
) => ({
  taskType: { type: "choice" as const, choice, probabilities: {}, confidence },
  complexity: {
    type: "score" as const,
    score,
    legend: [],
    probabilities: [],
    confidence: 0.9,
  },
  proceed: { type: "noul" as const, noul },
})

const cases: Array<[string, Parameters<typeof routeChat>[0]["answers"], string]> = [
  ["clear styling", mk("styling-copy", 0.9, 1, 0.9), "v0-mini"],
  ["styling, unclear requirements", mk("styling-copy", 0.9, 1, 0.3), "v0-pro"],
  ["standard feature", mk("feature", 0.8, 3, 0.8), "v0-pro"],
  ["hard debugging", mk("debugging", 0.8, 4.5, 0.8), "v0-max"],
  ["architecture", mk("architecture", 0.9, 5, 0.9), "v0-max"],
  ["low confidence", mk("unclear", 0.3, 3, 0.8), "v0-pro"],
  ["jev unavailable", undefined, "v0-pro"],
]

let ok = true
for (const [name, answers, expected] of cases) {
  const out = routeChat({ answers, explicitModelId: "auto" })
  const pass = out.modelId === expected
  ok = ok && pass
  console.log(`${pass ? "PASS" : "FAIL"} ${name} -> ${out.modelId} (${out.rule})`)
}

const explicit = routeChat({ explicitModelId: "v0-mini" })
const explicitPass =
  explicit.modelId === "v0-mini" && explicit.rule === "explicit-selection"
ok = ok && explicitPass
console.log(
  `${explicitPass ? "PASS" : "FAIL"} explicit override -> ${explicit.modelId} (${explicit.rule})`,
)

process.exit(ok ? 0 : 1)
