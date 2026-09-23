/**
 * Jev (TypeSafe System One) client, routed through Vercel AI Gateway.
 *
 * The Gateway exposes a TypeSafe-compatible surface at
 *   POST https://ai-gateway.vercel.sh/typesafe/v1/systemone
 * with identical request/response shapes to api.typesafe.ai. Only the
 * baseURL and API key differ.
 *
 * Docs: https://vercel.com/docs/ai-gateway/sdks-and-apis/typesafe
 */

const GATEWAY_SYSTEMONE_URL =
  process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/typesafe/v1/systemone"

export type JevChoiceAnswer = {
  type: "choice"
  choice: string
  probabilities: Record<string, number>
  confidence: number
}

export type JevScoreAnswer = {
  type: "score"
  score: number
  legend: string[]
  probabilities: number[]
  confidence: number
}

export type JevNoulAnswer = {
  type: "noul"
  noul: number
}

export type JevAnswer = JevChoiceAnswer | JevScoreAnswer | JevNoulAnswer
export type JevAnswers = Record<string, JevAnswer>

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } }

export type JevEvaluation = {
  /** Versioned model id that answered, e.g. "jev-1.13.0". */
  model: string
  answers: JevAnswers
  usage?: { input_tokens?: number; output_tokens?: number }
  /** Full raw response body, kept for the decision panel and logging. */
  raw: unknown
}

export class JevUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "JevUnavailableError"
  }
}

export async function evaluateQuestions(input: {
  state: string | object | unknown[]
  questions: Record<string, JevQuestion>
  model?: string
}): Promise<JevEvaluation> {
  const { env } = await import("../env")
  const apiKey = env.aiGatewayJevKey()
  const body = {
    state: input.state,
    model: input.model ?? process.env.JEV_MODEL ?? "jev-latest",
    questions: input.questions,
  }

  const res = await fetch(GATEWAY_SYSTEMONE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new JevUnavailableError(
      `Jev request failed: HTTP ${res.status} ${text.slice(0, 300)}`,
      res.status,
    )
  }

  const data = (await res.json()) as {
    model?: string
    answers?: JevAnswers
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  if (!data.answers) {
    throw new JevUnavailableError("Jev response missing answers")
  }

  return {
    model: data.model ?? "unknown",
    answers: data.answers,
    usage: data.usage,
    raw: data,
  }
}
