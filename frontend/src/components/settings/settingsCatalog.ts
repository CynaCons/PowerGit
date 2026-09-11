// The settings page's table of contents (v0.18.0). Every row the page
// shows is declared here once — its title, its one-line description and
// the words the search box should also find it by — and the sections,
// the contents column and the search all read this list. Adding a setting
// is one entry here and one <SettingRow id="…"> in its section; the
// texts are the ones the owner approved in the prototype
// (docs/prototypes/settings-layouts.html, layout A).

/** "<section>.<row>", e.g. "behaviour.autoFetch". */
export type SettingId = string

export type SettingMeta = {
  id: SettingId
  title: string
  description: string
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
  "Force-pushing a branch",
  "Deleting a branch or tag",
  "Resetting hard (discards changes)",
  "Checking out with uncommitted changes",
  "Aborting a merge or rebase",
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
        description: "Follow the system, or force light or dark.",
        keywords: ["appearance", "dark", "light", "system", "colour", "color"],
      },
      {
        id: "appearance.commandBar",
        title: "Command bar",
        description: "Where Commit, Pull, Push and the other commands live.",
        keywords: ["rail", "title bar", "toolbar", "layout"],
      },
      {
        id: "appearance.zoom",
        title: "Zoom",
        description: "Scale of the whole window. Ctrl + and Ctrl − change it too.",
        keywords: ["scale", "size", "percent", "font"],
      },
      {
        id: "appearance.authorDiscs",
        title: "Author discs",
        description: "An initials disc before each author in the graph, and a ring on the selected commit's author.",
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
        title: "User name",
        description: "user.name — who the commits are by.",
        keywords: ["identity", "author", "committer"],
      },
      {
        id: "git.userEmail",
        title: "Email",
        description: "user.email",
        keywords: ["identity", "author", "committer", "mail"],
      },
      {
        id: "git.autoCrlf",
        title: "Line endings",
        description: "core.autocrlf — what happens to CRLF on the way in and out.",
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
        description: "diff.tool — what “Open in diff tool” launches.",
        keywords: ["difftool", "vscode", "vs code", "beyond compare", "kdiff3", "compare"],
      },
      {
        id: "tools.mergeTool",
        title: "Merge tool",
        description: "merge.tool — what “Resolve conflicts” opens for a file.",
        keywords: ["mergetool", "conflicts", "vscode", "vs code", "beyond compare", "kdiff3"],
      },
      {
        id: "tools.editor",
        title: "Editor",
        description: "core.editor — for commit messages and interactive rebases.",
        keywords: ["vscode", "vs code", "vim", "notepad", "commit message"],
      },
      {
        id: "tools.vsCode",
        title: "VS Code",
        description: "One click sets it as editor, diff and merge tool.",
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
        id: "behaviour.confirmations",
        title: "Ask before",
        description: "A confirmation dialog before these; turn one off knowingly.",
        keywords: ["confirm", "confirmation", "force push", "delete", "reset", "checkout", "abort", ...CONFIRM_LABELS],
        anchor: "Confirmations",
      },
      {
        id: "behaviour.autoFetch",
        title: "Fetch in the background",
        description: "Keeps the remote branches fresh without asking.",
        keywords: ["auto fetch", "autofetch", "remote", "interval", "minutes", "background"],
        anchor: "Background fetch",
      },
      {
        id: "behaviour.mergeFf",
        title: "Merges by default",
        description: "What the Merge dialog starts with.",
        keywords: ["fast-forward", "fast forward", "ff", "merge commit", "no-ff"],
      },
      {
        id: "behaviour.rebaseDefaults",
        title: "Rebase defaults",
        description: "What the Rebase dialog starts with.",
        keywords: ["autostash", "autosquash", "stash", "fixup", "squash", "interactive"],
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
        description: "The app log needs no inspector; the developer tools may be unavailable on Ubuntu.",
        keywords: ["app log", "developer tools", "devtools", "inspector", "logs folder", "console", "debug"],
      },
      {
        id: "diagnostics.recovery",
        title: "Recovery experiments",
        description:
          "For a frozen picture while the app still reacts: press the hotkey, wait a few seconds, note whether the window repaints. Every press is written to engine.log.",
        keywords: ["freeze", "frozen", "ladder", "repaint", "hotkey", "ubuntu"],
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
        title: "PowerGit",
        // The prototype said "fetched" here; the word is kept out so a search
        // for "fetch" lands on the background fetch alone.
        description: "Nothing is checked until you ask, nothing installed until you say so.",
        keywords: ["update", "version", "check for updates", "download", "release", "restart"],
      },
      {
        id: "updates.location",
        title: "Install",
        description: "Where this PowerGit runs from.",
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
  return [meta.title, meta.description, ...(meta.keywords ?? [])].join("\n").toLowerCase()
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
