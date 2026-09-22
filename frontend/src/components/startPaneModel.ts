import type { RecentInfo } from "../engine"

export type RecentGroup = "Pinned" | "Today" | "This week" | "Earlier"

const DAY = 86_400_000

export function relativeTime(value: string | undefined, now = new Date()): string {
  if (!value) return "—"
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime())
  if (elapsed < 60_000) return "now"
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / 3_600_000)} h ago`
  if (elapsed < 2 * DAY) return "yesterday"
  if (elapsed < 14 * DAY) return `${Math.floor(elapsed / DAY)} d ago`
  const weeks = Math.floor(elapsed / (7 * DAY))
  return weeks === 1 ? "a week ago" : `${weeks} weeks ago`
}

export function recentGroup(repo: RecentInfo, now = new Date()): RecentGroup {
  if (repo.pinned) return "Pinned"
  if (!repo.lastOpened) return "Earlier"
  const date = new Date(repo.lastOpened)
  if (Number.isNaN(date.getTime())) return "Earlier"
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const opened = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  if (opened === today) return "Today"
  if (today - opened < 7 * DAY) return "This week"
  return "Earlier"
}

export function groupRecents(recents: RecentInfo[], now = new Date()) {
  const order: RecentGroup[] = ["Pinned", "Today", "This week", "Earlier"]
  return order
    .map((label) => ({ label, items: recents.filter((repo) => recentGroup(repo, now) === label) }))
    .filter((group) => group.items.length > 0)
}
