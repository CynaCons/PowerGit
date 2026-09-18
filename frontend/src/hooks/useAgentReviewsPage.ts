import { useCallback, useState } from "react"

export function useAgentReviewsPage() {
  const [open, setOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const openList = useCallback(() => {
    setOpen(true)
    setSessionId(null)
  }, [])
  const openSession = useCallback((id: string) => {
    setOpen(true)
    setSessionId(id)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    setSessionId(null)
  }, [])
  return { open, sessionId, openList, openSession, close }
}
