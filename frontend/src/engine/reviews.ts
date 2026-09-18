import { describeThrown, EngineClient, EngineError } from "./client"

// The review file routes (v0.19.0, docs/design/review-mode.md §2):
// GET / PUT / DELETE /repos/{id}/reviews/{key}. Standalone functions over
// the window's EngineClient, the files.ts pattern; the body is text, not
// JSON-parsed, because the pane shows the file exactly as written.

async function textResponse(res: Response): Promise<string> {
  let text: string
  try {
    text = await res.text()
  } catch (e) {
    throw new EngineError(`could not read the engine's response: ${describeThrown(e)}`, res.status)
  }
  if (!res.ok) {
    let message = `http ${res.status}`
    try {
      const body = JSON.parse(text) as { error?: unknown }
      if (typeof body.error === "string") message = body.error
    } catch {
      if (text) message = text.slice(0, 200)
    }
    throw new EngineError(message, res.status)
  }
  return text
}

const route = (engine: EngineClient, key: string) => `${engine.repoPath()}/reviews/${encodeURIComponent(key)}`

export async function getReview(engine: EngineClient, key: string, signal?: AbortSignal): Promise<string | null> {
  const res = await engine.request(route(engine, key), {}, { signal, timeoutMs: 0 })
  // 204: no review for this key yet (the ordinary case; not a console error).
  if (res.status === 204 || res.status === 404) return null
  return textResponse(res)
}

/**
 * Writes the document text as-is; the engine stores it verbatim. `keepalive`
 * lets the last debounced save of a page that is unloading complete
 * (useReview flushes on pagehide).
 */
export async function putReview(engine: EngineClient, key: string, text: string, keepalive = false): Promise<void> {
  const res = await engine.request(
    route(engine, key),
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: text, keepalive },
    { timeoutMs: 0 },
  )
  await textResponse(res)
}

export async function deleteReview(engine: EngineClient, key: string): Promise<void> {
  const res = await engine.request(route(engine, key), { method: "DELETE" }, { timeoutMs: 0 })
  await textResponse(res)
}
