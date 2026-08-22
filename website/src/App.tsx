const FEATURES = [
  {
    title: "The graph, always complete",
    body: "All branches, all tags, stashes as nodes — no filters needed. Git Extensions lane colors, virtualized to thousands of commits.",
  },
  {
    title: "Everything in reach",
    body: "Commit details, changed files, the full repo tree at any revision — open unchanged files too. Unified diffs with context / full-file / whitespace options.",
  },
  {
    title: "Real staging",
    body: "FormCommit-style window: unstaged │ staged │ diff │ message. Multi-select with shift/ctrl, right-click stage, delete and gitignore with a live ignore preview.",
  },
  {
    title: "Branch ops with GE guards",
    body: "Checkout, reset (soft/mixed/hard) and rebase from the graph's right-click menu — same prompts and guards as Git Extensions.",
  },
  {
    title: "Remotes, tags & submodules",
    body: "Hierarchical tree with icons and per-node menus: fetch or configure remotes, checkout or delete tags, open submodules.",
  },
  {
    title: "Portable by design",
    body: "One exe + one self-contained engine sidecar. The app spawns its own .NET 10 git host; nothing to install on the machine.",
  },
]

const SCREENS = [
  { file: "diff-options.png", caption: "Diff tab — files left, diff right, floating options bar" },
  { file: "file-tree.png", caption: "Full repo tree at any commit — open unchanged files" },
  { file: "commit-dialog.png", caption: "Commit window: unstaged │ staged │ diff │ message" },
  { file: "stash-menu.png", caption: "Stash handling from the topbar mini-menu" },
]

export default function App() {
  return (
    <>
      <header className="topbar">
        <div className="wrap topbar-inner">
          <span className="brand">PowerGit</span>
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
              Download v0.6.0
            </a>
          </div>
          <figure className="hero-shot">
            <img src="/assets/browse.png" alt="PowerGit Browse — live revision graph" />
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
            <iframe src="/PowerGit/demo/" title="PowerGit live demo" loading="lazy" />
          </div>
          <p className="fineprint">
            Tip: right-click commits and branches, drag the bottom-panel splitter, open the File
            Tree tab, hover the small pill at the bottom-center of the Diff tab.
          </p>
        </div>
      </section>

      <section id="features" className="features">
        <div className="wrap">
          <h2>What's inside</h2>
          <p className="lead">Scope of this fork: a new frontend for Git Extensions — not a rewrite of git plumbing.</p>
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
          <p className="lead">Captured from real builds.</p>
          <div className="shots">
            {SCREENS.map((s) => (
              <figure key={s.file}>
                <img src={`/assets/${s.file}`} alt={s.caption} loading="lazy" />
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
