import { useCallback, useRef, useState } from "react"
import type { AgentReviewEverywhereItem, RepoInfo } from "../engine"
import { describeThrown } from "../engine"
import { reviewOpenPlan } from "../components/agentReviews/reviewOpen"

// v0.21.10: one handler behind every inbox row, once the list covers every
// open repository. The per-review routes are bound to the row's repository,
// so the ones in another repository need that repository opened first
// (openRepo, awaited); a failed switch leaves the list up with the reason
// shown on it.

export function useAgentReviewOpen({
  openRepo,
  windowRepoId,
  openSession,
}: {
  openRepo: (path: string) => Promise<RepoInfo>
  windowRepoId: string | null
  openSession: (id: string) => void
}) {
  const [error, setError] = useState<string | null>(null)
  // The repository id the click is judged against: what the window shows
  // when it lands (not what a stale closure remembered).
  const repoIdRef = useRef(windowRepoId)
  repoIdRef.current = windowRepoId
  const openReview = useCallback(
    async (item: AgentReviewEverywhereItem) => {
      const plan = reviewOpenPlan(item, repoIdRef.current)
      if (plan.action === "open") {
        openSession(plan.sessionId)
        return
      }
      setError(null)
      try {
        await openRepo(plan.root)
        openSession(plan.sessionId)
      } catch (e) {
        setError(describeThrown(e))
      }
    },
    [openRepo, openSession],
  )
  const clearError = useCallback(() => setError(null), [])
  return { openReview, openError: error, clearError }
}
