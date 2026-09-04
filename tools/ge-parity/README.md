# Git Extensions graph parity fixtures

PowerGit's lane layouter (`frontend/src/graph/layout.ts`) is a TypeScript
reimplementation of Git Extensions' `RevisionGraph` (`src/app/GitUI/UserControls/
RevisionGrid/Graph/` in the reference worktree). It is not shared code and it
cannot be: the GE graph lives in the WinForms `GitUI` project, the PowerGit
engine must stay `net10.0` without `UseWindowsForms`, and the layout runs in a
Web Worker. So instead of reusing the code we reuse GE's **tests**.

Git Extensions ships snapshot tests for its layouter
(`tests/app/UnitTests/GitUI.Tests/UserControls/RevisionGrid/Graph/
RevisionGraphTests.cs` plus `*.verified.txt`). Each scenario is a small
synthetic history; the verified file is the ASCII rendering GE's
`AsciiGraphFor` produced for it. This directory turns those into JSON golden
fixtures that `frontend/src/graph/layout.ge-parity.test.ts` replays against
PowerGit's layouter. Nothing here needs a .NET build.

## Run

```bash
node tools/ge-parity/extract.mjs                 # ../gitextensions-ref relative to the repo root
node tools/ge-parity/extract.mjs C:\path\to\ref  # or GE_REF=...
cd frontend && npx vitest run src/graph/layout.ge-parity.test.ts
```

The generated `frontend/src/graph/__fixtures__/ge/*.json` are committed; the
vitest run never touches the reference worktree. Re-run the extractor when the
upstream pin moves (see `docs/agents/memories/branch-model.md`).

## What is transcribed by hand and what is parsed

`scenarios.json` is a **hand transcription** of the C# scenarios: test method,
verified file name, the commit spec string, whether the spec lists commits
oldest first (`CreateGraph`) or newest first (`CreateGraphTopDown`), and the
`AppSettings` in force (`MergeGraphLanesHavingCommonParent`,
`StraightenGraphDiagonals`). The C# is not parsed generically — the
scenarios are built from `[TestCase]` strings, `[Values]` parameters, a
constant, and two hand-built `GitRevision` graphs, which is not worth a
parser. `extract.mjs` guards against drift instead: every spec string must
still appear verbatim in `RevisionGraphTests.cs` (except the two
`handWritten` ones), and every test method name must exist.

`extract.mjs` **parses** the spec strings (`{id}:{parent},{parent}`, space
separated) into revisions in row order, and parses the verified ASCII.

## What the ASCII captures — and what the test asserts

`AsciiGraphFor` emits two lines per commit:

- **Commit line** (even lines): one character per lane, lanes two columns
  apart. `|` = a segment occupies that lane on this row; the node is drawn
  as its 1-character subject (or `*`) in the revision's lane, overwriting
  any `|` there. Trailing spaces are trimmed.
- **Connector line** (odd lines): for every segment of the row that continues
  on the next row, where it goes: `|` same lane, `\` / `/` one lane right or
  left (`X` when both cross), `` ` ``…`-`…`ˎ` several lanes right, `´`…`-`…`,`
  several lanes left. Segments that end at this row draw nothing.

So the snapshot pins, per row: the node lane, the set of lanes carrying
segments, and each segment's lane on the next row. It does **not** capture
`LaneSharing` (Exclusive / DifferentStart / DifferentEnd / Entire), colours,
`IsRelative`, segment identity beyond "continues in lane N", or how the
WinForms renderer draws curves. Those are outside this parity claim.

Each fixture therefore carries:

```jsonc
{
  "name": "SegmentsAreStraightened_merge=true",
  "source":   { "test": "RevisionGraphTests.SegmentsAreStraightened", "verifiedFile": "…", "spec": "…", "order": "oldestFirst" },
  "settings": { "mergeGraphLanesHavingCommonParent": true, "straightenGraphDiagonals": false },
  "revisions": [ { "id": "8", "parents": ["7", "2"], "label": "8" }, … ],   // row order, newest first
  "expectedRows": [ { "id": "8", "lane": 0, "laneCount": 1, "occupiedLanes": [] }, … ], // parsed commit lines
  "expectedAscii": [ "8", "|\\", "7 |", … ]                                 // the verified.txt, BOM/CRLF stripped
}
```

The test runs `createLayouter().append(revisions)`, renders the rows with a
TypeScript port of `AsciiGraphFor`, and asserts (1) row order, (2) node lane
per row, (3) occupied lanes per row, (4) the full ASCII, verbatim. Nothing is
normalised on either side.

## Known divergences

`KNOWN_DIVERGENCES` in the test lists the fixtures PowerGit does not
reproduce, with a one-line reason each. Those fixtures are still laid out and
rendered, and the assertion is inverted: if one starts matching, the test
fails so the entry is removed. Two families:

- `MergeGraphLanesHavingCommonParent=false` — GE then also enables
  `ReduceGraphCrossings`, which reorders start segments with a 50-row
  look-ahead. PowerGit hard-codes merge=true (GE's default).
- `StraightenLanes` / `StraightenDiagonals` — GE post-passes that move
  already-laid-out rows using a 20-row look-ahead. PowerGit's worker protocol
  is append-only (rows returned once, never revised), so it has no
  straightening pass. For every merge=true divergence, PowerGit's rendering
  equals GE's layout *before* straightening, lane for lane.

## Not extracted

- `MoveVisibleAndInvisibleLanesRight_*` call `IRevisionGraphRow.MoveLanesRight`
  directly to exercise gap bookkeeping; they are not layout scenarios.
- The non-snapshot tests in `RevisionGraphTests.cs` (`ShouldBeAbleToGetLaneCount`,
  topo-order, caching, `HighlightBranch`) and `LaneInfoProviderTests`,
  `LaneNodeLocatorTests`, `RevisionGraphRowTests`, `RevisionGraphColumnTests`
  test other units (tooltips, hit testing, render cache).
