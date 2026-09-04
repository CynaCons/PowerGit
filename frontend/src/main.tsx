import CssBaseline from "@mui/material/CssBaseline"
import { ThemeProvider } from "@mui/material/styles"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { installDiagnostics } from "./diagnostics"
import { bootstrapEngine } from "./engine"
import { HotkeyHost } from "./hotkeys"
import "./styles/app.css"
import "./styles/tokens.css"
import theme from "./theme"

installDiagnostics()

// The engine location (port + token) is resolved once, before the first
// render, so no component ever sees a client pointing at the wrong port.
void bootstrapEngine().then((base) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <ErrorBoundary>
          <HotkeyHost>
            <App base={base} />
          </HotkeyHost>
        </ErrorBoundary>
      </ThemeProvider>
    </StrictMode>,
  )
})
