// The one place a colour literal may live (v0.13.13). Everything else —
// the MUI palette, the `:root` custom properties app.css reads, and the
// canvas graph — is derived from these two objects, so light and dark stay
// complete mirrors of each other and a hex never drifts between a CSS file
// and a TS file.
//
// Literal hex / comma-syntax rgba only: the values are also written into
// `:root` as custom properties and read back by WebKitGTK's CSS parser and
// by the canvas fillStyle parser, neither of which can be trusted with
// color-mix(), oklch() or light-dark(). See
// docs/agents/memories/webkitgtk-css.md and visual-tokens.md.
// `graph/types.ts` intentionally retains exported Git Extensions fixture
// constants for parity tests. Canvas fallback literals likewise exist only
// for the no-DOM/early-paint path and are overridden by these variables.

export type ThemeMode = "light" | "dark"

export type RefBadge = { bg: string; fg: string }

export type Tokens = {
  /** Panels, paper, the revision grid. */
  surface: string
  /** The desk the panes sit on: the window background that shows through
   *  the gutters between cards (MUI background.default). A step darker than
   *  a pane since v0.20.5, or the cards do not read. */
  surfaceAlt: string
  /** Footers and strips that sit a step below the surface. */
  surfaceSunken: string
  /** Inside a pane, the ground cards sit on (Recent repositories, v0.21.6). */
  well: string
  /** Blocks of monospace output (job output). */
  codeBg: string
  /** "Too large / binary" notices. */
  noticeBg: string
  text: string
  /** MUI text.secondary. */
  textSecondary: string
  /** Grid metadata columns and header captions. */
  textMeta: string
  textDisabled: string
  /** MUI divider and Paper borders. */
  border: string
  /** Grid header/footer rules. */
  borderSoft: string
  /** The outline of a card on a well (v0.21.6). */
  borderStrong: string
  primary: string
  primaryDark: string
  onPrimary: string
  /** Brand mark strokes (src/assets/logo.svg): deep and light blue. */
  brandDeep: string
  brandLight: string
  selectionBg: string
  selectionBorder: string
  hover: string
  focusRing: string
  /** The hair of shadow under a pane (v0.20.5, prototype D). */
  cardShadow: string
  ref: Record<"local" | "remote" | "head" | "stash" | "tag" | "extra", RefBadge>
  diff: {
    added: string
    removed: string
    hunk: string
    meta: string
    context: string
    gutter: string
    gutterBorder: string
  }
  /** v0.15.0: "C" is an unmerged (conflicted) path. */
  fileStatus: Record<"A" | "M" | "D" | "R" | "U" | "C" | "other", string>
  status: { ok: string; warn: string; error: string }
  /** Git console dock line and panel (v0.15.1): a dark surface in BOTH
   *  themes, the way a browser's docked console is. */
  console: {
    bg: string
    /** The ~22 px dock line, a step above the panel so the two read apart. */
    lineBg: string
    text: string
    meta: string
    border: string
    ok: string
    /** v0.15.3: the app log's warnings. Green would read as success and the
     *  fail red would overstate them, so the console gains its own amber. */
    warn: string
    fail: string
  }
  /** Review mode's marks (v0.17.0, docs/design/review-mode.md §4). An
   *  unreviewed line is amber — green would read as "added" in a diff —
   *  ok is the primary blue, rejected is the diff's removed red, and the
   *  cursor is the grid selection so the two surfaces agree. */
  review: {
    todo: string
    todoBg: string
    todoStripe: string
    /** = primary */
    ok: string
    okBg: string
    /** = diff.removed */
    rejected: string
    rejectedBg: string
    /** = selectionBg */
    cursorBg: string
    /** Agent review rounds (v0.21.3): an accepted change, and what the agent wrote. */
    accept: string
    acceptBg: string
    agent: string
    agentBg: string
  }
  graph: {
    /** Git Extensions AppColor.GraphBranch1–7 (light) — parity, do not tune. */
    lanes: readonly [string, string, string, string, string, string, string]
    nonRelative: string
    headOutline: string
  }
}

// Light is the pre-v0.13.13 look, value for value: every literal below was
// lifted from app.css, tokens.css, theme.ts or a component sx.
export const light: Tokens = {
  surface: "#ffffff",
  surfaceAlt: "#e3e7ee",
  surfaceSunken: "#f6f8fb",
  well: "#e8ecf1",
  codeBg: "#f8fafc",
  noticeBg: "#fffbeb",
  text: "#101827",
  textSecondary: "#334155",
  textMeta: "#5b6778",
  textDisabled: "#64748b",
  border: "#d6dce5",
  borderSoft: "#e6eaf0",
  borderStrong: "#bcc5d1",
  primary: "#1553c9",
  primaryDark: "#0f3f9c",
  onPrimary: "#ffffff",
  brandDeep: "#1553c9",
  brandLight: "#7ec6ff",
  selectionBg: "#dbeafe",
  selectionBorder: "#2563eb",
  hover: "rgba(37, 99, 235, 0.08)",
  focusRing: "#2563eb",
  cardShadow: "0 1px 2px rgba(16, 24, 39, 0.07)",
  ref: {
    local: { bg: "#eff6ff", fg: "#2563eb" },
    remote: { bg: "#ecfdf5", fg: "#059669" },
    head: { bg: "#fef2f2", fg: "#dc2626" },
    stash: { bg: "#fef9c3", fg: "#a16207" },
    tag: { bg: "#f5f3ff", fg: "#6d28d9" },
    extra: { bg: "#f3f4f6", fg: "#6b7280" },
  },
  // Git Extensions git-coloring palette: AppColorDefaults.cs /
  // DiffHighlightService.cs (color.diff.old=red, new=green).
  diff: {
    added: "#189100",
    removed: "#d3000B",
    hunk: "#00a89a",
    meta: "#404040",
    context: "#000000",
    gutter: "#8a8a8a",
    gutterBorder: "#e0e0e0",
  },
  fileStatus: {
    A: "#189100",
    M: "#946cd4",
    D: "#d3000B",
    R: "#00a89a",
    U: "#e6a700",
    C: "#c2410c",
    other: "#737373",
  },
  // MUI's own defaults, spelled out so dark can override them.
  status: { ok: "#2e7d32", warn: "#ed6c02", error: "#d32f2f" },
  console: {
    bg: "#12171e",
    lineBg: "#1b222b",
    text: "#e6e9ef",
    meta: "#9aa6b4",
    border: "#2a3340",
    ok: "#5ee38a",
    warn: "#f5b942",
    fail: "#ff8a80",
  },
  // The prototype's light ambers (docs/prototypes/review-mode.html).
  review: {
    todo: "#b7791f",
    todoBg: "rgba(183, 121, 31, 0.10)",
    todoStripe: "#d99a2b",
    ok: "#1553c9",
    okBg: "rgba(21, 83, 201, 0.10)",
    rejected: "#d3000B",
    rejectedBg: "rgba(211, 0, 11, 0.10)",
    cursorBg: "#dbeafe",
    accept: "#047857",
    acceptBg: "rgba(5, 150, 105, 0.10)",
    agent: "#7c3aed",
    agentBg: "rgba(124, 58, 237, 0.08)",
  },
  graph: {
    lanes: ["#f064a0", "#78b4e6", "#24c221", "#a078f0", "#dd3228", "#1ac6a6", "#e7b00f"],
    nonRelative: "#a0a0a0",
    headOutline: "#1a1a1a",
  },
}

// v0.21.5 (owner picked proposal A of docs/prototypes/dark-contrast.html,
// "ok for a"): the same surfaces, with hairlines that show, a selection one
// clear step above hover, brighter secondary text and livelier badges.
// Dark: GNOME/VS Code-style neutral greys, every text token at WCAG AA
// (4.5:1) on both surfaces and every graphic (lanes, focus, primary) at
// 3:1. `contrast.test.ts` computes the ratios; change a value here and the
// test tells you if it fell under.
export const dark: Tokens = {
  surface: "#182029",
  surfaceAlt: "#0a0e13",
  surfaceSunken: "#141b23",
  well: "#0e1318",
  codeBg: "#14171b",
  noticeBg: "#3a2e0b",
  text: "#edf0f5",
  textSecondary: "#c6ccd5",
  textMeta: "#b0bbc9",
  textDisabled: "#8f98a5",
  border: "#384354",
  borderSoft: "#2d3744",
  borderStrong: "#526075",
  primary: "#5b94f7",
  primaryDark: "#4a7fe0",
  onPrimary: "#0b1220",
  brandDeep: "#5b94f7",
  brandLight: "#9fd5ff",
  selectionBg: "#23477a",
  selectionBorder: "#7ab4ff",
  hover: "rgba(160, 185, 220, 0.07)",
  focusRing: "#9cccff",
  cardShadow: "0 1px 2px rgba(0, 0, 0, 0.35)",
  ref: {
    local: { bg: "#1f4782", fg: "#d6e7ff" },
    remote: { bg: "#0e5139", fg: "#a7f3c4" },
    head: { bg: "#652424", fg: "#ffd9d9" },
    stash: { bg: "#56400c", fg: "#fdeaa5" },
    tag: { bg: "#3d2c7c", fg: "#e7e0ff" },
    extra: { bg: "#353e4a", fg: "#d5dbe3" },
  },
  diff: {
    added: "#5ee38a",
    removed: "#ff8a80",
    hunk: "#4dd0e1",
    meta: "#c9d1d9",
    context: "#e6e9ef",
    gutter: "#98a1ad",
    gutterBorder: "#364150",
  },
  fileStatus: {
    A: "#5ee38a",
    M: "#c4b5fd",
    D: "#ff8a80",
    R: "#5eead4",
    U: "#fbbf24",
    C: "#fb923c",
    other: "#a3abb8",
  },
  status: { ok: "#5ee38a", warn: "#fbbf24", error: "#ff8a80" },
  console: {
    bg: "#0d1116",
    lineBg: "#141b23",
    text: "#e6e9ef",
    meta: "#98a4b3",
    border: "#2a3340",
    ok: "#5ee38a",
    warn: "#f5b942",
    fail: "#ff8a80",
  },
  // The prototype's dark amber; the stripe is the ring colour itself since
  // a lighter amber would wash out on the dark surface.
  review: {
    todo: "#e0a83a",
    todoBg: "rgba(224, 168, 58, 0.12)",
    todoStripe: "#e0a83a",
    ok: "#5b94f7",
    okBg: "rgba(91, 148, 247, 0.14)",
    rejected: "#ff8a80",
    rejectedBg: "rgba(255, 138, 128, 0.14)",
    cursorBg: "#23477a",
    accept: "#34d399",
    acceptBg: "rgba(52, 211, 153, 0.14)",
    agent: "#a78bfa",
    agentBg: "rgba(167, 139, 250, 0.14)",
  },
  graph: {
    // Same hues as the GE set, lifted where a lane fell under 3:1 against
    // the dark surface (red, purple) so a branch line never disappears.
    lanes: ["#f47db1", "#82bdf0", "#3ad636", "#b08cf7", "#f0655a", "#2bd4b4", "#f0be2a"],
    nonRelative: "#8b939f",
    headOutline: "#f1f3f6",
  },
}

export const tokensFor = (mode: ThemeMode): Tokens => (mode === "dark" ? dark : light)

// Density metrics, in local CSS px (they scale with the application zoom
// because the whole #root is zoomed — see zoom.ts).
export const metrics = {
  /** Revision grid row; also the canvas row pitch. */
  rowHeight: 28,
  /** Toolbar buttons and other dense controls. */
  controlHeight: 26,
  /** Monospace surfaces (diff, blob, job output, diagnostics). */
  codeSize: 12,
  codeLineHeight: 18,
  /** Compact file rows and dialogs' path lists. */
  codeSizeSmall: 11.5,
  /** Body text in dense lists and captions. */
  denseText: 12,
  /** Grid header captions, SHA column, tail strip. */
  captionSize: 11,
  /** Ref badges. */
  badgeSize: 10,
  /** Keyboard focus ring width. */
  focusRingWidth: 1,
  /** Minimum pointer target for icon-only actions (WCAG 2.5.8 is 24px). */
  minHitTarget: 24,
  /** The gutter of desk between two panes, and the bottom splitter's height. */
  deskGap: 6,
  /** A pane's corner. */
  cardRadius: 6,
} as const

/** The `--pg-*` custom properties app.css and the canvas fallbacks read. */
export function cssVariables(t: Tokens): Record<string, string> {
  const vars: Record<string, string> = {
    "--pg-surface": t.surface,
    "--pg-surface-alt": t.surfaceAlt,
    "--pg-surface-sunken": t.surfaceSunken,
    "--pg-well": t.well,
    "--pg-code-bg": t.codeBg,
    "--pg-notice-bg": t.noticeBg,
    "--pg-text": t.text,
    "--pg-text-secondary": t.textSecondary,
    "--pg-text-meta": t.textMeta,
    "--pg-text-disabled": t.textDisabled,
    "--pg-border": t.border,
    "--pg-border-soft": t.borderSoft,
    "--pg-border-strong": t.borderStrong,
    "--pg-primary": t.primary,
    "--pg-primary-dark": t.primaryDark,
    "--pg-on-primary": t.onPrimary,
    "--pg-brand-deep": t.brandDeep,
    "--pg-brand-light": t.brandLight,
    "--pg-grid-sel": t.selectionBg,
    "--pg-grid-sel-border": t.selectionBorder,
    "--pg-grid-hover": t.hover,
    "--pg-focus-ring": t.focusRing,
    "--pg-card-shadow": t.cardShadow,
    "--pg-diff-added": t.diff.added,
    "--pg-diff-removed": t.diff.removed,
    "--pg-diff-hunk": t.diff.hunk,
    "--pg-diff-meta": t.diff.meta,
    "--pg-diff-context": t.diff.context,
    "--pg-diff-gutter": t.diff.gutter,
    "--pg-diff-gutter-border": t.diff.gutterBorder,
    "--pg-file-a": t.fileStatus.A,
    "--pg-file-m": t.fileStatus.M,
    "--pg-file-d": t.fileStatus.D,
    "--pg-file-r": t.fileStatus.R,
    "--pg-file-u": t.fileStatus.U,
    "--pg-file-c": t.fileStatus.C,
    "--pg-file-other": t.fileStatus.other,
    "--pg-status-ok": t.status.ok,
    "--pg-status-warn": t.status.warn,
    "--pg-status-error": t.status.error,
    "--pg-console-bg": t.console.bg,
    "--pg-console-line-bg": t.console.lineBg,
    "--pg-console-text": t.console.text,
    "--pg-console-meta": t.console.meta,
    "--pg-console-border": t.console.border,
    "--pg-console-ok": t.console.ok,
    "--pg-console-warn": t.console.warn,
    "--pg-console-fail": t.console.fail,
    "--pg-review-todo": t.review.todo,
    "--pg-review-todo-bg": t.review.todoBg,
    "--pg-review-todo-stripe": t.review.todoStripe,
    "--pg-review-ok": t.review.ok,
    "--pg-review-ok-bg": t.review.okBg,
    "--pg-review-rejected": t.review.rejected,
    "--pg-review-rejected-bg": t.review.rejectedBg,
    "--pg-review-cursor-bg": t.review.cursorBg,
    "--pg-review-accept": t.review.accept,
    "--pg-review-accept-bg": t.review.acceptBg,
    "--pg-agent": t.review.agent,
    "--pg-agent-bg": t.review.agentBg,
    "--pg-lane-non-relative": t.graph.nonRelative,
    "--pg-lane-head": t.graph.headOutline,
    "--pg-row-height": `${metrics.rowHeight}px`,
    "--pg-control-h": `${metrics.controlHeight}px`,
    "--pg-code-size": `${metrics.codeSize}px`,
    "--pg-code-line": `${metrics.codeLineHeight}px`,
    "--pg-caption-size": `${metrics.captionSize}px`,
    "--pg-badge-size": `${metrics.badgeSize}px`,
    "--pg-focus-ring-w": `${metrics.focusRingWidth}px`,
    "--pg-desk-gap": `${metrics.deskGap}px`,
    "--pg-card-radius": `${metrics.cardRadius}px`,
  }
  for (const [name, badge] of Object.entries(t.ref)) {
    vars[`--pg-ref-${name}-bg`] = badge.bg
    vars[`--pg-ref-${name}-fg`] = badge.fg
  }
  t.graph.lanes.forEach((lane, i) => {
    vars[`--pg-lane-${i + 1}`] = lane
  })
  return vars
}
