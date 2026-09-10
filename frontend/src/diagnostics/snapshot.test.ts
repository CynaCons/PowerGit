import { expect, test } from "vitest"
import { describeIncident } from "./snapshot"

// The banner's first sentence per watchdog kind. `presentation` and `loop`
// arrived with v0.15.6 (Ubuntu freeze taskforce): the first says the page
// was alive but GTK stopped painting, the second that the shell's own main
// loop stopped answering round-trips.
test("describeIncident names every watchdog kind", () => {
  expect(describeIncident("script")).toBe("PowerGit stopped responding")
  expect(describeIncident("paint")).toBe("PowerGit's window stopped updating")
  expect(describeIncident("crash")).toBe("PowerGit's page process crashed")
  expect(describeIncident("presentation")).toBe("PowerGit: the window stopped painting while the page kept running")
  expect(describeIncident("loop")).toBe("PowerGit: the shell's main loop stopped responding")
  expect(describeIncident(undefined)).toBe("PowerGit stopped responding")
  expect(describeIncident("")).toBe("PowerGit stopped responding")
})
