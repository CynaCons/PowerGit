// Wire types shared with src/engine/PowerGit.Engine/Dtos.cs.

export type Health = {
  engine: string
  status: string
  gitPath: string
  gitVersion: string
}

export type RepoInfo = {
  name: string
  root: string
  branch: string
  /** Session id; repo routes live under /repos/<id> (v0.13.6). */
  id: string
}

/** GET /repos/sessions: lifecycle facts per open session (v0.13.11). */
export type SessionInfo = RepoInfo & { lastUsed: string; busy: boolean; watchers: number }

export type RevisionDto = {
  id: string
  parents: string[]
  author: string
  authorEmail: string
  committer: string
  committerEmail: string
  date: string
  subject: string
  body: string
  refs: string[]
  isHead: boolean
}

export type CommitDetail = {
  id: string
  parents: string[]
  author: string
  authorEmail: string
  committer: string
  committerEmail: string
  authorDate: string
  commitDate: string
  subject: string
  body: string
  refs: string[]
}

export type FileChange = { path: string; status: string; binary: boolean }
export type TreeEntry = { name: string; type: string; sha: string }
export type RemoteInfo = { name: string; url: string }
export type IgnorePreview = { pattern: string; files: string[]; count: number }

export type DiffOptions = { context: number; ws: boolean; full: boolean }

/** Diff or blob text. v0.13.11: `sizeBytes` is the object's real size and
 *  `truncated`/`truncatedReason` ("size" | "lines") say explicitly when the
 *  engine cut the text, instead of a sentinel appended to it. */
export type DiffDto = {
  path: string
  text: string
  binary: boolean
  sizeBytes: number
  truncated: boolean
  truncatedReason: "size" | "lines" | null
}
export type StatusFile = { path: string; status: string; staged: boolean }
export type RepoStatus = {
  branch: string
  unstagedCount: number
  stagedCount: number
  unstaged: StatusFile[]
  staged: StatusFile[]
  /** Null when the branch has no upstream (or HEAD is detached). */
  ahead: number | null
  behind: number | null
  /** e.g. "origin/main"; null without an upstream (v0.13.12). */
  upstream: string | null
}
export type RefItem = { name: string; fullName: string; target: string; current: boolean }
export type Submodule = { name: string; path: string; head: string | null }
export type RefTree = {
  branches: RefItem[]
  remotes: RefItem[]
  tags: RefItem[]
  submodules: Submodule[]
}
export type GitConfig = {
  userName: string | null
  userEmail: string | null
  autoCrlf: string | null
  scope: string
}
export type VsCodeInfo = { found: boolean; path: string | null; applied: boolean }

export type GitJob = {
  id: string
  kind: string
  status: "running" | "completed" | "failed"
  output: string | null
  error: string | null
  /** Sanitized command context, e.g. "git fetch --prune origin" (v0.13.12). */
  command: string | null
  startedAt: string | null
  finishedAt: string | null
  cancelled: boolean
}
export type JobStarted = { id: string; kind: string }

export type StashInfo = { reference: string; id: string; subject: string }

/** Coarse classification of a GET /events change notification: "refs"
 *  (HEAD/branch/tag moved — the commit list, ref tree, and status may all be
 *  stale) is the superset of "status" (only the index changed). */
export type ChangeKind = "none" | "status" | "refs"
