import { env } from "./env"

/**
 * Template registry — the starter projects a chat can fork from.
 * A template zip lives at a public URL (Vercel Blob) so v0's servers can
 * fetch it for `chats.createFromZip`. A template with no configured URL is
 * hidden from the picker.
 */
export type ChatTemplate = {
  id: string
  name: string
  zipUrl: string
}

export function listTemplates(): ChatTemplate[] {
  const templates: ChatTemplate[] = []
  const storefrontUrl = env.storefrontZipUrl()
  if (storefrontUrl) {
    templates.push({ id: "storefront", name: "Storefront", zipUrl: storefrontUrl })
  }
  return templates
}

export function getTemplate(id: string): ChatTemplate | undefined {
  return listTemplates().find((t) => t.id === id)
}
