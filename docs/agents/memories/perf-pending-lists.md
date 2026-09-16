# Pending lists that scale

## Virtual row surface
`frontend/src/components/CompactFileList.tsx` uses `useVirtualizer` with a fixed 20 px row. Pending-file rows are plain classed DOM elements in `styles/app.css`; do not reintroduce per-row MUI component trees, because a 12,500-file status list previously mounted tens of thousands of nodes.

## Status identity
`hooks/statusEquals.ts` preserves the existing `RepoStatus` reference for an equal poll result. Derived pending rows and worktree diffs must depend on the relevant file inputs, not a freshly allocated wrapper object.

## Re-measure
Run `npm run perf:audit -- --pending 2000 --scenarios pending` against the private harness. The target budgets are commit window under 500 ms and Diff tab under 400 ms at 12,500 files, stage one under 400 ms at 2,500, and a quiet status poll under 50 ms main-thread time.
