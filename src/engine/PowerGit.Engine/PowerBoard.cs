using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace PowerGit.Engine;

/// <summary>
///  powerboard's SQLite file, read and written directly (v0.21.2,
///  docs/design/agent-review-rounds.md §4): agents wait on a review's channel
///  with powerboard's <c>read</c>; PowerGit posts there for the owner and reads
///  the agent's answers. The file is opened the way powerboard opens it (WAL,
///  busy timeout 10 s, writes in BEGIN IMMEDIATE) and never created here: no
///  file means powerboard is not installed. PowerGit reads by message id and
///  never writes the <c>seen</c> table, so no agent's read position moves.
/// </summary>
public sealed class PowerBoard
{
    private static readonly Regex NamePattern = new("^[a-z0-9][a-z0-9._-]{0,63}$", RegexOptions.Compiled);

    public sealed record Message(long Id, string Channel, string Author, string Text, double Created);
    public sealed record Status(bool Available, string Path, string? Reason);

    public string Path { get; }

    private PowerBoard(string path) => Path = path;

    /// <summary>Where powerboard keeps its file: POWERBOARD_DB, else the per-user data folder.</summary>
    public static string DefaultPath()
    {
        string? overridden = Environment.GetEnvironmentVariable("POWERBOARD_DB");
        if (!string.IsNullOrWhiteSpace(overridden)) return overridden;
        string folder;
        if (OperatingSystem.IsWindows())
            folder = Environment.GetEnvironmentVariable("LOCALAPPDATA") is { Length: > 0 } local ? local : System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Local");
        else if (OperatingSystem.IsMacOS())
            folder = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "Application Support");
        else
            folder = Environment.GetEnvironmentVariable("XDG_DATA_HOME") is { Length: > 0 } xdg ? xdg : System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".local", "share");
        return System.IO.Path.Combine(folder, "powerboard", "board.db");
    }

    /// <summary>The board at <paramref name="path"/>, or why there is none (missing file, unknown schema).</summary>
    public static (PowerBoard? Board, Status Status) Open(string path)
    {
        if (!File.Exists(path)) return (null, new(false, path, "powerboard not found"));
        try
        {
            using SqliteConnection db = Connect(path);
            if (!HasColumns(db, "messages", "id", "channel", "author", "text", "created") || !HasColumns(db, "seen", "reader", "channel", "last_id", "updated"))
                return (null, new(false, path, "unknown powerboard schema"));
            return (new PowerBoard(path), new(true, path, null));
        }
        catch (SqliteException ex) { return (null, new(false, path, ex.Message)); }
    }

    private static SqliteConnection Connect(string path)
    {
        SqliteConnection db = new(new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadWrite, Pooling = false, DefaultTimeout = 10 }.ToString());
        db.Open();
        using SqliteCommand pragma = db.CreateCommand();
        pragma.CommandText = "PRAGMA busy_timeout=10000;";
        pragma.ExecuteNonQuery();
        return db;
    }

    private static bool HasColumns(SqliteConnection db, string table, params string[] columns)
    {
        using SqliteCommand cmd = db.CreateCommand();
        cmd.CommandText = $"SELECT name FROM pragma_table_info('{table}')";
        HashSet<string> found = [];
        using SqliteDataReader reader = cmd.ExecuteReader();
        while (reader.Read()) found.Add(reader.GetString(0));
        return columns.All(found.Contains);
    }

    /// <summary>powerboard's name rule: lowercase letters, digits, '.', '_' or '-', 1–64, starting with a letter or digit.</summary>
    public static bool IsName(string? name) => name is not null && NamePattern.IsMatch(name);

    /// <summary>A free-form text made into a name fragment: lowercased, other characters to '-'.</summary>
    public static string Slug(string text, int max)
    {
        string slug = Regex.Replace(text.Trim().ToLowerInvariant(), "[^a-z0-9._-]+", "-").Trim('-', '.', '_');
        if (slug.Length > max) slug = slug[..max].TrimEnd('-', '.', '_');
        return slug.Length == 0 ? "repo" : slug;
    }

    public Message Post(string author, string channel, string text)
    {
        if (!IsName(author) || !IsName(channel)) throw new InvalidOperationException("invalid powerboard name");
        string body = text.Trim();
        if (body.Length == 0) throw new InvalidOperationException("message is empty");
        double now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() / 1000.0;
        using SqliteConnection db = Connect(Path);
        using SqliteTransaction tx = db.BeginTransaction(deferred: false);
        using SqliteCommand cmd = db.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = "INSERT INTO messages (channel, author, text, created) VALUES ($c, $a, $t, $n); SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("$c", channel);
        cmd.Parameters.AddWithValue("$a", author);
        cmd.Parameters.AddWithValue("$t", body);
        cmd.Parameters.AddWithValue("$n", now);
        long id = (long)cmd.ExecuteScalar()!;
        tx.Commit();
        return new(id, channel, author, body, now);
    }

    /// <summary>The channel's messages after <paramref name="after"/>, oldest first (as powerboard's tail).</summary>
    public List<Message> Read(string channel, long after, int limit = 500)
    {
        using SqliteConnection db = Connect(Path);
        using SqliteCommand cmd = db.CreateCommand();
        cmd.CommandText = "SELECT id, channel, author, text, created FROM messages WHERE channel = $c AND id > $after ORDER BY id LIMIT $limit";
        cmd.Parameters.AddWithValue("$c", channel);
        cmd.Parameters.AddWithValue("$after", after);
        cmd.Parameters.AddWithValue("$limit", limit);
        List<Message> messages = [];
        using SqliteDataReader reader = cmd.ExecuteReader();
        while (reader.Read()) messages.Add(new(reader.GetInt64(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetDouble(4)));
        return messages;
    }

    /// <summary>When <paramref name="reader"/> last read <paramref name="channel"/> (powerboard's seen.updated), as Unix seconds.</summary>
    public double? LastRead(string reader, string channel)
    {
        using SqliteConnection db = Connect(Path);
        using SqliteCommand cmd = db.CreateCommand();
        cmd.CommandText = "SELECT updated FROM seen WHERE reader = $r AND channel = $c";
        cmd.Parameters.AddWithValue("$r", reader);
        cmd.Parameters.AddWithValue("$c", channel);
        object? value = cmd.ExecuteScalar();
        return value is null or DBNull ? null : Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
    }
}
