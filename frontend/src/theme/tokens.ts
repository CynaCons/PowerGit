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

export type ThemeMode = "light" | "dark"

export type RefBadge = { bg: string; fg: string }

export type Tokens = {
  /** Panels, paper, the revision grid. */
  surface: string
  /** The window background behind panels (MUI background.default). */
  surfaceAlt: string
  /** Footers and strips that sit a step below the surface. */
  surfaceSunken: string
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
  primary: string
  primaryDark: string
  onPrimary: string
  selectionBg: string
  selectionBorder: string
  hover: string
  focusRing: string
  ref: Record<"local" | "remote" | "head" | "stash" | "extra", RefBadge>
  diff: {
    added: string
    removed: string
    hunk: string
    meta: string
    context: string
    gutter: string
    gutterBorder: string
  }
  fileStatus: Record<"A" | "M" | "D" | "R" | "U" | "other", string>
  status: { ok: string; warn: string; error: string }
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
  surfaceAlt: "#f4f6f8",
  surfaceSunken: "#fafafa",
  codeBg: "#f8fafc",
  noticeBg: "#fffbeb",
  text: "#0f172a",
  textSecondary: "#334155",
  textMeta: "#475569",
  textDisabled: "#64748b",
  border: "#d1d5db",
  borderSoft: "#e5e5e5",
  primary: "#2563eb",
  primaryDark: "#1d4ed8",
  onPrimary: "#ffffff",
  selectionBg: "#dbeafe",
  selectionBorder: "#2563eb",
  hover: "rgba(37, 99, 235, 0.08)",
  focusRing: "#2563eb",
  ref: {
    local: { bg: "#eff6ff", fg: "#2563eb" },
    remote: { bg: "#ecfdf5", fg: "#059669" },
    head: { bg: "#fef2f2", fg: "#dc2626" },
    stash: { bg: "#fef9c3", fg: "#a16207" },
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
    other: "#737373",
  },
  // MUI's own defaults, spelled out so dark can override them.
  status: { ok: "#2e7d32", warn: "#ed6c02", error: "#d32f2f" },
  graph: {
    lanes: ["#f064a0", "#78b4e6", "#24c221", "#a078f0", "#dd3228", "#1ac6a6", "#e7b00f"],
    nonRelative: "#a0a0a0",
    headOutline: "#1a1a1a",
  },
}

// Dark: GNOME/VS Code-style neutral greys, every text token at WCAG AA
// (4.5:1) on both surfaces and every graphic (lanes, focus, primary) at
// 3:1. `contrast.test.ts` computes the ratios; change a value here and the
// test tells you if it fell under.
export const dark: Tokens = {
  surface: "#1e2227",
  surfaceAlt: "#16191d",
  surfaceSunken: "#1a1d21",
  codeBg: "#14171b",
  noticeBg: "#3a2e0b",
  text: "#e6e9ef",
  textSecondary: "#b6bcc6",
  textMeta: "#a3abb8",
  textDisabled: "#8b939f",
  border: "#3a4048",
  borderSoft: "#2c3239",
  primary: "#60a5fa",
  primaryDark: "#3b82f6",
  onPrimary: "#0b1220",
  selectionBg: "#1f3a5f",
  selectionBorder: "#60a5fa",
  hover: "rgba(96, 165, 250, 0.12)",
  focusRing: "#93c5fd",
  ref: {
    local: { bg: "#1f3a5f", fg: "#bfdbfe" },
    remote: { bg: "#0b3d2e", fg: "#86efac" },
    head: { bg: "#4a1d1d", fg: "#fecaca" },
    stash: { bg: "#3f2a06", fg: "#fde68a" },
    extra: { bg: "#2c3239", fg: "#c5cbd3" },
  },
  diff: {
    added: "#5ee38a",
    removed: "#ff8a80",
    hunk: "#4dd0e1",
    meta: "#c9d1d9",
    context: "#e6e9ef",
    gutter: "#8b939f",
    gutterBorder: "#2c3239",
  },
  fileStatus: {
    A: "#5ee38a",
    M: "#c4b5fd",
    D: "#ff8a80",
    R: "#5eead4",
    U: "#fbbf24",
    other: "#a3abb8",
  },
  status: { ok: "#5ee38a", warn: "#fbbf24", error: "#ff8a80" },
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
} as const

/** The `--pg-*` custom properties app.css and the canvas fallbacks read. */
export function cssVariables(t: Tokens): Record<string, string> {
  const vars: Record<string, string> = {
    "--pg-surface": t.surface,
    "--pg-surface-alt": t.surfaceAlt,
    "--pg-surface-sunken": t.surfaceSunken,
    "--pg-code-bg": t.codeBg,
    "--pg-notice-bg": t.noticeBg,
    "--pg-text": t.text,
    "--pg-text-secondary": t.textSecondary,
    "--pg-text-meta": t.textMeta,
    "--pg-text-disabled": t.textDisabled,
    "--pg-border": t.border,
    "--pg-border-soft": t.borderSoft,
    "--pg-primary": t.primary,
    "--pg-primary-dark": t.primaryDark,
    "--pg-on-primary": t.onPrimary,
    "--pg-grid-sel": t.selectionBg,
    "--pg-grid-sel-border": t.selectionBorder,
    "--pg-grid-hover": t.hover,
    "--pg-focus-ring": t.focusRing,
    "--pg-diff-added": t.diff.added,
    "--pg-diff-removed": t.diff.removed,
    "--pg-diff-hunk": t.diff.hunk,
    "--pg-diff-meta": t.diff.meta,
    "--pg-diff-context": t.diff.context,
    "--pg-diff-gutter": t.diff.gutter,
    "--pg-diff-gutter-border": t.diff.gutterBorder,
    "--pg-status-ok": t.status.ok,
    "--pg-status-warn": t.status.warn,
    "--pg-status-error": t.status.error,
    "--pg-lane-non-relative": t.graph.nonRelative,
    "--pg-lane-head": t.graph.headOutline,
    "--pg-row-height": `${metrics.rowHeight}px`,
    "--pg-control-h": `${metrics.controlHeight}px`,
    "--pg-code-size": `${metrics.codeSize}px`,
    "--pg-code-line": `${metrics.codeLineHeight}px`,
    "--pg-caption-size": `${metrics.captionSize}px`,
    "--pg-badge-size": `${metrics.badgeSize}px`,
    "--pg-focus-ring-w": `${metrics.focusRingWidth}px`,
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
