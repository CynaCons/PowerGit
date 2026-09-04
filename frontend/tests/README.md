# Tests

Three lanes. Default is functional e2e. Visual and demo run only when the owner asks.

| Script                | What                    | Screenshots | When                        |
| --------------------- | ----------------------- | ----------- | --------------------------- |
| `npm run test:unit`   | Graph layout            | no          | every change to `src/graph` |
| `npm run test:e2e`    | Headless assertions     | no          | every UI change, **once**   |
| `npm run test:visual` | Pixel diffs             | yes         | owner asked                 |
| `npm run test:demo`   | Headed slow walkthrough | no          | owner design demo           |

E2e stops at the first failure (`maxFailures: 1`) and never retries. Do not re-run a red suite. Read the first error, fix, then run once.

While writing a new test, use `npm run test:e2e:debug`. After it is green, leave the spec quiet — no `console.log`, no `page.pause`, no `waitForTimeout`.

Visual specs live in `tests/visual/` and use `expect(page).toHaveScreenshot(...)`. Chrome DevTools MCP screenshots are not a test suite.
