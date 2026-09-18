# Review comments

## Diff item indexes are not parsed-line indexes

In review mode, `frontend/src/components/DiffView.tsx` expands each parsed line into a `line` item followed by its `note` items and optional `cmd` item. The `lineToItem` map translates review cursor line indexes before virtual scrolling or DOM lookup; without the review prop the original line-only DOM path remains unchanged.

## Variable rows are measured in VirtualLines

`frontend/src/components/VirtualLines.tsx` accepts per-index estimates and a measurement predicate. Diff note and command rows opt into `measureElement` and `height: auto`; ordinary code rows retain the fixed 18 px estimate unless wrapping is enabled.

## Command rows own focus while open

`ReviewRows.CommandRow` autofocuses its input and places the caret at the end. Enter and Escape stop propagation; successful commands and Escape close the row and `useDiffReview` returns focus to the diff, while parser errors keep the input open with its hint.
