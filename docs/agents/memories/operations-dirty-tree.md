# Operations on a dirty tree

## Git decides; the UI offers recovery

2026-09-16 owner: "It's really important that the operations in the repo are working. Whenever I do a merge or a reset, usually it fails. Simple operations like that are failing. App looks good, but we need to ensure the operations are working properly."

The engine must never pre-refuse a dirty working tree: run git and let its overlap check decide. Git's overwrite refusal is HTTP 409 with `code: "dirty"`, its verbatim message and files; the dialog keeps the error inline and offers **Stash and retry**. A busy mutation is HTTP 409 with `code: "busy"`; the frontend waits rather than silently dropping the operation.
