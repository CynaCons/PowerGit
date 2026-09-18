using System.Collections.Concurrent;
using System.IO.Pipes;
using System.Net.Sockets;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;

namespace PowerGit.Engine.Mcp;

public sealed class McpHost(RepoRegistry registry, string endpoint, string engineVersion) : IHostedService, IAsyncDisposable
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly CancellationTokenSource _stopping = new();
    private readonly ConcurrentDictionary<Stream, byte> _connections = new();
    private readonly McpTools _tools = new(registry);
    private Task? _acceptLoop;
    private Socket? _socket;
    private NamedPipeServerStream? _firstPipe;
    private bool _hosting;

    public Task StartAsync(CancellationToken cancellationToken)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                _firstPipe = CreatePipe(first: true);
                _acceptLoop = AcceptPipes();
            }
            else
            {
                string directory = Path.GetDirectoryName(endpoint) ?? throw new InvalidOperationException("MCP socket needs a directory");
                Directory.CreateDirectory(directory);
                File.SetUnixFileMode(directory, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
                if (File.Exists(endpoint)) RemoveStaleSocket(endpoint);
                _socket = new(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
                _socket.Bind(new UnixDomainSocketEndPoint(endpoint));
                _socket.Listen(128);
                File.SetUnixFileMode(endpoint, UnixFileMode.UserRead | UnixFileMode.UserWrite);
                _acceptLoop = AcceptSockets();
            }
            _hosting = true;
            Console.Error.WriteLine($"[engine] mcp: hosting on {endpoint}");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or SocketException)
        {
            Console.Error.WriteLine($"[engine] mcp: endpoint busy, not hosting ({ex.Message})");
            _firstPipe?.Dispose(); _firstPipe = null; _socket?.Dispose(); _socket = null;
        }
        return Task.CompletedTask;
    }

    private static void RemoveStaleSocket(string path)
    {
        using Socket probe = new(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        try
        {
            probe.Connect(new UnixDomainSocketEndPoint(path));
            throw new IOException("another engine owns the socket");
        }
        catch (SocketException)
        {
            File.Delete(path);
        }
    }

    // Shutdown runs twice (the host's StopAsync, then the container's
    // DisposeAsync) and must never throw: a test factory's teardown or the
    // sidecar's exit is not the place for a disposed pipe to surface. Every
    // step is guarded on its own, and the stopping token source is never
    // disposed (a straggling read that asks it for a token would throw).
    private bool _stopped;

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        if (_stopped) return;
        _stopped = true;
        foreach (GitHost host in registry.OpenHosts)
        {
            try { host.ExpireAgentReviews("host_gone"); }
            catch (Exception ex) { Console.Error.WriteLine($"[engine] mcp: could not expire the sessions of {host.Current?.Root}: {ex.Message}"); }
        }
        try { _stopping.Cancel(); } catch (ObjectDisposedException) { }
        try { _firstPipe?.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException) { }
        try { _socket?.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException or SocketException) { }
        foreach (Stream connection in _connections.Keys)
        {
            try { connection.Dispose(); } catch (Exception ex) when (ex is IOException or ObjectDisposedException) { }
        }
        if (_acceptLoop is not null) try { await _acceptLoop.WaitAsync(cancellationToken); } catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException or SocketException) { }
        if (_hosting && !OperatingSystem.IsWindows()) try { File.Delete(endpoint); } catch (IOException) { }
        _hosting = false;
    }

    [SupportedOSPlatform("windows")]
    private NamedPipeServerStream CreatePipe(bool first)
    {
        SecurityIdentifier owner = WindowsIdentity.GetCurrent().User ?? throw new InvalidOperationException("current user has no SID");
        PipeSecurity security = new(); security.SetOwner(owner);
        security.AddAccessRule(new PipeAccessRule(owner, PipeAccessRights.FullControl, AccessControlType.Allow));
        PipeOptions options = PipeOptions.Asynchronous | (first ? PipeOptions.FirstPipeInstance : 0);
        return NamedPipeServerStreamAcl.Create(McpEndpoint.PipeName(endpoint), PipeDirection.InOut,
            NamedPipeServerStream.MaxAllowedServerInstances, PipeTransmissionMode.Byte, options, 0, 0, security);
    }

    [SupportedOSPlatform("windows")]
    private async Task AcceptPipes()
    {
        NamedPipeServerStream? waiting = _firstPipe;
        try
        {
            while (!_stopping.IsCancellationRequested)
            {
                await waiting!.WaitForConnectionAsync(_stopping.Token);
                NamedPipeServerStream connected = waiting;
                waiting = CreatePipe(first: false);
                _firstPipe = waiting;
                _ = Serve(connected);
            }
        }
        catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException) { waiting?.Dispose(); }
    }

    private async Task AcceptSockets()
    {
        try
        {
            while (!_stopping.IsCancellationRequested) _ = Serve(new NetworkStream(await _socket!.AcceptAsync(_stopping.Token), ownsSocket: true));
        }
        catch (Exception ex) when (ex is OperationCanceledException or ObjectDisposedException or SocketException) { }
    }

    private async Task Serve(Stream stream)
    {
        _connections.TryAdd(stream, 0);
        using (stream)
        using (StreamReader reader = new(stream, new UTF8Encoding(false), false, 4096, leaveOpen: true))
        using (StreamWriter writer = new(stream, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true, NewLine = "\n" })
        using (SemaphoreSlim writeGate = new(1, 1))
        {
            try
            {
                while (!_stopping.IsCancellationRequested && await reader.ReadLineAsync(_stopping.Token) is { } line)
                {
                    _ = HandleLine(line.TrimEnd('\r'), writer, writeGate);
                }
            }
            catch (Exception ex) when (ex is OperationCanceledException or IOException or ObjectDisposedException) { }
            finally { _connections.TryRemove(stream, out _); }
        }
    }

    private async Task HandleLine(string line, StreamWriter writer, SemaphoreSlim writeGate)
    {
        string? response;
        try
        {
            using JsonDocument document = JsonDocument.Parse(line);
            if (document.RootElement.ValueKind == JsonValueKind.Array)
            {
                object?[] replies = await Task.WhenAll(document.RootElement.EnumerateArray().Select(Dispatch));
                object[] actual = [.. replies.Where(r => r is not null).Cast<object>()];
                response = actual.Length == 0 ? null : JsonSerializer.Serialize(actual, Json);
            }
            else response = JsonSerializer.Serialize(await Dispatch(document.RootElement), Json);
        }
        catch (JsonException) { response = JsonSerializer.Serialize(Error(null, -32700, "parse error"), Json); }
        catch (OperationCanceledException) { return; }
        if (response is null or "null") return;
        try
        {
            await writeGate.WaitAsync(_stopping.Token);
            try { await writer.WriteLineAsync(response.AsMemory(), _stopping.Token); }
            finally { writeGate.Release(); }
        }
        catch (Exception ex) when (ex is IOException or ObjectDisposedException or OperationCanceledException) { }
    }

    private async Task<object?> Dispatch(JsonElement request)
    {
        JsonElement? id = request.TryGetProperty("id", out JsonElement idElement) ? idElement.Clone() : null;
        string method = request.TryGetProperty("method", out JsonElement methodElement) ? methodElement.GetString() ?? "" : "";
        if (id is null) return null;
        try
        {
            JsonElement parameters = request.TryGetProperty("params", out JsonElement p) ? p : default;
            object result = method switch
            {
                "initialize" => Initialize(parameters),
                "ping" => new { },
                "tools/list" => new { tools = ToolDescriptors() },
                "tools/call" => await ToolCall(parameters),
                "prompts/list" => new { prompts = Array.Empty<object>() },
                "resources/list" => new { resources = Array.Empty<object>() },
                _ => throw new MissingMethodException(method),
            };
            return new { jsonrpc = "2.0", id, result };
        }
        catch (MissingMethodException) { return Error(id, -32601, $"method not found: {method}"); }
        catch (Exception ex) { return Error(id, -32603, ex.Message); }
    }

    private object Initialize(JsonElement parameters)
    {
        string? requested = parameters.ValueKind == JsonValueKind.Object && parameters.TryGetProperty("protocolVersion", out JsonElement p) ? p.GetString() : null;
        string protocol = requested is "2024-11-05" or "2025-03-26" or "2025-06-18" ? requested : "2025-06-18";
        return new { protocolVersion = protocol, capabilities = new { tools = new { } }, serverInfo = new { name = "powergit", version = engineVersion } };
    }

    private async Task<object> ToolCall(JsonElement parameters)
    {
        string name = parameters.GetProperty("name").GetString() ?? "";
        JsonElement args = parameters.TryGetProperty("arguments", out JsonElement value) ? value : JsonDocument.Parse("{}").RootElement;
        try
        {
            object payload = name switch
            {
                "agent_review_open" => _tools.Open(args, _stopping.Token),
                "agent_review_wait" => await _tools.Wait(args, _stopping.Token),
                "agent_review_get" => _tools.Get(args, _stopping.Token),
                "agent_review_list" => _tools.List(args),
                "agent_review_cancel" => _tools.Cancel(args, _stopping.Token),
                _ => throw new InvalidOperationException($"unknown tool: {name}"),
            };
            string text = JsonSerializer.Serialize(payload, Json);
            return new { content = new[] { new { type = "text", text } }, structuredContent = payload };
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new { content = new[] { new { type = "text", text = ex.Message } }, isError = true };
        }
    }

    private static object[] ToolDescriptors() => [
        Tool("agent_review_open", "Open a PowerGit agent review.", ["repo_path", "mode", "title"], new { repo_path = S(), mode = S(), title = S(), why = S(), agent = S(), branch = S(), base_sha = S(), head_sha = S(), worktree = B(), files = new { type = "array", items = new { type = "object" } } }),
        Tool("agent_review_wait", "Wait for an owner decision without auto-approving.", ["repo_path", "review_id"], new { repo_path = S(), review_id = S(), timeout_ms = I() }),
        Tool("agent_review_get", "Get an agent review.", ["repo_path", "review_id"], new { repo_path = S(), review_id = S() }),
        Tool("agent_review_list", "List agent reviews for a repository.", ["repo_path"], new { repo_path = S() }),
        Tool("agent_review_cancel", "Cancel a pending agent review.", ["repo_path", "review_id"], new { repo_path = S(), review_id = S(), reason = S() }),
    ];
    private static object Tool(string name, string description, string[] required, object properties) => new { name, description, inputSchema = new { type = "object", properties, required } };
    private static object S() => new { type = "string" }; private static object B() => new { type = "boolean" }; private static object I() => new { type = "integer" };
    private static object Error(JsonElement? id, int code, string message) => new { jsonrpc = "2.0", id, error = new { code, message } };

    public async ValueTask DisposeAsync() => await StopAsync(CancellationToken.None);
}
