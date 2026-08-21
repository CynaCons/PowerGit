import type { Revision } from "./types"

const AUTHORS = ["Henrik", "RussKie", "mstv", "gerhardol", "NikolayXIT", "you"]

export function syntheticHistory(count: number, seed = 1): Revision[] {
  let s = seed >>> 0
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0xffffffff
  }

  let nextId = 0x100000
  const hex = () => {
    nextId += 1
    return nextId.toString(16).padStart(8, "0") + "aaaaaaaaaaaaaaaaaaaaaaaa"
  }

  const chronological: Revision[] = []
  let lastMain = ""
  const openBranches: string[] = []

  for (let i = 0; i < count; i++) {
    const id = hex()
    const roll = rand()
    const refs: string[] = []
    let parents: string[] = []

    if (i === 0) {
      parents = []
    } else if (roll < 0.12 && openBranches.length > 0 && lastMain) {
      const branchTip = openBranches.pop() as string
      parents = [lastMain, branchTip]
      lastMain = id
    } else if (roll < 0.2 && lastMain && openBranches.length < 5) {
      parents = [lastMain]
      openBranches.push(id)
      refs.push(`feature/${(openBranches.length % 17) + 1}`)
    } else {
      parents = lastMain ? [lastMain] : []
      lastMain = id
    }

    if (i % 80 === 0) refs.push(`v0.${Math.floor(i / 80)}.0`)

    const day = new Date(Date.UTC(2024, 0, 1) + i * 3600_000)
    chronological.push({
      id,
      parents,
      message:
        i === 0
          ? "Initial commit"
          : parents.length > 1
            ? `Merge branch into master (#${i})`
            : `Work item ${i}`,
      author: AUTHORS[i % AUTHORS.length],
      date: day.toISOString().slice(0, 16).replace("T", " "),
      refs,
    })
  }

  const newestFirst = chronological.reverse()
  newestFirst[0] = {
    ...newestFirst[0],
    refs: ["HEAD", "master", ...newestFirst[0].refs],
  }
  return newestFirst
}
