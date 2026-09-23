"use client"

import { useCallback, useEffect, useState } from "react"

type OrgTeam = {
  teamId: string
  slug: string
  name: string
  billingPlan?: string
}

export default function OrgsPanel() {
  const [teams, setTeams] = useState<OrgTeam[]>([])
  const [newTeamName, setNewTeamName] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  const refreshTeams = useCallback(async () => {
    try {
      const res = await fetch("/api/orgs/teams")
      const data = await res.json()
      setTeams(data.teams ?? [])
    } catch {
      setTeams([])
    }
  }, [])

  useEffect(() => {
    // Initial load on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshTeams()
  }, [refreshTeams])

  async function provisionTeam() {
    if (!newTeamName.trim()) return
    setMessage("Provisioning…")
    try {
      const res = await fetch("/api/orgs/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTeamName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setMessage(
        `${data.created ? "Created" : "Reused"} team ${data.link.teamId} (${data.link.slug}) · v0 key ${data.stored ? "already stored" : "minted and stored"}.`,
      )
      setNewTeamName("")
      refreshTeams()
    } catch (e) {
      setMessage(`Failed: ${(e as Error).message}`)
    }
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
        Organizations
      </h2>
      <ul className="mb-3 space-y-1 text-sm">
        {teams.length === 0 && <li className="text-neutral-400">No teams loaded.</li>}
        {teams.map((team) => (
          <li key={team.teamId} className="flex justify-between gap-2">
            <span className="truncate">{team.name}</span>
            <span className="font-mono text-xs text-neutral-500">{team.billingPlan ?? "—"}</span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input
          value={newTeamName}
          onChange={(e) => setNewTeamName(e.target.value)}
          placeholder="New tenant name"
          className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
        />
        <button
          onClick={provisionTeam}
          className="rounded-lg border border-neutral-900 px-3 py-1.5 text-sm"
        >
          Provision
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-neutral-600">{message}</p>}
    </div>
  )
}
