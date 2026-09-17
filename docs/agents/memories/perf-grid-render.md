# Grid render performance

## v0.18.16 baseline and follow-up

The 2026-09-16 audit records a 6 s scroll's `graphWidth` self time as 143 / 99 / 216 ms (PowerGit / flutter / vscode) and hover-to-canvas median as 32 / 32 / 34 ms in the Vite development build. This worker could not run the detached flutter audit because the required dedicated harness was not available; the coordinator should add after numbers from `npm run perf:audit -- --repo C:\dev\flutter --scenarios scroll,hover`.
