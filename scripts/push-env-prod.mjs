#!/usr/bin/env node
/**
 * Pushes the routing POC env vars from .env.local to the linked Vercel
 * project's Production environment. Values are piped straight into the
 * `vercel` CLI and never printed.
 */
import { readFileSync } from "node:fs"
import { execFileSync } from "node:child_process"

const VARS = [
  "AI_GATEWAY_API_KEY",
  "AI_GATEWAY_JEV_API_KEY",
  "ROOT_ORGS_ID",
  "VERCEL_ORGS_TOKEN",
  "ROOT_V0_KEY",
  "DEFAULT_TEAM_ID",
  "DEFAULT_TEAM_V0_KEY",
]

// parse .env.local
const values = {}
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^(?:export\s+)?([A-Za-z_0-9]+)=(.*)$/)
  if (!m) continue
  let v = m[2].trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  values[m[1]] = v
}

for (const name of VARS) {
  if (!values[name]) {
    console.log(`${name}: MISSING in .env.local, skipped`)
    continue
  }
  const add = () =>
    execFileSync("vercel", ["env", "add", name, "production", "--yes"], {
      input: values[name],
      stdio: ["pipe", "pipe", "pipe"],
    })
  try {
    add()
    console.log(`${name}: added`)
  } catch (err) {
    const out = String(err.stderr || err.message || "")
    if (/already exists/i.test(out)) {
      try {
        execFileSync("vercel", ["env", "rm", name, "production", "--yes"], { stdio: "pipe" })
        add()
        console.log(`${name}: replaced`)
      } catch (err2) {
        console.log(`${name}: FAILED on replace: ${String(err2.stderr || err2.message).slice(0, 200)}`)
      }
    } else {
      console.log(`${name}: FAILED: ${out.slice(0, 200)}`)
    }
  }
}
