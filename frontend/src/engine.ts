export const ENGINE_URL = "http://127.0.0.1:7733"

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
}

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
export type DiffDto = { path: string; text: string; binary: boolean }
export type StatusFile = { path: string; status: string; staged: boolean }
export type RepoStatus = {
  branch: string
  unstagedCount: number
  stagedCount: number
  unstaged: StatusFile[]
  staged: StatusFile[]
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

async function json<T>(res: Response): Promise<T> {
  const body = await res.json()
  if (!res.ok) throw new Error(body.error ?? `http ${res.status}`)
  return body as T
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  const res = await fetch(`${ENGINE_URL}/health`, { signal })
  return json<Health>(res)
}

export async function openRepo(path: string): Promise<RepoInfo> {
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  return json<RepoInfo>(res)
}

export async function fetchCurrent(): Promise<RepoInfo | null> {
  const res = await fetch(`${ENGINE_URL}/repos/current`)
  if (res.status === 404) return null
  return json<RepoInfo>(res)
}

export async function fetchRecents(): Promise<RepoInfo[]> {
  const res = await fetch(`${ENGINE_URL}/repos/recents`)
  return json<RepoInfo[]>(res)
}

export async function fetchRevisions(max = 800): Promise<RevisionDto[]> {
  const res = await fetch(`${ENGINE_URL}/revisions?max=${max}`)
  return json<RevisionDto[]>(res)
}

export async function fetchCommit(id: string): Promise<CommitDetail> {
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}`)
  return json<CommitDetail>(res)
}

export async function fetchFiles(id: string): Promise<FileChange[]> {
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/files`)
  return json<FileChange[]>(res)
}

export async function fetchDiff(id: string, path: string): Promise<DiffDto> {
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}`)
  return json<DiffDto>(res)
}

export async function fetchStatus(): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/status`)
  return json<RepoStatus>(res)
}

export async function fetchRefs(): Promise<RefTree> {
  const res = await fetch(`${ENGINE_URL}/refs`)
  return json<RefTree>(res)
}

export async function fetchConfig(): Promise<GitConfig> {
  const res = await fetch(`${ENGINE_URL}/config`)
  return json<GitConfig>(res)
}

export async function saveConfig(patch: Partial<GitConfig> & { global?: boolean }): Promise<GitConfig> {
  const res = await fetch(`${ENGINE_URL}/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: patch.userName,
      userEmail: patch.userEmail,
      autoCrlf: patch.autoCrlf,
      global: patch.global ?? false,
    }),
  })
  return json<GitConfig>(res)
}

export async function fetchVsCode(): Promise<VsCodeInfo> {
  const res = await fetch(`${ENGINE_URL}/tools/vscode`)
  return json<VsCodeInfo>(res)
}

export async function applyVsCode(): Promise<VsCodeInfo> {
  const res = await fetch(`${ENGINE_URL}/tools/vscode`, { method: "POST" })
  return json<VsCodeInfo>(res)
}

export async function stagePaths(paths: string[], unstage = false): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, unstage }),
  })
  return json<RepoStatus>(res)
}

export async function createCommit(message: string): Promise<{ id: string }> {
  const res = await fetch(`${ENGINE_URL}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })
  return json<{ id: string }>(res)
}
