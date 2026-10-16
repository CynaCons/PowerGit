import { useCallback, useRef } from "react"
import type { AgentReviewEverywhereItem, EngineClient, RepoInfo } from "../engine"
import { focusGrid } from "./focusGrid"
import { useAgentReviewOpen } from "./useAgentReviewOpen"
import { useAgentReviews } from "./useAgentReviews"
import { useAgentReviewsPage } from "./useAgentReviewsPage"

// The agent reviews' place in the window (v0.21.10): the list behind the
// rail badge and the inbox covers every open repository (the list hook asks
// the engine-level `/agent-reviews` with the repo-less base client), and the
// one handler a row runs switches this window's repository first when the
// review lives in another one. The rail's button closes the views the page
// replaces before showing it, and closing the page returns the focus to the
// grid — the same shape as Settings, which outranks the start pane too
// (v0.21.6, owner: "the settings view still overrides all the other views").

/** The inbox data plus the row handler, built here and handed to
 *  AgentReviewsView as its one `inbox` prop. */
export type AgentReviewsInbox = {
  sessions: AgentReviewEverywhereItem[]
  refresh: () => Promise<void>
  openError: string | null
  openReview: (item: AgentReviewEverywhereItem) => void
  clearError: () => void
}

export function useAgentReviewsChrome({
  base,
  openRepo,
  windowRepoId,
  closeOthers,
}: {
  base: EngineClient
  openRepo: (path: string) => Promise<RepoInfo>
  windowRepoId: string | null
  /** Close the views the reviews page replaces (file history, settings, start). */
  closeOthers: () => void
}) {
  const page = useAgentReviewsPage()
  const { openList: showList, close: closePage } = page
  const list = useAgentReviews({ engine: base })
  const open = useAgentReviewOpen({ openRepo, windowRepoId, openSession: page.openSession })
  // closeOthers is a fresh lambda every App render; the rail reads openList at
  // click time (useStable), so keep the identity stable across renders.
  const closeOthersRef = useRef(closeOthers)
  closeOthersRef.current = closeOthers
  const openList = useCallback(() => {
    closeOthersRef.current()
    showList()
  }, [showList])
  const close = useCallback(() => {
    closePage()
    focusGrid()
  }, [closePage])
  const inbox: AgentReviewsInbox = {
    sessions: list.sessions,
    refresh: list.refresh,
    openError: open.openError,
    openReview: open.openReview,
    clearError: open.clearError,
  }
  return { page, badge: list.badge, inbox, openList, close }
}
