# Contributing to PowerGit

PowerGit is a GPL-3.0 fork of [Git Extensions](https://github.com/gitextensions/gitextensions):
a React + Tauri frontend over a small C# git engine. Contributions land on the
`powergit` branch. `master` is the untouched upstream mirror and is read-only.

## Setup

Windows dev machine, .NET 10 SDK, Node 22, Rust.

```bash
git clone https://github.com/CynaCons/PowerGit.git
cd PowerGit
git worktree add ../gitextensions-ref master   # optional: the behavioural reference
dotnet test src/engine/PowerGit.Engine.sln
cd frontend && npm ci && npm run dev:all
```

## Before you open a pull request

- `dotnet test src/engine/PowerGit.Engine.sln` is green.
- `npm run test:unit` and `npm run test:e2e` are green (the e2e suite needs
  the dev engine from `npm run dev:all` or `npm run engine`).
- Behaviour matches Git Extensions unless a requirement in `docs/srs/` says
  otherwise. The revision graph is the product; a pretty-but-wrong lane
  layout is a defect.
- Keep diffs small and do not reformat files you are not changing.
- New files are GPL-3.0 like the rest of the tree.

## Where things are

See [AGENTS.md](AGENTS.md) for the project shape, the branch model, the
verification rules and the agent memories under `docs/agents/`.
