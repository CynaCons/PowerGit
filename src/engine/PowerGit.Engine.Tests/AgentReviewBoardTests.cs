using Microsoft.Data.Sqlite;
using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>v0.21.2: the review's PowerChannel channel (docs/design/agent-review-rounds.md §4).</summary>
public sealed class AgentReviewBoardTests
{
    // PowerChannel's own schema (formerly powerboard/store.py _SCHEMA; unchanged).
    private const string Schema = """
        CREATE TABLE IF NOT EXISTS messages (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            channel TEXT NOT NULL,
            author  TEXT NOT NULL,
            text    TEXT NOT NULL,
            created REAL NOT NULL
        );
        CREATE INDEX IF NOT EXISTS messages_channel ON messages (channel, id);
        CREATE INDEX IF NOT EXISTS messages_created ON messages (created);
        CREATE TABLE IF NOT EXISTS seen (
            reader  TEXT NOT NULL,
            channel TEXT NOT NULL,
            last_id INTEGER NOT NULL,
            updated REAL NOT NULL,
            PRIMARY KEY (reader, channel)
        );
        """;

    private sealed class TempBoard : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"pg-board-{Guid.NewGuid():N}", "board.db");

        public TempBoard(string schema = Schema)
        {
            Directory.CreateDirectory(System.IO.Path.GetDirectoryName(Path)!);
            Exec("PRAGMA journal_mode=WAL;" + schema);
        }

        public void Exec(string sql, params (string, object)[] args)
        {
            using SqliteConnection db = new($"Data Source={Path};Pooling=False");
            db.Open();
            using SqliteCommand cmd = db.CreateCommand();
            cmd.CommandText = sql;
            foreach ((string name, object value) in args) cmd.Parameters.AddWithValue(name, value);
            cmd.ExecuteNonQuery();
        }

        public long Count(string table)
        {
            using SqliteConnection db = new($"Data Source={Path};Pooling=False");
            db.Open();
            using SqliteCommand cmd = db.CreateCommand();
            cmd.CommandText = $"SELECT COUNT(*) FROM {table}";
            return (long)cmd.ExecuteScalar()!;
        }

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            try { Directory.Delete(System.IO.Path.GetDirectoryName(Path)!, true); } catch (IOException) { }
        }
    }

    private static AgentReviewRequest Request(string? board = null) =>
        new("wait", "Fix the race", "two refreshes", "auth-fix", null, null, null, false,
            [new("f.txt", "M", "@@ -1,2 +1,2 @@\n a\n-b\n+c\n")], board);

    [Fact]
    public void Without_powerchannel_a_review_has_no_channel_and_still_works()
    {
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        host.BoardPath = Path.Combine(Path.GetTempPath(), $"pg-none-{Guid.NewGuid():N}", "board.db");
        Assert.False(host.BoardStatus().Available);
        AgentReviewDto session = host.CreateAgentReview(Request());
        Assert.Null(session.Board);
        Assert.False(host.GetAgentReviewBoard(session.Id, 0).Available);
        Assert.Equal("pending", host.SendAgentReviewRound(session.Id, null).Status);
        Assert.False(File.Exists(host.BoardPath));
    }

    [Fact]
    public void An_unknown_schema_is_unavailable()
    {
        using TempBoard board = new("CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT);");
        (PowerChannel? opened, PowerChannel.Status status) = PowerChannel.Open(board.Path);
        Assert.Null(opened);
        Assert.Equal("unknown powerchannel schema", status.Reason);
    }

    [Fact]
    public void The_channel_carries_rounds_questions_replies_and_the_close()
    {
        using TempBoard board = new();
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        host.BoardPath = board.Path;
        Assert.True(host.BoardStatus().Available);

        AgentReviewDto session = host.CreateAgentReview(Request());
        Assert.Matches($"^review-powergit-ops-[a-z0-9._-]+-{session.Id[..4]}$", session.Board!);
        AgentReviewBoardDto feed = host.GetAgentReviewBoard(session.Id, 0);
        BoardMessageDto opened = Assert.Single(feed.Messages);
        Assert.Equal("powergit", opened.Author);
        Assert.StartsWith($"Round 1 opened · review {session.Id[..8]} · 1 file, 1 change\nFix the race", opened.Text);
        Assert.EndsWith($"\nReply with `cN: <answer>`; Markdown is shown.\nreview_id={session.Id}", opened.Text);

        AgentReviewThreadDto asked = host.AskAgentReview(session.Id, new(1, "f.txt", "+2", "why c?"));
        feed = host.GetAgentReviewBoard(session.Id, opened.Id);
        Assert.Equal(("human", "c1 · f.txt:2\nwhy c?"), (feed.Messages[0].Author, feed.Messages[0].Text));

        // The agent answers on the board; the reply lands on the comment once.
        PowerChannel.Open(board.Path).Board!.Post("auth-fix", session.Board!, "c1: because b was wrong");
        PowerChannel.Open(board.Path).Board!.Post("auth-fix", session.Board!, "working on it");
        host.GetAgentReviewBoard(session.Id, 0);
        host.GetAgentReviewBoard(session.Id, 0);
        AgentReviewReplyDto reply = Assert.Single(host.GetAgentReview(session.Id)!.Comments!.Single(c => c.Id == asked.Id).Replies);
        Assert.Equal(("auth-fix", "because b was wrong"), (reply.Author, reply.Body));
        Assert.Equal(0, board.Count("seen"));

        // Presence: PowerChannel's seen.updated of the agent's name.
        double now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0;
        board.Exec("INSERT INTO seen (reader, channel, last_id, updated) VALUES ($r, $c, 1, $u)", ("$r", "auth-fix"), ("$c", session.Board!), ("$u", now));
        feed = host.GetAgentReviewBoard(session.Id, 0);
        Assert.True(feed.Reading); Assert.NotNull(feed.LastRead); Assert.Equal("auth-fix", feed.Agent);

        host.WriteReview(session.Id, "{\"files\":{\"f.txt\":{\"lines\":{\"-2\":\"rejected\",\"+2\":\"rejected\"},\"comments\":[{\"line\":\"+2\",\"text\":\"keep b\"}]}}}");
        host.SendAgentReviewRound(session.Id, "one thing");
        string round = host.GetAgentReviewBoard(session.Id, 0).Messages.Last(m => m.Author == "human").Text;
        Assert.StartsWith($"Round 1 sent · review {session.Id[..8]} · 0 accepted, 1 rejected, 0 undecided, 1 comment\none thing", round);
        Assert.Contains("✗ h1  f.txt:2  c2  keep b", round);
        Assert.EndsWith($"details: agent_review_get review_id={session.Id} round=1", round);

        host.ReviseAgentReview(session.Id, new("kept b", [new("c2", "restored")], null, [new("f.txt", "M", "@@ -1,2 +1,3 @@\n a\n b\n+d\n")]), CancellationToken.None);
        string second = host.GetAgentReviewBoard(session.Id, 0).Messages.Last(m => m.Author == "powergit").Text;
        Assert.StartsWith("Round 2 opened", second);
        Assert.Contains("c2 answered: restored", second);
        Assert.DoesNotContain("Reply with", second);
        Assert.EndsWith($"\nreview_id={session.Id}", second);

        BoardMessageDto said = host.PostAgentReviewBoard(session.Id, "looks better");
        Assert.Equal("human", said.Author);
        host.ResolveAgentReview(session.Id, new("approve", null, null));
        Assert.StartsWith($"Approved · review {session.Id[..8]} · round 2", host.GetAgentReviewBoard(session.Id, 0).Messages[^1].Text);
    }

    // v0.21.12, owner: "when I'm dropping a comment in the review panel, it is
    // not deletable." A question already asked on the board is withdrawn: the
    // thread stays as "withdrawn" (ids are never reused), the board says so,
    // and the round does not carry it.
    [Fact]
    public void An_asked_comment_can_be_withdrawn()
    {
        using TempBoard board = new();
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        host.BoardPath = board.Path;
        AgentReviewDto session = host.CreateAgentReview(Request());
        AgentReviewThreadDto asked = host.AskAgentReview(session.Id, new(1, "f.txt", "+2", "why c?"));

        AgentReviewThreadDto gone = host.WithdrawAgentReviewComment(session.Id, asked.Id);
        Assert.Equal(("c1", "withdrawn"), (gone.Id, gone.Kind));
        Assert.Equal(("human", "c1 withdrawn"), (host.GetAgentReviewBoard(session.Id, 0).Messages[^1].Author, host.GetAgentReviewBoard(session.Id, 0).Messages[^1].Text));
        Assert.Throws<AgentReviewStateException>(() => host.WithdrawAgentReviewComment(session.Id, asked.Id));
        Assert.Throws<KeyNotFoundException>(() => host.WithdrawAgentReviewComment(session.Id, "c9"));

        Assert.Equal("c2", host.AskAgentReview(session.Id, new(1, "f.txt", "+2", "and this?")).Id);
        AgentReviewDto sent = host.SendAgentReviewRound(session.Id, null);
        Assert.DoesNotContain("why c?", host.GetAgentReviewBoard(session.Id, 0).Messages[^1].Text);
        Assert.Equal("withdrawn", sent.Comments!.Single(c => c.Id == "c1").Kind);
        Assert.Throws<AgentReviewStateException>(() => host.WithdrawAgentReviewComment(session.Id, "c2"));
    }

    [Fact]
    public void An_agent_can_name_the_channel()
    {
        using TempBoard board = new();
        using TempRepo repo = new(); GitHost host = new(); host.Open(repo.Dir);
        host.BoardPath = board.Path;
        Assert.Equal("my-review", host.CreateAgentReview(Request("My-Review")).Board);
        Assert.StartsWith("review-", host.CreateAgentReview(Request("not a name!")).Board);
    }
}
