import { expect, test } from "vitest"
import { LANE_COLORS } from "./types"

// Git Extensions src/app/GitExtUtils/GitUI/Theming/AppColorDefaults.cs:
//   GraphBranch1..7 = Color.FromArgb(r, g, b); GraphBranch8 = Color.Empty (unused).
// RevisionGraphLaneColor.cs cycles through exactly these seven.
const GE_GRAPH_BRANCH_DEFAULTS = [
  "#f064a0", // GraphBranch1
  "#78b4e6", // GraphBranch2
  "#24c221", // GraphBranch3
  "#a078f0", // GraphBranch4
  "#dd3228", // GraphBranch5
  "#1ac6a6", // GraphBranch6
  "#e7b00f", // GraphBranch7
]

test("LANE_COLORS are Git Extensions AppColor.GraphBranch1-7 defaults, in order", () => {
  expect(LANE_COLORS).toEqual(GE_GRAPH_BRANCH_DEFAULTS)
})
