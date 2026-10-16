using Xunit;

namespace PowerGit.Engine.Tests;

/// <summary>
///  v0.21.2: where PowerChannel finds its file (renamed from powerboard):
///  <c>POWERCHANNEL_DB</c>, then the legacy <c>POWERBOARD_DB</c>, then the new
///  per-user file, then the legacy one, else the new path.
/// </summary>
public sealed class PowerChannelTests
{
    private static string DataRoot() => System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"pg-channel-{Guid.NewGuid():N}");

    // The env var DefaultPath() reads for this OS's data folder. macOS reads
    // UserProfile, which .NET resolves from HOME; the file cases skip there.
    private static string DataRootVar() => OperatingSystem.IsWindows() ? "LOCALAPPDATA" : OperatingSystem.IsMacOS() ? "HOME" : "XDG_DATA_HOME";

    private static string Folder(string root) => OperatingSystem.IsMacOS() ? System.IO.Path.Combine(root, "Library", "Application Support") : root;

    private static string NewPath(string root) => System.IO.Path.Combine(Folder(root), "powerchannel", "channels.db");
    private static string LegacyPath(string root) => System.IO.Path.Combine(Folder(root), "powerboard", "board.db");

    /// <summary>Sets env vars and puts every one back on Dispose, so tests never leak.</summary>
    private sealed class Env : IDisposable
    {
        private readonly List<(string Name, string? Value)> _saved = [];

        public Env Set(string name, string? value)
        {
            _saved.Add((name, Environment.GetEnvironmentVariable(name)));
            Environment.SetEnvironmentVariable(name, value);
            return this;
        }

        public void Dispose()
        {
            foreach ((string name, string? value) in _saved) Environment.SetEnvironmentVariable(name, value);
        }
    }

    [Fact]
    public void DefaultPath_prefers_the_new_file()
    {
        if (OperatingSystem.IsMacOS()) return;
        string root = DataRoot();
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(NewPath(root))!);
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(LegacyPath(root))!);
        File.WriteAllText(NewPath(root), "");
        File.WriteAllText(LegacyPath(root), "");
        using Env env = new Env().Set(DataRootVar(), root).Set("POWERCHANNEL_DB", null).Set("POWERBOARD_DB", null);
        try { Assert.Equal(NewPath(root), PowerChannel.DefaultPath()); }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void DefaultPath_finds_the_legacy_file_when_only_it_exists()
    {
        if (OperatingSystem.IsMacOS()) return;
        string root = DataRoot();
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(LegacyPath(root))!);
        File.WriteAllText(LegacyPath(root), "");
        using Env env = new Env().Set(DataRootVar(), root).Set("POWERCHANNEL_DB", null).Set("POWERBOARD_DB", null);
        try { Assert.Equal(LegacyPath(root), PowerChannel.DefaultPath()); }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void DefaultPath_names_the_new_place_when_neither_exists()
    {
        if (OperatingSystem.IsMacOS()) return;
        string root = DataRoot();
        Directory.CreateDirectory(root);
        using Env env = new Env().Set(DataRootVar(), root).Set("POWERCHANNEL_DB", null).Set("POWERBOARD_DB", null);
        try { Assert.Equal(NewPath(root), PowerChannel.DefaultPath()); }
        finally { Directory.Delete(root, true); }
    }

    [Fact]
    public void PowerChannelDb_beats_the_legacy_board_db()
    {
        using Env env = new Env()
            .Set("POWERCHANNEL_DB", "/tmp/pc/channels.db")
            .Set("POWERBOARD_DB", "/tmp/pb/board.db");
        Assert.Equal("/tmp/pc/channels.db", PowerChannel.DefaultPath());
    }

    [Fact]
    public void The_legacy_board_db_override_is_still_honoured()
    {
        using Env env = new Env()
            .Set("POWERCHANNEL_DB", null)
            .Set("POWERBOARD_DB", "/tmp/pb/board.db");
        Assert.Equal("/tmp/pb/board.db", PowerChannel.DefaultPath());
    }
}
