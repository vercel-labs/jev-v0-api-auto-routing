import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"

/**
 * Demo-grade persistence for tenant v0 API keys minted through the orgs
 * provisioning flow. Stored outside git (data/ is gitignored). A real
 * product would keep these in a database with encryption at rest.
 */

const DATA_DIR = join(process.cwd(), "data")
const KEYS_FILE = join(DATA_DIR, "tenant-keys.json")

export function readTenantKeys(): Record<string, string> {
  try {
    return JSON.parse(readFileSync(KEYS_FILE, "utf8")) as Record<string, string>
  } catch {
    return {}
  }
}

export function writeTenantKeys(keys: Record<string, string>) {
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2) + "\n")
}

export function saveTenantKey(teamId: string, apiKey: string) {
  const keys = readTenantKeys()
  keys[teamId] = apiKey
  writeTenantKeys(keys)
}
