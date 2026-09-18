export function reviewKeyOf({
  commitId,
  pending,
  headId,
}: {
  commitId: string | null
  pending: "worktree" | "index" | null
  headId: string | null
}): string | null {
  if (commitId) return commitId
  return pending && headId ? `${headId}-${pending}` : null
}

export function headOfKey(key: string): string | null {
  const match = /^([0-9a-f]{40}(?:[0-9a-f]{24})?)-(?:worktree|index)$/.exec(key)
  return match?.[1] ?? null
}
