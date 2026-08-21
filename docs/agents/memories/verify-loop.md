# Verify loop (token budget)

Captured 2026-08-21 after a session burned most of its context on Chrome MCP screenshots, not tests.

## Playwright is the default proof, screenshots are opt-in
- Functional: `frontend/` `npm run test:e2e` (headless, `retries: 0`, `maxFailures: 1`, no shot/trace/video).
- Pixel diffs: `npm run test:visual` — only when the owner asks. Baselines via `npm run test:visual:update`.
- Headed walkthrough: `npm run test:demo` — owner design demo, also opt-in.
- Chrome DevTools MCP `take_screenshot` / `take_snapshot` are not a test suite. They re-inject images as synthetic user messages (~100–460 KB each) and were the dominant token cost.

## Fail once
If e2e is red, do not rerun the suite. Seven tests failing on missing `browse-shell` is one crash. Read the first error, fix, run once.

## Blank page
`ReferenceError` after HMR (e.g. `visibleRefs is not defined`) means restart Vite and hard-reload. Do not screenshot a white page or re-run Playwright until the module loads.

## Do not list `frontend/`
`list_dir frontend/` walks `node_modules` and `src-tauri/target` despite `.gitignore`. Scope to `frontend/src`.
