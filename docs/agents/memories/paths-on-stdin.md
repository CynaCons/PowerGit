# Paths on stdin

## Large lists never travel in argv or URLs

Git path lists use `--pathspec-from-file=- --pathspec-file-nul` and the
`GitHost.RunTimedWithStdin` runner. Ref filters use `git log --stdin` and
POST `/revisions` JSON, not a query string. `RunLogged` records only the
stdin item count, never paths or refs; whole-tree stage/unstage uses
`git add -A` / `git restore --staged .`.
