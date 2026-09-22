import { useCallback, useEffect, useRef, useState } from "react"
import type { RecentInfo } from "../engine"

export function useDelayedForget(onForget: (root: string) => void, delayMs = 5000) {
  const [pending, setPending] = useState<RecentInfo | null>(null)
  const pendingRef = useRef<RecentInfo | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callback = useRef(onForget)
  useEffect(() => void (callback.current = onForget), [onForget])
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const flush = useCallback(() => {
    clear()
    const repo = pendingRef.current
    pendingRef.current = null
    setPending(null)
    if (repo) callback.current(repo.root)
  }, [])
  const forget = useCallback(
    (repo: RecentInfo) => {
      flush()
      pendingRef.current = repo
      setPending(repo)
      timer.current = setTimeout(flush, delayMs)
    },
    [delayMs, flush],
  )
  const undo = useCallback(() => {
    clear()
    pendingRef.current = null
    setPending(null)
  }, [])
  useEffect(() => flush, [flush])
  return { pending, forget, undo }
}
