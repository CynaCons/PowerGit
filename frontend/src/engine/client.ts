import type {
  ArchiveFormat,
  ChangeKind,
  CheckoutOptions,
  CommitDetail,
  CreateBranchOptions,
  Divergence,
  ConflictFile,
  ConflictStage,
  ConflictTake,
  MergeOptions,
  PatchScope,
  PatchText,
  RebaseOptions,
  RebaseTodo,
  RebaseTodoEntry,
  SequencerAction,
  SequencerOp,
  DiffDto,
  DiffOptions,
  FileChange,
  GitConfig,
  GitJob,
  GitLogEntry,
  Health,
  IgnorePreview,
  JobStarted,
  RefTree,
  RemoteInfo,
  RepoInfo,
  RecentInfo,
  RepoPeek,
  RepoStatus,
  ResetScope,
  RevisionDto,
  RevisionFilter,
  ToolInfo,
  SessionInfo,
  StashInfo,
  TreeEntry,
  VsCodeInfo,
  CommitChanges,
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

/** Query string of a path filter; empty without one. Only what differs from
 *  the engine's defaults travels, so an unfiltered request is unchanged. */
export function filterParams(filter: RevisionFilter | undefined): string {
  if (!filter) return ""
  let qs = ""
  if (filter.path) {
    qs += `&path=${encodeURIComponent(filter.path)}`
    if (filter.follow === false) qs += "&follow=false"
    if (filter.exact) qs += "&exact=true"
    if (filter.full) qs += "&full=true"
    if (filter.simplify) qs += "&simplify=true"
  }
  // Sorted so the same set is the same URL whatever order the tree ticked
  // it in (the paging client keys requests by the string). An explicit
  // empty set is a bare `ref=`: the engine then lists HEAD alone (the
  // filter mode with nothing ticked).
  if (filter.refs) {
    if (filter.refs.length === 0) qs += "&ref="
    for (const ref of [...filter.refs].sort()) qs += `&ref=${encodeURIComponent(ref)}`
  }
  return qs
}

export class EngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly running?: string,
    readonly code?: string,
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

/** Handle on the requests started while a refresh sweep runs; `end()` gives
 *  the lowest watcher version they were stamped with (0 if none carried one). */
export type ChangeVersionScope = { end(): number }

/** The monotonically increasing portion of the packed watcher version. The
 * low two bits are only its change classification, not ordering state. */
export function changeSequenceOf(version: number): number {
  return Math.floor(version / 4)
}

/** Whether a change event was already represented by a completed refresh.
 * v0.18.18 drops only this proven watcher echo; a later external write has a
 * higher sequence and remains eligible for the existing deferred refresh. */
export function changeVersionWasObserved(eventVersion: number, observedVersion: number): boolean {
  return changeSequenceOf(eventVersion) <= changeSequenceOf(observedVersion)
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
    const obj =
      body && typeof body === "object" ? (body as { error?: unknown; running?: unknown; code?: unknown }) : null
    const err = obj && typeof obj.error === "string" ? obj.error : ""
    const running = obj && typeof obj.running === "string" ? obj.running : undefined
    const code = obj && typeof obj.code === "string" ? obj.code : undefined
    throw new EngineError(err || `http ${res.status}`, res.status, running, code)
  }
  if (body === null && res.status !== 204) throw new EngineError("engine returned an empty response", res.status)
  return body as T
}

/** The `filename=` of a Content-Disposition header (the RFC 5987 `filename*=` form first, when present). */
export function fileNameOf(contentDisposition: string | null, fallback: string): string {
  if (!contentDisposition) return fallback
  const star = /filename\*=(?:UTF-8|utf-8)''([^;]+)/.exec(contentDisposition)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim()) || fallback
    } catch {
      // fall through to the plain form
    }
  }
  const plain = /filename="?([^";]+)"?/.exec(contentDisposition)
  return plain?.[1].trim() || fallback
}

/** A streamed patch response as text; a non-2xx answer is the engine's JSON error. */
async function patchText(res: Response, fallbackName: string): Promise<PatchText> {
  if (!res.ok) await json(res)
  return { name: fileNameOf(res.headers.get("Content-Disposition"), fallbackName), text: await res.text() }
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
  /** Highest watcher version carried by any response for this client. */
  lastChangeVersion = 0
  // A refresh may treat a watcher version as observed only if EVERY request
  // of that sweep was stamped at or above it, so a scope keeps the lowest
  // stamp of the requests started while it is open — not the highest of
  // all responses, which a concurrent mutation could raise past what the
  // sweep's reads actually saw (v0.18.18).
  private readonly versionScopes = new Set<{ min: number }>()

  beginChangeVersionScope(): ChangeVersionScope {
    const scope = { min: Number.POSITIVE_INFINITY }
    this.versionScopes.add(scope)
    return {
      end: () => {
        this.versionScopes.delete(scope)
        return Number.isFinite(scope.min) ? scope.min : 0
      },
    }
  }

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
    // Membership is decided at request start: the engine samples the version
    // before the handler runs, so a request started inside the scope saw at
    // least the scope's state.
    const scopes = [...this.versionScopes]
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: ctrl.signal })
      const version = Number(response.headers.get("X-PowerGit-Change-Version"))
      if (Number.isSafeInteger(version) && version >= 0) {
        if (version > this.lastChangeVersion) this.lastChangeVersion = version
        for (const scope of scopes) if (version < scope.min) scope.min = version
      }
      return response
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

  async recents(): Promise<RecentInfo[]> {
    return json<RecentInfo[]>(await this.get(`/repos/recents`))
  }

  async peekRepos(roots: string[], signal?: AbortSignal): Promise<RepoPeek[]> {
    const query = roots.map((root) => `root=${encodeURIComponent(root)}`).join("&")
    return json<RepoPeek[]>(await this.get(`/repos/peek?${query}`, { signal }))
  }

  async peekRepo(root: string, history: number, signal?: AbortSignal): Promise<RepoPeek> {
    return json<RepoPeek>(await this.get(`/repos/peek?root=${encodeURIComponent(root)}&history=${history}`, { signal }))
  }

  async pinRecent(root: string, pinned: boolean): Promise<void> {
    await json<{ ok: boolean }>(await this.put(`/repos/recents/pin`, { root, pinned }))
  }

  /** Removes one root from the recents list for good (v0.14.2). */
  async forgetRecent(root: string): Promise<void> {
    const res = await this.request(`/repos/recents?root=${encodeURIComponent(root)}`, { method: "DELETE" })
    if (!res.ok) await json(res)
  }

  // ---- reads (abortable: latest request wins) ---------------------------

  /** The revision stream, or with `filter` (v0.16.0) the commits that touched one path. */
  async revisions(max = 800, skip = 0, signal?: AbortSignal, filter?: RevisionFilter): Promise<RevisionDto[]> {
    if (filter?.refs) {
      return json<RevisionDto[]>(
        await this.post(
          `${this.repoPath()}/revisions`,
          {
            refs: filter.refs,
            max,
            skip,
            path: filter.path,
            follow: filter.follow,
            exact: filter.exact,
            full: filter.full,
            simplify: filter.simplify,
          },
          { signal, timeoutMs: 120_000 },
        ),
      )
    }
    return json<RevisionDto[]>(
      await this.get(
        `${this.repoPath()}/revisions?max=${max}${skip > 0 ? `&skip=${skip}` : ""}${filterParams(filter)}`,
        {
          signal,
          timeoutMs: 120_000,
        },
      ),
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

  /** Files of a commit plus the diff of its first file in one request, so
   *  the Diff tab needs one round trip after a selection, not two. Engines
   *  before v0.13.14 have no /changes route (404): compose the same answer
   *  from /files and /diff so a stale sidecar still shows diffs. */
  async changes(id: string, options?: Partial<DiffOptions>, signal?: AbortSignal): Promise<CommitChanges> {
    const query = diffParams(options).replace(/^&/, "")
    try {
      return json<CommitChanges>(
        await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}/changes?${query}`, { signal }),
      )
    } catch (e) {
      if (!(e instanceof EngineError) || e.status !== 404) throw e
      const files = await this.files(id, signal)
      const first = files[0]
      const firstDiff = first ? await this.diff(id, first.path, options, signal) : null
      return { files, firstDiff }
    }
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

  /** The file as the pending-change rows see it (v0.16.0): on disk for the
   *  Working directory row, in the index for the Index row (`staged`). The
   *  File Tree of those rows lists HEAD's tree, so this is what a click on
   *  one of its files shows. */
  async workTreeBlob(path: string, staged = false, signal?: AbortSignal): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(`${this.repoPath()}/blob/worktree?path=${encodeURIComponent(path)}&staged=${staged}`, {
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

  /** `scope` reads exactly what that file sets; omit it for the effective value. */
  async config(scope?: "local" | "global"): Promise<GitConfig> {
    const qs = scope ? `?scope=${scope}` : ""
    return json<GitConfig>(await this.get(`${this.repoPath()}/config${qs}`))
  }

  /** Diff/merge tools and editors present on this machine (v0.15.0). */
  async tools(): Promise<ToolInfo[]> {
    return json<ToolInfo[]>(await this.get(`${this.repoPath()}/tools`))
  }

  async vsCode(): Promise<VsCodeInfo> {
    return json<VsCodeInfo>(await this.get(`${this.repoPath()}/tools/vscode`))
  }

  // ---- mutations --------------------------------------------------------

  /**
   * Apply a synthesized (partial) patch: stage (cached), unstage (cached +
   * reverse) or reset lines in the working tree (reverse). v0.15.5 adds
   * `index` + `threeWay` for undoing a selection taken from a commit, which
   * must land in the working tree and the index and survive context drift.
   */
  async applyPatch(
    patch: string,
    options: { cached?: boolean; reverse?: boolean; index?: boolean; threeWay?: boolean },
  ): Promise<RepoStatus> {
    return json<RepoStatus>(
      await this.post(`${this.repoPath()}/patch`, {
        patch,
        cached: options.cached ?? false,
        reverse: options.reverse ?? false,
        index: options.index ?? false,
        threeWay: options.threeWay ?? false,
      }),
    )
  }

  /**
   * Discard changes of `paths`; untracked ones are deleted (git holds no copy).
   * `scope` says which diff is being undone (v0.15.5): "head" is GE's "Reset
   * file(s) to HEAD", "worktree" restores from the index and keeps staged work,
   * "index" unstages and leaves the file on disk.
   */
  async resetFiles(paths: string[], scope: ResetScope = "head"): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/files/reset`, { paths, scope }))
  }

  /** External difftool on a working-tree file (index vs HEAD when staged). */
  async openWorkTreeDifftool(path: string, staged: boolean): Promise<void> {
    await this.post(`${this.repoPath()}/difftool/worktree`, { path, staged })
  }

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

  async createBranch(name: string, commit?: string, options?: CreateBranchOptions): Promise<RefTree> {
    return json<RefTree>(
      await this.post(`${this.repoPath()}/branches/create`, {
        name,
        commit,
        checkout: options?.checkout ?? false,
        orphan: options?.orphan ?? false,
      }),
    )
  }

  /** A message makes the tag annotated (`tag -a -m`). */
  async createTag(name: string, commit?: string, message?: string | null): Promise<RefTree> {
    return json<RefTree>(await this.post(`${this.repoPath()}/tags/create`, { name, commit, message: message ?? null }))
  }

  /** `rev-list --left-right --count local...remote` (v0.18.11). */
  async divergence(local: string, remote: string): Promise<Divergence> {
    return json<Divergence>(
      await this.get(
        `${this.repoPath()}/branches/divergence?local=${encodeURIComponent(local)}&remote=${encodeURIComponent(remote)}`,
      ),
    )
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

  async saveConfig(
    patch: Partial<GitConfig> & { global?: boolean; diffToolPath?: string | null; mergeToolPath?: string | null },
  ): Promise<GitConfig> {
    return json<GitConfig>(
      await this.put(`${this.repoPath()}/config`, {
        userName: patch.userName,
        userEmail: patch.userEmail,
        autoCrlf: patch.autoCrlf,
        editor: patch.editor,
        diffTool: patch.diffTool,
        mergeTool: patch.mergeTool,
        diffToolPath: patch.diffToolPath,
        mergeToolPath: patch.mergeToolPath,
        global: patch.global ?? false,
      }),
    )
  }

  async applyVsCode(): Promise<VsCodeInfo> {
    return json<VsCodeInfo>(await this.post(`${this.repoPath()}/tools/vscode`))
  }

  async stage(paths: string[], unstage = false, all = false): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/stage`, { paths, unstage, all }))
  }

  async createCommit(message: string, amend = false): Promise<{ id: string }> {
    return json<{ id: string }>(await this.post(`${this.repoPath()}/commit`, { message, amend }))
  }

  /** `{ref, force}` is the pre-v0.18.11 shape; the options are Git Extensions' checkout dialog. */
  async checkout(ref: string, options: boolean | CheckoutOptions = false): Promise<RepoStatus> {
    const o = typeof options === "boolean" ? { force: options } : options
    return json<RepoStatus>(
      await this.post(`${this.repoPath()}/checkout`, {
        ref,
        force: o.force ?? false,
        as: o.as ?? null,
        name: o.name ?? null,
        localChanges: o.localChanges ?? null,
      }),
    )
  }

  async reset(commit: string, mode: "soft" | "mixed" | "hard"): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/reset`, { commit, mode }))
  }

  // ---- merge / rebase / sequencer (v0.15.0) ------------------------------
  // A stopped operation (conflicts, an `edit` line) comes back as 200 with
  // `state` set; only a real failure is a 400. Every call returns the new
  // status so the banner appears without a second round trip.

  async merge(options: MergeOptions): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/merge`, options))
  }

  /** 400 while conflicts remain; otherwise commits the merge (or the squash). */
  async mergeContinue(message?: string | null): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/merge/continue`, { message: message ?? null }))
  }

  async mergeAbort(): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/merge/abort`))
  }

  /** `git rebase [--autostash] [--rebase-merges] [--autosquash] onto`; with
   *  `todo` the interactive path runs that list instead of git's own. */
  async rebase(onto: string, options?: Partial<RebaseOptions>, todo?: RebaseTodoEntry[]): Promise<RepoStatus> {
    return json<RepoStatus>(
      await this.post(`${this.repoPath()}/rebase`, {
        onto,
        autosquash: options?.autosquash ?? false,
        rebaseMerges: options?.rebaseMerges ?? false,
        autostash: options?.autostash ?? false,
        todo: todo ?? null,
      }),
    )
  }

  /** `git rebase|cherry-pick|revert --continue|--skip|--abort`. */
  async sequencerAction(op: SequencerOp, action: SequencerAction): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/${op}/${action}`))
  }

  rebaseContinue(): Promise<RepoStatus> {
    return this.sequencerAction("rebase", "continue")
  }

  rebaseSkip(): Promise<RepoStatus> {
    return this.sequencerAction("rebase", "skip")
  }

  rebaseAbort(): Promise<RepoStatus> {
    return this.sequencerAction("rebase", "abort")
  }

  /** git's own todo for `rebase -i onto` (autosquash order, label/reset/merge
   *  lines), captured without leaving rebase state behind. */
  async rebaseTodo(onto: string, options?: Partial<RebaseOptions>): Promise<RebaseTodo> {
    return json<RebaseTodo>(
      await this.post(`${this.repoPath()}/rebase/todo`, {
        onto,
        autosquash: options?.autosquash ?? false,
        rebaseMerges: options?.rebaseMerges ?? false,
      }),
    )
  }

  async conflicts(signal?: AbortSignal): Promise<ConflictFile[]> {
    return json<ConflictFile[]>(await this.get(`${this.repoPath()}/conflicts`, { signal }))
  }

  /** `git show :<stage>:<path>` — 1 base, 2 ours, 3 theirs; bounded like blobs. */
  async conflictBlob(path: string, stage: ConflictStage, signal?: AbortSignal): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(`${this.repoPath()}/conflicts/blob?path=${encodeURIComponent(path)}&stage=${stage}`, {
        signal,
      }),
    )
  }

  async resolveConflicts(paths: string[], take: ConflictTake): Promise<RepoStatus> {
    return json<RepoStatus>(await this.post(`${this.repoPath()}/conflicts/resolve`, { paths, take }))
  }

  /** Detached `git mergetool --no-prompt -y -- path`; 400 without a merge.tool. */
  async openMergetool(path: string): Promise<void> {
    await json<{ ok: boolean }>(await this.post(`${this.repoPath()}/mergetool`, { path }))
  }

  // ---- compare / archive (v0.15.0) ----------------------------------------

  private compareQuery(from: string, to: string | null): string {
    return `from=${encodeURIComponent(from)}&${to === null ? "worktree=true" : `to=${encodeURIComponent(to)}`}`
  }

  /** Files changed between two commits (`to` null: `from` vs the working tree) plus the first diff. */
  async compare(from: string, to: string | null, options?: Partial<DiffOptions>, signal?: AbortSignal) {
    return json<CommitChanges>(
      await this.get(`${this.repoPath()}/compare?${this.compareQuery(from, to)}${diffParams(options)}`, { signal }),
    )
  }

  async compareDiff(
    from: string,
    to: string | null,
    path: string,
    options?: Partial<DiffOptions>,
    signal?: AbortSignal,
  ): Promise<DiffDto> {
    return json<DiffDto>(
      await this.get(
        `${this.repoPath()}/compare?${this.compareQuery(from, to)}&path=${encodeURIComponent(path)}${diffParams(options)}`,
        { signal },
      ),
    )
  }

  /** Streamed `git archive`; the token rides in the query like /events so a
   *  plain navigation can download it. */
  archiveUrl(id: string, format: ArchiveFormat = "zip"): string {
    return `${this.baseUrl}${this.repoPath()}/commits/${encodeURIComponent(id)}/archive?format=${encodeURIComponent(format)}&token=${encodeURIComponent(this.token)}`
  }

  async archive(id: string, format: ArchiveFormat = "zip"): Promise<Blob> {
    const res = await this.request(
      `${this.repoPath()}/commits/${encodeURIComponent(id)}/archive?format=${encodeURIComponent(format)}`,
      {},
      { timeoutMs: 0 },
    )
    if (!res.ok) await json(res)
    return res.blob()
  }

  // ---- patch (v0.18.6) ----------------------------------------------------
  // "Save as patch…": the engine streams the text under git's own file
  // name, the shell writes it where the Save dialog pointed; in a browser
  // the URL form is navigated to and the browser saves it under that name.

  patchUrl(id: string): string {
    return `${this.baseUrl}${this.repoPath()}/commits/${encodeURIComponent(id)}/patch?token=${encodeURIComponent(this.token)}`
  }

  worktreePatchUrl(scope: PatchScope): string {
    return `${this.baseUrl}${this.repoPath()}/worktree/patch?scope=${scope}&token=${encodeURIComponent(this.token)}`
  }

  /** `git format-patch -1 --stdout` of one commit, with the name from Content-Disposition. */
  async patch(id: string): Promise<PatchText> {
    return patchText(
      await this.get(`${this.repoPath()}/commits/${encodeURIComponent(id)}/patch`, { timeoutMs: 0 }),
      `${id.slice(0, 7)}.patch`,
    )
  }

  /** `git diff --binary` (worktree) or `git diff --cached --binary` (index) as a patch. */
  async worktreePatch(scope: PatchScope): Promise<PatchText> {
    return patchText(
      await this.get(`${this.repoPath()}/worktree/patch?scope=${scope}`, { timeoutMs: 0 }),
      `${scope}.patch`,
    )
  }

  async cherryPick(id: string, autostash = false): Promise<RepoStatus> {
    return json<RepoStatus>(
      await this.post(`${this.repoPath()}/commits/${encodeURIComponent(id)}/cherry-pick`, { autostash }),
    )
  }

  async revert(id: string, autostash = false): Promise<RepoStatus> {
    return json<RepoStatus>(
      await this.post(`${this.repoPath()}/commits/${encodeURIComponent(id)}/revert`, { autostash }),
    )
  }

  /** Opens `path` at `commit` in the user's configured external diff tool.
   *  The engine launches the tool detached and responds immediately. */
  /** External difftool on a file at a commit: against its parent, or with `local` against the working tree. */
  async openDifftool(commit: string, path: string, local = false): Promise<void> {
    await json<{ ok: boolean }>(await this.post(`${this.repoPath()}/difftool`, { commit, path, local }))
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

  /** The Git console's rolling log (v0.15.1). `after` is the highest id
   *  already held, so the console polls for a delta rather than the buffer. */
  async gitLog(after?: number, signal?: AbortSignal): Promise<GitLogEntry[]> {
    const qs = after !== undefined ? `?after=${after}` : ""
    return json<GitLogEntry[]>(await this.get(`${this.repoPath()}/gitlog${qs}`, { signal, timeoutMs: 10_000 }))
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
