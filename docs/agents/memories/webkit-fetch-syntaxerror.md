# WebKit "The string did not match the expected pattern" (v0.12.0)

## The symptom
Clicking Fetch on the Ubuntu AppImage (WebKitGTK) showed a red banner with
exactly this text. It is **not** a normal JS error message — it is WebKit's
generic wording for *any* internal string-validation failure across many
unrelated APIs: `new URL()`, `Headers`/`Request` with an invalid name or
value, `document.querySelector` with a bad selector, and — critically —
**`Response.json()` called on a body that isn't valid JSON**. Chromium/V8
would instead say something specific like "Unexpected end of JSON input";
only WebKit collapses all of these into one indistinguishable sentence.

## Investigation result
`frontend/src/engine.ts`'s fetch/pull/push call sites (`fetchRemote`,
`pullBranch`, `pushBranch`, `startJob`/`startFetch`/`startPull`/`startPush`,
`getJob`) were already safe against the classic causes: static headers,
`JSON.stringify` bodies, `encodeURIComponent` on path segments. No dynamic
value was being concatenated into a URL or header unescaped. That means the
most likely trigger was **not** a malformed request but a malformed
*response*: the shared `json<T>()` helper in `engine.ts` calls
`res.json()` unconditionally, before checking `res.ok`. If the engine ever
answers with a non-JSON body (empty body from a dropped connection, or a
foreign process replying on the expected port with its own HTML/error page —
see `docs/agents/memories/engine-port.md` for the port-collision bug that
made this possible pre-v0.12.0), WebKit's `.json()` throws this exact
generic DOMException, and it does **not** reliably satisfy
`instanceof Error` across engines — so a catch block written as
`e instanceof Error ? e.message : "X failed"` can silently swallow the real
detail and show a useless fallback instead.

## The fix (defense in depth, not a single root cause)
- `engine.ts` now exports `describeThrown(e)` — reads `.message` off
  anything with one (covers real `Error` and `DOMException` alike) before
  falling back to `String(e)`.
- `engine.ts` adds `parseJobResponse<T>()`, used only by the fetch/pull/push
  family instead of the shared `json<T>()`. It reads `res.text()` and does
  its own `JSON.parse`, so a non-JSON body throws a clear, attributable
  `Error` ("engine returned a non-JSON response (http NNN)") instead of
  leaking WebKit's ambiguous wording. The shared `json<T>()` used by every
  other endpoint was deliberately left untouched (owned by other concurrent
  workers; also lower risk of a body-mismatch since those are all GETs with
  static shapes).
- `App.tsx`'s `withBusy` and `RemoteDialog.save()` now always prefix the
  banner/error text with the operation name via `describeThrown`, so a
  future report names what was clicked even if the underlying message is
  still generic.
- The port-collision fix in `engine-port.md` (probe/reuse/OS-assigned-port
  fallback) most likely removes the actual trigger going forward. This
  hardening is the safety net for any *other* way a non-JSON response could
  reach the client.

## Coordination note
On 2026-09-02 the App.tsx toolbar rework (MUI `ButtonGroup` split-buttons,
Refresh/Branch/Checkout/Merge/Rebase/Tag buttons, GE-style icons) was found
already implemented in the shared working tree by a concurrent/duplicate
"toolbar" worker, matching this task's spec almost exactly (down to the same
icon choices and the same disabled/coming-soon treatment for Merge, which
has no backing engine endpoint). It was verified correct and left as-is;
only the engine.ts response-parsing hardening above, plus consolidating on
one shared `describeThrown` helper (it had independently been added to
`engine.ts` and half-wired into `App.tsx` already — an unused import), were
this worker's actual contribution. If you find the toolbar already looking
like this, check git status/diff before assuming the task is undone.
