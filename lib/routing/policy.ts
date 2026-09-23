import type { JevAnswers, JevChoiceAnswer, JevNoulAnswer, JevScoreAnswer } from "../jev/client"

/**
 * Routing policy v0.1 — the initial hypotheses from jev-v0-model-routing.md,
 * made executable. Decides the v0 model ONCE per chat, at chat creation.
 *
 * Deliberate constraints:
 * - The chosen model is fixed for the chat's lifetime. Switching models
 *   mid-chat breaks v0 prompt caching (80-90% of input cost); a one-way
 *   escalation is allowed and is priced as one cold cache write.
 * - Fail-safe default is v0-pro: it is the customer's status-quo model, so
 *   misrouting to pro costs nothing relative to today's behavior.
 * - v0-max-fast is never auto-selected: latency preference is a user
 *   decision, not a task property.
 */

export const POLICY_VERSION = "0.1.0"

export type ChatModelId = "v0-mini" | "v0-pro" | "v0-max" | "v0-max-fast"

export type ExplicitSelection = ChatModelId | "auto"

export type RoutingDecision = {
  modelId: ChatModelId
  /** Which rule fired, for the decision panel and logs. */
  rule: string
  reason: string
  /** True when Jev could not be consulted or its answer was unusable. */
  fallback: boolean
}

function isChoice(
  answer: JevAnswers[string],
): answer is JevChoiceAnswer {
  return answer.type === "choice" && typeof (answer as JevChoiceAnswer).choice === "string"
}

function isScore(answer: JevAnswers[string]): answer is JevScoreAnswer {
  return answer.type === "score" && typeof (answer as JevScoreAnswer).score === "number"
}

function isNoul(answer: JevAnswers[string]): answer is JevNoulAnswer {
  return answer.type === "noul" && typeof (answer as JevNoulAnswer).noul === "number"
}

export function routeChat(input: {
  answers?: JevAnswers
  explicitModelId?: ExplicitSelection
}): RoutingDecision {
  const { answers, explicitModelId } = input

  // Explicit user selections always win over automatic routing.
  if (explicitModelId && explicitModelId !== "auto") {
    return {
      modelId: explicitModelId,
      rule: "explicit-selection",
      reason: "User explicitly selected this model; overrides automatic routing.",
      fallback: false,
    }
  }

  if (!answers) {
    return {
      modelId: "v0-pro",
      rule: "jev-unavailable",
      reason: "Jev was unavailable; fell back to the status-quo default.",
      fallback: true,
    }
  }

  const taskType = answers.taskType
  const complexity = answers.complexity
  const proceed = answers.proceed

  // Low confidence in the classification = fail safe to pro.
  if (!isChoice(taskType) || typeof taskType.confidence !== "number" || taskType.confidence < 0.5) {
    return {
      modelId: "v0-pro",
      rule: "low-confidence",
      reason: `Classification confidence ${taskType && isChoice(taskType) ? taskType.confidence : "n/a"} is below 0.5; using the default model.`,
      fallback: false,
    }
  }

  const complexityScore = isScore(complexity) ? complexity.score : null
  const proceedValue = isNoul(proceed) ? proceed.noul : null

  if (taskType.choice === "architecture") {
    return {
      modelId: "v0-max",
      rule: "architecture-to-max",
      reason: "Architectural change; routed to the strongest model.",
      fallback: false,
    }
  }

  if (taskType.choice === "debugging" && complexityScore !== null && complexityScore >= 4) {
    return {
      modelId: "v0-max",
      rule: "hard-debug-to-max",
      reason: `Debugging with complexity ${complexityScore}/5; routed to the strongest model.`,
      fallback: false,
    }
  }

  if (taskType.choice === "styling-copy" && complexityScore !== null && complexityScore <= 2) {
    if (proceedValue !== null && proceedValue < 0.5) {
      return {
        modelId: "v0-pro",
        rule: "needs-clarification",
        reason: "Looks simple but the requirements are unclear; not risking a mini attempt.",
        fallback: false,
      }
    }
    return {
      modelId: "v0-mini",
      rule: "simple-edit-to-mini",
      reason: `Clear, localized styling/copy change (complexity ${complexityScore ?? "?"}/5); routed to mini.`,
      fallback: false,
    }
  }

  return {
    modelId: "v0-pro",
    rule: "default-pro",
    reason: `Task type '${taskType.choice}' with complexity ${complexityScore ?? "?"}/5 fits the standard model.`,
    fallback: false,
  }
}
