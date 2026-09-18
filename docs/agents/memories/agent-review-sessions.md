# Agent review sessions

## File layout
Sessions are engine-written JSON documents at `.powergit/agent-reviews/<id>.json`; writes are atomic and `/.powergit/` is locally excluded.

## Session id is the review key
The random 40-lowercase-hex session id also keys `.powergit/reviews/<id>.json`, so v0.19 marks and comments need no second format or mapping.

## Wait is a notification, not a decision
`GitHost.WaitAgentReview` waits on a swapped `TaskCompletionSource`, re-reads after every bump, and returns pending plus `timedOut: true` at the clamped deadline; it never auto-approves.
