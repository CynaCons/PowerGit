// The settings page's table of contents (v0.18.0). Every row the page
// shows is declared here once — its title, the Git key it writes or a
// short line when the title alone does not say what it does, and the words
// the search box should also find it by — and the sections, the contents
// column and the search all read this list. Adding a setting is one entry
// here and one <SettingRow id="…"> in its section. v0.21.6 (owner: "more of
// an engineering settings … we don't need opinions, we don't need lengthy
// text"): labels are short, Git rows show their key, and a description is
// there only when it adds a fact.

/** "<section>.<row>", e.g. "behaviour.autoFetch". */
export type SettingId = string

export type SettingMeta = {
  id: SettingId
  title: string
  /** The Git config key the row writes, shown under the title. */
  gitKey?: string
  /** One short line, only when the title and control do not say it. */
  description?: string
  /** Words the search also matches, beyond the title and description. */
  keywords?: string[]
  /** When set, the row gets its own sub-entry in the contents column. */
  anchor?: string
}

export type SectionMeta = {
  id: string
  title: string
  /** "app": this app, every repository (localStorage); "git": Git config at a scope. */
  scope: "app" | "git"
  rows: SettingMeta[]
}

const CONFIRM_LABELS = [
  "Force push",
  "Delete a branch or tag",
  "Hard reset",
  "Checkout with uncommitted changes",
  "Abort a merge or rebase",
]

export const SETTINGS_CATALOG: SectionMeta[] = [
  {
    id: "appearance",
    title: "Appearance",
    scope: "app",
    rows: [
      {
        id: "appearance.theme",
        title: "Theme",
        keywords: ["appearance", "dark", "light", "system", "colour", "color"],
      },
      {
        id: "appearance.commandBar",
        title: "Command bar",
        keywords: ["rail", "title bar", "toolbar", "layout", "commit", "pull", "push"],
      },
      {
        id: "appearance.zoom",
        title: "Zoom",
        description: "Ctrl + / Ctrl −",
        keywords: ["scale", "size", "percent", "font"],
      },
      {
        id: "appearance.authorDiscs",
        title: "Author discs",
        description: "Initials before each author in the graph.",
        keywords: ["author", "initials", "avatar", "graph", "ring", "highlight", "mark"],
      },
    ],
  },
  {
    id: "git",
    title: "Git identity",
    scope: "git",
    rows: [
      {
        id: "git.userName",
        title: "Name",
        gitKey: "user.name",
        keywords: ["identity", "author", "committer", "user name"],
      },
      {
        id: "git.userEmail",
        title: "Email",
        gitKey: "user.email",
        keywords: ["identity", "author", "committer", "mail"],
      },
      {
        id: "git.autoCrlf",
        title: "Line endings",
        gitKey: "core.autocrlf",
        keywords: ["crlf", "lf", "eol", "newline", "windows"],
      },
    ],
  },
  {
    id: "tools",
    title: "Tools",
    scope: "git",
    rows: [
      {
        id: "tools.diffTool",
        title: "Diff tool",
        gitKey: "diff.tool",
        keywords: ["difftool", "vscode", "vs code", "beyond compare", "kdiff3", "compare"],
      },
      {
        id: "tools.mergeTool",
        title: "Merge tool",
        gitKey: "merge.tool",
        keywords: ["mergetool", "conflicts", "vscode", "vs code", "beyond compare", "kdiff3"],
      },
      {
        id: "tools.editor",
        title: "Editor",
        gitKey: "core.editor",
        keywords: ["vscode", "vs code", "vim", "notepad", "commit message"],
      },
      {
        id: "tools.vsCode",
        title: "VS Code",
        description: "Sets editor, diff tool and merge tool.",
        keywords: ["vscode", "code", "editor", "diff", "merge"],
      },
    ],
  },
  {
    id: "behaviour",
    title: "Behaviour",
    scope: "app",
    rows: [
      {
        id: "behaviour.openLast",
        title: "On start",
        keywords: ["startup", "launch", "recent", "repository", "last", "empty", "browse"],
      },
      {
        id: "behaviour.confirmations",
        title: "Confirm",
        keywords: [
          "confirm",
          "confirmation",
          "ask",
          "force push",
          "delete",
          "reset",
          "checkout",
          "abort",
          ...CONFIRM_LABELS,
        ],
        anchor: "Confirmations",
      },
      {
        id: "behaviour.autoFetch",
        title: "Background fetch",
        keywords: ["auto fetch", "autofetch", "remote", "interval", "minutes"],
        anchor: "Background fetch",
      },
      {
        id: "behaviour.mergeFf",
        title: "Merge default",
        keywords: ["fast-forward", "fast forward", "ff", "merge commit", "no-ff", "ff-only", "dialog"],
      },
      {
        id: "behaviour.rebaseDefaults",
        title: "Rebase default",
        keywords: ["autostash", "autosquash", "stash", "fixup", "squash", "interactive", "dialog"],
      },
    ],
  },
  {
    id: "diagnostics",
    title: "Diagnostics",
    scope: "app",
    rows: [
      {
        id: "diagnostics.logs",
        title: "Logs",
        keywords: ["app log", "developer tools", "devtools", "inspector", "logs folder", "console", "debug"],
      },
      {
        id: "diagnostics.scrollBenchmark",
        title: "Scroll benchmark",
        description: "Scrolls the graph for about 40 s, then writes frame rates to the app log.",
        keywords: ["benchmark", "fps", "frame rate", "smooth", "scroll", "performance", "slow", "linux", "measure"],
      },
      {
        id: "diagnostics.recovery",
        title: "Recovery ladder",
        description: "Window recovery steps for a frozen picture. Each press is logged to engine.log.",
        keywords: ["freeze", "frozen", "ladder", "repaint", "hotkey", "ubuntu", "experiments"],
        anchor: "Recovery ladder",
      },
    ],
  },
  {
    id: "updates",
    title: "Updates",
    scope: "app",
    rows: [
      {
        id: "updates.check",
        title: "Version",
        keywords: ["update", "version", "check for updates", "download", "release", "restart"],
      },
      {
        id: "updates.location",
        title: "Install folder",
        keywords: ["app location", "folder", "appimage", "install", "path"],
      },
    ],
  },
]

const BY_ID = new Map<SettingId, SettingMeta>()
const SECTION_BY_ID = new Map<string, SectionMeta>()
for (const s of SETTINGS_CATALOG) {
  SECTION_BY_ID.set(s.id, s)
  for (const r of s.rows) BY_ID.set(r.id, r)
}

export function metaOf(id: SettingId): SettingMeta {
  const meta = BY_ID.get(id)
  if (!meta) throw new Error(`unknown setting ${id}`)
  return meta
}

export function sectionOf(id: string): SectionMeta {
  const section = SECTION_BY_ID.get(id)
  if (!section) throw new Error(`unknown settings section ${id}`)
  return section
}

function haystack(meta: SettingMeta): string {
  return [meta.title, meta.gitKey ?? "", meta.description ?? "", ...(meta.keywords ?? [])].join("\n").toLowerCase()
}

/**
 * The rows a query leaves visible: `null` for no query (everything shows),
 * else the ids whose title, description or keywords contain every
 * whitespace-separated word of the query, case-insensitively.
 */
export function matchSettings(query: string): Set<SettingId> | null {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return null
  const hits = new Set<SettingId>()
  for (const [id, meta] of BY_ID) {
    const text = haystack(meta)
    if (words.every((w) => text.includes(w))) hits.add(id)
  }
  return hits
}

/** Whether a row is shown under the current match set (`null` = no query). */
export function isShown(visible: Set<SettingId> | null, id: SettingId): boolean {
  return visible === null || visible.has(id)
}

/** A section shows while at least one of its rows does. */
export function sectionShown(visible: Set<SettingId> | null, sectionId: string): boolean {
  return sectionOf(sectionId).rows.some((r) => isShown(visible, r.id))
}
