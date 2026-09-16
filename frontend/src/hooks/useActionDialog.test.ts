// @vitest-environment jsdom
import { act } from "react"
import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { EngineError } from "../engine"
import { useActionDialog } from "./useActionDialog"

describe("useActionDialog", () => {
  it("keeps git's dirty-tree error inline and retries with autostash", async () => {
    const action = vi
      .fn<(autostash?: boolean) => Promise<void>>()
      .mockRejectedValueOnce(new EngineError("Your local changes would be overwritten", 409, undefined, "dirty"))
      .mockResolvedValueOnce(undefined)
    const onClose = vi.fn()
    const { result } = renderHook(() => useActionDialog({ open: true, label: "merge", action, onClose }))

    await act(() => result.current.submit())
    expect(result.current.error).toContain("Your local changes would be overwritten")
    expect(result.current.dirty).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await act(() => result.current.retryWithStash())
    expect(action.mock.calls).toEqual([[false], [true]])
    expect(onClose).toHaveBeenCalledOnce()
  })
})
