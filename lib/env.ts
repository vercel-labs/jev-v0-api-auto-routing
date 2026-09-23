export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    )
  }
  return value
}

export const env = {
  aiGatewayKey: () => requireEnv("AI_GATEWAY_API_KEY"),
  /** Dedicated Jev key; optional — falls back to AI_GATEWAY_API_KEY. */
  aiGatewayJevKey: () => process.env.AI_GATEWAY_JEV_API_KEY ?? process.env.AI_GATEWAY_API_KEY,
  rootOrgsId: () => requireEnv("ROOT_ORGS_ID"),
  vercelToken: () => requireEnv("VERCEL_ORGS_TOKEN"),
  v0RootKey: () => process.env.ROOT_V0_KEY,
  defaultTeamV0Key: () => process.env.DEFAULT_TEAM_V0_KEY,
  defaultTenantTeamId: () => requireEnv("DEFAULT_TEAM_ID"),
  /** Public URL of the storefront template zip (Vercel Blob). */
  storefrontZipUrl: () => process.env.TEMPLATE_STOREFRONT_URL,
}
