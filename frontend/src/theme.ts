import type { SxProps, Theme } from "@mui/material/styles"
import { createTheme } from "@mui/material/styles"

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

const theme = createTheme({
  palette: {
    primary: { main: "#2563eb", dark: "#1d4ed8" },
    background: { default: "#f4f6f8", paper: "#ffffff" },
    // Contrast tuned for Linux rasterizers a second time: the 2026-08-24
    // pass (#111827/#4b5563) still read as washed-out/low-quality on Ubuntu
    // per fresh owner feedback (2026-09-02). Darkened further; see
    // docs/agents/memories/linux-fonts.md.
    text: { primary: "#0f172a", secondary: "#334155", disabled: "#64748b" },
    divider: "#d1d5db",
  },
  typography: {
    fontFamily: SANS_FONT,
    fontSize: 14,
    // Body text at 500 rather than 400: the platform UI faces above read a
    // step lighter under WebKitGTK's rasterizer than under DirectWrite, and
    // asking for the weight is the honest fix (the smoothing hack above was
    // not). Segoe UI/Ubuntu both ship a real 500, so this is not synthesised.
    fontWeightRegular: 500,
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 4 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ":root": { "--pg-font-mono": MONO_FONT },
        "html, body, #root": { height: "100%", margin: 0 },
        // sx-generated classes cannot be matched by the inline-style selector,
        // so disable ligatures globally; Inter has no meaningful ligatures.
        body: {
          backgroundColor: "#f4f6f8",
          overflow: "hidden",
          fontVariantLigatures: "none",
          fontFeatureSettings: '"liga" 0, "calt" 0',
          // NOT `-webkit-font-smoothing: antialiased`. That was set here on
          // 2026-09-02 to make Linux text darker; it does the opposite. It
          // disables subpixel rendering and forces grayscale AA, which drops
          // roughly a third of the coverage the rasterizer would otherwise
          // put down — i.e. it is precisely what makes text look thin and
          // washed out, the symptom it was meant to fix. `auto` lets each
          // platform use its own (subpixel, where the display allows it).
          // `textRendering: optimizeLegibility` is likewise gone: it buys
          // nothing for UI text and perturbs metrics/kerning.
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
          border: "1px solid #d1d5db",
          backgroundImage: "none",
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
    },
    MuiAppBar: {
      styleOverrides: {
        root: { backgroundImage: "none" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 8 },
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
      },
    },
    MuiMenuItem: {
      styleOverrides: {
        root: {
          fontSize: 13,
          minHeight: 30,
          py: 0.5,
          "& .MuiListItemText-primary": { fontSize: 13 },
        },
      },
    },
  },
})

export default theme
