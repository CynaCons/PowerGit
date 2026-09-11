import { useCallback, useEffect, useRef, useState } from "react"
import { describeThrown, type EngineClient, type GitConfig } from "../../engine"

// Git config for one scope, applied as it is edited (v0.18.0). Every change
// is a one-key `PUT /config` patch: the engine leaves a key it is not
// given alone (null) and unsets one given as "", so a patch carries only
// the keys that changed and never the rest of the form. Saves go through
// one queue, one after another; a key edited twice before its save ran is
// sent once with the latest value, and the answer of the last save is what
// the fields show next. A failed save shows in the section's status and
// re-reads the scope so the fields tell the truth again.

export type GitScope = "local" | "global"
export type GitConfigKey = "userName" | "userEmail" | "autoCrlf" | "editor" | "diffTool" | "mergeTool"
/** "" unsets the key at this scope. */
export type GitConfigPatch = Partial<Record<GitConfigKey, string>>
export type GitConfigStatus = "idle" | "saving" | "saved" | { error: string }

export type GitConfigApi = {
  cfg: GitConfig | null
  patch: (partial: GitConfigPatch) => void
  status: GitConfigStatus
  reload: () => void
}

type Queued = { global: boolean; patch: GitConfigPatch }

export function useGitConfig(engine: EngineClient, scope: GitScope): GitConfigApi {
  const [cfg, setCfg] = useState<GitConfig | null>(null)
  const [status, setStatus] = useState<GitConfigStatus>("idle")
  const [tick, setTick] = useState(0)
  const scopeRef = useRef(scope)
  scopeRef.current = scope
  const queue = useRef<Queued[]>([])
  const draining = useRef(false)

  // The fields show one scope at a time, so re-read when it flips. The read
  // is cancelled on the way out: flipping twice quickly (or React's
  // double-mount in dev) otherwise lets the earlier answer land last and
  // show the other scope's values, or blank the fields altogether.
  const loadedScope = useRef<string | null>(null)
  useEffect(() => {
    let cancelled = false
    // Blank the fields only when the scope they show actually changed. A
    // re-run for any other reason (a reload after an error, the page
    // re-rendering while the app refreshes behind it) must not flash the
    // fields empty.
    if (loadedScope.current !== null && loadedScope.current !== scope) setCfg(null)
    engine
      .config(scope)
      .then((c) => {
        if (cancelled) return
        loadedScope.current = scope
        setCfg(c)
      })
      .catch((e: unknown) => {
        if (!cancelled) setStatus({ error: describeThrown(e) })
      })
    return () => {
      cancelled = true
    }
  }, [engine, scope, tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    setStatus("saving")
    try {
      while (queue.current.length > 0) {
        const next = queue.current.shift()!
        const saved = await engine.saveConfig({ ...next.patch, global: next.global })
        // The answer describes the scope it wrote; show it only while that
        // scope is still the one on screen, and only when nothing newer is
        // waiting (the last answer wins).
        const savedScope: GitScope = next.global ? "global" : "local"
        if (queue.current.length === 0 && savedScope === scopeRef.current) setCfg(saved)
      }
      setStatus("saved")
    } catch (e) {
      queue.current = []
      setStatus({ error: describeThrown(e) })
      reload()
    } finally {
      draining.current = false
    }
  }, [engine, reload])

  const patch = useCallback(
    (partial: GitConfigPatch) => {
      setCfg((c) => (c ? { ...c, ...partial } : c))
      const global = scopeRef.current === "global"
      const last = queue.current[queue.current.length - 1]
      // Coalesce with the waiting entry for the same scope: the latest
      // value per key wins and one request carries them.
      if (last && last.global === global) Object.assign(last.patch, partial)
      else queue.current.push({ global, patch: { ...partial } })
      void drain()
    },
    [drain],
  )

  return { cfg, patch, status, reload }
}
