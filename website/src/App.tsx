const FEATURES = [
  {
    title: "The graph, always complete",
    body: "All branches, tags and stashes as nodes, Git Extensions lane colours, virtualised to tens of thousands of commits. The selected row keeps its node and lanes.",
  },
  {
    title: "Never stale",
    body: "A filesystem watcher streams .git changes to the UI; status is re-checked while the window is visible and on focus. Commit from a terminal or an agent and the graph follows.",
  },
  {
    title: "Commands in a rail",
    body: "Refresh, Commit with its change count, Stash, Pull, Push, Fetch, Branch, Checkout, Rebase and Tag in a collapsible left rail. The classic title-bar toolbar stays available in Settings.",
  },
  {
    title: "Real staging",
    body: "FormCommit-style window: unstaged │ staged │ diff │ message. Stage or reset whole files, or select lines in the diff and stage or reset just those, like Git Extensions.",
  },
  {
    title: "Everything in reach",
    body: "Commit details, changed files as a flat list or a directory tree, unified diffs with context / full-file / whitespace options, the full repository tree at any revision.",
  },
  {
    title: "Keyboard muscle memory",
    body: "Git Extensions defaults: Ctrl+Space commit, Ctrl+, settings, arrows on the graph, F5 refresh, Ctrl+B panel, Ctrl+= / Ctrl+- / Ctrl+0 zoom. Letter keys never steal from the commit message.",
  },
  {
    title: "Heavy repos stay fluid",
    body: "Paged history, a virtualised ref tree with filter, jump-to-ref that loads until the tip is visible, and refreshes that reuse unchanged rows instead of re-laying out the graph.",
  },
  {
    title: "Branch ops with GE guards",
    body: "Checkout, reset (soft/mixed/hard), rebase, cherry-pick and revert from the graph's right-click menu, with the same prompts and guards as Git Extensions.",
  },
  {
    title: "Frameless and portable",
    body: "One window with integrated controls on Windows and Linux, light and dark. Windows zip or installer, Linux AppImage that registers its own launcher entry. The app spawns its own .NET 10 git engine.",
  },
]

const SCREENS = [
  { file: "browse-dark.png", caption: "Browse in dark: the same graph, rail and status bar" },
  { file: "diff-tree.png", caption: "Diff tab in directory-tree mode, floating toggle bottom-right of the file list" },
  { file: "file-tree.png", caption: "Full repository tree at any commit, unchanged files included" },
  { file: "commit-dialog.png", caption: "Commit window: unstaged │ staged │ diff │ message, with line-level stage and reset" },
  { file: "stash-menu.png", caption: "Every rail command has its options behind a chevron" },
]

// Assets live under the site base (/PowerGit/ on Pages); absolute /assets
// paths 404 there, which is how the site shipped without a single image.
const asset = (file: string) => `${import.meta.env.BASE_URL}assets/${file}`

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand">
            <img src="logo.svg" alt="" width="22" height="22" style={{ verticalAlign: "-4px", marginRight: 8 }} />
            PowerGit
          </span>
          <nav>
            <a href="#demo">Live demo</a>
            <a href="#features">Features</a>
            <a href="#screens">Screens</a>
            <a href="https://github.com/CynaCons/PowerGit/releases" className="nav-cta">
              Download
            </a>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <p className="kicker">A GPL-3.0 fork of Git Extensions</p>
          <h1>
            A new frontend for Git Extensions.
            <br />
            <span className="accent">Modern. Portable. Cross-platform.</span>
          </h1>
          <p className="sub">
            The revision graph you know — re-imagined with React + Material inside a lightweight
            Tauri shell, driven by a self-contained C# git engine.
          </p>
          <div className="cta">
            <a className="btn primary" href="#demo">
              Try the live demo
            </a>
            <a className="btn ghost" href="https://github.com/CynaCons/PowerGit/releases">
              Download v{__APP_VERSION__}
            </a>
          </div>
          <figure className="hero-shot">
            <img src={asset("browse.png")} alt="PowerGit Browse: the revision graph, command rail and commit details" />
          </figure>
        </div>
      </section>

      <section id="demo" className="demo">
        <div className="wrap">
          <h2>Try it right here</h2>
          <p className="lead">
            This is the real application running in your browser on built-in sample data
            (the shipped app connects it to your repositories through its git engine).
          </p>
          <div className="demo-frame">
            <iframe src={`${import.meta.env.BASE_URL}demo/`} title="PowerGit live demo" loading="lazy" />
          </div>
          <p className="fineprint">
            Tip: click a commit for its details and diff, right-click commits and branches, collapse
            the rail, drag the bottom-panel splitter, switch the Diff tab's file list to a directory
            tree with the button at its bottom-right.
          </p>
        </div>
      </section>

      <section id="features" className="features">
        <div className="wrap">
          <h2>What's inside</h2>
          <p className="lead">Scope of this fork: a new frontend for Git Extensions, not a rewrite of git plumbing.</p>
          <div className="grid">
            {FEATURES.map((f) => (
              <article key={f.title} className="card">
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="screens" className="screens">
        <div className="wrap">
          <h2>Screens</h2>
          <p className="lead">Captured from the real app on the PowerGit repository, v{__APP_VERSION__}.</p>
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

      <footer>
        <div className="wrap footer-inner">
          <span>GPL-3.0 — combined work with Git Extensions.</span>
          <span>Tauri · React · MUI · .NET 10</span>
        </div>
      </footer>
    </>
  )
}
