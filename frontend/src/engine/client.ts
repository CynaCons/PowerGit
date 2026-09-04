import type {
  ChangeKind,
  CommitDetail,
  DiffDto,
  DiffOptions,
  FileChange,
  GitConfig,
  GitJob,
  Health,
  IgnorePreview,
  JobStarted,
  RefTree,
  RemoteInfo,
  RepoInfo,
  RepoStatus,
  RevisionDto,
  SessionInfo,
  StashInfo,
  TreeEntry,
  VsCodeInfo,
} from "./types"

/**
 * v0.13.12: one engine client per {baseUrl, token, repoId}. Nothing in this
 * file is module-global, so two windows (or two React trees, or two tests)
 * can talk to two repositories without switching each other: a client is
 * immutable, and `withRepo` returns a new one. Repository identity is
 * therefore explicit at every call site — a helper that needs a repo throws
 * when the client has none instead of silently using "whatever was opened
 * last".
 */
export type EngineConfig = {
  baseUrl: string
  token: string
  /** Session id this client is bound to, or null for repo-less calls. */
  repoId: string | null
}

export type RequestOptions = {
  signal?: AbortSignal
  /** Per-request budget; the default is `READ_TIMEOUT_MS` for reads. */
  timeoutMs?: number
}

/** Default budget for read requests. Jobs poll instead of waiting, so no request should legitimately take longer. */
export const READ_TIMEOUT_MS = 30_000

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly running?: string,
  ) {
    super(message)
    this.name = "EngineError"
  }
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

export const isAbort = (e: unknown): boolean =>
  (e instanceof DOMException && e.name === "AbortError") ||
  (typeof e === "object" && e !== null && "name" in e && (e as { name?: unknown }).name === "AbortError")

/** Decodes the `GitChangeKind` the engine packs into the low 2 bits of the
 *  /events SSE payload (see GitHost.Watch.cs). */
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

// Text-first: WebKit throws a generic DOMException ("The string did not match
// the expected pattern") from Response.json() on any non-JSON body (empty 500,
// proxy page, dropped connection). Read text, then parse, so the UI can show
// the real status and body instead of that sentence.
async function json<T>(res: Response): Promise<T> {
  let text: string
  try {
    text = await res.text()
  } catch (e) {
    throw new EngineError(`could not read the engine's response: ${describeThrown(e)}`, res.status)
  }
  let body: unknown = null
  if (text.trim().length > 0) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new EngineError(
        `engine returned a non-JSON response (http ${res.status}): ${text.slice(0, 200)}`,
        res.status,
      )
    }
  }
  if (!res.ok) {
    const obj = body && typeof body === "object" ? (body as { error?: unknown; running?: unknown }) : null
    const err = obj && typeof obj.error === "string" ? obj.error : ""
    const running = obj && typeof obj.running === "string" ? obj.running : undefined
    throw new EngineError(err || `http ${res.status}`, res.status, running)
  }
  if (body === null && res.status !== 204) throw new EngineError("engine returned an empty response", res.status)
  return body as T
}

const diffParams = (o?: Partial<DiffOptions>) => {
  const p = new URLSearchParams()
  if (o?.context !== undefined) p.set("context", String(o.context))
  if (o?.ws) p.set("ws", "true")
  if (o?.full) p.set("full", "true")
  const qs = p.toString()
  return qs ? `&${qs}` : ""
}

const JSON_HEADERS = { "Content-Type": "application/json" }

export class EngineClient {
  readonly baseUrl: string
  readonly token: string
  readonly repoId: string | null

  constructor(cfg: EngineConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/+$/, "")
    this.token = cfg.token
    this.repoId = cfg.repoId
  }

  /** A client for another session on the same engine; this one is untouched. */
  withRepo(repoId: string | null): EngineClient {
    return new EngineClient({ baseUrl: this.baseUrl, token: this.token, repoId })
  }

  get hasRepo(): boolean {
    return this.repoId !== null
  }

  /** `/repos/<id>`; throws when the client is not bound to a session. */
  repoPath(): string {
    if (!this.repoId) throw new EngineError("no repository open", 0)
    return `/repos/${encodeURIComponent(this.repoId)}`
  }

  /** EventSource cannot send headers, so /events takes the token as a query. */
  eventsUrl(): string {
    return `${this.baseUrl}${this.repoPath()}/events?token=${encodeURIComponent(this.token)}`
  }

  /** Every engine call goes through here: base URL, bearer token, and a
   *  timeout composed with the caller's AbortSignal without relying on
   *  AbortSignal.any/timeout (absent on older WebKitGTK). */
  async request(path: string, init: RequestInit = {}, opts: RequestOptions = {}): Promise<Response> {
    const headers = new Headers(init.headers)
    if (this.token) headers.set("Authorization", `Bearer ${this.token}`)
    const ctrl = new AbortController()
    const budget = opts.timeoutMs ?? READ_TIMEOUT_MS
    const timer =
      budget > 0
        ? setTimeout(() => ctrl.abort(new DOMException("engine request timed out", "TimeoutError")), budget)
        : null
    const onAbort = () => ctrl.abort(opts.signal?.reason)
    if (opts.signal) {
      if (opts.signal.aborted) onAbort()
      else opts.signal.addEventListener("abort", onAbort, { once: true })
    }
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: ctrl.signal })
    } catch (e) {
      if (ctrl.signal.aborted && !opts.signal?.aborted) {
        throw new EngineError(`engine request timed out after ${Math.round(budget / 1000)} s: ${path}`, 0)
      }
      throw e
    } finally {
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener("abort", onAbort)
    }
  }

  private get(path: string, opts?: RequestOptions) {
    return this.request(path, {}, opts)
  }

  private post(path: string, body?: unknown, opts?: RequestOptions) {
    return this.request(
      path,
      { method: "POST", headers: JSON_HEADERS, body: body === undefined ? undefined : JSON.stringify(body) },
      { timeoutMs: 0, ...opts },
    )
  }

  private put(path: string, body: unknown, opts?: RequestOptions) {
    return this.request(
      path,
      { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(body) },
      { timeoutMs: 0, ...opts },
    )
  }

  // ---- engine-level -----------------------------------------------------

  async health(signal?: AbortSignal): Promise<Health> {
    return json<Health>(await this.get(`/health`, { signal, timeoutMs: 10_000 }))
  }

  /** Opens a repository; the returned client is bound to it. */
  async openRepo(path: string): Promise<{ info: RepoInfo; client: EngineClient }> {
    const info = await json<RepoInfo>(await this.post(`/repos/open`, { path }))
    return { info, client: this.withRepo(info.id) }
  }

  /** The engine-global "last opened" session, or null. Only used when this
   *  window has no pinned repo (see boot in useEngineSession). */
  async currentRepo(): Promise<RepoInfo | null> {
    const res = await this.get(`/repos/current`)
    if (res.status === 404) return null
    return json<RepoInfo>(res)
  }

  async listRepos(): Promise<RepoInfo[]> {
    return json<RepoInfo[]>(await this.get(`/repos`))
  }

  async sessions(): Promise<SessionInfo[]> {
    return json<SessionInfo[]>(await this.get(`/repos/sessions`))
  }

  /** Session facts for one id (null when the engine no longer has it). */
  async repoInfo(id: string): Promise<RepoInfo | null> {
    const all = await this.listRepos()
    return all.find((r) => r.id === id) ?? null
  }

  async closeRepo(id: string): Promise<void> {
    const res = await this.request(`/repos/${encodeURIComponent(id)}`, { method: "DELETE" })
    if (!res.ok && res.status !== 404) await json(res)
  }

  async recents(): Promise<RepoInfo[]> {
    return json<RepoInfo[]>(await this.get(`/repos/recents`))
  }

  // ---- reads (abortable: latest request wins) ---------------------------

  async revisions(max = 800, skip = 0, signal?: AbortSignal): Promise<RevisionDto[]> {
    return json<RevisionDto[]>(
      await this.get(`${this.repoPath()}/revisions?max=${max}${skip > 0 ? `&skip=${skip}` : ""}`, {
        signal,
        timeoutMs: 120_000,
      }),
    )
  }

  async commit(id: string, signal?: AbortSignal): Promise<CommitDetail> {
    return json<CommitDetail>(await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}`, { signal }))
  }

  async files(id: string, signal?: AbortSignal): Promise<FileChange[]> {
    return json<FileChange[]>(await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}/files`, { signal }))
  }

  async tree(id: string, path?: string, signal?: AbortSignal): Promise<TreeEntry[]> {
    const qs = path ? `?path=${encodeURIComponent(path)}` : ""
    return json<TreeEntry[]>(
      await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}/tree${qs}`, { signal }),
    )
  }

  async diff(id: string, path: string, options?: Partial<DiffOptions>, signal?: AbortSignal): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(
        `${this.repoPath()}/commits/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}${diffParams(options)}`,
        { signal },
      ),
    )
  }

  async blob(id: string, path: string, signal?: AbortSignal): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}/blob?path=${encodeURIComponent(path)}`, {
        signal,
      }),
    )
  }

  async workTreeDiff(
    path: string,
    staged = false,
    options?: Partial<DiffOptions>,
    signal?: AbortSignal,
  ): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(
        `${this.repoPath()}/diff/worktree?path=${encodeURIComponent(path)}&staged=${staged}${diffParams(options)}`,
        { signal },
      ),
    )
  }

  async status(signal?: AbortSignal): Promise<RepoStatus> {
    return json<RepoStatus>(await this.get(`${this.repoPath()}/status`, { signal }))
  }

  async refs(signal?: AbortSignal): Promise<RefTree> {
    return json<RefTree>(await this.get(`${this.repoPath()}/refs`, { signal }))
  }

  async stashes(signal?: AbortSignal): Promise<StashInfo[]> {
    return json<StashInfo[]>(await this.get(`${this.repoPath()}/stashes`, { signal }))
  }

  async remotes(): Promise<RemoteInfo[]> {
    return json<RemoteInfo[]>(await this.get(`${this.repoPath()}/remotes`))
  }

  async config(): Promise<GitConfig> {
    return json<GitConfig>(await this.get(`${this.repoPath()}/config`))
  }

  async vsCode(): Promise<VsCodeInfo> {
    return json<VsCodeInfo>(await this.get(`${this.repoPath()}/tools/vscode`))
  }

  // ---- mutations --------------------------------------------------------

  async deleteFiles(paths: string[]): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/files/delete`, { paths }))
  }

  async addToIgnore(pattern: string): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/ignore`, { pattern }))
  }

  async previewIgnore(pattern: string): Promise<IgnorePreview> {
    return json<IgnorePreview>(await this.post(`${this.repoPath()}/ignore/preview`, { pattern }))
  }

  async saveRemote(name: string, url: string): Promise<RemoteInfo> {
    return json<RemoteInfo>(await this.put(`${this.repoPath()}/remotes`, { name, url }))
  }

  async createBranch(name: string, commit?: string): Promise<RefTree> {
    return json<RefTree>(await this.post(`${this.repoPath()}/branches/create`, { name, commit }))
  }

  async createTag(name: string, commit?: string): Promise<RefTree> {
    return json<RefTree>(await this.post(`${this.repoPath()}/tags/create`, { name, commit }))
  }

  async deleteBranch(name: string): Promise<RefTree> {
    return json<RefTree>(await this.post(`${this.repoPath()}/branches/delete`, { name }))
  }

  async deleteTag(name: string): Promise<RefTree> {
    return json<RefTree>(await this.post(`${this.repoPath()}/tags/delete`, { name }))
  }

  async stashChanges(message: string | null, keepIndex = false, includeUntracked = false): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/stash`, { message, keepIndex, includeUntracked }))
  }

  async applyStash(reference: string, pop = false): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/stash/apply`, { reference, pop }))
  }

  async dropStash(reference: string): Promise<void> {
    await json<{ ok: boolean }>(await this.post(`${this.repoPath()}/stash/drop`, { name: reference }))
  }

  async saveConfig(patch: Partial<GitConfig> & { global?: boolean }): Promise<GitConfig> {
    return json<GitConfig>(
      await this.put(`${this.repoPath()}/config`, {
        userName: patch.userName,
        userEmail: patch.userEmail,
        autoCrlf: patch.autoCrlf,
        global: patch.global ?? false,
      }),
    )
  }

  async applyVsCode(): Promise<VsCodeInfo> {
    return json<VsCodeInfo>(await this.post(`${this.repoPath()}/tools/vscode`))
  }

  async stage(paths: string[], unstage = false): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/stage`, { paths, unstage }))
  }

  async createCommit(message: string, amend = false): Promise<{ id: string }> {
    return json<{ id: string }>(await this.post(`${this.repoPath()}/commit`, { message, amend }))
  }

  async checkout(ref: string, force = false): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/checkout`, { ref, force }))
  }

  async reset(commit: string, mode: "soft" | "mixed" | "hard"): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/reset`, { commit, mode }))
  }

  async rebase(onto: string): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/rebase`, { onto }))
  }

  async cherryPick(id: string): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/commits/${encodeURIComponent(id)}/cherry-pick`))
  }

  async revert(id: string): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/commits/${encodeURIComponent(id)}/revert`))
  }

  /** Opens `path` at `commit` in the user's configured external diff tool.
   *  The engine launches the tool detached and responds immediately. */
  async openDifftool(commit: string, path: string): Promise<void> {
    await json<{ ok: boolean }>(await this.post(`${this.repoPath()}/difftool`, { commit, path }))
  }

  // ---- network jobs -----------------------------------------------------

  /** Job routes live under the session (v0.13.10; `/fetch` used to be sent unprefixed). */
  private async startJob(kind: "fetch" | "pull" | "push", body: unknown): Promise<JobStarted> {
    return json<JobStarted>(await this.post(`${this.repoPath()}/${kind}`, body))
  }

  startFetch(remote: string): Promise<JobStarted> {
    return this.startJob("fetch", { remote })
  }

  startPull(rebase = false): Promise<JobStarted> {
    return this.startJob("pull", { rebase })
  }

  startPush(forceWithLease = false): Promise<JobStarted> {
    return this.startJob("push", { forceWithLease })
  }

  async job(id: string): Promise<GitJob> {
    return json<GitJob>(await this.get(`${this.repoPath()}/jobs/${encodeURIComponent(id)}`))
  }

  async jobs(): Promise<GitJob[]> {
    return json<GitJob[]>(await this.get(`${this.repoPath()}/jobs`))
  }

  async cancelJob(id: string): Promise<boolean> {
    const res = await this.post(`${this.repoPath()}/jobs/${encodeURIComponent(id)}/cancel`)
    if (res.status === 404) return false
    await json<{ ok: boolean }>(res)
    return true
  }

  /** Polls a job until it reaches a terminal state. */
  async waitJob(id: string, onTick?: (job: GitJob) => void, timeoutMs = 300_000): Promise<GitJob> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const job = await this.job(id)
      onTick?.(job)
      if (job.status !== "running") return job
      if (Date.now() > deadline) throw new EngineError("operation timed out", 0)
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}
