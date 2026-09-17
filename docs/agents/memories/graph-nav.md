# Graph navigation: the compass (v0.18.12)

Owner (2026-09-16): "when we're in the main graph, I'd like to have some
sort of control buttons for 'go to head', 'go to successor' and 'go to
parent'" → "definitely the compass bottom right" (prototype B of
`docs/prototypes/graph-nav.html`; A was a header cluster, C chevrons on the
node).

## The model is pure: `graph/graphNav.ts`
- `parentsOf(rows, sha)`, `firstChildOf(rows, sha)`, `headSha(rows)`,
  `rowOf(rows, sha)` read one index per rows array, memoised in a `WeakMap`
  by reference: a refresh that changes nothing keeps the array
  (historyMerge.ts) and the index with it; a page append is a new array.
- `firstChildOf` is GE `GetRevisionChildren(id)[0]`: the topmost loaded row
  that lists the commit as a parent (GE's `Children` is an ImmutableStack
  pushed in load order, then reversed — first loaded first). Children above
  the loaded window do not exist; a tip has none.
- Pending rows (`row.artificial`) are not commits: never a child target,
  no parents, and a selected pending row disables ↑ and ↓ with "Select a
  commit to navigate" (⌂ still works). GE would list the artificial commit
  as HEAD's child; PowerGit does not, so navigation never lands where the
  compass goes dead.
- `navTargets(rows, selected, memory)` is what the compass and the chords
  consume: parents, the parent/child the buttons go to, HEAD, `atHead`, and
  a `NavReason` per button (`reasonText` is the tooltip line).

## GE parity: the way back, the selection history
- `ParentChildMemory` = GE `ParentChildNavigationHistory`: "go to parent"
  from M pushes M on the child stack, so "go to child" from the parent
  returns to M whichever child the loaded graph lists first; "go to child"
  pushes the parent stack the same way. Any other selection change clears
  both (`settle(sha)` in the hook's selection effect).
- `wayBackFrom(sha)` answers only for the row a move is heading to, or
  the row the memory was settled for. The grid renders with the new
  selection **before** the effect settles the memory, so without this
  guard a click elsewhere showed the previous row's way back for one
  render. The row a move leaves keeps the graph's own answer while the
  target pages in.
- `NavHistory` = GE `NavigationHistory`: every selection (however made)
  is pushed from the hook's effect on `current?.rev.id`; the same SHA twice
  in a row is one entry, so the selection a back/forward walk lands on is
  not pushed again; a new selection after a walk drops the forward
  entries; capped at 50. Cleared with the memory on a repository switch
  (`client.repoId`).
- Ctrl+P on a merge is the first parent, as in GE; the second parent is
  the list (badge, right-click, long press). GE's GoToFirstParent /
  GoToLastParent chords are not bound.

## Not loaded yet
- `useHistory.jumpToCommit(sha)` shares `loadUntil` with `jumpToRef`
  (pages 5 × PAGE at a time until the SHA is in `revisionsRef`), sets
  `loadingTarget` while it runs — the grid's tail says "Loading history to
  febf4ba…" instead of "Loading more history…" — and returns whether it
  landed instead of raising the error banner. `useGraphNav.select` calls
  it for any target not in `rowOf(rows)`; a miss is a status note: "Not in
  the loaded history", or "Not in the filtered graph" while the ref filter
  is on. `historyComplete` makes the miss immediate (the loop never runs).
- HEAD not loaded (an old checkout below newer branches): `targets.head`
  is null, `goToHead` takes the branch's SHA from the ref tree
  (`findRefTarget(refs, repo.branch)`) and pages to it.
- Under the ref filter a *parent* is always reachable from the same ref,
  so the only "Not in the filtered graph" in practice is Alt+← to a row
  the filter dropped (graph-nav.spec covers that one).
- e2e proof of the paging path: a 1100-commit fixture through
  `git fast-import` (a commit per process would take minutes; `git reset
  --hard` after it or the stale worktree adds a pending row), `page.route`
  holding `skip=1000` until the test releases it. Autofill loads to 10k on
  boot, so nothing smaller than a held page shows the state.

## The pill: `components/GraphCompass.tsx`
- Bottom-right of `.main` (RevisionGrid's `compass` slot, mounted by
  HistoryPane from `nav`), `right: 10; bottom: 10`, the mirror of
  GraphOptionsBar's `left: 10; bottom: 10`; z-index 5 like the options
  pill, above `.graph-scrollbar` (z 3, 8 px tall at bottom 0, the graph
  column's width only — it never reaches the right edge, and 10 px of
  bottom offset clears its height). The options pill's `maxWidth` leaves
  68 px at the right so its ancestry state cannot run under the compass.
- `useFloatingBar()` for the pointer/menu state plus a focus flag: 45 %
  opacity at rest, border + paper + shadow 3 when expanded (hover, focus
  within, menu open) — the options pill's recipe, `data-expanded` for tests.
- Buttons are 28 px round `IconButton`s that are never `disabled`:
  `aria-disabled` + `data-reason` keep them hoverable so the MUI tooltip
  can say why (Playwright honours aria-disabled — `click({ force: true })`
  in specs). ⌂ is lit (`data-lit`, primary tint and border) while the
  selection is HEAD. The tooltips are "Go to parent febf4ba" + a `Kbd`
  chip; `Kbd` got a `.MuiTooltip-tooltip &` rule for white ink.
- The parents list is a MUI `Menu` anchored bottom-left of the parent
  button, transform bottom-right, so it opens leftwards over the graph:
  header "2 parents of 643ab4f — Ctrl+P goes to the first", numbered discs
  (the first filled), mono SHA, subject, `Kbd` on the first. Test ids:
  `graph-nav`, `graph-nav-child`, `graph-nav-head`, `graph-nav-parent`,
  `graph-nav-parent-count`, `graph-nav-parents`, `graph-nav-parent-<n>`,
  `graph-nav-loading`.
- App.tsx is on the 400-line lint cap: the hook registers the chords on
  its own browse layer and HistoryPane mounts the pill, so App adds one
  hook call and one prop (see hotkeys.md).
- A mouse click never takes focus (v0.18.18): NavButton's `onMouseDown`
  calls `preventDefault`. The pill is outside `.grid-body`, whose
  `onKeyDown` owns the plain arrows, so a focused button left them dead
  until the grid was clicked. Tab still reaches it; MUI ButtonBase runs the
  user handler and then the ripple whatever the event's default; the
  parents Menu's focus trap restores focus to the grid. Proof is
  `GraphCompass.test.ts` (jsdom does not move focus on mousedown itself, so
  it asserts `defaultPrevented`); MUI's lazy ripple mounts in a microtask,
  hence `await act(async …)` around the dispatch or React warns.
