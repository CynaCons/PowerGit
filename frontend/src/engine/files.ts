import { EngineClient, EngineError, describeThrown } from "./client"
import type { RepoStatus, StatusFile } from "./types"

// The commit dialog's file menu against the engine's /files/* routes
// (v0.16.0, Git Extensions FileStatusList parity). Standalone functions over
// the window's EngineClient rather than methods on it: the client's request
// helper is public, its JSON reader is not, so the small text-first reader
// from client.ts is repeated here (same rules: WebKit throws a generic
// DOMException from Response.json() on any non-JSON body, and a failed
// response carries the engine's `error` text).

async function readJson<T>(res: Response): Promise<T> {
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
    const obj = body && typeof body === "object" ? (body as { error?: unknown }) : null
    throw new EngineError((obj && typeof obj.error === "string" && obj.error) || `http ${res.status}`, res.status)
  }
  if (body === null && res.status !== 204) throw new EngineError("engine returned an empty response", res.status)
  return body as T
}

function post<T>(engine: EngineClient, route: string, body: unknown): Promise<T> {
  return engine
    .request(
      `${engine.repoPath()}/files/${route}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
      { timeoutMs: 0 },
    )
    .then(readJson<T>)
}

/** GE "Open working directory file" (OS default handler) / "...with" (`withApp`: a program path or command line). */
export function openFile(engine: EngineClient, path: string, withApp?: string): Promise<void> {
  return post<{ ok: boolean }>(engine, "open", { path, with: withApp || null }).then(() => undefined)
}

/** GE "Edit working directory file": git's core.editor when set, else the OS handler. */
export function editFile(engine: EngineClient, path: string): Promise<void> {
  return post<{ ok: boolean }>(engine, "edit", { path }).then(() => undefined)
}

/** `git update-index --[no-]skip-worktree`; answers with the fresh status. */
export function setSkipWorktree(engine: EngineClient, paths: string[], on: boolean): Promise<RepoStatus> {
  return post<RepoStatus>(engine, "skip-worktree", { paths, on })
}

/** `git update-index --[no-]assume-unchanged`; answers with the fresh status. */
export function setAssumeUnchanged(engine: EngineClient, paths: string[], on: boolean): Promise<RepoStatus> {
  return post<RepoStatus>(engine, "assume-unchanged", { paths, on })
}

/** Appends the patterns to `.git/info/exclude` (GE writes them anchored: `/dir/file`). */
export function excludeFiles(engine: EngineClient, patterns: string[]): Promise<RepoStatus> {
  return post<RepoStatus>(engine, "exclude", { paths: patterns })
}

/** GE "Stop tracking this file": `git rm --cached`, the file stays on disk. */
export function untrackFiles(engine: EngineClient, paths: string[]): Promise<RepoStatus> {
  return post<RepoStatus>(engine, "untrack", { paths })
}

/** GE "Rename / move": `git mv` to a repository-relative path. */
export function moveFile(engine: EngineClient, path: string, newPath: string): Promise<RepoStatus> {
  return post<RepoStatus>(engine, "move", { path, newPath })
}

/**
 * Every tracked path carrying skip-worktree or assume-unchanged, with git's
 * `ls-files -v` letter as its status ("S", "h", "s"). Git leaves these out of
 * `status`; the Unstaged list fetches them when "Show skip-worktree files" /
 * "Show assumed-unchanged files" is on.
 */
export function hiddenFiles(engine: EngineClient, signal?: AbortSignal): Promise<StatusFile[]> {
  return engine.request(`${engine.repoPath()}/files/hidden`, {}, { signal }).then(readJson<StatusFile[]>)
}
