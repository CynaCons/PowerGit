# v0.15.2 release evidence (2026-09-09)

Changes: release inspector (Settings and POWERGIT_DEVTOOLS=1); native focus
logging independent of page JS; immediate page focus/visibility and refresh
timings; recent repositories load in no-repository phase; Settings reveals
the AppImage location. Snapshots include app path and data-directory overrides.

The recents symptom test was committed before the fix (4e64a9222), after
observing the empty Recent repositories dialog with a reachable engine and
saved entries. Browser test uses controlled engine responses; it is not a
native AppImage persistence test. Both Ubuntu owner reports stay open.

Local checks, scoped per owner request to keep testing light:
- 2 diagnostics unit tests; immediate shell log delivery and inspector command.
- 21 Rust shell tests, including after adding the app-location command.
- TypeScript build and lint on changed frontend files.
- 2 Playwright checks for inspector Settings action and recents after reload.
- Native optimized Windows build launched successfully; inspector window
  visually inspected, startup log and native focus events verified on disk.
  The native smoke preceded the later app-location/recents additions.
- 15 focused engine checks for existing CI failures: preserve the truncation
  flag before output is capped; request a stable rebase instruction format.
- 2 focused Playwright checks for existing CI failures: select the target
  branch after options load; test floating-label clipping only when the whole
  field is in the scroll viewport.

No local full engine/e2e/resolution/visual matrix reruns. Ubuntu native docking
and the actual owner freeze are unverified locally (Docker was not running).
CI and the release workflow provide Linux build/runtime validation.

Memories: diagnostics.md corrects the rAF/presentation inference and Windows
log directory; recents-startup.md explains the startup guard and AppImage path.
