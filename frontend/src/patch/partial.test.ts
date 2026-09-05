import { describe, expect, it } from "vitest"
import { buildPartialPatch, partialEligibility, selectableIndices } from "./partial"

// Owner: "select a piece of diff and reset it like we can in baseline Git
// Extensions". Three changed lines; the owner selects two.
const DIFF = [
  "diff --git a/f.txt b/f.txt",
  "index 1111111..2222222 100644",
  "--- a/f.txt",
  "+++ b/f.txt",
  "@@ -1,3 +1,3 @@",
  "-1",
  "-2",
  "-3",
  "+1x",
  "+2x",
  "+3x",
  "",
].join("\n")

const idx = (needle: string) => DIFF.split("\n").indexOf(needle)

describe("buildPartialPatch", () => {
  it("stage base (old side): unselected + dropped, unselected - kept as context", () => {
    const sel = new Set([idx("-1"), idx("-2"), idx("+1x"), idx("+2x")])
    expect(buildPartialPatch(DIFF, sel, "old")).toBe(
      [
        "diff --git a/f.txt b/f.txt",
        "index 1111111..2222222 100644",
        "--- a/f.txt",
        "+++ b/f.txt",
        "@@ -1,3 +1,3 @@",
        "-1",
        "-2",
        " 3",
        "+1x",
        "+2x",
        "",
      ].join("\n"),
    )
  })

  it("reset base (new side): unselected - dropped, unselected + kept as context", () => {
    const sel = new Set([idx("-1"), idx("-2"), idx("+1x"), idx("+2x")])
    expect(buildPartialPatch(DIFF, sel, "new")).toBe(
      [
        "diff --git a/f.txt b/f.txt",
        "index 1111111..2222222 100644",
        "--- a/f.txt",
        "+++ b/f.txt",
        "@@ -1,3 +1,3 @@",
        "-1",
        "-2",
        "+1x",
        "+2x",
        " 3x",
        "",
      ].join("\n"),
    )
  })

  it("returns null when only context is selected", () => {
    expect(buildPartialPatch(DIFF, new Set([idx("@@ -1,3 +1,3 @@")]), "old")).toBeNull()
  })

  it("shifts later hunk starts by the lines already emitted", () => {
    const two = [
      "diff --git a/g b/g",
      "--- a/g",
      "+++ b/g",
      "@@ -1,2 +1,3 @@",
      " a",
      "+b",
      " c",
      "@@ -10,2 +11,3 @@",
      " x",
      "+y",
      " z",
      "",
    ].join("\n")
    const rows = two.split("\n")
    const patch = buildPartialPatch(two, new Set([rows.indexOf("+y")]), "old")
    // the first hunk is not emitted, so the second keeps its old start and
    // gets a new start equal to it (no earlier delta)
    expect(patch).toContain("@@ -10,2 +10,3 @@")
    const both = buildPartialPatch(two, new Set([rows.indexOf("+b"), rows.indexOf("+y")]), "old")
    expect(both).toContain("@@ -1,2 +1,3 @@")
    expect(both).toContain("@@ -10,2 +11,3 @@")
  })

  it("keeps the no-newline marker only with its line", () => {
    const d = [
      "diff --git a/h b/h",
      "--- a/h",
      "+++ b/h",
      "@@ -1 +1 @@",
      "-old",
      "\\ No newline at end of file",
      "+new",
      "\\ No newline at end of file",
      "",
    ].join("\n")
    const rows = d.split("\n")
    const patch = buildPartialPatch(d, new Set([rows.indexOf("+new")]), "old")
    expect(patch).toBe(
      [
        "diff --git a/h b/h",
        "--- a/h",
        "+++ b/h",
        "@@ -1 +1,2 @@".replace("@@ -1 +1,2 @@", "@@ -1,1 +1,2 @@"),
        " old",
        "\\ No newline at end of file",
        "+new",
        "\\ No newline at end of file",
        "",
      ].join("\n"),
    )
  })
})

describe("eligibility", () => {
  it("rejects binary, new and deleted files", () => {
    expect(partialEligibility("Binary file (not shown)").ok).toBe(false)
    expect(partialEligibility("diff --git a/n b/n\nnew file mode 100644\n@@ -0,0 +1 @@\n+x\n").ok).toBe(false)
    expect(partialEligibility("diff --git a/n b/n\ndeleted file mode 100644\n@@ -1 +0,0 @@\n-x\n").ok).toBe(false)
    expect(partialEligibility(DIFF).ok).toBe(true)
  })

  it("selectable rows are the hunk bodies only", () => {
    const s = selectableIndices(DIFF)
    expect(s.has(idx("-1"))).toBe(true)
    expect(s.has(idx("@@ -1,3 +1,3 @@"))).toBe(false)
    expect(s.has(idx("--- a/f.txt"))).toBe(false)
  })
})
