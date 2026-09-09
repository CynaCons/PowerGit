# Recent repositories after restart (2026-09-09)

## Reachable engine is not the same as an open repository

`sessionView().live` is false in `no-repository`. The previous recents
startup effect used `view.live`, so a restarted app without an open session
never fetched its saved list. v0.15.2 also fetches in `no-repository`.
`tests/e2e/recents-restart.spec.ts` reproduces the empty visible dialog with
saved API data and no current session, then checks it again after reload.
This proves the frontend startup defect, not actual AppImage disk persistence.
Ubuntu owner verification remains open.

## AppImage updates preserve the original path

tauri-plugin-updater 2.11.0 uses the AppImage path and replaces that file in
place. The filename can still contain an old version. PowerGit's desktop
entry `${XDG_DATA_HOME:-$HOME/.local/share}/applications/powergit.desktop`
records it in `Exec`. Settings → Updates → Open app location (v0.15.2)
reveals `$APPIMAGE`, not the temporary mounted executable. Snapshots record
the app location and data-directory overrides.

The engine's default recent list is under the user's LocalApplicationData
directory in `PowerGit/recents.json` (normally `~/.local/share/PowerGit` on
Linux); `POWERGIT_DATA_DIR` overrides it. It is separate from the AppImage.
