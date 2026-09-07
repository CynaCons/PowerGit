import { readFileSync } from "node:fs"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

// One version source for the whole repo: frontend/package.json (see the
// release skill). The download button and the screens caption read it.
const version = JSON.parse(readFileSync(new URL("../frontend/package.json", import.meta.url), "utf8")).version as string

export default defineConfig({
  base: "/PowerGit/",
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
