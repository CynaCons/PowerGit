import type { ConflictFile, RepoOperation, RepoStatus, StatusFile } from "../engine"

const filesEqual = (a: StatusFile[] | null | undefined, b: StatusFile[] | null | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every(
      (f, i) =>
        f.path === b[i].path &&
        f.status === b[i].status &&
        f.staged === b[i].staged &&
        f.skipWorktree === b[i].skipWorktree &&
        f.assumeUnchanged === b[i].assumeUnchanged,
    ))
const conflictsEqual = (a: ConflictFile[] | null | undefined, b: ConflictFile[] | null | undefined) =>
  a === b ||
  (!!a &&
    !!b &&
    a.length === b.length &&
    a.every((f, i) => Object.keys(f).every((key) => f[key as keyof ConflictFile] === b[i][key as keyof ConflictFile])))
const operationEqual = (a: RepoOperation | null | undefined, b: RepoOperation | null | undefined) =>
  a === b ||
  (!!a && !!b && Object.keys(a).every((key) => a[key as keyof RepoOperation] === b[key as keyof RepoOperation]))

/** Status polling must preserve referential identity when git returned no change. */
export function statusEquals(a: RepoStatus | null, b: RepoStatus | null): boolean {
  return (
    a === b ||
    (!!a &&
      !!b &&
      a.branch === b.branch &&
      a.unstagedCount === b.unstagedCount &&
      a.stagedCount === b.stagedCount &&
      a.ahead === b.ahead &&
      a.behind === b.behind &&
      a.upstream === b.upstream &&
      a.state === b.state &&
      filesEqual(a.unstaged, b.unstaged) &&
      filesEqual(a.staged, b.staged) &&
      filesEqual(a.hidden, b.hidden) &&
      operationEqual(a.operation, b.operation) &&
      conflictsEqual(a.conflicts, b.conflicts))
  )
}
