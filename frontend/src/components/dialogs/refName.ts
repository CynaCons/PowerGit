// git check-ref-format, the cases a person actually types (v0.18.11): the
// "appears as" chip turns red with the reason before the engine is asked,
// and the primary stays disabled so Enter never sends a bad name. The
// wording is the interface's, short enough to sit beside the chip.
//
//   git check-ref-format --branch: no component may begin with "." or end
//   with ".lock"; no ".." anywhere; no ASCII control character, space, ~,
//   ^, :, ?, *, [ or \; no leading, trailing or double "/"; no trailing
//   "."; no "@{"; not the single "@"; a branch name may not start with "-".

/** The reason git would refuse `name`, "already exists" against `existing`, or null when it is fine. */
export function refNameError(name: string, existing: readonly string[] = []): string | null {
  if (name.length === 0) return "a name is required"
  if (/\s/.test(name)) return "no spaces"
  if (name.includes("..")) return 'no ".."'
  if (name.startsWith("/") || name.endsWith("/") || name.includes("//")) return 'no leading, trailing or double "/"'
  if (name.endsWith(".lock") || name.includes(".lock/")) return 'cannot end in ".lock"'
  if (name.includes("@{")) return 'no "@{"'
  if (name === "@") return 'not "@"'
  if (name.endsWith(".") || /(^|\/)\./.test(name)) return 'no "." at the start or end of a part'
  // eslint-disable-next-line no-control-regex
  if (/[~^:?*[\\\x00-\x1f\x7f]/.test(name)) return "no ~ ^ : ? * [ \\ or control characters"
  if (name.startsWith("-")) return 'cannot start with "-"'
  if (existing.includes(name)) return "already exists"
  return null
}

/** A local branch name suggested from a remote-tracking one: `origin/feature/x` → `feature/x`. */
export function localNameFor(remote: string, remoteNames: readonly string[]): string {
  for (const r of remoteNames) if (remote.startsWith(r + "/")) return remote.slice(r.length + 1)
  const slash = remote.indexOf("/")
  return slash > 0 ? remote.slice(slash + 1) : remote
}
