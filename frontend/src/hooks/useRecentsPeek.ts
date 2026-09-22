import { useEffect, useRef, useState } from "react"
import type { RecentInfo, RepoPeek } from "../engine"
import { useEngineBase } from "../engine"

export function useRecentsPeek(recents: RecentInfo[], selectedRoot?: string | null) {
  const engine = useEngineBase()
  const [peeks, setPeeks] = useState<Map<string, RepoPeek>>(new Map())
  const [detail, setDetail] = useState<RepoPeek | null>(null)
  const [loading, setLoading] = useState(false)
  const cache = useRef(new Map<string, RepoPeek>())
  const rootsKey = recents.map((repo) => repo.root).join("\0")

  useEffect(() => {
    const controller = new AbortController()
    const roots = rootsKey ? rootsKey.split("\0") : []
    const load = async () => {
      if (roots.length === 0) return setPeeks(new Map())
      try {
        const values = await engine.peekRepos(roots, controller.signal)
        setPeeks(new Map(values.map((peek) => [peek.root, peek])))
      } catch {
        // A preview is enrichment; opening the recents pane must never fail with it.
      }
    }
    void load()
    const timer = setInterval(() => void load(), 10_000)
    return () => {
      controller.abort()
      clearInterval(timer)
    }
    // rootsKey deliberately represents the list without depending on its array identity.
  }, [engine, rootsKey])

  useEffect(() => {
    const controller = new AbortController()
    if (!selectedRoot) {
      setDetail(null)
      return () => controller.abort()
    }
    const hit = cache.current.get(selectedRoot)
    if (hit) {
      setDetail(hit)
      return () => controller.abort()
    }
    setLoading(true)
    engine
      .peekRepo(selectedRoot, 8, controller.signal)
      .then((value) => {
        cache.current.set(selectedRoot, value)
        setDetail(value)
      })
      .catch(() => setDetail(null))
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [engine, selectedRoot])

  return { peeks, detail, loading }
}
