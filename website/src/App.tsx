import { useState } from "react"

// The landing page (2026-10-25, owner: "a very good github documentation and
// landing page, showcasing all the features and the agent integration").
// The page is drawn as a git graph: a lane runs down the left gutter, every
// section is a commit on it, and the agent sections branch off on a dashed
// agent lane, as a planned branch looks in PowerGit, then merge back.

const RELEASES = "https://github.com/CynaCons/PowerGit/releases/latest"
const REPO = "https://github.com/CynaCons/PowerGit"
const DOCS = `${REPO}/blob/powergit/docs/agents/mcp-agent-review.md`

// Assets live under the site base (/PowerGit/ on Pages); absolute /assets
// paths 404 there.
const asset = (file: string) => `${import.meta.env.BASE_URL}assets/${file}`

const STEPS = [
  {
    title: "Connect your agent",
    body: "One command adds PowerGit's MCP server to Claude Code, Codex or any MCP client. The endpoint is a private pipe on your machine.",
  },
  {
    title: "The agent opens a review",
    body: "When it is done, the agent hands over its changes and waits. The review appears in PowerGit's inbox, from any of your repositories.",
  },
  {
    title: "You decide, change by change",
    body: "Accept or reject each change, comment on lines, ask a question and read the answer under your line. Then send the round back.",
  },
  {
    title: "It revises until you approve",
    body: "The agent fixes what you rejected and opens round 2. Your verdicts carry over where nothing moved. When you approve, it commits.",
  },
]

const CONNECT = {
  "Claude Code": {
    lang: "shell",
    code: `claude mcp add powergit -- "C:\\Users\\<you>\\AppData\\Local\\PowerGit\\powergit.exe" mcp`,
  },
  Codex: {
    lang: "~/.codex/config.toml",
    code: `[mcp_servers.powergit]\ncommand = "C:/Users/<you>/AppData/Local/PowerGit/powergit.exe"\nargs = ["mcp"]`,
  },
  "Any MCP client": {
    lang: ".mcp.json",
    code: `{\n  "mcpServers": {\n    "powergit": { "command": "<path to powergit>", "args": ["mcp"] }\n  }\n}`,
  },
} as const

const TOOLS = [
  ["agent_review_open", "Hand over changes from the working tree, a commit range or patches, with explanations on lines"],
  ["agent_review_wait", "Wait until you send the round back, approve or cancel"],
  ["agent_review_revise", "Open the next round, with a reply to each of your comments"],
  ["agent_review_comment", "Review beside you as a second agent"],
  ["branch_plan_preview", "Check a plan with git without showing it to anyone"],
  ["branch_plan_open", "Show you a plan of rebases, merges, cherry-picks and tags on your graph"],
  ["branch_plan_get", "Read which steps you approved and which already ran"],
  ["branch_plan_pr", "Attach a pull request from GitHub, Bitbucket, GitLab or any host"],
]

const GIT = [
  {
    title: "The revision graph",
    body: "All branches, tags and stashes in Git Extensions' lane colours, with a layout checked against its own graph tests. Virtualised, and measured on a 100,000-commit repository.",
  },
  {
    title: "Follow your branch",
    body: "Ring the commits your branch reaches and dim the rest, highlight any commit's ancestry, or show only the branches you pick.",
  },
  {
    title: "Staging by the line",
    body: "Unstaged, staged, diff and message side by side. Stage or reset whole files or selected lines, even with thousands of changes pending.",
  },
  {
    title: "Merge, rebase, conflicts",
    body: "Fast-forward and squash merges, interactive rebase, cherry-pick and revert. A conflict stops with Resolve, Continue, Skip and Abort.",
  },
  {
    title: "Undo from the diff",
    body: "Select lines in any diff and reset just those, or reverse one change of an old commit. Each reset says what it keeps before it runs.",
  },
  {
    title: "Your own review",
    body: "Mark lines as reviewed and comment in any diff. The review survives restarts and exports to Markdown.",
  },
  {
    title: "Tags that know where they are",
    body: "Each tag shows whether a remote has it. Push a local tag from its menu.",
  },
  {
    title: "Every command, visible",
    body: "The console at the bottom lists each git command PowerGit ran, with its output and exit code. Credentials never reach it.",
  },
  {
    title: "Never stale",
    body: "A watcher follows .git, so a commit from a terminal or an agent shows up at once.",
  },
]

const SCREENS = [
  { file: "sample-browse-dark.png", caption: "The graph in dark mode, Git Extensions' lane colours lifted for contrast" },
  { file: "branch-plan-dark.png", caption: "A branch plan in dark mode, on its pull request step" },
  { file: "sample-commit.png", caption: "The commit window: unstaged, staged, the diff and the message" },
  { file: "sample-diff.png", caption: "A merge's changed files and their diff, under the graph" },
]

function Connect() {
  const [tab, setTab] = useState<keyof typeof CONNECT>("Claude Code")
  const [copied, setCopied] = useState(false)
  const current = CONNECT[tab]
  const copy = () => {
    void navigator.clipboard?.writeText(current.code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className="terminal">
      <div className="terminal-tabs" role="tablist">
        {(Object.keys(CONNECT) as (keyof typeof CONNECT)[]).map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "on" : undefined}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
        <button className="copy" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="terminal-lang">{current.lang}</p>
      <pre>
        <code>{current.code}</code>
      </pre>
    </div>
  )
}

function Shot({ file, alt, wide }: { file: string; alt: string; wide?: boolean }) {
  return (
    <figure className={wide ? "shot wide" : "shot"}>
      <img src={asset(file)} alt={alt} loading="lazy" />
    </figure>
  )
}

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <a className="brand" href="#top">
            <img src="logo.svg" alt="" width="22" height="22" />
            PowerGit
          </a>
          <nav>
            <a href="#agents">Agents</a>
            <a href="#git">Git client</a>
            <a href="#demo">Live demo</a>
            <a href={REPO}>GitHub</a>
            <a href={RELEASES} className="nav-cta">
              Download
            </a>
          </nav>
        </div>
      </header>

      <main id="top" className="graph">
        <section className="hero commit head">
          <div className="wrap">
            <p className="ref-chips">
              <span className="chip head">HEAD</span>
              <span className="chip version">v{__APP_VERSION__}</span>
              <span className="chip os">Windows and Linux</span>
            </p>
            <h1>The git client your coding agents report to.</h1>
            <p className="sub">
              PowerGit is a fast, portable git client built on the revision graph of Git Extensions. Its MCP
              server lets Claude Code, Codex and other agents show you their changes and their branch plans on
              your own graph, and wait for your decision before anything lands.
            </p>
            <div className="cta">
              <a className="btn primary" href={RELEASES}>
                Download v{__APP_VERSION__}
              </a>
              <a className="btn" href="#demo">
                Try the live demo
              </a>
              <a className="btn quiet" href={REPO}>
                Source on GitHub
              </a>
            </div>
          </div>
          <div className="hero-shot">
            <img
              src={asset("branch-plan-end.png")}
              alt="A branch plan in PowerGit: an agent's planned rebase, merge and pull request drawn on the repository's graph, with a predicted conflict"
            />
          </div>
        </section>

        <div id="agents" className="agent-lane">
          <section className="commit planned">
            <div className="wrap">
              <h2>How a review goes</h2>
              <p className="lead">
                Your agent works as usual. When it has something to land, it asks you first, in the window
                where you already read your history.
              </p>
              <ol className="steps">
                {STEPS.map((s, i) => (
                  <li key={s.title} style={{ "--lane": `var(--lane-${(i % 7) + 1})` } as React.CSSProperties}>
                    <h3>{s.title}</h3>
                    <p>{s.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <section className="commit planned feature">
            <div className="wrap split">
              <div className="copy">
                <h2>Agent reviews</h2>
                <p className="lead">A pull request review for work that has not left your machine.</p>
                <ul className="points">
                  <li>
                    <b>A verdict per change.</b> Accept or reject each change, or mark single lines.
                  </li>
                  <li>
                    <b>Questions on lines.</b> Ask while you review. The answer lands under the line you asked
                    about.
                  </li>
                  <li>
                    <b>The author explains.</b> The agent can say why on the line itself, and you reply in the
                    thread.
                  </li>
                  <li>
                    <b>A second reviewer.</b> Let Codex review Claude's work beside you, and keep or dismiss
                    its comments.
                  </li>
                  <li>
                    <b>Rounds that remember.</b> Unchanged changes keep your verdict, and earlier conversations
                    stay on their lines.
                  </li>
                </ul>
              </div>
              <Shot
                file="agent-review.png"
                alt="An agent review: a change accepted, the agent's explanation on line 9, the owner's question on line 19 and the agent's answer"
              />
            </div>
          </section>

          <section className="commit planned feature">
            <div className="wrap split">
              <div className="copy">
                <h2>Branch plans</h2>
                <p className="lead">See the rebase before it happens, on your real graph.</p>
                <ul className="points">
                  <li>
                    <b>Step through it.</b> A scrubber plays the plan. Planned commits are hollow, replaced ones
                    struck through, and labels move with each step.
                  </li>
                  <li>
                    <b>Checked with git.</b> Merges go through <code>git merge-tree</code>, and rebases and
                    cherry-picks are replayed commit by commit. A predicted conflict shows both sides.
                  </li>
                  <li>
                    <b>Approve, then watch it run.</b> Each step ticks as the agent runs it. If your branches
                    move first, PowerGit checks the plan again.
                  </li>
                  <li>
                    <b>Pull requests from any host.</b> GitHub, Bitbucket, GitLab or your own server. The agent
                    reports the PR, and it opens from its branch label.
                  </li>
                </ul>
              </div>
              <Shot
                file="branch-plan.png"
                alt="A branch plan stopped on a rebase step: the conflict on src/session.ts with main's change and the branch's change side by side"
              />
            </div>
          </section>

          <section className="commit planned feature">
            <div className="wrap split">
              <div className="copy">
                <h2>Documents, read as documents</h2>
                <p className="lead">Agents write docs too. Review them rendered.</p>
                <ul className="points">
                  <li>
                    <b>Changes or Preview.</b> A Markdown file switches between its diff and the rendered page.
                  </li>
                  <li>
                    <b>Comment on the page.</b> Hover a paragraph, list or table and leave a comment. It reaches
                    the agent on that line.
                  </li>
                  <li>
                    <b>A channel beside it.</b> With{" "}
                    <a href="https://github.com/CynaCons/PowerChannel">PowerChannel</a>, each review has a
                    channel. You see when the agent is reading, and you can message it at any time.
                  </li>
                </ul>
              </div>
              <Shot
                file="agent-review-markdown.png"
                alt="A Markdown file in its preview: headings, a table of retry delays and the owner's comment under the table"
              />
            </div>
          </section>

          <section className="commit planned">
            <div className="wrap">
              <h2>Connect your agent</h2>
              <p className="lead">
                PowerGit must be running. The server is local only: a private pipe on Windows, a socket on
                Linux. No token on disk, nothing on the network.
              </p>
              <div className="connect">
                <Connect />
                <table className="tools">
                  <tbody>
                    {TOOLS.map(([name, what]) => (
                      <tr key={name}>
                        <td>
                          <code>{name}</code>
                        </td>
                        <td>{what}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="fineprint">
                Payloads, the review loop and the channel protocol: <a href={DOCS}>Agent review over MCP</a>.
              </p>
            </div>
          </section>
        </div>

        <section id="git" className="commit merge">
          <div className="wrap">
            <h2>A complete git client</h2>
            <p className="lead">
              Everything Git Extensions users reach for, rebuilt in React and Material UI in a Tauri shell, on
              Windows and Linux.
            </p>
            <Shot
              wide
              file="sample-browse.png"
              alt="PowerGit Browse: merged feature branches in Git Extensions' lane colours, the repository tree and a merge commit's details"
            />
            <dl className="git-list">
              {GIT.map((g) => (
                <div key={g.title}>
                  <dt>{g.title}</dt>
                  <dd>{g.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="demo" className="commit">
          <div className="wrap">
            <h2>Try it here</h2>
            <p className="lead">
              The real application, running in your browser on sample data. Click a commit, right-click
              commits and branches, open the Diff tab.
            </p>
            <div className="demo-frame">
              <iframe src={`${import.meta.env.BASE_URL}demo/`} title="PowerGit live demo" loading="lazy" />
            </div>
          </div>
        </section>

        <section className="commit">
          <div className="wrap">
            <h2>More screens</h2>
            <div className="shots">
              {SCREENS.map((s) => (
                <figure key={s.file}>
                  <img src={asset(s.file)} alt={s.caption} loading="lazy" />
                  <figcaption>{s.caption}</figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        <section id="download" className="commit root">
          <div className="wrap">
            <h2>Download</h2>
            <p className="lead">
              PowerGit brings its own git engine. It needs only <code>git</code> on your <code>PATH</code>.
            </p>
            <div className="downloads">
              <a href={RELEASES}>
                <b>Windows installer</b>
                <span>Updates itself from Settings</span>
              </a>
              <a href={RELEASES}>
                <b>Windows portable zip</b>
                <span>Unzip and run powergit.exe</span>
              </a>
              <a href={RELEASES}>
                <b>Linux AppImage</b>
                <span>Ubuntu 22.04, 24.04 and 26.04</span>
              </a>
            </div>
            <p className="fineprint">
              Updates are signed and checked only when you ask. Free software under GPL-3.0.
            </p>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap footer-inner">
          <span>GPL-3.0. A combined work with Git Extensions.</span>
          <span>
            <a href={REPO}>Source</a>
            <a href={`${REPO}/issues`}>Issues</a>
            <a href={DOCS}>Agent docs</a>
          </span>
        </div>
      </footer>
    </>
  )
}
