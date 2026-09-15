# Save as patch (v0.18.6)

Owner (2026-09-15): "Being able to export a patch from a commit. Probably
from the right click menu." Git Extensions' `FormFormatPatch` is a dialog
(a range, an output directory); PowerGit puts one entry in the row menus
and writes one file. `GitHost.Patch.cs`, `useOperationActions.savePatch`,
`revisionMenuModel.ts` (`ctx-save-patch`), `fileHistoryMenuModel.ts`
(`fh-save-patch`), `save-patch.spec.ts`.

## The engine streams, the shell writes
The engine stays read-only and never learns the destination:
`GET /repos/{id}/commits/{sha}/patch` streams `git format-patch -1 --stdout
--find-renames --find-copies --break-rewrites <sha>` through the
`OpenArchive` pattern (`StartStreamed`: a detached child, its stdout is the
response, the launch is in the command log with "exit code not observed"),
so a huge patch never meets `GitProcess`'s stdout cap. The shell side is
`plugin-dialog`'s `save()` (already granted by `dialog:default`) plus a
20-line `write_text_file(path, contents)` Tauri command in `lib.rs`: the
parent folder must exist, nothing is ever created, the error string is what
the page shows. No fs plugin, no engine write.

Because the exit code is not observed, everything that can fail is checked
**before** the launch: `rev-parse --verify <id>^{commit}` (400 naming the
id), and the parent list from `log -1 --format=%f%n%P` — a merge is a 400
too, since `format-patch` silently prints nothing for one. An empty commit
also prints nothing (`--always` would fix it but is git ≥ 2.36 and Ubuntu
22.04 ships 2.34); that case is left alone.

## The file name is git's own
`%f` is the sanitized subject `git format-patch` uses; git then chops
`0001-<%f>` at 57 bytes so the whole name stays under 64 (`log-tree.c`
`fmt_output_subject`, `FORMAT_PATCH_NAME_MAX_DEFAULT`), then `.patch`.
`GitHost.PatchFileName` does the same chop; `PatchTests` pins it. The name
travels in `Content-Disposition` (ASP.NET writes both `filename=` and
`filename*=UTF-8''…`); `fileNameOf` in `client.ts` prefers the starred
form. The pending rows are `<repo>-worktree.patch` / `<repo>-index.patch`
(`GET /worktree/patch?scope=`), `git diff --binary` with `--cached` for
the index — untracked files are not in a diff, as on the command line.

## The browser fallback and the query token
Dev, demo and Playwright have no Save dialog: `savePatch` opens
`client.patchUrl(sha)` with `openExternal` and the browser downloads it
under the same name. A download is a navigation and carries no
`Authorization` header, so `EngineAuth.AcceptsQueryToken` lets
`/archive` and `/patch` take `?token=` like `/events` — and nothing else
does. (`archiveUrl` had put the token in the query since v0.15.0 without
the engine honouring it; the browser path of "Create archive…" was a 401
until v0.18.6.) In a spec, `window.open(url, "_blank", "noopener")` starts
the download from a **popup** page: listen on `page.context().once("page")`
→ `popup.once("download")` as well as `page.once("download")`
(`nextDownload` in `save-patch.spec.ts`).

## The pending rows' entry and its disabled state
The rows exist only while their count is > 0 (`withArtificialRows`), so
"disabled when the count is 0" is reachable only with the menu already
open when the tree goes clean under it — a live refresh sets
`unstagedCount` to 0, `RevisionContextMenu` re-renders on the stale
target, and the entry greys out instead of offering an empty file. That is
how the spec proves it (`git checkout -- a.txt` with the menu open). The
model needs to know *which* row it is: `RevisionMenuInput.artificial` is
`false | "worktree" | "index"` since v0.18.6, no longer a boolean.

## The status bar's note slot
`useStatusNote` (`hooks/useStatusNote.ts`): `{ text, action? }`, cleared
by `App.tsx` on the next row selection or by its own 10 s timer;
`StatusBar` draws it as `status-note` with `status-note-action`. "Saved
0001-….patch — Show in folder" (`revealInFolder`) is its first user; it is
a general slot for "something landed on disk".

## What a range would need
GE's dialog takes "from the other selected commit to this one" and writes
`0001-…`, `0002-…` into a directory. That is `git format-patch <from>..<to>
--stdout` (one mailbox with several messages, `git am` takes it whole) or
`-o <dir>` with the engine writing — the second breaks "the engine never
writes where the user points" and needs a folder picker instead of `save()`.
A range also needs the menu to know the other selected row
(`otherSelectedSha` already reaches the model for Compare). Backlog.
