"""Interop (v0.21.2): the engine's board adapter against PowerChannel's own code.

Needs Python with PowerChannel installed (pip install git+https://github.com/CynaCons/PowerChannel)
and a built engine. Run: python scripts/board-interop.py; ENGINE_EXE=<published exe> checks
the single-file sidecar instead of dotnet run.

The engine runs with POWERCHANNEL_DB pointing at a channel store PowerChannel created.
PowerChannel's Board plays the agent: it reads the round PowerGit posted,
answers a comment, and the engine copies the answer onto the thread.
"""
import json, os, subprocess, sys, tempfile, time, urllib.request
from pathlib import Path
from powerchannel.store import Board

engine_dir = str(Path(__file__).resolve().parent.parent / "src" / "engine" / "PowerGit.Engine")
tmp = Path(tempfile.mkdtemp(prefix="pg-interop-"))
db = tmp / "board.db"
board = Board(db)  # PowerChannel creates the schema
repo = tmp / "repo"
repo.mkdir()
def git(*a): subprocess.run(["git", *a], cwd=repo, check=True, capture_output=True)
git("init", "-q", "-b", "main"); git("config", "user.email", "t@e"); git("config", "user.name", "t")
(repo / "f.txt").write_text("a\nb\n"); git("add", "-A"); git("commit", "-qm", "init")
(repo / "f.txt").write_text("a\nc\n")

port, token = 7799, "interop-token"
env = dict(os.environ, POWERCHANNEL_DB=str(db), POWERGIT_DATA_DIR=str(tmp / "data"), POWERGIT_MCP="0",
           POWERGIT_ENGINE_URL=f"http://127.0.0.1:{port}")
dotnet = os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\dotnet\dotnet.exe")
cmd = [os.environ["ENGINE_EXE"], "--token", token] if os.environ.get("ENGINE_EXE") else [dotnet, "run", "--no-build", "--", "--token", token]
proc = subprocess.Popen(cmd, cwd=engine_dir, env=env,
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def call(method, path, body=None):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method,
                                 data=None if body is None else json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        text = r.read().decode()
        return json.loads(text) if text else None

try:
    for _ in range(120):
        try: call("GET", "/health"); break
        except Exception: time.sleep(0.5)
    rid = call("POST", "/repos/open", {"path": str(repo)})["id"]
    status = call("GET", f"/repos/{rid}/board/status")
    assert status["available"], status
    s = call("POST", f"/repos/{rid}/agent-reviews", {"mode": "wait", "title": "Interop", "agent": "auth-fix",
                                                     "worktree": True, "files": [{"path": "f.txt", "status": "M"}]})
    channel = s["board"]
    print("channel", channel)
    first = board.read_new("auth-fix", channel)[0]
    assert first and first[0].author == "powergit" and first[0].text.startswith("Round 1 opened"), first
    call("POST", f"/repos/{rid}/agent-reviews/{s['id']}/ask", {"round": 1, "path": "f.txt", "line": "+2", "body": "why c?"})
    asked = board.read_new("auth-fix", channel)[0]
    assert asked[0].author == "human" and asked[0].text.startswith("c1 · f.txt:2"), asked
    board.post("auth-fix", channel, "c1: because b was wrong")
    feed = call("GET", f"/repos/{rid}/agent-reviews/{s['id']}/board")
    assert feed["agent"] == "auth-fix" and feed["lastRead"] is not None, feed
    session = call("GET", f"/repos/{rid}/agent-reviews/{s['id']}")
    reply = session["comments"][0]["replies"][0]
    assert reply["body"] == "because b was wrong" and reply["author"] == "auth-fix", reply
    call("POST", f"/repos/{rid}/agent-reviews/{s['id']}/send", {"note": "fine"})
    sent = board.read_new("auth-fix", channel)[0]
    assert sent[0].text.startswith("Round 1 sent"), sent
    print("ok: open, ask, reply, send all crossed the board both ways")
finally:
    proc.kill()
