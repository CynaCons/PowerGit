import { readOrCreateToken } from "../scripts/engine-token.mjs"

/** Direct engine access from specs. The UI under test gets the same token
 *  from vite.config.ts (dev) or VITE_ENGINE_TOKEN (preview builds). */
export const ENGINE_URL = process.env.POWERGIT_ENGINE_URL ?? "http://127.0.0.1:7733"
export const ENGINE_TOKEN = readOrCreateToken()
export const engineHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  Authorization: `Bearer ${ENGINE_TOKEN}`,
  ...extra,
})
