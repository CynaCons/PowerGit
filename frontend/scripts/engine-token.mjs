// Dev-time engine token. The engine refuses every request without it
// (src/engine/PowerGit.Engine/EngineAuth.cs). Under Tauri the shell generates
// one per launch; in dev, engine.ps1 and vite.config.ts share this file so the
// engine and the UI agree without a well-known constant. Never commit it.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const TOKEN_FILE = join(dirname(fileURLToPath(import.meta.url)), "..", ".engine-token")

export function readOrCreateToken() {
  const fromEnv = process.env.POWERGIT_ENGINE_TOKEN ?? process.env.VITE_ENGINE_TOKEN
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  if (existsSync(TOKEN_FILE)) {
    const existing = readFileSync(TOKEN_FILE, "utf8").trim()
    if (existing) return existing
  }
  const token = randomBytes(32).toString("hex")
  try {
    writeFileSync(TOKEN_FILE, token + "\n", { flag: "wx" })
    return token
  } catch {
    return readFileSync(TOKEN_FILE, "utf8").trim() // lost the race; use the winner's
  }
}
