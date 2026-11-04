import { describe, expect, it } from "vitest"
import { hunkTitle, scopeOf } from "./roundScope"
import type { HunkRow, RoundHunk } from "./roundModel"

/** A hunk changing the 1-based line `n` of `source`, with no captured context. */
function hunkAt(source: string[], n: number): RoundHunk {
  const row: HunkRow = { kind: "add", oldNum: null, newNum: n, text: source[n - 1], key: `+${n}` }
  return {
    header: `@@ -${n},0 +${n} @@ git's text`,
    oldStart: n,
    newStart: n,
    rows: [row],
    keys: [row.key],
    change: null,
  }
}

const scopeAt = (path: string, source: string[], marker: string) =>
  scopeOf(path, source, hunkAt(source, source.findIndex((l) => l.includes(marker)) + 1))

describe("scopeOf: Python", () => {
  const source = [
    "import os",
    "",
    "class Greeter(Base):  # the class",
    "    # A comment",
    "    def greet(self, name) -> str:",
    "        if name:",
    "            value = 1  # CHANGE",
    "",
    "    async def later(",
    "        self,",
    "        name,",
    "    ) -> str:",
    "        def inner():",
    "            return 2  # NESTED",
    "        return 3  # SIGNATURE",
    "",
    "def top():",
    '    text = """',
    "at the margin",
    '"""',
    "    return 4  # STRING",
    "",
    "TABLE = {",
    '    "a": 1,  # DATA',
    "}",
    "print(5)  # MODULE",
  ]

  it("names the class and the function above the change", () => {
    expect(scopeAt("a.py", source, "CHANGE")).toEqual(["class Greeter(Base)", "def greet(self, name) -> str"])
  })

  it("keeps a nested function, and finds one with a multi-line signature", () => {
    expect(scopeAt("a.py", source, "NESTED")).toEqual(["class Greeter(Base)", "async def later(", "def inner()"])
    expect(scopeAt("a.py", source, "SIGNATURE")).toEqual(["class Greeter(Base)", "async def later("])
  })

  it("names nothing outside a function, so the card keeps git's text", () => {
    expect(scopeAt("a.py", source, "DATA")).toEqual([])
    expect(scopeAt("a.py", source, "MODULE")).toEqual([])
    expect(hunkTitle("a.py", source, hunkAt(source, 24))).toEqual({ numbers: "@@ -24,0 +24 @@", scope: "git's text" })
  })
})

describe("scopeOf: C and C++", () => {
  const source = [
    "namespace app {",
    "",
    "class Greeter : public Base {",
    " public:",
    "  Greeter(int count) : count_(count) {",
    "    start();  // CTOR",
    "  }",
    "",
    "  int greet(int count) const override {",
    "#ifdef DEBUG",
    "    for (int i = 0; i < count; i++) {",
    "      call(i,",
    "           count);  // INLINE",
    "    }",
    "#endif",
    "    return 0;",
    "  }",
    "};",
    "",
    "}  // namespace app",
    "",
    "static int",
    "plain(int count)",
    "{",
    "    return count;  // GNU",
    "}",
    "",
    "void Greeter::wide(int first,",
    "                   int second)",
    "{",
    "    int table[] = {",
    "        1,  // INITIALIZER",
    "    };",
    "    return;  // OUTOFLINE",
    "}",
    "",
    "int walk(struct list *head) {",
    "    list_for_each(pos, head) {",
    "        use(pos);  // MACRO",
    "    }",
    "}",
    "",
    "void lambdas() {",
    "    auto f = [&](int x) {",
    "        return x;  // LAMBDA",
    "    };",
    "    std::min(first,",
    "             second);  // QUALIFIED",
    "}",
    "",
    "static const int data[] = {",
    "    1,  // DATA",
    "};",
    "",
    "struct Point {",
    "    int x;  // FIELD",
    "};",
    "",
    "enum class Color {",
    "    Red,  // MEMBER",
    "};",
  ]

  it("names the class and the method, past directives, loops and calls", () => {
    expect(scopeAt("a.cpp", source, "INLINE")).toEqual([
      "class Greeter : public Base",
      "int greet(int count) const override",
    ])
    expect(scopeAt("a.hpp", source, "CTOR")).toEqual([
      "class Greeter : public Base",
      "Greeter(int count) : count_(count)",
    ])
  })

  it("finds a header above a lone brace, and a signature on several lines", () => {
    expect(scopeAt("a.c", source, "GNU")).toEqual(["plain(int count)"])
    expect(scopeAt("a.cc", source, "OUTOFLINE")).toEqual(["void Greeter::wide(int first,"])
    expect(scopeAt("a.cc", source, "INITIALIZER")).toEqual(["void Greeter::wide(int first,"])
  })

  it("takes the function, not a block that looks like one", () => {
    expect(scopeAt("a.c", source, "MACRO")).toEqual(["int walk(struct list *head)"])
    expect(scopeAt("a.cpp", source, "LAMBDA")).toEqual(["void lambdas()"])
    expect(scopeAt("a.cpp", source, "QUALIFIED")).toEqual(["void lambdas()"])
  })

  it("names a struct or an enum, not an initializer", () => {
    expect(scopeAt("a.h", source, "FIELD")).toEqual(["struct Point"])
    expect(scopeAt("a.h", source, "MEMBER")).toEqual(["enum class Color"])
    expect(scopeAt("a.c", source, "DATA")).toEqual([])
  })
})

describe("scopeOf: where a change sits", () => {
  const source = ["class A:", "    def f(self):", "        one = 1", "        two = 2", "        three = 3"]

  it("reads a removed line's place from the context above it", () => {
    const hunk: RoundHunk = {
      ...hunkAt(source, 3),
      rows: [
        { kind: "context", oldNum: 3, newNum: 3, text: source[2], key: "+3" },
        { kind: "remove", oldNum: 4, newNum: null, text: "        gone = 0", key: "-4" },
      ],
    }
    expect(scopeOf("a.py", source, hunk)).toEqual(["class A", "def f(self)"])
  })

  it("reads a pure deletion from the header's start, even past the end of the file", () => {
    const row: HunkRow = { kind: "remove", oldNum: 6, newNum: null, text: "        gone = 0", key: "-6" }
    const hunk: RoundHunk = { ...hunkAt(source, 5), newStart: 5, rows: [row] }
    expect(scopeOf("a.py", source, hunk)).toEqual(["class A", "def f(self)"])
    expect(scopeOf("a.py", source, { ...hunk, newStart: 50 })).toEqual(["class A", "def f(self)"])
  })

  it("takes the indent from the first changed line that has text", () => {
    const hunk: RoundHunk = {
      ...hunkAt(source, 3),
      rows: [
        { kind: "add", oldNum: null, newNum: 3, text: "", key: "+3" },
        { kind: "add", oldNum: null, newNum: 4, text: source[3], key: "+4" },
      ],
    }
    expect(scopeOf("a.py", source, hunk)).toEqual(["class A", "def f(self)"])
  })

  it("keeps git's text for another language or without the file", () => {
    expect(hunkTitle("a.ts", source, hunkAt(source, 3)).scope).toBe("git's text")
    expect(hunkTitle("a.py", null, hunkAt(source, 3)).scope).toBe("git's text")
  })

  it("joins the class and the function", () => {
    expect(hunkTitle("a.py", source, hunkAt(source, 3))).toEqual({
      numbers: "@@ -3,0 +3 @@",
      scope: "class A › def f(self)",
    })
  })
})
