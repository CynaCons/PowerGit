# Agent reviews UI

## The inbox owns the main page slot

`AgentReviewsView` replaces the history/bottom-panel area while leaving the repository tree visible. Opening it closes file history; closing returns focus to the graph.

## A session id is its review key

The 40-hex agent-review session id is passed unchanged to `DiffTab`, `useReview`, and `ReviewBar`, so marks and comments persist in `.powergit/reviews/<id>.json` and the engine can copy them when changes are requested.

## The inbox poll is ambient

`useAgentReviews` loads immediately and every five seconds, aborts superseded requests, retains the last successful list on failure, and is mounted once in `App` so both rails always have the badge.

## Session diffs are read-only

The session passes no `actions` and a null `row` to `DiffTab`; this preserves review marks/comments while omitting reset menus. Each selected path loads through the session-specific diff route.
