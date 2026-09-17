# Grid render performance

## v0.18.16 baseline and follow-up

The 2026-09-16 audit records a 6 s scroll's `graphWidth` self time as 143 / 99 / 216 ms (PowerGit / flutter / vscode) and hover-to-canvas median as 32 / 32 / 34 ms in the Vite development build. This worker could not run the detached flutter audit because the required dedicated harness was not available; the coordinator should add after numbers from `npm run perf:audit -- --repo C:\dev\flutter --scenarios scroll,hover`.

## Held keys select once per frame (v0.18.18, `components/heldKey.ts`)

`useHeldKey(onSelectRef)`: a keydown with `e.repeat` only advances a pending index and one `requestAnimationFrame` calls `onSelect` with the latest; the first press and Home/End stay immediate; keyup, blur and unmount drop the pending frame. The pending index stays the base until the key is released — the rAF's `setSelectedSha` runs with `window.event` undefined, so it is a DefaultLane update committed in a later task, and a repeat can land before that; restarting from the `selected` prop would then stall a step. Test: `RevisionGrid.test.ts` "held keys" (rAF stubbed with `vi.stubGlobal`; React's `onBlur` is `focusout` when dispatching by hand).

## A setState(null) on selection is not free while a deferred pass is pending

React's eager same-state bailout needs `fiber.lanes === NoLanes`; `useDeferredValue(current)` in App merges a DeferredLane into App's fiber during the urgent render, so the passive-effect `setNoteState(null)` after a click enqueued a real SyncLane update and ran App's body a third time (urgent, extra, deferred). A functional updater does not help (the bailout is skipped before the reducer runs). `useStatusNote(clearOn)` guards on a `hasNote` ref and dispatches nothing; `useStatusNote.test.ts` counts 2 renders per selection, 3 without the guard.

## The 400 code-line `max-lines` cap and prettier fight

App.tsx and RevisionGrid.tsx sit at the cap (blank lines and comments do not count). Squeezing two statements onto one line to fit (e07e5ee97 did) trips `format:check`, and prettier's split trips lint. Extract instead: `heldKey.ts` took the grid's held-key logic, `useStatusNote(selectedSha)` took App's clear-on-selection effect.
