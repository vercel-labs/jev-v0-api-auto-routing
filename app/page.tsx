import ChatWorkbench, { type TemplateOption } from "@/components/chat-workbench"
import { listTemplates } from "@/lib/templates"
import Link from "next/link"

export const dynamic = "force-dynamic"

export default function Home() {
  const templates: TemplateOption[] = listTemplates().map((t) => ({ id: t.id, name: t.name }))

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6 font-sans">
      <header className="flex items-baseline justify-between border-b border-neutral-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Jev → v0 Model Routing</h1>
          <p className="text-sm text-neutral-500">
            Jev classifies each new chat once; the model is fixed for the chat lifetime. Fork a
            template and small changes run cheap.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/orgs" className="text-xs text-neutral-500 underline">
            Organizations
          </Link>
          <span className="rounded-md bg-neutral-900 px-2 py-1 font-mono text-xs text-white">
            policy v0.3.0
          </span>
        </div>
      </header>
      <ChatWorkbench templates={templates} />
    </main>
  )
}
