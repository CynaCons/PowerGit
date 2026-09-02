# Grid diff and revision selection

## Ligatures stay disabled globally for code-like text
`frontend/src/theme.ts` exports `MONO_FONT` and `codeSx`, while `MuiCssBaseline`
falls back to `body { font-variant-ligatures: none; }` so the Fira Code-backed
monospace surfaces keep raw characters even when `sx`-generated classes cannot
be matched directly.

## Selected revision rows use a stronger shared highlight
`frontend/src/components/RevisionGrid.tsx` and `frontend/src/graph/draw.ts`
now share `--pg-grid-sel`, `--pg-grid-author`, and
`--pg-grid-sel-border` so the selected row has a stronger primary tint and a
2px left border, while same-author rows stay on the lighter tint.
