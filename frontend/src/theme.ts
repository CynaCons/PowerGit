import type { SxProps, Theme } from "@mui/material/styles"
import { createTheme } from "@mui/material/styles"

export const MONO_FONT = '"Fira Code", ui-monospace, monospace'

export const codeSx = {
  fontFamily: MONO_FONT,
  fontVariantLigatures: "none",
  fontFeatureSettings: '"liga" 0, "calt" 0',
} satisfies SxProps<Theme>

const theme = createTheme({
  palette: {
    primary: { main: "#2563eb", dark: "#1d4ed8" },
    background: { default: "#f4f6f8", paper: "#ffffff" },
    // Contrast tuned for Linux rasterizers: light greys looked washed-out
    // and low-quality on Ubuntu (owner feedback 2026-08-24).
    text: { primary: "#111827", secondary: "#4b5563" },
    divider: "#d1d5db",
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
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
