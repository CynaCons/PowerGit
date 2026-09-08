// Remote URL → web URL (v0.15.0, "Open in browser" on the commit menu).
// Git Extensions asks its plugin list; PowerGit maps the four hosts that
// cover practically every repository we see, from either transport form:
//
//   ssh://git@github.com:22/o/r.git   git@github.com:o/r.git
//   https://github.com/o/r.git        https://user@dev.azure.com/o/p/_git/r
//
// Anything else returns null and the menu item is disabled rather than
// opening a guessed URL.

export type GitHost = "github" | "gitlab" | "bitbucket" | "azure"

export type RemoteWeb = {
  host: GitHost
  /** Repository root on the web, no trailing slash. */
  base: string
}

/** {host, path} of a remote URL in any transport form, or null. */
function parseRemote(url: string): { host: string; path: string } | null {
  const raw = url.trim()
  if (!raw) return null
  // scp-like: [user@]host:path (no "//" after the colon).
  const scp = /^(?:([^@/]+)@)?([^/:]+):(?!\/\/)(.+)$/.exec(raw)
  if (scp && !/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
    return { host: scp[2].toLowerCase(), path: trimPath(scp[3]) }
  }
  const m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.*)$/i.exec(raw)
  if (!m) return null
  return { host: m[1].toLowerCase(), path: trimPath(m[2]) }
}

function trimPath(path: string): string {
  return path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
}

function hostKind(host: string): GitHost | null {
  if (host === "github.com" || host.endsWith(".github.com") || host === "ssh.github.com") return "github"
  if (host === "gitlab.com" || host.startsWith("gitlab.")) return "gitlab"
  if (host === "bitbucket.org" || host.startsWith("bitbucket.")) return "bitbucket"
  if (host === "dev.azure.com" || host.endsWith(".dev.azure.com")) return "azure"
  if (host.endsWith(".visualstudio.com") || host.startsWith("vs-ssh.")) return "azure"
  return null
}

/** The repository's page on its host, or null when we do not know the host. */
export function remoteWebUrl(remoteUrl: string): RemoteWeb | null {
  const parsed = parseRemote(remoteUrl)
  if (!parsed) return null
  const host = hostKind(parsed.host)
  if (!host) return null
  let path = parsed.path
  if (host === "azure") {
    // dev.azure.com/org/project/_git/repo, the ssh form v3/org/project/repo,
    // and org.visualstudio.com/project/_git/repo all describe the same page.
    const segments = path.split("/").filter(Boolean)
    if (segments[0] === "v3") segments.shift()
    if (!segments.includes("_git") && segments.length >= 3) segments.splice(segments.length - 1, 0, "_git")
    if (parsed.host.endsWith(".visualstudio.com") || parsed.host.startsWith("vs-ssh.")) {
      const org = parsed.host.startsWith("vs-ssh.")
        ? (segments.shift() ?? "")
        : parsed.host.replace(/\.visualstudio\.com$/, "")
      return { host, base: `https://dev.azure.com/${[org, ...segments].filter(Boolean).join("/")}` }
    }
    path = segments.join("/")
    return { host, base: `https://dev.azure.com/${path}` }
  }
  if (host === "gitlab" && path.startsWith("v3/")) path = path.slice(3)
  const webHost = parsed.host.replace(/^(ssh|vs-ssh|altssh)\./, "")
  return { host, base: `https://${webHost}/${path}` }
}

/** Web page of one commit, or null when the remote's host is unknown. */
export function commitWebUrl(remoteUrl: string, sha: string): string | null {
  const web = remoteWebUrl(remoteUrl)
  if (!web || !sha) return null
  switch (web.host) {
    case "github":
      return `${web.base}/commit/${sha}`
    case "gitlab":
      return `${web.base}/-/commit/${sha}`
    case "bitbucket":
      return `${web.base}/commits/${sha}`
    case "azure":
      return `${web.base}/commit/${sha}`
  }
}
