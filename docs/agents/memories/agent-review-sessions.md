# Agent review sessions

## File layout
Sessions are engine-written JSON documents at `.powergit/agent-reviews/<id>.json`; writes are atomic and `/.powergit/` is locally excluded.

## Session id is the review key
The random 40-lowercase-hex session id also keys `.powergit/reviews/<id>.json`, so v0.19 marks and comments need no second format or mapping.

## Wait is a notification, not a decision
`GitHost.WaitAgentReview` takes the current `TaskCompletionSource` before the read, re-reads after every bump, and returns pending plus `timedOut: true` at the clamped deadline; it never auto-approves. Since v0.21.10 the signal lives in a static dictionary keyed by `IdFor(root)`, so a resolve on any `GitHost` instance of the same folder wakes a waiter on another instance (closing and reopening the repo no longer strands the agent until the deadline).

## Cross-repository index (v0.21.10)
`AgentReviewRepos` keeps `<RecentsStore.DataDir>/agent-review-repos.json`, a deduplicated (by `IdFor`) list of roots a review was opened in; `CreateAgentReview` records the root and never fails on index IO. `GET /agent-reviews` (top level, outside `/repos/{repo}`) unions that index with the open sessions and the recents, reads each root straight from disk via `GitHost.ListAgentReviews(root, boardPath)`, skips roots without a `.powergit/agent-reviews` folder, and answers `{ sessions: [{ repo, session }], badge }` newest-first. It never opens a repository or writes recents.
