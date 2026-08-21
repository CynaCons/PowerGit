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
export type TreeEntry = { name: string; type: string; sha: string }
export type RemoteInfo = { name: string; url: string }
export type IgnorePreview = { pattern: string; files: string[]; count: number }

export type DiffOptions = { context: number; ws: boolean; full: boolean }

const diffParams = (o?: Partial<DiffOptions>) => {
  const p = new URLSearchParams()
  if (o?.context !== undefined) p.set("context", String(o.context))
  if (o?.ws) p.set("ws", "true")
  if (o?.full) p.set("full", "true")
  const qs = p.toString()
  return qs ? `&${qs}` : ""
}
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

export async function fetchTree(id: string, path?: string): Promise<TreeEntry[]> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ""
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/tree${qs}`)
  return json<TreeEntry[]>(res)
}

export async function fetchDiff(id: string, path: string, options?: Partial<DiffOptions>): Promise<DiffDto> {
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}${diffParams(options)}`)
  return json<DiffDto>(res)
}

export async function fetchBlob(id: string, path: string): Promise<DiffDto> {
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/blob?path=${encodeURIComponent(path)}`)
  return json<DiffDto>(res)
}

export async function fetchWorkTreeDiff(path: string, staged = false, options?: Partial<DiffOptions>): Promise<DiffDto> {
  const res = await fetch(`${ENGINE_URL}/diff/worktree?path=${encodeURIComponent(path)}&staged=${staged}${diffParams(options)}`)
  return json<DiffDto>(res)
}

export async function deleteFiles(paths: string[]): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/files/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  })
  return json<RepoStatus>(res)
}

export async function addToIgnore(pattern: string): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/ignore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pattern }),
  })
  return json<RepoStatus>(res)
}

export async function previewIgnore(pattern: string): Promise<IgnorePreview> {
  const res = await fetch(`${ENGINE_URL}/ignore/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pattern }),
  })
  return json<IgnorePreview>(res)
}

export async function listRemotes(): Promise<RemoteInfo[]> {
  const res = await fetch(`${ENGINE_URL}/remotes`)
  return json<RemoteInfo[]>(res)
}

export async function saveRemote(name: string, url: string): Promise<RemoteInfo> {
  const res = await fetch(`${ENGINE_URL}/remotes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url }),
  })
  return json<RemoteInfo>(res)
}

export async function fetchRemote(name: string): Promise<{ output: string }> {
  const res = await fetch(`${ENGINE_URL}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remote: name }),
  })
  return json<{ output: string }>(res)
}

export async function deleteBranch(name: string): Promise<RefTree> {
  const res = await fetch(`${ENGINE_URL}/branches/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  return json<RefTree>(res)
}

export async function deleteTag(name: string): Promise<RefTree> {
  const res = await fetch(`${ENGINE_URL}/tags/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  return json<RefTree>(res)
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

export async function checkoutRef(ref: string, force = false): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, force }),
  })
  return json<RepoStatus>(res)
}

export async function resetBranch(commit: string, mode: "soft" | "mixed" | "hard"): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commit, mode }),
  })
  return json<RepoStatus>(res)
}

export async function rebaseOnto(onto: string): Promise<RepoStatus> {
  const res = await fetch(`${ENGINE_URL}/rebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ onto }),
  })
  return json<RepoStatus>(res)
}
