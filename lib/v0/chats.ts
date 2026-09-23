import { createV0Client } from "v0"
import { env } from "../env"
import { readTenantKeys } from "../orgs/tenant-keys"
import { evaluateQuestions, JevUnavailableError } from "../jev/client"
import { routingQuestions, ROUTING_QUESTIONS_VERSION } from "../jev/questions"
import { POLICY_VERSION, routeChat, type ExplicitSelection, type RoutingDecision } from "../routing/policy"
import { resolveForkUrl, type ChatTemplate } from "../templates"

export type V0ModelId = "v0-mini" | "v0-pro" | "v0-max" | "v0-max-fast"

export type CreateChatResult = {
  chatId: string
  messageId?: string
  decision: RoutingDecision
  jev?: { model: string; raw: unknown }
  /** Present for template forks: the first generation is already running. */
  stream?: import("v0").V0StreamResult
}

function clientForTeam(teamId: string) {
  const key = resolveTeamKey(teamId)
  return createV0Client({ auth: key })
}

/**
 * Resolves the v0 API key for a team. The default team prefers a dedicated
 * env key (prod-safe; the serverless filesystem cannot persist writes), then
 * falls back to the local store populated by the provisioning flow. The root
 * org key is never used for chats — only for minting child-team keys.
 */
function resolveTeamKey(teamId: string): string {
  if (teamId === env.defaultTenantTeamId()) {
    const envKey = env.defaultTeamV0Key()
    if (envKey) return envKey
    const stored = readTenantKeys()[teamId]
    if (stored) return stored
    throw new Error(
      'No v0 key for the default team. Set DEFAULT_TEAM_V0_KEY, or mint one locally: POST /api/orgs/teams {"name": "commercetools"} (requires ROOT_V0_KEY).',
    )
  }
  const stored = readTenantKeys()[teamId]
  if (!stored) {
    throw new Error(`No v0 key stored for team ${teamId}. Provision it via POST /api/orgs/teams first.`)
  }
  return stored
}

function buildState(prompt: string): string {
  return [
    "A user is about to start a new conversation with an AI app builder (v0).",
    "Classify the request below and answer the questions.",
    "",
    `User prompt:\n${prompt}`,
  ].join("\n")
}

export async function createRoutedChat(input: {
  teamId: string
  prompt: string
  explicitModelId?: ExplicitSelection
}): Promise<CreateChatResult> {
  const v0 = clientForTeam(input.teamId)

  let answers
  let jevModel = "not-consulted"
  let jevRaw: unknown = null
  try {
    const evaluation = await evaluateQuestions({
      state: buildState(input.prompt),
      questions: routingQuestions(),
    })
    answers = evaluation.answers
    jevModel = evaluation.model
    jevRaw = evaluation.raw
  } catch (error) {
    if (!(error instanceof JevUnavailableError)) throw error
    // Jev outages degrade to the default model; the demo keeps working.
  }

  const decision = routeChat({ answers, explicitModelId: input.explicitModelId })

  const res = await v0.chats.createAsync({
    message: input.prompt,
    modelConfiguration: { modelId: decision.modelId, imageGenerations: false },
    metadata: {
      routedModelId: decision.modelId,
      policyVersion: POLICY_VERSION,
      routingQuestionsVersion: ROUTING_QUESTIONS_VERSION,
      jevModel,
      routingDecision: JSON.stringify(decision),
    },
  })

  if (res.error || !res.data?.chatId) {
    throw new Error(`Could not create v0 chat: ${JSON.stringify(res.error)}`)
  }

  return {
    chatId: res.data.chatId,
    messageId: res.data.messageId,
    decision,
    jev: jevRaw ? { model: jevModel, raw: jevRaw } : undefined,
  }
}

/**
 * Template fork flow: the chat is created from a template zip (seeded, no
 * generation, no model choice yet), then Jev classifies the first change
 * request and the routed model is attached to the first billable message.
 * Every turn afterwards rides the same model and its warm cache.
 */
export async function createForkedChat(input: {
  teamId: string
  prompt: string
  template: ChatTemplate
  explicitModelId?: ExplicitSelection
}): Promise<CreateChatResult> {
  const v0 = clientForTeam(input.teamId)

  let answers
  let jevModel = "not-consulted"
  let jevRaw: unknown = null
  try {
    const evaluation = await evaluateQuestions({
      state: buildState(input.prompt),
      questions: routingQuestions(),
    })
    answers = evaluation.answers
    jevModel = evaluation.model
    jevRaw = evaluation.raw
  } catch (error) {
    if (!(error instanceof JevUnavailableError)) throw error
  }

  const decision = routeChat({ answers, explicitModelId: input.explicitModelId })
  const metadata = {
    routedModelId: decision.modelId,
    policyVersion: POLICY_VERSION,
    routingQuestionsVersion: ROUTING_QUESTIONS_VERSION,
    jevModel,
    routingDecision: JSON.stringify(decision),
    templateId: input.template.id,
  }

  const forked = await v0.chats.createFromZip({
    url: await resolveForkUrl(input.template),
    metadata,
  })
  if (forked.error || !forked.data?.chat.id) {
    throw new Error(`Could not fork template chat: ${JSON.stringify(forked.error)}`)
  }
  const chatId = forked.data.chat.id

  const stream = await v0.messages.sendStream({
    chatId,
    message: input.prompt,
    modelConfiguration: { modelId: decision.modelId, imageGenerations: false },
  })

  return {
    chatId,
    decision,
    jev: jevRaw ? { model: jevModel, raw: jevRaw } : undefined,
    stream,
  }
}

export async function getRoutedModel(teamId: string, chatId: string): Promise<V0ModelId> {  const v0 = clientForTeam(teamId)
  const res = await v0.chats.get({ chatId })
  if (res.error || !res.data) {
    throw new Error(`Could not load chat ${chatId}`)
  }
  const routed = res.data.metadata?.routedModelId
  if (routed === "v0-mini" || routed === "v0-pro" || routed === "v0-max" || routed === "v0-max-fast") {
    return routed
  }
  return "v0-pro"
}

/**
 * Follow-up message. The chat's routed model is reused unless escalate=true,
 * which performs the one-way escalation to v0-max (costs one cold cache
 * write — that is the point we demo).
 */
export async function sendMessage(input: {
  teamId: string
  chatId: string
  message: string
  escalate?: boolean
}) {
  const v0 = clientForTeam(input.teamId)
  const routed = await getRoutedModel(input.teamId, input.chatId)
  const modelId: V0ModelId = input.escalate ? "v0-max" : routed

  const stream = await v0.messages.sendStream({
    chatId: input.chatId,
    message: input.message,
    modelConfiguration: { modelId, imageGenerations: false },
  })
  return { stream, modelId, escalated: Boolean(input.escalate) && modelId !== routed }
}

export async function resumeChat(teamId: string, chatId: string) {
  const v0 = clientForTeam(teamId)
  return v0.chats.resume({ chatId })
}

export async function listChats(teamId: string) {
  const v0 = clientForTeam(teamId)
  const res = await v0.chats.list({ limit: 20 })
  if (res.error) throw new Error(`Could not list chats: ${JSON.stringify(res.error)}`)
  return res.data
}
