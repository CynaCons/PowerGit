import type { RepoInfo } from "../engine"

type ResolveStartRepoOptions = {
  pinned: string | null
  openPath: string | null
  openLast: boolean
  repoInfo: (id: string) => Promise<RepoInfo | null>
  currentRepo: () => Promise<RepoInfo | null>
  recents: () => Promise<RepoInfo[]>
  openRepo: (path: string) => Promise<RepoInfo>
  onPinnedMissing?: (id: string) => void
  onOpenFailure?: (path: string, error: unknown) => void
}

/** Startup-only repository precedence (v0.18.19). Opening an explicit path
 * or saved recent is best effort so a stale path never blocks the shell. */
export async function resolveStartRepo({
  pinned,
  openPath,
  openLast,
  repoInfo,
  currentRepo,
  recents,
  openRepo,
  onPinnedMissing,
  onOpenFailure,
}: ResolveStartRepoOptions): Promise<RepoInfo | null> {
  if (openPath) {
    try {
      return await openRepo(openPath)
    } catch (error) {
      onOpenFailure?.(openPath, error)
    }
  }

  if (pinned) {
    const info = await repoInfo(pinned)
    if (info) return info
    onPinnedMissing?.(pinned)
  }

  const current = await currentRepo()
  if (current) return current
  if (!openLast) return null

  const recent = (await recents())[0]
  if (!recent) return null
  try {
    return await openRepo(recent.root)
  } catch (error) {
    onOpenFailure?.(recent.root, error)
    return null
  }
}
