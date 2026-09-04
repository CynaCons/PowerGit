import js from "@eslint/js"
import reactHooks from "eslint-plugin-react-hooks"
import reactRefresh from "eslint-plugin-react-refresh"
import globals from "globals"
import tseslint from "typescript-eslint"

// Flat config (ESLint 9+). Scope: src (app), tests (Playwright/vitest) and
// scripts (node .mjs). `npm run lint` is the gate; CI wiring is v0.13.7.
//
// max-lines is the god-component tripwire from v0.13.4: App.tsx reached
// 1580 lines with nothing to stop it. Blank lines and comments do not count,
// so a well-commented 350-line file passes and a 450-line component fails.
export default tseslint.config(
  { ignores: ["dist", "node_modules", "src-tauri", "test-results", "playwright-report"] },
  {
    files: ["**/*.{ts,tsx,js,mjs}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      // The two classic hook rules only. eslint-plugin-react-hooks 7 also
      // ships React Compiler rules (set-state-in-effect, refs, …) that flag
      // deliberate patterns in this codebase (dialog reset-on-open effects,
      // latest-value refs); adopting those is its own iteration.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "react-refresh/only-export-components": ["error", { allowConstantExport: true }],
    },
  },
  {
    // Off-limits to v0.13.4 (engine contract and the lane model are owned by
    // their own iterations); the pre-existing findings there are recorded in
    // PLAN.md rather than patched around here.
    files: ["src/engine/client.ts", "src/graph/**"],
    rules: { "max-lines": "off", "no-useless-assignment": "off", "preserve-caught-error": "off" },
  },
)
