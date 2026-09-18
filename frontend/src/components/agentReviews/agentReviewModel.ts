import type { AgentReviewStatus, AgentReviewSummary } from "../../engine"

export function ageOf(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(iso)) / 1000))
  if (seconds < 60) return "just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}
export const badgeOf = (sessions: AgentReviewSummary[]) =>
  sessions.filter((s) => (s.mode === "wait" && s.status === "pending") || (s.mode === "notify" && s.unread)).length
export const statusLabel = (status: AgentReviewStatus) =>
  ({
    pending: "Pending",
    approved: "Approved",
    changes_requested: "Changes requested",
    cancelled: "Cancelled",
    expired: "Expired",
  })[status]
