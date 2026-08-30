import CssBaseline from "@mui/material/CssBaseline"
import { ThemeProvider } from "@mui/material/styles"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import App from "./App"
import { HotkeyHost } from "./hotkeys"
import "./styles/app.css"
import "./styles/tokens.css"
import theme from "./theme"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <HotkeyHost>
        <App />
      </HotkeyHost>
    </ThemeProvider>
  </StrictMode>,
)
