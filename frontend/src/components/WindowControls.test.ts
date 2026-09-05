import { describe, expect, it } from "vitest"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WindowControls } from "./WindowControls"
import { isTauriShell } from "../shell"

// The controls belong to the frameless Tauri window only; a browser tab or
// the e2e build has a native frame and must not grow a second set.
describe("WindowControls", () => {
  it("renders nothing outside the Tauri shell", () => {
    expect(isTauriShell()).toBe(false)
    expect(renderToStaticMarkup(createElement(WindowControls))).toBe("")
  })
})
