// v0.21.10: opening a row of the every-repo inbox. The per-review routes
// stay under /repos/{id}/..., so a review can only be opened once its
// repository is the window's own: the same repository opens in place, any
// other opens the repository first (openRepo, awaited) and then the review.

import type { AgentReviewEverywhereItem } from "../../engine"

export type ReviewOpenPlan =
  { action: "open"; sessionId: string } | { action: "switch"; root: string; sessionId: string }

export function reviewOpenPlan(
  item: Pick<AgentReviewEverywhereItem, "repo"> & { session: { id: string } },
  windowRepoId: string | null,
): ReviewOpenPlan {
  const sessionId = item.session.id
  return item.repo.id === windowRepoId
    ? { action: "open", sessionId }
    : { action: "switch", root: item.repo.root, sessionId }
}
