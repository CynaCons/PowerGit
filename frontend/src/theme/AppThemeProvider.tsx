import CssBaseline from "@mui/material/CssBaseline"
import { ThemeProvider } from "@mui/material/styles"
import { useLayoutEffect, useMemo, type ReactNode } from "react"
import { buildTheme } from "./index"
import { useThemeMode } from "./appearance"
import { useZoom } from "./zoom"

// Runtime-switchable MUI theme (v0.13.13). One theme object per
// (mode, zoom) pair; CssBaseline writes the token set into `:root` and the
// zoom onto #root, so app.css and the canvas follow the same switch. The
// `data-theme` attribute on <html> is for tests and any CSS that wants a
// per-mode hook; the values themselves never depend on it.
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const mode = useThemeMode()
  const zoom = useZoom()
  const theme = useMemo(() => buildTheme(mode, zoom), [mode, zoom])

  useLayoutEffect(() => {
    document.documentElement.setAttribute("data-theme", mode)
  }, [mode])

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  )
}
