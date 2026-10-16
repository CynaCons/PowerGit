# Agent reviews UI

## The inbox owns the main page slot

`AgentReviewsView` replaces the history/bottom-panel area while leaving the repository tree visible. Opening it closes file history; closing returns focus to the graph. Since v0.21.10 it also outranks the start pane: `useStartPane` reports `open: true` whenever no repository is open, so the page must be chosen first (`agentReviews.page.open ? …`, never `&& !startPane.open`), or the rail button reaches nothing exactly when the window has no repository.

## A session id is its review key

The 40-hex agent-review session id is passed unchanged to `DiffTab`, `useReview`, and `ReviewBar`, so marks and comments persist in `.powergit/reviews/<id>.json` and the engine can copy them when changes are requested.

## The inbox poll is ambient

`useAgentReviews` loads immediately and every five seconds, aborts superseded requests, retains the last successful list on failure, and is mounted once in `App` so both rails always have the badge. Since v0.21.10 it polls the engine-level `GET /agent-reviews` with the repo-less `base` client (never `repoPath()`, which throws with no repo), so the inbox and the badge cover every repository and work before anything is open.

## One row may live in another repository

`GET /agent-reviews` returns `{ sessions: [{ repo, session }], badge }`, newest first; the engine builds it from the DataDir review index plus open repos and recents, so a review stays listed after the window closes its previous session on a switch. The per-review routes stay under `/repos/{id}/`, so a row opens its own repository first (`openRepo(root)` awaited, then `openSession(id)`); a failed switch leaves the list up with the reason on it. The page state lives in `useAgentReviewsChrome`, which App keeps mounted across the switch, so the review view stays open.

## Session diffs are read-only

The session passes no `actions` and a null `row` to `DiffTab`; this preserves review marks/comments while omitting reset menus. Each selected path loads through the session-specific diff route.
