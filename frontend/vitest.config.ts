import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    // Component tests carry `// @vitest-environment jsdom` and, when they
    // render JSX of their own, a .tsx extension (StartPane, v0.20.3).
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
})
