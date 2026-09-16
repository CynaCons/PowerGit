# Operation dialogs

## A-shell contract (v0.18.11)

`frontend/src/components/dialogs/OpDialog.tsx` owns the shared 15 px / 600 title,
Enter/Esc hints, quoted subject band, footer note and `primary` contract
(`label`, `danger`, `disabled`, `testid`). Dialogs choose an explicit 520–600 px
width; inputs use `Field` and options use `OptionRow` / `OptionGroup`.

## Quote and clipping rules

The operation target is rendered as `QuotedRow` or `QuotedRef` on the sunken
band; it is the dialog's one decorated element. Labels sit above controls,
and labels/options must stay inside the paper and never wrap. `BranchPicker`
is the chip-valued searchable control shared by Checkout and Merge; do not
bring back a floating-label MUI select.

## Counts come from git, not the UI

Checkout and Delete branch call `GET /branches/divergence`, whose
`rev-list --left-right --count` result supplies ahead/behind and unreachable
commit language. Delete's merged state is the same question (`ahead === 0`)
against the checked-out branch. Dirty counts come from the loaded status.
