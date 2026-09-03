import { invoke } from "@tauri-apps/api/core"

/** Engine base URL. Override with VITE_ENGINE_URL (e.g. remote engine or
 *  demo setups); the packaged app otherwise starts with the bundled sidecar
 *  default and `engineReady` (below) may rewrite it once resolved. */
export let ENGINE_URL = import.meta.env.VITE_ENGINE_URL ?? "http://127.0.0.1:7733"

/**
 *  Resolves once at module load. Under Tauri, `lib.rs` may reuse an already
 *  running engine, spawn on 7733 (first choice), or fall back to an
 *  OS-assigned port when 7733 is held by something that is not our engine
 *  (see docs/agents/memories/engine-port.md) — this asks it which via the
 *  `engine_base_url` command and rewrites `ENGINE_URL` in place. Every
 *  request function below awaits this first so no call can fire before the
 *  real port is known. It resolves immediately as a no-op outside Tauri or
 *  when VITE_ENGINE_URL is set, so Vite dev and the Pages demo are unchanged.
 */
const engineReady: Promise<void> = (async () => {
  if (import.meta.env.VITE_ENGINE_URL) return
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return
  try {
    ENGINE_URL = await invoke<string>("engine_base_url")
  } catch {
    // Older host build without the command, or an IPC failure — keep the default.
  }
})()

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
  /** Null when the branch has no upstream (or HEAD is detached). */
  ahead: number | null
  behind: number | null
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

// Text-first: WebKit throws a generic DOMException ("The string did not match
// the expected pattern") from Response.json() on any non-JSON body (empty 500,
// proxy page, dropped connection). Read text, then parse, so the UI can show
// the real status and body instead of that sentence.
async function json<T>(res: Response): Promise<T> {
  const text = await res.text()
  let body: unknown = null
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new Error(`http ${res.status}: ${text.slice(0, 200)}`)
    }
  }
  if (!res.ok) {
    const err = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : ""
    throw new Error(err || `http ${res.status}`)
  }
  return body as T
}

export async function fetchHealth(signal?: AbortSignal): Promise<Health> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/health`, { signal })
  return json<Health>(res)
}

export async function openRepo(path: string): Promise<RepoInfo> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/repos/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  })
  return json<RepoInfo>(res)
}

export async function fetchCurrent(): Promise<RepoInfo | null> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/repos/current`)
  if (res.status === 404) return null
  return json<RepoInfo>(res)
}

export async function fetchRecents(): Promise<RepoInfo[]> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/repos/recents`)
  return json<RepoInfo[]>(res)
}

export async function fetchRevisions(max = 800, skip = 0): Promise<RevisionDto[]> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/revisions?max=${max}${skip > 0 ? `&skip=${skip}` : ""}`)
  return json<RevisionDto[]>(res)
}

export async function fetchCommit(id: string): Promise<CommitDetail> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}`)
  return json<CommitDetail>(res)
}

export async function fetchFiles(id: string): Promise<FileChange[]> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/files`)
  return json<FileChange[]>(res)
}

export async function fetchTree(id: string, path?: string): Promise<TreeEntry[]> {
  const qs = path ? `?path=${encodeURIComponent(path)}` : ""
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/tree${qs}`)
  return json<TreeEntry[]>(res)
}

export async function fetchDiff(id: string, path: string, options?: Partial<DiffOptions>): Promise<DiffDto> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}${diffParams(options)}`)
  return json<DiffDto>(res)
}

export async function fetchBlob(id: string, path: string): Promise<DiffDto> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/blob?path=${encodeURIComponent(path)}`)
  return json<DiffDto>(res)
}

export async function fetchWorkTreeDiff(path: string, staged = false, options?: Partial<DiffOptions>): Promise<DiffDto> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/diff/worktree?path=${encodeURIComponent(path)}&staged=${staged}${diffParams(options)}`)
  return json<DiffDto>(res)
}

export async function deleteFiles(paths: string[]): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/files/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  })
  return json<RepoStatus>(res)
}

export async function addToIgnore(pattern: string): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/ignore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pattern }),
  })
  return json<RepoStatus>(res)
}

export async function previewIgnore(pattern: string): Promise<IgnorePreview> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/ignore/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pattern }),
  })
  return json<IgnorePreview>(res)
}

export async function listRemotes(): Promise<RemoteInfo[]> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/remotes`)
  return json<RemoteInfo[]>(res)
}

export async function saveRemote(name: string, url: string): Promise<RemoteInfo> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/remotes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url }),
  })
  return json<RemoteInfo>(res)
}

/** Normalizes a thrown value into a plain string message. DOMException
 *  (thrown by WebKit for many string-validation failures, including
 *  `Response.json()` on a non-JSON body) does not reliably satisfy
 *  `instanceof Error` across browser engines, so callers must not assume
 *  `.message` is only safe to read after that check. */
export function describeThrown(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === "object" && "message" in e && typeof (e as { message?: unknown }).message === "string") {
    return (e as { message: string }).message
  }
  return String(e)
}

/** Safe response reader for the fetch/pull/push job endpoints. Deliberately
 *  avoids `Response.json()`: WebKit throws a generic DOMException
 *  ("The string did not match the expected pattern.") for any string that
 *  fails its internal validation — the same wording it uses for a malformed
 *  `URL`/`Headers` value — so a non-JSON body (e.g. an empty response from a
 *  dropped connection, or a stray process squatting on the engine's port) is
 *  otherwise indistinguishable from a real request-building bug. Reading as
 *  text first keeps the failure attributable instead of leaking that
 *  ambiguous message straight into the UI. */
async function parseJobResponse<T>(res: Response): Promise<T> {
  let text: string
  try {
    text = await res.text()
  } catch (e) {
    throw new Error(`could not read the engine's response: ${describeThrown(e)}`)
  }
  let body: unknown
  try {
    body = text ? JSON.parse(text) : undefined
  } catch {
    throw new Error(`engine returned a non-JSON response (http ${res.status})`)
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
        ? (body as { error: string }).error
        : `http ${res.status}`
    throw new Error(message)
  }
  if (body === undefined) throw new Error("engine returned an empty response")
  return body as T
}

export async function fetchRemote(name: string): Promise<{ output: string }> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/fetch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ remote: name }),
  })
  return parseJobResponse<{ output: string }>(res)
}

export async function pullBranch(rebase = false): Promise<{ output: string }> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rebase }),
  })
  return parseJobResponse<{ output: string }>(res)
}

export async function pushBranch(forceWithLease = false): Promise<{ output: string }> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ forceWithLease }),
  })
  return parseJobResponse<{ output: string }>(res)
}

export async function createBranch(name: string, commit?: string): Promise<RefTree> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/branches/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, commit }),
  })
  return json<RefTree>(res)
}

export async function createTag(name: string, commit?: string): Promise<RefTree> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/tags/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, commit }),
  })
  return json<RefTree>(res)
}

export type GitJob = {
  id: string
  kind: string
  status: "running" | "completed" | "failed"
  output: string | null
  error: string | null
}
export type JobStarted = { id: string; kind: string }

async function startJob(url: string, body?: unknown): Promise<JobStarted> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return parseJobResponse<JobStarted>(res)
}

export const startFetch = (remote: string) => startJob("/fetch", { remote })
export const startPull = (rebase = false) => startJob("/pull", { rebase })
export const startPush = (forceWithLease = false) => startJob("/push", { forceWithLease })

export async function getJob(id: string): Promise<GitJob> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/jobs/${encodeURIComponent(id)}`)
  return parseJobResponse<GitJob>(res)
}

/** Polls a job until it reaches a terminal state. */
export async function waitJob(id: string, onTick?: (job: GitJob) => void, timeoutMs = 300_000): Promise<GitJob> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const job = await getJob(id)
    onTick?.(job)
    if (job.status !== "running") return job
    if (Date.now() > deadline) throw new Error("operation timed out")
    await new Promise((r) => setTimeout(r, 400))
  }
}

export async function deleteBranch(name: string): Promise<RefTree> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/branches/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  return json<RefTree>(res)
}

export async function deleteTag(name: string): Promise<RefTree> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/tags/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  return json<RefTree>(res)
}

export type StashInfo = { reference: string; id: string; subject: string }

export async function fetchStashes(): Promise<StashInfo[]> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/stashes`)
  return json<StashInfo[]>(res)
}

export async function stashChanges(message: string | null, keepIndex = false, includeUntracked = false): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/stash`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, keepIndex, includeUntracked }),
  })
  return json<RepoStatus>(res)
}

export async function applyStash(reference: string, pop = false): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/stash/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reference, pop }),
  })
  return json<RepoStatus>(res)
}

export async function dropStash(reference: string): Promise<void> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/stash/drop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: reference }),
  })
  await json<{ ok: boolean }>(res)
}

export async function fetchStatus(): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/status`)
  return json<RepoStatus>(res)
}

/** Coarse classification of a GET /events change notification: "refs"
 *  (HEAD/branch/tag moved — the commit list, ref tree, and status may all be
 *  stale) is the superset of "status" (only the index changed). */
export type ChangeKind = "none" | "status" | "refs"

/** Decodes the `GitChangeKind` the engine packs into the low 2 bits of the
 *  /events SSE payload (see GitHost.Watch.cs) — still a single integer on
 *  the wire, so this is the only place that needs to know the encoding. */
export function changeKindOf(version: number): ChangeKind {
  switch (version & 0b11) {
    case 1:
      return "status"
    case 2:
      return "refs"
    default:
      return "none"
  }
}

export async function fetchRefs(): Promise<RefTree> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/refs`)
  return json<RefTree>(res)
}

export async function fetchConfig(): Promise<GitConfig> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/config`)
  return json<GitConfig>(res)
}

export async function saveConfig(patch: Partial<GitConfig> & { global?: boolean }): Promise<GitConfig> {
  await engineReady
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
  await engineReady
  const res = await fetch(`${ENGINE_URL}/tools/vscode`)
  return json<VsCodeInfo>(res)
}

export async function applyVsCode(): Promise<VsCodeInfo> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/tools/vscode`, { method: "POST" })
  return json<VsCodeInfo>(res)
}

export async function stagePaths(paths: string[], unstage = false): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/stage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths, unstage }),
  })
  return json<RepoStatus>(res)
}

export async function createCommit(message: string, amend = false): Promise<{ id: string }> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, amend }),
  })
  return json<{ id: string }>(res)
}

export async function checkoutRef(ref: string, force = false): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, force }),
  })
  return json<RepoStatus>(res)
}

export async function resetBranch(commit: string, mode: "soft" | "mixed" | "hard"): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commit, mode }),
  })
  return json<RepoStatus>(res)
}

export async function rebaseOnto(onto: string): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/rebase`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ onto }),
  })
  return json<RepoStatus>(res)
}

export async function cherryPickCommit(id: string): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/cherry-pick`, { method: "POST" })
  return json<RepoStatus>(res)
}

export async function revertCommit(id: string): Promise<RepoStatus> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/commits/${encodeURIComponent(id)}/revert`, { method: "POST" })
  return json<RepoStatus>(res)
}

/** Opens `path` at `commit` in the user's configured external diff tool
 *  (git difftool, e.g. VS Code — see VsCodeLocator.cs). The engine launches
 *  the tool detached and responds immediately, so this resolves as soon as
 *  the request is accepted, not when the tool window closes. */
export async function openDifftool(commit: string, path: string): Promise<void> {
  await engineReady
  const res = await fetch(`${ENGINE_URL}/difftool`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commit, path }),
  })
  await json<{ ok: boolean }>(res)
}
