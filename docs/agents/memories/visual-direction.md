# Visual direction (v0.13.15)

The design plan behind the chrome overhaul, so later changes keep to it.

## Subject
PowerGit is a desktop Git client whose product is the revision graph. The
audience is developers who grew up on Git Extensions, on Windows 11 and
Ubuntu, in long sessions, mostly on the keyboard. The page's one job:
read history fast and act on it (stage, commit, push) without leaving the
graph. An instrument panel, not a website.

## Color
| role | light | dark |
|---|---|---|
| ground (workspace floor) | #eef1f5 | #10161e |
| panel | #ffffff | #182029 |
| ink | #101827 | #e6ebf2 |
| meta | #5b6778 | #98a4b3 |
| hairline | #d6dce5 | #2a3340 |
| brand deep (primary) | #1553c9 | #3b7bff |
| brand light (selection band, mark) | #7ec6ff | #9fd5ff |

The two blues of the mark are the only accent. Neutrals carry a cool
slate bias (never plain grey, never #111 as "black"). Diff, lane and file
status colours are Git Extensions parity and are not tuned for looks.

## Type
The platform UI face (Segoe UI on Windows, Ubuntu on GNOME) stays: it is
the honest desktop choice and it rasterizes correctly on WebKitGTK, which a
webfont does not (docs/agents/memories/linux-fonts.md). Fira Code for
SHAs, code and diffs. Scale: 13 UI, 12 dense rows and grid header, 11
captions and badges, 15 dialog titles, the wordmark at subtitle1 700.
Weight 400/500 for text, 600 only for the wordmark, the selected branch and
primary actions. No uppercase labels, no letter-spaced eyebrows.

## Layout
Three flat regions that meet at 1px hairlines; no bordered, rounded cards
around panes. The owner compared three placements of the commands on the
real window (title bar, floating bottom bar, left rail) and chose the
rail: a slim title strip (mark, name, repository, window controls) and a
collapsible command rail (48px icons / 188px with labels, `pg.rail`) that
also carries open / recents / settings. The Commit count is a pill of its
own, above the icon when collapsed and after the label when expanded, and
caps at "999+". The title-bar toolbar survives as Settings → Command bar →
"In the title bar" (`pg.bar`); both render the one list in
`components/commandItems.tsx`. The pre-rail wireframe, for reference:

```
[✕ PowerGit] ⟳ Refresh [● Commit ▾] Stash ▾ Pull ▾ Push ▾ Fetch ▾ Branch ▾ Checkout Merge Rebase Tag   ─ □ ✕
┌──┬───────────────┬────────────────────────────────────────────────────┐
│▣ │ Branches       │ Graph   Message                    Author   Date   SHA│
│▤ │  master        │ ●─┐  HEAD powergit ci: keep …      Constantin …     │
│⟲ │ ▸powergit      │ │ ●   …                                              │
│  │ Remotes        ├────────────────────────────────────────────────────┤
│⚙ │ Tags           │ Commit  Diff (1)  File tree                          │
└──┴───────────────┴────────────────────────────────────────────────────┘
 powergit ↑0 ↓0 (0 changes)                        git 2.38 · engine 0.13.14
```
Left-aligned throughout; tabular numerals in the date and SHA columns.
The nav rail (48) and side panel (240) draw their right hairline; the
bottom panel draws its top one; the graph pane is borderless. The
splitter is a 5px strip on the ground colour that turns brand blue on
hover.

## Principles
- The graph is the spotlight: it is the only place with colour; chrome is
  quiet and flat.
- One filled button per surface (Commit in the bar); everything else is a
  text button with an icon.
- Hairlines encode region boundaries and nothing else; no shadows,
  gradients, or decorative radii.
- Selection is the spotlight band: brand-light tint on the text cells, the
  canvas band in the graph column, a 2px brand bar on the left.
- Copy is sentence case, active voice, from the user's side ("Reset file to
  HEAD…", not "Discard changes").

## What was rejected as a default
Cream + serif + terracotta; near-black + one acid accent; hairline
broadsheet columns; the rounded-card kit (which is exactly what the
v0.13.13 shell was: every pane a bordered rounded Paper on a grey floor);
uppercase eyebrows (the grid header was one); middle-dot meta strings.

## The graph's second signal: the checked-out branch's history (v0.14.0)

After selection, the one other thing the graph says is which commits the
checked-out branch reaches. Reachable nodes carry a thin ring in the head
outline colour (HEAD keeps its 2px ring); with "Dim others" on, everything
outside that history is painted in the Git Extensions non-relative grey
(`--pg-lane-non-relative`) and the highlighted lines get one extra pixel of
stroke. Scope is all ancestors or the first-parent line. The choices live
in the floating pill at the bottom-left of the graph column
(`GraphOptionsBar`), the same device as the diff options pill. Text cells
are never dimmed: the message column stays readable, the graph column
carries the signal. Tag chips carry a tag glyph in violet; remote chips a
cloud in green.

The same signal can start from any commit (v0.18.4, owner: "right click on
a commit and hit Highlight ancestry and then temporarily all the ancestry
is highlighted like we do for the current branch"; GE "Highlight selected
branch (until refresh)"). The row menu item, Alt+click and Ctrl+Shift+B
make a row the root: `markAncestry(rows, rootId)` walks from it instead of
HEAD, the root wears HEAD's 2 px outline (HEAD keeps its own), and the
scope, Ring and Dim choices apply unchanged. The pill is the mode's home
and turns **amber** — the review `todo` tokens, the one hue outside the
blues, so the temporary state never reads as a setting: amber border and
route icon, "Ancestry of" + the 7-char SHA (mono) + the subject (ellipsis
at 150 px) in place of "Checked-out branch", an outlined amber Exit with
an Esc key chip, pinned open until Exit / Esc / a refresh that drops the
row / a repository switch, then it collapses again. Text cells are still
never dimmed. Never persisted: it is a look, not a setting.

## Recent repositories: a flat picker, the disc is the one bold element (v0.18.7)

Owner (2026-09-15): "can we run /frontend-design on the Recent Repositories
overlay? Show me visual prototypes to improve that UI" → "ok for C" of
`docs/prototypes/recents.html` (A quick-open list, B by folder, C tiles, D
today). The v0.4.6 dialog was the last place the rounded-card kit survived
(a centred modal, two columns of outlined cards, the full path on every
one). The picker (`components/RecentsDialog.tsx`, `RecentTile.tsx`,
`recentsModel.ts`) opens where a command palette opens — 80 px from the
top, 760 wide — with the focus in the search box, and is a hairline grid
of tiles three across (two under 700 px): no cards, no shadows, the lines
are the 1 px gap on `--pg-border-soft`. One bold element per tile: a
30 px initials disc (the name's first two words, camel-case counted,
PowerGit → PG) coloured by a stable hash of the *path* onto the six
ref-badge pairs — the author-disc device of v0.18.1, so two repositories
called `api` never share a disc. Then the name at 500 with a fork-glyph
branch chip (the chip truncates before the name does), the path in the
code face with the shared root in text.disabled, the tail in
text.secondary and the ellipsis from the left, "open now" after the path
of the open repository, and a mono 1–9 hint in the corner that gives way
to the cross on hover and on the cursor tile. The cursor tile wears the
grid's selection band (`--pg-grid-sel`, 2 px `--pg-grid-sel-border` on the
left). The footer sits on the sunken surface: the count ("6
repositories" / "1 of 6"), the key hints as `Kbd` chips, Open folder….
Forgetting is a five-second Undo in the footer ("Removed <name> · Undo"),
never a confirm. Empty states in the interface's voice: "No repositories
yet — Open a folder and it will be listed here next time." and "Nothing
matches "x" — Try part of the path or the branch name."
