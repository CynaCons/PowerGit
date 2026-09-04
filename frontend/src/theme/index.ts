import type { SxProps, Theme } from "@mui/material/styles"
import { createTheme } from "@mui/material/styles"
import { cssVariables, metrics, tokensFor, type ThemeMode, type Tokens } from "./tokens"

export { dark, light, metrics, tokensFor, type ThemeMode, type Tokens } from "./tokens"
export { useThemeMode, useThemePreference, setThemePreference, type ThemePreference } from "./appearance"
export { useZoom, zoomIn, zoomOut, zoomReset, zoomPercent } from "./zoom"

// VS Code's own workbench stack, in VS Code's own order: the platform UI
// font first, self-hosted Inter only as the fallback. The owner asked for
// "the same as VS Code" after Inter read as low-quality on Ubuntu, and the
// reason is rasterization, not the typeface: Segoe UI (Windows) and Ubuntu
// (GNOME) ship with hinting instructions and fontconfig rules tuned for
// their platform's rasterizer, which a webfont served through WebKitGTK
// does not get. Inter still backstops any desktop that has neither.
// See docs/agents/memories/linux-fonts.md.
const SANS_FONT =
  'system-ui, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", "Cantarell", "Noto Sans", "Inter", "DejaVu Sans", sans-serif'
export const MONO_FONT = '"Fira Code", "JetBrains Mono", "DejaVu Sans Mono", ui-monospace, Consolas, monospace'

export const codeSx = {
  fontFamily: MONO_FONT,
  fontVariantLigatures: "none",
  fontFeatureSettings: '"liga" 0, "calt" 0',
} satisfies SxProps<Theme>

/** Monospace block metrics shared by diff, blob and output panes. */
export const codeBlockSx = {
  ...codeSx,
  fontSize: metrics.codeSize,
  lineHeight: `${metrics.codeLineHeight}px`,
} satisfies SxProps<Theme>

/** Keyboard focus ring for custom focusable surfaces (grid, lists, code). */
export const focusRingSx = {
  outline: "none",
  "&:focus-visible": { boxShadow: `inset 0 0 0 ${metrics.focusRingWidth}px var(--pg-focus-ring)` },
} satisfies SxProps<Theme>

// The whole app is one MUI theme built from the active token set; light
// is the pre-v0.13.13 look value for value. `zoom` is baked in as a literal
// number rather than var(--pg-zoom): a var() inside `zoom` that WebKitGTK
// could not resolve would drop the declaration silently, whereas a number
// is the oldest form of the property WebKit has.
export function buildTheme(mode: ThemeMode, zoom = 1): Theme {
  const t: Tokens = tokensFor(mode)
  return createTheme({
    palette: {
      mode,
      primary: { main: t.primary, dark: t.primaryDark, contrastText: t.onPrimary },
      background: { default: t.surfaceAlt, paper: t.surface },
      // Contrast tuned for Linux rasterizers a second time: the 2026-08-24
      // pass (#111827/#4b5563) still read as washed-out/low-quality on
      // Ubuntu per fresh owner feedback (2026-09-02). Darkened further; see
      // docs/agents/memories/linux-fonts.md.
      text: { primary: t.text, secondary: t.textSecondary, disabled: t.textDisabled },
      divider: t.border,
      success: { main: t.status.ok },
      warning: { main: t.status.warn },
      error: { main: t.status.error },
    },
    typography: {
      fontFamily: SANS_FONT,
      fontSize: 14,
      // Body text at 500 rather than 400: the platform UI faces above read
      // a step lighter under WebKitGTK's rasterizer than under DirectWrite,
      // and asking for the weight is the honest fix (the smoothing hack
      // was not). Segoe UI/Ubuntu both ship a real 500, so this is not
      // synthesised.
      fontWeightRegular: 500,
      button: { textTransform: "none", fontWeight: 600 },
    },
    shape: { borderRadius: 4 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          ":root": { ...cssVariables(t), "--pg-font-mono": MONO_FONT, "--pg-zoom": String(zoom), colorScheme: mode },
          // #root is visually scaled for application zoom; hiding overflow
          // on html as well as body prevents the scaled box from extending
          // the document scroll area at the supported viewport sizes.
          "html, body, #root": { height: "100%", margin: 0, overflow: "hidden" },
          // Compensate the layout box for CSS zoom so its visual height stays
          // exactly the viewport height (and does not enlarge document
          // scrollHeight on WebKit/Chromium).
          "#root": zoom === 1 ? {} : { zoom, height: `calc(100% / ${zoom})`, width: `calc(100% / ${zoom})` },
          // sx-generated classes cannot be matched by the inline-style
          // selector, so disable ligatures globally; Inter has no
          // meaningful ligatures.
          body: {
            backgroundColor: t.surfaceAlt,
            overflow: "hidden",
            fontVariantLigatures: "none",
            fontFeatureSettings: '"liga" 0, "calt" 0',
            // NOT `-webkit-font-smoothing: antialiased`. That was set here
            // on 2026-09-02 to make Linux text darker; it does the
            // opposite. It disables subpixel rendering and forces grayscale
            // AA, which drops roughly a third of the coverage the
            // rasterizer would otherwise put down — i.e. it is precisely
            // what makes text look thin and washed out, the symptom it was
            // meant to fix. `auto` lets each platform use its own
            // (subpixel, where the display allows it). `textRendering:
            // optimizeLegibility` is likewise gone: it buys nothing for UI
            // text and perturbs metrics/kerning.
            WebkitFontSmoothing: "auto",
          },
          // Grid rows render plain divs/spans styled by app.css, which this
          // file does not own; only the weight bump lives here (per the
          // static Inter faces above) so grid text is legible at 12-13px
          // without duplicating app.css's colour rules.
          ".grid-row .msg-text, .grid-row .author, .grid-row .date, .grid-row .sha": {
            fontWeight: 500,
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${t.border}`,
            backgroundImage: "none",
          },
        },
      },
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          // Focus ring on every button, including the dense toolbar ones
          // whose outlined border otherwise hides MUI's default focus cue.
          root: {
            "&.Mui-focusVisible": { boxShadow: `0 0 0 ${metrics.focusRingWidth + 1}px ${t.focusRing}` },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            "&.Mui-focusVisible": { boxShadow: `0 0 0 ${metrics.focusRingWidth + 1}px ${t.focusRing}` },
          },
          // `size="small"` icon buttons are 22-26px of glyph+padding; keep
          // the pointer target at the WCAG 2.5.8 minimum without growing
          // the dense layout (the box stays inline, only the hit area grows).
          sizeSmall: { minWidth: metrics.minHitTarget, minHeight: metrics.minHitTarget },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: { backgroundImage: "none" },
        },
      },
      MuiDialog: {
        styleOverrides: {
          // Portals render outside #root: the paper is zoomed here (its
          // flex centring happens in the unzoomed container, so it stays
          // centred). Never zoom a Popover/Menu *paper* — its left/top come
          // from an anchor rect in visual px and would be re-zoomed.
          paper: { borderRadius: 8, zoom },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: { borderRadius: 4 },
        },
      },
      MuiInputLabel: {
        styleOverrides: {
          root: { maxWidth: "calc(100% - 24px)", overflow: "visible" },
        },
      },
      MuiMenu: {
        styleOverrides: {
          paper: { borderRadius: 8 },
          list: { zoom },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { zoom },
        },
      },
      MuiMenuItem: {
        styleOverrides: {
          root: {
            fontSize: 13,
            minHeight: 30,
            py: 0.5,
            "& .MuiListItemText-primary": { fontSize: 13 },
            "&.Mui-focusVisible": { boxShadow: `inset 0 0 0 ${metrics.focusRingWidth}px ${t.focusRing}` },
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            "&.Mui-focusVisible": { boxShadow: `inset 0 0 0 ${metrics.focusRingWidth}px ${t.focusRing}` },
          },
        },
      },
    },
  })
}
