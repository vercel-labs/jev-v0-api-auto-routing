import { issueSignedToken, presignUrl } from "@vercel/blob"
import { env } from "./env"

/**
 * Template registry — the starter projects a chat can fork from.
 * A template zip lives in Vercel Blob (private access). At fork time we sign
 * a short-lived download URL for v0's zip fetcher via getDownloadUrl.
 * A template with no configured URL is hidden from the picker.
 */
export type ChatTemplate = {
  id: string
  name: string
  /** Permanent blob URL (auth-required) or any public URL. */
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

/**
 * Returns a URL v0's servers can fetch right now: for private Blob objects,
 * a short-lived presigned GET URL (valid 10 minutes, scoped to the zip
 * pathname, read-only); for any other URL, the URL itself.
 */
export async function resolveForkUrl(template: ChatTemplate): Promise<string> {
  try {
    const url = new URL(template.zipUrl)
    if (url.hostname.includes(".private.")) {
      const pathname = url.pathname.replace(/^\//, "")
      const issued = await issueSignedToken({
        pathname,
        operations: ["get"],
        validUntil: Date.now() + 10 * 60 * 1000,
      })
      const presigned = await presignUrl(issued, {
        operation: "get",
        pathname,
        access: "private",
        validUntil: Date.now() + 10 * 60 * 1000,
      })
      return presigned.presignedUrl
    }
  } catch {
    // fall through: treat as an ordinary public URL
  }
  return template.zipUrl
}
