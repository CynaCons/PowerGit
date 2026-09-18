using System.IO.Pipes;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using PowerGit.Engine.Mcp;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class McpHostTests
{
    [Fact]
    public void Endpoint_override_is_the_full_endpoint()
    {
        string? previous = Environment.GetEnvironmentVariable(McpEndpoint.EnvironmentVariable);
        try
        {
            string expected = OperatingSystem.IsWindows() ? @"\\.\pipe\PowerGit.mcp.test.override" : Path.Combine(Path.GetTempPath(), "powergit-override.sock");
            Environment.SetEnvironmentVariable(McpEndpoint.EnvironmentVariable, expected);
            Assert.Equal(expected, McpEndpoint.Resolve());
        }
        finally { Environment.SetEnvironmentVariable(McpEndpoint.EnvironmentVariable, previous); }
    }

    [Fact]
    public async Task Initialize_and_tools_list_name_the_protocol_and_five_tools()
    {
        await using Harness h = await Harness.Start();
        await using Client c = await h.Connect();
        JsonElement init = await c.Call("initialize", new { protocolVersion = "wat" });
        Assert.Equal("2025-06-18", init.GetProperty("protocolVersion").GetString());
        Assert.Equal("powergit", init.GetProperty("serverInfo").GetProperty("name").GetString());
        JsonElement tools = await c.Call("tools/list", new { });
        Assert.Equal(McpTools.Names.Order(), tools.GetProperty("tools").EnumerateArray().Select(x => x.GetProperty("name").GetString()).Order());
    }

    [Fact]
    public async Task Open_list_and_get_return_a_clean_persisted_session()
    {
        await using Harness h = await Harness.Start(); await using Client c = await h.Connect();
        JsonElement opened = await c.Tool("agent_review_open", new { repo_path = h.Repo.Dir, mode = "wait", title = "Guard", files = new[] { new { path = "f.txt", status = "M", patch = "@@ -1 +1,2 @@\n a\n+b\n" } } });
        string id = opened.GetProperty("review_id").GetString()!;
        Assert.True(File.Exists(Path.Combine(h.Repo.Dir, GitHost.AgentReviewsDirectory, id + ".json")));
        Assert.Equal("", h.Repo.Output("status", "--porcelain"));
        JsonElement listed = await c.Tool("agent_review_list", new { repo_path = h.Repo.Dir });
        Assert.Single(listed.GetProperty("sessions").EnumerateArray());
        Assert.Equal("pending", (await c.Tool("agent_review_get", new { repo_path = h.Repo.Dir, review_id = id })).GetProperty("status").GetString());
    }

    [Fact]
    public async Task Wait_times_out_pending_and_wakes_with_comments_and_markdown()
    {
        await using Harness h = await Harness.Start(); await using Client c = await h.Connect();
        JsonElement opened = await c.Tool("agent_review_open", new { repo_path = h.Repo.Dir, mode = "wait", title = "Guard", files = new[] { new { path = "f.txt", patch = "@@ -1 +1,2 @@\n a\n+b\n" } } });
        string id = opened.GetProperty("review_id").GetString()!;
        JsonElement timed = await c.Tool("agent_review_wait", new { repo_path = h.Repo.Dir, review_id = id, timeout_ms = 1000 });
        Assert.True(timed.GetProperty("timed_out").GetBoolean()); Assert.Equal("pending", timed.GetProperty("status").GetString());
        Task<JsonElement> waiting = c.Tool("agent_review_wait", new { repo_path = h.Repo.Dir, review_id = id, timeout_ms = 10000 });
        GitHost host = h.Host;
        host.WriteReview(id, "{\"reviewed\":1,\"changed\":1,\"files\":{\"f.txt\":{\"lines\":{},\"comments\":[{\"line\":\"+2\",\"text\":\"needs a guard\"}]}}}");
        host.ResolveAgentReview(id, new("request_changes", "fix", null));
        JsonElement result = await waiting.WaitAsync(TimeSpan.FromSeconds(15));
        Assert.Equal("changes_requested", result.GetProperty("status").GetString());
        Assert.Equal("needs a guard", result.GetProperty("comments")[0].GetProperty("body").GetString());
        Assert.Contains("f.txt", result.GetProperty("export_markdown").GetString());
        Assert.Contains("needs a guard", result.GetProperty("export_markdown").GetString());
    }

    [Fact]
    public async Task Unknown_method_is_minus_32601_and_second_connection_pings_while_first_waits()
    {
        await using Harness h = await Harness.Start(); await using Client first = await h.Connect(); await using Client second = await h.Connect();
        JsonElement error = await first.Raw("nope", new { }, result: false);
        Assert.Equal(-32601, error.GetProperty("code").GetInt32());
        JsonElement opened = await first.Tool("agent_review_open", new { repo_path = h.Repo.Dir, mode = "wait", title = "Guard", files = new[] { new { path = "f.txt", patch = "+b" } } });
        Task<JsonElement> waiting = first.Tool("agent_review_wait", new { repo_path = h.Repo.Dir, review_id = opened.GetProperty("review_id").GetString(), timeout_ms = 10000 });
        await second.Call("ping", new { }).WaitAsync(TimeSpan.FromSeconds(15));
        h.Host.ResolveAgentReview(opened.GetProperty("review_id").GetString()!, new("approve", null, null));
        await waiting.WaitAsync(TimeSpan.FromSeconds(15));
    }

    [Fact]
    public async Task Stop_expires_pending_wait_sessions_as_host_gone()
    {
        await using Harness h = await Harness.Start(); await using Client c = await h.Connect();
        JsonElement opened = await c.Tool("agent_review_open", new { repo_path = h.Repo.Dir, mode = "wait", title = "Guard", files = new[] { new { path = "f.txt", patch = "+b" } } });
        string id = opened.GetProperty("review_id").GetString()!;
        await h.Stop();
        AgentReviewDto session = h.Host.GetAgentReview(id)!;
        Assert.Equal("expired", session.Status); Assert.Equal("host_gone", session.Reason);
    }

    [Fact]
    public void Review_markdown_orders_marks_and_includes_context()
    {
        AgentReviewDto session = new(1, new string('a', 40), "wait", "Guard", "", null, "main", "a", "b", false, [new("f.txt", "M", null)], "pending", true, "", "", null, null, null);
        string review = "{\"reviewed\":2,\"changed\":3,\"files\":{\"f.txt\":{\"lines\":{\"+2\":\"rejected\"},\"comments\":[{\"line\":\"+2\",\"text\":\"needs a guard\"}]}}}";
        string text = ReviewMarkdown.Render(session, review, new Dictionary<string, string> { ["f.txt"] = "@@ -1 +1,2 @@\n a\n+b\n" });
        Assert.Contains("2 / 3 lines reviewed · 1 rejected · 1 comments", text);
        Assert.Contains("**+2** — rejected and comment", text); Assert.Contains("> needs a guard", text); Assert.Contains("+b", text);
    }

    private sealed class Harness : IAsyncDisposable
    {
        public TempRepo Repo { get; } = new(); public RepoRegistry Registry { get; } = new(); public McpHost Server { get; }
        public GitHost Host => Registry.Get(Registry.Open(Repo.Dir).Id)!;
        private readonly string _endpoint; private bool _stopped;
        private Harness(string endpoint) { _endpoint = endpoint; Server = new(Registry, endpoint, "test"); }
        public static async Task<Harness> Start()
        {
            string endpoint = OperatingSystem.IsWindows() ? $@"\\.\pipe\PowerGit.mcp.test.{Guid.NewGuid():N}" : Path.Combine(Path.GetTempPath(), "powergit-mcp-" + Guid.NewGuid().ToString("N"), "mcp.sock");
            Harness value = new(endpoint); await value.Server.StartAsync(CancellationToken.None); return value;
        }
        public async Task<Client> Connect() => await Client.Connect(_endpoint);
        public async Task Stop() { if (!_stopped) { await Server.StopAsync(CancellationToken.None); _stopped = true; } }
        public async ValueTask DisposeAsync() { await Stop(); Repo.Dispose(); }
    }

    private sealed class Client(Stream stream) : IAsyncDisposable
    {
        private readonly StreamReader _reader = new(stream, Encoding.UTF8, false, 4096, true);
        private readonly StreamWriter _writer = new(stream, new UTF8Encoding(false), 4096, true) { AutoFlush = true, NewLine = "\n" };
        private int _id;
        public static async Task<Client> Connect(string endpoint)
        {
            if (OperatingSystem.IsWindows()) { NamedPipeClientStream pipe = new(".", McpEndpoint.PipeName(endpoint), PipeDirection.InOut, PipeOptions.Asynchronous); await pipe.ConnectAsync(2000); return new(pipe); }
            Socket socket = new(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified); await socket.ConnectAsync(new UnixDomainSocketEndPoint(endpoint)); return new(new NetworkStream(socket, true));
        }
        public Task<JsonElement> Call(string method, object args) => Raw(method, args, true);
        public async Task<JsonElement> Tool(string name, object args)
        {
            JsonElement result = await Call("tools/call", new { name, arguments = args });
            Assert.False(result.TryGetProperty("isError", out JsonElement failed) && failed.GetBoolean(), result.ToString());
            return result.GetProperty("structuredContent");
        }
        public async Task<JsonElement> Raw(string method, object args, bool result)
        {
            int id = Interlocked.Increment(ref _id);
            await _writer.WriteLineAsync(JsonSerializer.Serialize(new { jsonrpc = "2.0", id, method, @params = args }));
            using JsonDocument doc = JsonDocument.Parse((await _reader.ReadLineAsync())!);
            return doc.RootElement.GetProperty(result ? "result" : "error").Clone();
        }
        // A failed assertion leaves a request in flight; disposing the writer
        // then throws "stream in use" and would hide the assertion (CI run
        // 35375085756). The stream goes first, the wrappers follow quietly.
        public ValueTask DisposeAsync()
        {
            try { stream.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException) { }
            try { _writer.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException or InvalidOperationException) { }
            try { _reader.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException or InvalidOperationException) { }
            return ValueTask.CompletedTask;
        }
    }
}
