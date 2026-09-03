# Per-file LF/CRLF drift is pre-existing, not something your edit introduced

Observed 2026-09-02 while touching `frontend/src/**/*.tsx`, `engine.ts`, and
`src/engine/PowerGit.Engine/**/*.cs`.

## `.gitattributes` does not force CRLF for `.ts`/`.tsx`/`.cs`
Only `*.sln`, `*.targets`, `*.bat`, `*.cmd` get an explicit `eol=crlf`; `.cs`
gets `text diff=csharp` (no eol=) and `.ts`/`.tsx` fall under the generic
`* text=auto`. Canonical storage for these files is therefore LF regardless
of what the working tree shows, so a file sitting as LF-only does not mean
it will diff/commit differently than a CRLF one.

## Some already-committed files are LF-only in the working tree today
Before touching anything this session, `GitHost.Jobs.cs` and
`DiffOptionsBar.tsx` were already 100% LF (verified byte-by-byte), while
sibling files like `GitHost.cs` and `theme.ts` were 100% CRLF. This is
leftover from earlier agent sessions' tools, not a live `core.autocrlf`
problem — `core.autocrlf=true` only rewrites on checkout, not for files an
editor tool overwrites in place.

## The edit/create tools preserve each file's existing convention
Editing an already-CRLF file (`Dtos.cs`, `GitHostTests.cs`, `BottomPanel.tsx`)
kept it 100% CRLF after inserting new lines; editing an already-LF file
(`GitOps.tsx`, `CommitDialog.tsx`, `GitHost.Operations.cs`, `Program.cs`,
`engine.ts`) kept it 100% LF. No file ended up mixed. Verify with a quick
byte scan instead of guessing:
```powershell
$b=[IO.File]::ReadAllBytes($path);$crlf=0;$lf=0
for($i=0;$i -lt $b.Length;$i++){if($b[$i]-eq10){if($i-gt0-and $b[$i-1]-eq13){$crlf++}else{$lf++}}}
"CRLF=$crlf LF=$lf"
```
If `git diff` warns `LF will be replaced by CRLF the next time Git touches
it` on a file you edited, check whether it was already LF-only before your
edit (it usually was) before treating it as a regression to fix.
