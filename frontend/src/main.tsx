import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { installDiagnostics } from "./diagnostics"
import { bootstrapEngine } from "./engine"
import { HotkeyHost } from "./hotkeys"
import "./styles/app.css"
import "./styles/tokens.css"
import { AppThemeProvider } from "./theme/AppThemeProvider"

installDiagnostics()

// The engine location (port + token) is resolved once, before the first
// render, so no component ever sees a client pointing at the wrong port.
void bootstrapEngine().then((base) => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <AppThemeProvider>
        <ErrorBoundary>
          <HotkeyHost>
            <App base={base} />
          </HotkeyHost>
        </ErrorBoundary>
      </AppThemeProvider>
    </StrictMode>,
  )
})
