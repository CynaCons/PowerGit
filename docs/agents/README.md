# Agent memories and context

PowerGit agents improve across sessions by writing markdown here. `AGENTS.md`
is the standing briefing. This folder is the **durable scratchpad**.

## Layout

```
docs/agents/
  README.md                 # this file
  memories/                 # durable facts (landmines, maps, decisions)
  context/                  # per-feature working context for workers
```

## When to write a memory

Write or update `memories/<topic>.md` when you discover something that the
next agent would otherwise have to rediscover:

- A Windows-only API in a file we thought was portable
- Where Git Extensions hides a behaviour (type + path)
- A Linux git / encoding / credential quirk
- A layout measurement that must match the WinForms original
- A decision already made in PRD/SRS that is easy to violate in code

Do **not** write: task status (that is PLAN.md), secrets, or a copy of the SRS.

## Format

```md
# Topic

## <one fact>
Short paragraph or bullets. Path references as `path/file.ext`.
Date the first write if the fact might rot (`2026-08-20`).
```

One heading per fact. Correct wrong facts in place.

## When to write context

`context/<feature>.md` is a briefing for a worker about to touch that feature
(graph renderer, sidecar protocol, left tree, …). Keep it current; delete it
when it is fully absorbed into code comments + SRS.

## Coordinator vs worker

Workers may create and edit files under `docs/agents/`. They still must not
edit PLAN.md / PRD.md / SRS unless the task says so.
