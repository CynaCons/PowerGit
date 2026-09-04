import { readOrCreateToken } from "../scripts/engine-token.mjs"

/** Direct engine access from specs. The UI under test gets the same token
 *  from vite.config.ts (dev) or VITE_ENGINE_TOKEN (preview builds). */
export const ENGINE_URL = process.env.POWERGIT_ENGINE_URL ?? "http://127.0.0.1:7733"
export const ENGINE_TOKEN = readOrCreateToken()
export const engineHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  Authorization: `Bearer ${ENGINE_TOKEN}`,
  ...extra,
})

/** Session-scoped base (v0.13.6): `${ENGINE_URL}/repos/<id>` for the engine's current repo. */
export async function repoBase(): Promise<string> {
  const res = await fetch(`${ENGINE_URL}/repos/current`, { headers: engineHeaders() })
  if (!res.ok) throw new Error(`no current repo on the engine: http ${res.status}`)
  const info = (await res.json()) as { id: string }
  return `${ENGINE_URL}/repos/${info.id}`
}
