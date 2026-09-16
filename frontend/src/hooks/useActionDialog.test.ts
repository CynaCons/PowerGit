// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EngineError } from "../engine"
import { useActionDialog } from "./useActionDialog"

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe("useActionDialog", () => {
  let root: Root
  let container: HTMLDivElement
  let latest: ReturnType<typeof useActionDialog> | null = null
  let action: ReturnType<typeof vi.fn<(autostash?: boolean) => Promise<void>>>
  let onClose: ReturnType<typeof vi.fn>

  function Probe() {
    latest = useActionDialog({ open: true, label: "merge", action, onClose })
    return null
  }

  beforeEach(async () => {
    action = vi.fn<(autostash?: boolean) => Promise<void>>()
    onClose = vi.fn()
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(Probe)))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    latest = null
  })

  it("keeps git's dirty-tree error inline and retries with autostash", async () => {
    action
      .mockRejectedValueOnce(new EngineError("Your local changes would be overwritten", 409, undefined, "dirty"))
      .mockResolvedValueOnce(undefined)

    await act(() => latest!.submit())
    expect(latest?.error).toContain("Your local changes would be overwritten")
    expect(latest?.dirty).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await act(() => latest!.retryWithStash())
    expect(action.mock.calls).toEqual([[false], [true]])
    expect(onClose).toHaveBeenCalledOnce()
  })
})
