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

/**
 * Which diff a file reset undoes (v0.15.5). The Browse panel shows three of
 * them and "reset" means undoing the one on screen: "head" sends index and
 * working tree back to HEAD (Git Extensions' "Reset file(s) to HEAD"),
 * "worktree" restores the file from the index and leaves staged work alone,
 * "index" unstages and leaves the file on disk untouched.
 */
export type ResetScope = "head" | "worktree" | "index"

/** One round trip per selection: the changed files plus the first file's diff. */
export type CommitChanges = { files: FileChange[]; firstDiff: DiffDto | null }

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

/** v0.15.0: the operation the repository is in the middle of. A stopped
 *  merge/rebase/cherry-pick/revert is a state, not an error (Git Extensions
 *  parity); "none" is the ordinary case. */
export type RepoOperationKind = "merging" | "rebasing" | "cherry-picking" | "reverting"
export type RepoOperationState = "none" | RepoOperationKind

/** Which index stages `git ls-files -u` reports for one unmerged path. */
export type ConflictKind =
  | "both-modified"
  | "added-by-both"
  | "deleted-by-us"
  | "deleted-by-them"
  | "added-by-us"
  | "added-by-them"
  | "both-deleted"

/** One unmerged path. Stage numbers are git's: 1 base, 2 ours, 3 theirs;
 *  during a rebase "ours" is the branch being rebased onto (the UI relabels). */
export type ConflictFile = {
  path: string
  hasBase: boolean
  hasOurs: boolean
  hasTheirs: boolean
  baseSha: string | null
  oursSha: string | null
  theirsSha: string | null
  kind: ConflictKind
}

export type RepoOperation = {
  kind: RepoOperationKind
  /** Branch being rebased (rebase-merge/head-name) or merged (MERGE_MSG). */
  headName: string | null
  onto: string | null
  ontoName: string | null
  step: number | null
  total: number | null
  /** The commit the sequencer stopped at. */
  stoppedSha: string | null
  interactive: boolean
  /** MERGE_MSG / SQUASH_MSG while merging. */
  message: string | null
}

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
  /** v0.15.0; engines before it omit the three fields (treated as "none"). */
  state?: RepoOperationState
  operation?: RepoOperation | null
  conflicts?: ConflictFile[] | null
}

/** POST /merge (v0.15.0, Git Extensions FormMergeBranch). `squash` excludes
 *  `ff: "no"`; a dirty tree is accepted only with `autostash`. */
export type MergeOptions = {
  branch: string
  ff: "only" | "allow" | "no"
  squash: boolean
  message: string | null
  autostash: boolean
  noCommit: boolean
}

export type RebaseOptions = { autosquash: boolean; rebaseMerges: boolean; autostash: boolean }

/** A todo line as git generated it (POST /rebase/todo). Lines without a sha
 *  (label, reset, merge, exec, …) are read-only. */
export type RebaseTodoLine = { action: string; sha: string | null; subject: string | null; raw: string }
export type RebaseTodo = { lines: RebaseTodoLine[]; onto: string; headName: string }

/** One line the UI sends back for an interactive rebase: pick | reword | edit
 *  | squash | fixup | drop with `sha`; reword and squash may carry `message`;
 *  anything else is written from `raw` verbatim. */
export type RebaseTodoEntry = { action: string; sha: string | null; message: string | null; raw: string | null }

export type SequencerOp = "rebase" | "cherry-pick" | "revert"
export type SequencerAction = "continue" | "skip" | "abort"

/** GE HandleConflictSelectSide, stage based (so a rebase's inverted ours /
 *  theirs is a labelling matter in the UI only). */
export type ConflictTake = "ours" | "theirs" | "base" | "mark" | "delete"
export type ConflictStage = 1 | 2 | 3

export type ArchiveFormat = "zip" | "tar.gz"
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
  /** Which scope these values were read at: "local", "global" or the effective view. */
  scope: string
  /** v0.15.0 settings; a pre-v0.15 engine omits them. */
  editor?: string | null
  diffTool?: string | null
  mergeTool?: string | null
  /** Where the identity actually comes from: "local" | "global" | "system" | null. */
  userNameOrigin?: string | null
  userEmailOrigin?: string | null
}

/** A diff/merge tool or editor the engine found on this machine (v0.15.0). */
export type ToolInfo = {
  name: string
  label: string
  path: string | null
  found: boolean
  /** Which roles it can fill: "diff", "merge", "editor". */
  kinds: string[]
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

/** One git invocation as the Git console shows it (v0.15.1). The engine
 *  keeps the last 50 per session; `id` is monotonic so the console can ask
 *  for a delta. `command` and `output` are sanitized engine-side — a push
 *  URL can carry a token (GitCommandSanitizer.cs). */
export type GitLogEntry = {
  id: number
  /** UTC ISO-8601. */
  at: string
  /** e.g. "git fetch --prune origin". */
  command: string
  /** git's exit code; -1 when it timed out or was cancelled. */
  exitCode: number
  durationMs: number
  /** stdout then stderr, capped at 8 KB engine-side. */
  output: string
  truncated: boolean
}

export type StashInfo = { reference: string; id: string; subject: string }

/** Coarse classification of a GET /events change notification: "refs"
 *  (HEAD/branch/tag moved — the commit list, ref tree, and status may all be
 *  stale) is the superset of "status" (only the index changed). */
export type ChangeKind = "none" | "status" | "refs"
