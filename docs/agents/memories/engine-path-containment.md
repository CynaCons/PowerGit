# Engine path containment (`GitHost.ResolveInRoot`)

Captured 2026-09-11 (v0.16.0 review, finding 1).

## Two checks, and the OS case rule
Every UI-supplied path (`/files/*`, `/blob/worktree`) goes through
`GitHost.ResolveInRoot` in `src/engine/PowerGit.Engine/GitHost.Files.cs`.
It compares with `PathComparison`: ordinal on Linux, ignore-case on
Windows and macOS. Before, `OrdinalIgnoreCase` everywhere let
`../Repo/x` pass as inside `/tmp/repo/` on Linux. A lexical prefix test
runs first, then the same test on `RealPath(...)` of the root and of the
path, so a link inside the tree pointing outside (`link -> /etc`) is
refused with the same "outside the repository" error. The lexical path is
what callers get back.

## `ResolveLinkTarget` does not follow links in parent directories
`FileSystemInfo.ResolveLinkTarget(true)` resolves the entry it is called
on only. `RealPath` walks the existing prefix one component at a time from
the drive / `/`, and restarts from the target whenever a component is a
link (40 hops max; a link it cannot follow is left as is). The missing
tail (a `git mv` target) is appended unchanged. `LinkTarget` covers
symlinks and Windows junctions (`mklink /J`, no privilege needed), which
is what the test uses when `Directory.CreateSymbolicLink` is refused.

## Linux-only facts in xunit 2
There is no conditional `Skip` in xunit 2.9; `LinuxFactAttribute`
(`FilesTests.cs`) sets `Skip` in its constructor when not on Linux, so the
case-sensitivity test shows as skipped on Windows instead of silently
passing.
