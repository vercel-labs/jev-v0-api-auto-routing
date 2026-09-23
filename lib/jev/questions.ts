import type { JevQuestion } from "./client"

/**
 * Jev question definitions — ROUTING QUESTIONS v1.
 *
 * Evaluated together in one call against a state containing the initial
 * prompt and any conversation context. Questions are evaluated in isolation;
 * they do not consume one another's answers.
 *
 * History of changes to this file defines the policy's provenance, so bump
 * ROUTING_QUESTIONS_VERSION whenever wording or options change.
 */

export const ROUTING_QUESTIONS_VERSION = "1"

export const TASK_TYPE_OPTIONS = [
  "styling-copy",
  "feature",
  "integration",
  "debugging",
  "architecture",
  "unclear",
] as const

export const COMPLEXITY_LEVELS = [
  "Trivial: a copy change, color, label, or single-line tweak.",
  "Small: one component or one file, no new behavior.",
  "Standard: a component or feature with normal logic and states.",
  "Large: multiple files, new data flow, third-party integration, or non-obvious debugging.",
  "Architectural: cross-cutting change, several subsystems, or repeated failed attempts already happened.",
] as const

export const taskTypeQuestion: JevQuestion = {
  type: "choice",
  instructions:
    "Classify the kind of task the user is asking the app builder to perform, based on the provided prompt and context. " +
    "If the request cannot be classified with the information given, choose 'unclear'.",
  criteria: {
    "styling-copy": "Visual styling, theming, copy/text changes, or small layout tweaks with no new behavior.",
    feature: "Building or changing application behavior: new components, pages, or functionality.",
    integration: "Connecting to an external service, API, database, or SDK.",
    debugging: "Something is broken or failing and needs diagnosing and fixing.",
    architecture: "Structural or cross-cutting change: data model, routing, state management, multi-system rework.",
    unclear: "The prompt does not contain enough information to classify the task.",
  },
}

export const complexityQuestion: JevQuestion = {
  type: "score",
  instructions:
    "Estimate how much work and risk this request involves for an app-building agent, based on the prompt and context. " +
    "Consider scope of change, unknowns, and how much can go wrong. The levels are ordered from least to most complex.",
  criteria: [...COMPLEXITY_LEVELS],
}

export const proceedQuestion: JevQuestion = {
  type: "noul",
  instructions:
    "Judge whether the provided prompt and context are sufficient to build a useful first version without asking the user a clarifying question.",
  criteria: {
    true: "The requirements are concrete enough to build something useful; even a partial result moves the user forward.",
    false: "Key requirements are missing or contradictory; building now would likely waste an attempt.",
  },
}

export function routingQuestions(): Record<string, JevQuestion> {
  return {
    taskType: taskTypeQuestion,
    complexity: complexityQuestion,
    proceed: proceedQuestion,
  }
}
