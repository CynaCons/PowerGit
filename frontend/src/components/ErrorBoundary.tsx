import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Typography from "@mui/material/Typography"
import { Component, type ErrorInfo, type ReactNode } from "react"
import { formatDiagnostics, report } from "../diagnostics"
import { copyToClipboard } from "./clipboard"

type State = { error: Error | null }

/** v0.13.11: a render error shows a recoverable screen with the diagnostics
 *  instead of a blank webview. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    report("error", "render", `${error.name}: ${error.message}${info.componentStack ? `\n${info.componentStack}` : ""}`)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Box data-testid="render-error" role="alert" sx={{ p: 4, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h6" sx={{ mb: 1 }}>
          PowerGit hit an error while rendering
        </Typography>
        <Typography variant="body2" color="error" sx={{ mb: 2, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {this.state.error.message}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="contained" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button onClick={() => window.location.reload()}>Reload window</Button>
          <Button onClick={() => void copyToClipboard(formatDiagnostics())}>Copy diagnostics</Button>
        </Box>
      </Box>
    )
  }
}
