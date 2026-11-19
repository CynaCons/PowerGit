import { afterEach, describe, expect, it, vi } from "vitest"
import { COMMENT_INK, highlightTestHooks, languageForPath, languageName, tokenizeLines, type Token } from "./highlight"

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

// v0.22.13, owner: comments in the review "look less like plain text".
describe("comment ink", () => {
  afterEach(() => {
    highlightTestHooks.resetTokenCache()
  })
  const ink = COMMENT_INK.light
  const flat = (lines: Token[][]) => lines.flat()
  const find = (lines: Token[][], text: string) => flat(lines).find((t) => t.content.includes(text))

  it("draws TypeScript comments in slate italics, doc tags in violet, TODO as a tag", async () => {
    const code = "/** Retry it. @param status the code */\n// TODO: add jitter\nconst x = 1 // note"
    const lines = (await tokenizeLines(code, "typescript", "light"))!
    expect(find(lines, "Retry it")).toMatchObject({ color: ink.text.toUpperCase(), italic: true })
    expect(find(lines, "@param")?.color?.toLowerCase() ?? find(lines, "param")?.color?.toLowerCase()).toBe(ink.tag)
    expect(find(lines, "TODO")).toMatchObject({ content: "TODO", tag: true })
    expect(find(lines, ": add jitter")).toMatchObject({ italic: true })
    expect(find(lines, "const")?.italic).toBeUndefined()
    expect(find(lines, "//")?.color?.toLowerCase()).toBe(ink.mark)
  })

  it("colours C# doc tags and Python docstrings", async () => {
    const cs = (await tokenizeLines("/// <summary>Retries.</summary>\nint x = 1;", "csharp", "light"))!
    expect(find(cs, "summary")?.color?.toLowerCase()).toBe(ink.tag)
    expect(find(cs, "Retries.")).toMatchObject({ italic: true })
    const py = (await tokenizeLines(
      'def f():\n    """Retries the call. FIXME later."""\n    return 1',
      "python",
      "light",
    ))!
    expect(find(py, "Retries the call")).toMatchObject({ italic: true })
    expect(find(py, "FIXME")).toMatchObject({ tag: true })
  })

  it("uses the dark ink in dark mode", async () => {
    const lines = (await tokenizeLines("# a comment\nx = 1", "python", "dark"))!
    expect(find(lines, "a comment")?.color?.toLowerCase()).toBe(COMMENT_INK.dark.text)
  })
})

describe("languageForPath", () => {
  it("knows the v0.22.13 languages, special basenames and shebangs", () => {
    expect(languageForPath("build/deploy.ps1")).toBe("powershell")
    expect(languageForPath("src/App.csproj")).toBe("xml")
    expect(languageForPath("Views/Home.cshtml")).toBe("razor")
    expect(languageForPath("infra/main.tf")).toBe("terraform")
    expect(languageForPath("tsconfig.json")).toBe("jsonc")
    expect(languageForPath("package.json")).toBe("json")
    expect(languageForPath("CMakeLists.txt")).toBe("cmake")
    expect(languageForPath("scripts/release", "#!/usr/bin/env python3")).toBe("python")
    expect(languageForPath("scripts/run", "#!/bin/bash")).toBe("bash")
    expect(languageForPath("scripts/run", "echo hi")).toBeNull()
    expect(languageName("csharp")).toBe("C#")
  })
})

describe("grammars whose precompiled end patterns broke", () => {
  it("end a Python docstring, a Markdown fence and a Rust raw string", async () => {
    const py = (await tokenizeLines('#!/usr/bin/env python3\n"""Doc."""\nimport sys', "python", "light"))!
    const commentInk: string[] = [COMMENT_INK.light.text, COMMENT_INK.light.mark]
    expect(py[0].every((t) => commentInk.includes(t.color?.toLowerCase() ?? ""))).toBe(true)
    expect(py[2].find((t) => t.content.includes("import"))?.italic).toBeUndefined()
    const md = (await tokenizeLines("```js\nconst a = 1\n```\n# Title", "markdown", "light"))!
    expect(md[3].map((t) => t.content).join("")).toBe("# Title")
    expect(md[3][0].color?.toLowerCase()).toBe("#800000")
    const rs = (await tokenizeLines('let s = r#"x"#;\nlet y = 1;', "rust", "light"))!
    expect(rs[1].find((t) => t.content === "let")?.color?.toLowerCase()).toBe("#0000ff")
  })
})
