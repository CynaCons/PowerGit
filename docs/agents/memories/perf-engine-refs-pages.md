# Engine refs and history paging

## Ref names no longer make Git disambiguate every ref
v0.18.15 asks `for-each-ref` for full names and derives display names in C#.
It strips the heads/remotes/tags prefix, except that a name shared by kinds is
shown as `heads/name`, `tags/name`, or `remotes/name`, matching Git's useful
disambiguation. The audit measured vscode `/refs` at 2,578 ms with
`%(refname:short)` and 130 ms without it.

## Fewer, larger history pages
History pages are now 3,000 rows under the unchanged 10,000 eager ceiling.
The vscode target is boot to 10k rows under 8 s and refresh under 1.5 s;
the synthetic-fixture CI boot budget is 12 s (measured allowance × 1.5).
The fixed ~1.3 s `git log` setup cost still exists per page. A long-lived,
streamed log is the follow-up if 3,000 rows is insufficient.

## Status avoids constant git probes
The absolute git directory is resolved on open and HEAD is read directly for
status, leaving status porcelain, ahead/behind, upstream, and file flags as
the four git calls. On the audit's vscode tree status remains filesystem-bound;
`core.fsmonitor` is a separate follow-up.
