import OrgsPanel from "@/components/orgs-panel"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function OrgsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 p-6 font-sans">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-neutral-500">
            Vercel Organizations API: list teams, create child teams, mint v0 keys. Idempotent —
            provisioning an existing tenant reuses it.
          </p>
        </div>
        <Link href="/" className="text-xs text-neutral-500 underline">
          ← Back to routing
        </Link>
      </header>
      <OrgsPanel />
    </main>
  )
}
