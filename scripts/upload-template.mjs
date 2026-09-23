#!/usr/bin/env node
/**
 * Uploads the template zip to Vercel Blob and prints the public URL for
 * TEMPLATE_STOREFRONT_URL.
 *
 * Requires BLOB_READ_WRITE_TOKEN (connect a Blob store to the project, then
 * `vercel env pull .env.local`).
 *
 * Run: node --env-file=.env.local scripts/upload-template.mjs <path-to-zip>
 */
import { put } from "@vercel/blob"
import { readFileSync } from "node:fs"

const zipPath = process.argv[2]
if (!zipPath) {
  console.error("Usage: node --env-file=.env.local scripts/upload-template.mjs <path-to-zip>")
  process.exit(1)
}
if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is not set. Connect a Blob store and run: vercel env pull .env.local --yes")
  process.exit(1)
}

const content = readFileSync(zipPath)
// Private access: the zip needs auth to fetch. The fork flow signs a
// short-lived download URL at request time (lib/templates.ts).
const blob = await put("templates/storefront.zip", content, {
  access: "private",
  addRandomSuffix: false,
})

console.log(`Uploaded ${zipPath} (${content.length} bytes)`)
console.log(`Blob URL (permanent, auth-required): ${blob.url}`)
console.log("Set this as TEMPLATE_STOREFRONT_URL in .env.local and in the Vercel project env.")
