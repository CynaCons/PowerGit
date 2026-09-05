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
