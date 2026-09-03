import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { readOrCreateToken } from "./scripts/engine-token.mjs"

const host = process.env.TAURI_DEV_HOST

export default defineConfig(({ command }) => ({
  plugins: [react()],
  clearScreen: false,
  define: {
    // Dev server: share frontend/.engine-token with scripts/engine.ps1.
    // Builds: only what VITE_ENGINE_TOKEN says (harnesses that run `vite
    // preview` set it); the packaged app gets its token from Tauri at runtime
    // and the Pages demo has no engine, so nothing is baked in by default.
    "import.meta.env.VITE_ENGINE_TOKEN": JSON.stringify(
      process.env.VITE_ENGINE_TOKEN ?? (command === "serve" ? readOrCreateToken() : ""),
    ),
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
  },
}))
