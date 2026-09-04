import { invoke } from "@tauri-apps/api/core"
import { EngineClient } from "./client"

/** Engine base URL. Override with VITE_ENGINE_URL (e.g. remote engine or
 *  demo setups); the packaged app otherwise asks the Tauri shell. */
const DEFAULT_URL = "http://127.0.0.1:7733"

/**
 * Resolves the engine location once. Under Tauri, `lib.rs` spawned the
 * sidecar on 7733 (first choice) or an OS-assigned port when 7733 was held
 * (docs/agents/memories/engine-port.md), and generated the per-launch token
 * (engine-token.md); the `engine_config` command hands both over. Outside
 * Tauri (Vite dev, Pages demo, e2e) the env values are used as-is.
 */
export async function bootstrapEngine(): Promise<EngineClient> {
  let baseUrl: string = import.meta.env.VITE_ENGINE_URL ?? DEFAULT_URL
  let token: string = import.meta.env.VITE_ENGINE_TOKEN ?? ""
  if (!import.meta.env.VITE_ENGINE_URL && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    try {
      const cfg = await invoke<{ baseUrl: string; token: string }>("engine_config")
      baseUrl = cfg.baseUrl
      token = cfg.token
    } catch {
      // Older host build without the command, or an IPC failure — keep the defaults.
    }
  }
  return new EngineClient({ baseUrl, token, repoId: null })
}

const PIN_PARAM = "repo"

/** `?repo=<id>` pins this window to a session (v0.13.12): a second window
 *  opening another repository can no longer flip this one on reload. */
export function pinnedRepoId(
  search: string = typeof window === "undefined" ? "" : window.location.search,
): string | null {
  const id = new URLSearchParams(search).get(PIN_PARAM)
  return id && /^[a-f0-9]{6,40}$/i.test(id) ? id : null
}

/** Writes the pin into the URL without a navigation (no-op outside a browser). */
export function rememberPinnedRepo(id: string | null): void {
  if (typeof window === "undefined" || typeof window.history?.replaceState !== "function") return
  try {
    const url = new URL(window.location.href)
    if (id) url.searchParams.set(PIN_PARAM, id)
    else url.searchParams.delete(PIN_PARAM)
    window.history.replaceState(window.history.state, "", url.toString())
  } catch {
    // tauri:// URLs on some WebKit builds reject replaceState; the pin is a convenience.
  }
}
