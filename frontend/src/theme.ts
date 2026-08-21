import { createTheme } from "@mui/material/styles"

const theme = createTheme({
  palette: {
    primary: { main: "#2563eb", dark: "#1d4ed8" },
    background: { default: "#f4f6f8", paper: "#ffffff" },
    text: { primary: "#1a1a1a", secondary: "#737373" },
    divider: "#e5e5e5",
  },
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
    fontSize: 14,
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "html, body, #root": { height: "100%", margin: 0 },
        body: { backgroundColor: "#f4f6f8" },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: "1px solid #e5e5e5",
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
        paper: { borderRadius: 12 },
      },
    },
  },
})

export default theme
