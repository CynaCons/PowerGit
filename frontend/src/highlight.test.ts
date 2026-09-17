import { afterEach, describe, expect, it, vi } from "vitest"
import { highlightTestHooks } from "./highlight"

describe("tokenizeLines", () => {
  afterEach(() => {
    highlightTestHooks.resetTokenCache()
  })

  it("serves repeated text from the module token cache without tokenizing again", async () => {
    const codeToTokensBase = vi.fn(() => [
      [{ content: "const", offset: 0, color: "#0000ff" }],
      [{ content: "x = 1", offset: 0 }],
    ])

    const first = await highlightTestHooks.tokenizeLinesWithHighlighter(
      { codeToTokensBase },
      "const\nx = 1",
      "typescript",
      "light",
    )
    const second = await highlightTestHooks.tokenizeLinesWithHighlighter(
      { codeToTokensBase },
      "const\nx = 1",
      "typescript",
      "light",
    )

    expect(second).toBe(first)
    expect(second).toEqual([[{ content: "const", color: "#0000ff" }], [{ content: "x = 1" }]])
    expect(codeToTokensBase).toHaveBeenCalledTimes(1)
  })
})
