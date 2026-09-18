import { describeThrown, EngineClient, EngineError } from "./client"

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
  if (res.status === 404) return null
  return textResponse(res)
}

export async function putReview(engine: EngineClient, key: string, text: string): Promise<void> {
  const res = await engine.request(
    route(engine, key),
    { method: "PUT", headers: { "Content-Type": "application/json" }, body: text },
    { timeoutMs: 0 },
  )
  await textResponse(res)
}

export async function deleteReview(engine: EngineClient, key: string): Promise<void> {
  const res = await engine.request(route(engine, key), { method: "DELETE" }, { timeoutMs: 0 })
  await textResponse(res)
}
