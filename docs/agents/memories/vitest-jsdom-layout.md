# vitest jsdom has no layout: scrollHeight/getBoundingClientRect stay 0

## Component tests cannot measure the DOM (2026-10-16)
`environment: "jsdom"` in this repo's vitest runs does **not** implement
layout: `el.scrollHeight`, `el.getBoundingClientRect().height` and friends
always return 0. A "render unclipped, measure, clip if too tall" fold
component therefore never clips in a test and its "Show more" button never
appears — the failure looks like a broken feature, not a measurement gap.

Pattern that works in both worlds (Markdown.tsx's `fold`, v0.21.11): in
the effect, take the browser's real `scrollHeight` when it is > 0, else
fall back to a text estimate (lines × line height, `ceil(len / 60)` per
paragraph). The browser gets true measurement; jsdom gets a deterministic
decision.

Related timing landmine: a test that exercises `tokenizeLines` for the
first time pays Shiki's dynamic `import("shiki/core")` — cold, that is
seconds on this machine (suite env setup ~96 s), so a `vi.waitFor` with a
5 s budget times out even though the code is correct. Wait with a plain
`await new Promise(r => setTimeout(r, 2500))` inside `act(async () => {})`
and give the `it` a 30 s timeout; `vi.waitFor` also misbehaved inside
`act` here (never saw the spans), the plain wait did.
