import { describeThrown, EngineClient, EngineError } from "./client"
import type {
  AgentReview,
  AgentReviewBoard,
  AgentReviewEverywhere,
  AgentReviewList,
  AgentReviewThread,
  BoardMessage,
  DiffDto,
} from "./types"

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
/** v0.21.10: the reviews of every open repository. Engine-level path on
 *  purpose (no repoPath()): it is asked with the repo-less `base` client so
 *  the rail badge and the inbox work before anything is open in the window. */
export const listAllAgentReviews = (engine: EngineClient, signal?: AbortSignal) =>
  engine.request("/agent-reviews", {}, { signal }).then(json<AgentReviewEverywhere>)
export const getAgentReview = (engine: EngineClient, id: string, signal?: AbortSignal) =>
  engine.request(`${root(engine)}/${encodeURIComponent(id)}`, {}, { signal }).then(json<AgentReview>)
export const agentReviewDiff = (engine: EngineClient, id: string, path: string, signal?: AbortSignal, round?: number) =>
  engine
    .request(
      `${root(engine)}/${encodeURIComponent(id)}/diff?path=${encodeURIComponent(path)}${round ? `&round=${round}` : ""}`,
      {},
      { signal },
    )
    .then(json<DiffDto>)

const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

/** v0.21.1: the owner sends the round back to the agent. */
export const sendAgentReviewRound = (engine: EngineClient, id: string, note: string | null) =>
  engine
    .request(`${root(engine)}/${encodeURIComponent(id)}/send`, post({ note }), { timeoutMs: 0 })
    .then(json<AgentReview>)

/** v0.21.1: a comment posted at once (Ask now). */
export const askAgentReview = (
  engine: EngineClient,
  id: string,
  ask: { round: number; path: string; line: string; body: string },
) => engine.request(`${root(engine)}/${encodeURIComponent(id)}/ask`, post(ask)).then(json<AgentReviewThread>)

/** v0.21.12: the owner takes back a question asked on the board. */
export const withdrawAgentReviewComment = (engine: EngineClient, id: string, comment: string) =>
  engine
    .request(`${root(engine)}/${encodeURIComponent(id)}/comments/${encodeURIComponent(comment)}`, { method: "DELETE" })
    .then(json<AgentReviewThread>)

/** v0.21.13: the owner's reply in a comment's conversation (posted on the board). */
export const replyAgentReviewComment = (engine: EngineClient, id: string, comment: string, body: string) =>
  engine
    .request(
      `${root(engine)}/${encodeURIComponent(id)}/comments/${encodeURIComponent(comment)}/replies`,
      post({ body }),
    )
    .then(json<AgentReviewThread>)

/** v0.21.2: the review's board channel after a message id. */
export const agentReviewBoard = (engine: EngineClient, id: string, after: number, signal?: AbortSignal) =>
  engine
    .request(`${root(engine)}/${encodeURIComponent(id)}/board?after=${after}`, {}, { signal })
    .then(json<AgentReviewBoard>)

export const postAgentReviewBoard = (engine: EngineClient, id: string, text: string) =>
  engine.request(`${root(engine)}/${encodeURIComponent(id)}/board`, post({ text })).then(json<BoardMessage>)
/** v0.22.9: close a review from the cross-repository inbox; a pending one is cancelled. */
export const closeAgentReviewAnywhere = (engine: EngineClient, repoId: string, id: string) =>
  engine
    .request(`/agent-reviews/${encodeURIComponent(repoId)}/${encodeURIComponent(id)}/close`, post({}))
    .then(json<AgentReview>)

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

/** v0.22.0: the owner's comment on a step of a branch plan (posted on the board). */
export const commentBranchPlanStep = (engine: EngineClient, id: string, step: number, body: string) =>
  engine
    .request(`${engine.repoPath()}/branch-plans/${encodeURIComponent(id)}/comments`, post({ step, body }))
    .then(json<AgentReviewThread>)

/** v0.22.0: the plan's steps checked again against the repository as it is now. */
export const recheckBranchPlan = (engine: EngineClient, id: string) =>
  engine
    .request(`${engine.repoPath()}/branch-plans/${encodeURIComponent(id)}/recheck`, post({}), { timeoutMs: 0 })
    .then(json<AgentReview>)
