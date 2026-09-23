import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { installDiagnostics } from "./diagnostics"
import { bootstrapEngine } from "./engine"
import { HotkeyHost } from "./hotkeys"
import "./styles/app.css"
import "./styles/op-dialogs.css"
import "./styles/tokens.css"
import { AppThemeProvider } from "./theme/AppThemeProvider"

installDiagnostics()

// Perf probe builds only (docs/perf/audit-2026-09-23.md); absent from a normal build.
if (import.meta.env.VITE_PERF_PROBE)
  void import("./perf/probe").then((m) => m.installProbe(import.meta.env.VITE_PERF_PROBE!))

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
