/**
 * v0.13.12: turns git's transport/credential failures into something a
 * person can act on. git's own wording is kept underneath (it is what a web
 * search finds); the headline says what to do.
 */
export type GitFailure = {
  /** Short, actionable headline. */
  title: string
  /** What to do next; null when there is nothing specific. */
  hint: string | null
  /** The original text. */
  raw: string
  kind: "auth" | "ssh" | "network" | "diverged" | "rejected" | "dirty" | "no-upstream" | "cancelled" | "other"
}

const RULES: Array<{ kind: GitFailure["kind"]; test: RegExp; title: string; hint: string | null }> = [
  {
    kind: "cancelled",
    test: /was cancelled/i,
    title: "Operation cancelled",
    hint: null,
  },
  {
    kind: "auth",
    test: /Authentication failed|could not read Username|terminal prompts disabled|Invalid username or password|Permission denied \(publickey/i,
    title: "Authentication failed",
    hint: "The engine never prompts for credentials. Configure a credential helper (e.g. Git Credential Manager) or an SSH key with an agent, then retry.",
  },
  {
    kind: "ssh",
    test: /Host key verification failed|no matching host key type|kex_exchange_identification|Connection closed by .* port 22/i,
    title: "SSH connection refused",
    hint: "Trust the host first from a terminal (ssh -T git@host) so its key lands in known_hosts, then retry.",
  },
  {
    kind: "network",
    test: /Could not resolve host|Connection refused|Connection timed out|unable to access|Network is unreachable|Failed to connect|Recv failure|SSL_ERROR|schannel/i,
    title: "Remote unreachable",
    hint: "Check the network, VPN or proxy and the remote URL (Repository ▸ remotes).",
  },
  {
    kind: "no-upstream",
    test: /no upstream|has no upstream branch|set-upstream/i,
    title: "No upstream branch",
    hint: "Push with upstream tracking first (Push sets -u origin HEAD when none exists) or configure one with git branch --set-upstream-to.",
  },
  {
    kind: "diverged",
    test: /diverged|not possible to fast-forward|Need to specify how to reconcile/i,
    title: "Local and remote have diverged",
    hint: "Pull with rebase, or merge the upstream branch, then push again.",
  },
  {
    kind: "rejected",
    test: /rejected|non-fast-forward|stale info|fetch first/i,
    title: "Push rejected by the remote",
    hint: "Fetch and integrate the remote changes first. Force-with-lease only if you meant to rewrite the branch.",
  },
  {
    kind: "dirty",
    test: /uncommitted changes|would be overwritten|Please commit your changes or stash/i,
    title: "Working tree has local changes",
    hint: "Commit or stash them before pulling.",
  },
]

export function explainGitFailure(raw: string | null | undefined): GitFailure {
  const text = (raw ?? "").trim()
  for (const rule of RULES) {
    if (rule.test.test(text)) return { kind: rule.kind, title: rule.title, hint: rule.hint, raw: text }
  }
  const firstLine = text.split("\n").find((l) => l.trim().length > 0) ?? "Operation failed"
  return { kind: "other", title: firstLine.slice(0, 160), hint: null, raw: text }
}
