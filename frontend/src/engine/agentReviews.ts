import { describeThrown, EngineClient, EngineError } from "./client"
import type { AgentReview, AgentReviewList, DiffDto } from "./types"

async function json<T>(res: Response): Promise<T> {
  const text = await res.text().catch((e: unknown) => {
    throw new EngineError(`could not read the engine's response: ${describeThrown(e)}`, res.status)
  })
  let body: unknown
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    throw new EngineError(`engine returned a non-JSON response (http ${res.status})`, res.status)
  }
  if (!res.ok) throw new EngineError((body as { error?: string } | null)?.error ?? `http ${res.status}`, res.status)
  return body as T
}

const root = (engine: EngineClient) => `${engine.repoPath()}/agent-reviews`
export const listAgentReviews = (engine: EngineClient, signal?: AbortSignal) =>
  engine.request(root(engine), {}, { signal }).then(json<AgentReviewList>)
export const getAgentReview = (engine: EngineClient, id: string, signal?: AbortSignal) =>
  engine.request(`${root(engine)}/${encodeURIComponent(id)}`, {}, { signal }).then(json<AgentReview>)
export const agentReviewDiff = (engine: EngineClient, id: string, path: string, signal?: AbortSignal) =>
  engine
    .request(`${root(engine)}/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}`, {}, { signal })
    .then(json<DiffDto>)
export const resolveAgentReview = (
  engine: EngineClient,
  id: string,
  action: "approve" | "request_changes" | "cancel" | "ack",
  summary?: string,
) =>
  engine
    .request(
      `${root(engine)}/${encodeURIComponent(id)}/resolve`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, summary }) },
      { timeoutMs: 0 },
    )
    .then(json<AgentReview>)
