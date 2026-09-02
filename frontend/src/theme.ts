import type { SxProps, Theme } from "@mui/material/styles"
import { createTheme } from "@mui/material/styles"

// Linux fallbacks matter here: an AppImage renders offline and a WebKitGTK
// host may briefly (font-display: swap) or permanently (load failure) miss
// the self-hosted static faces in tokens.css, so these stacks fall through
// to fonts actually preinstalled on mainstream Linux desktops rather than a
// generic/thin default. See docs/agents/memories/linux-fonts.md.
const SANS_FONT = '"Inter", "Noto Sans", "Cantarell", "Ubuntu", "DejaVu Sans", system-ui, sans-serif'
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
          // Linux/WebKitGTK grayscale antialiasing renders the same weight
          // visibly thinner/lighter than Windows ClearType; these are no-ops
          // on Windows/macOS but measurably darken/sharpen text on Linux
          // (owner feedback 2026-09-02).
          WebkitFontSmoothing: "antialiased",
          MozOsxFontSmoothing: "grayscale",
          textRendering: "optimizeLegibility",
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
