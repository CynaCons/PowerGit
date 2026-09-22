// The desk (v0.20.5). Prototype D of docs/prototypes/contrast.html, picked by
// the owner on 2026-09-22 — "I like the cards best" — after his report that
// "we're missing a bit of contrast and separators in the app. Right now its
// all just white and its hard to distinguish the different parts."
//
// Every part of the shell he has to tell apart is a card: one border, a small
// radius, a hair of shadow, with a gutter of the window's own colour between
// them. Both values are tokens written into `:root`, so application zoom
// scales the gutter along with everything else.

/** The gutter of desk between two panes, and the height of the splitter. */
export const deskGap = "var(--pg-desk-gap, 6px)"

/** A pane. Spread into a component's sx; it paints the card and nothing else. */
export const paneSx = {
  bgcolor: "background.paper",
  border: 1,
  borderColor: "divider",
  borderRadius: "var(--pg-card-radius, 6px)",
  boxShadow: "var(--pg-card-shadow)",
  // A pane's own content stops at the corner — the revision grid's canvas
  // included, which is why this lives on the card and not on its children.
  overflow: "hidden",
} as const
