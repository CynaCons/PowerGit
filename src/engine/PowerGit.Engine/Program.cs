using System.Diagnostics;
using System.Reflection;
using PowerGit.Engine;

// Version comes from frontend/package.json via the csproj (v0.13.5); nothing to keep in sync here.
string engineVersion = typeof(Program).Assembly
    .GetCustomAttribute<System.Reflection.AssemblyInformationalVersionAttribute>()?.InformationalVersion?.Split('+')[0]
    ?? "0.0.0";

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

string? url = Environment.GetEnvironmentVariable("POWERGIT_ENGINE_URL");
if (!string.IsNullOrWhiteSpace(url))
{
    builder.WebHost.UseUrls(url);
}

// v0.13.6: sessions. One RepoRegistry per process; one GitHost per open
// repository. Routes under /repos/{repo} get their GitHost injected by the
// scoped factory below, which resolves the {id} route value exactly once.
builder.Services.AddSingleton<RepoRegistry>(_ =>
{
    string? git = Environment.GetEnvironmentVariable("GIT_EXECUTABLE");
    RepoRegistry repos = new(string.IsNullOrWhiteSpace(git) ? null : git);
    try
    {
        if (repos.TryDiscover(Directory.GetCurrentDirectory()) is null)
        {
            repos.TryDiscover(AppContext.BaseDirectory);
        }
    }
    catch
    {
        // Discovery is best-effort.
    }

    return repos;
});
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<GitHost>(sp =>
{
    HttpContext ctx = sp.GetRequiredService<IHttpContextAccessor>().HttpContext
        ?? throw new InvalidOperationException("GitHost is only available inside a request");
    string id = ctx.Request.RouteValues["repo"]?.ToString() ?? "";
    return sp.GetRequiredService<RepoRegistry>().Get(id)
        ?? sp.GetRequiredService<RepoRegistry>().Tool; // never used: the group filter answers 404 first
});
// Browser origins allowed to call this engine. The Tauri webview origins
// plus the Vite dev server; POWERGIT_ENGINE_ORIGINS adds more (comma
// separated) for harnesses. Never AllowAnyOrigin: the engine runs git with
// the user's credentials, and any web page can reach 127.0.0.1.
string[] allowedOrigins =
[
    "tauri://localhost",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "http://127.0.0.1:1420",
    "http://localhost:1420",
    .. (Environment.GetEnvironmentVariable("POWERGIT_ENGINE_ORIGINS") ?? "")
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries),
];
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod()));

WebApplication app = builder.Build();
app.UseCors();

// Per-launch shared secret. The Tauri shell generates one and hands it to the
// sidecar via POWERGIT_ENGINE_TOKEN (dev scripts use frontend/.engine-token);
// `--token` is the CLI equivalent. Without either, a random one is generated
// and printed so a standalone `dotnet run` is never silently open.
string engineToken = EngineAuth.ResolveToken(builder.Configuration["token"]);
app.UseMiddleware<EngineAuth>(engineToken);

app.MapGet("/health", (RepoRegistry repos) =>
{
    try
    {
        GitVersion version = repos.Tool.Version();
        return Results.Ok(new HealthResponse(engineVersion, "ok", repos.GitPath, version.Raw));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/repos/open", (OpenRepoRequest body, RepoRegistry repos) =>
{
    if (string.IsNullOrWhiteSpace(body.Path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(repos.Open(body.Path));
    }
    catch (DirectoryNotFoundException ex)
    {
        return Results.NotFound(new ErrorResponse(ex.Message));
    }
    catch (InvalidOperationException ex)
    {
        return Results.BadRequest(new ErrorResponse(ex.Message));
    }
});

app.MapGet("/repos/current", (RepoRegistry repos) =>
    repos.Current is null
        ? Results.Json(new ErrorResponse("no repository open"), statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(repos.Current));

app.MapGet("/repos/recents", () => Results.Ok(RecentsStore.List()));

app.MapGet("/repos", (RepoRegistry repos) => Results.Ok(repos.List()));

// Lifecycle facts per session (last use, busy, watcher count): what the
// recovery panel and the longevity gate look at.
app.MapGet("/repos/sessions", (RepoRegistry repos) => Results.Ok(repos.Describe()));

app.MapDelete("/repos/{repo}", (string repo, RepoRegistry repos) =>
    repos.Close(repo) ? Results.NoContent() : Results.NotFound(new ErrorResponse($"unknown repository session '{repo}'")));

// Every per-repository route lives here. The filter resolves the session
// once (404 when unknown) and serializes mutations through the session's
// write gate: a colliding mutation answers 409 with what is running instead
// of interleaving git processes. Network ops (/fetch, /pull, /push) are
// jobs that take the gate themselves for their whole lifetime, so the
// filter must not hold it around their POST.
RouteGroupBuilder repo = app.MapGroup("/repos/{repo}");
repo.AddEndpointFilter(async (ctx, next) =>
{
    string id = ctx.HttpContext.Request.RouteValues["repo"]?.ToString() ?? "";
    GitHost? session = ctx.HttpContext.RequestServices.GetRequiredService<RepoRegistry>().Get(id);
    if (session is null)
    {
        return Results.Json(new ErrorResponse($"unknown repository session '{id}'"), statusCode: StatusCodes.Status404NotFound);
    }

    session.Touch();
    string method = ctx.HttpContext.Request.Method;
    string path = ctx.HttpContext.Request.Path.Value ?? "";
    bool isJob = path.EndsWith("/fetch", StringComparison.Ordinal)
        || path.EndsWith("/pull", StringComparison.Ordinal)
        || path.EndsWith("/push", StringComparison.Ordinal)
        || path.EndsWith("/cancel", StringComparison.Ordinal);
    try
    {
        if (HttpMethods.IsGet(method) || HttpMethods.IsOptions(method) || isJob)
        {
            return await next(ctx);
        }

        // Handlers in this group are synchronous, so waiting here does not
        // block on anything but the git process itself.
        return session.Mutate($"{method} {path}", () => next(ctx).GetAwaiter().GetResult());
    }
    catch (RepoBusyException busy)
    {
        return Results.Json(new BusyResponse(busy.Message, busy.Running), statusCode: StatusCodes.Status409Conflict);
    }
});

// Read routes hand HttpContext.RequestAborted down to the git process:
// when the UI abandons a request (latest selection wins) the git child is
// killed instead of finishing for nobody (v0.13.11).
repo.MapGet("/revisions", (GitHost git, int? max, int? skip, HttpContext ctx) =>
{
    try
    {
        return Results.Ok(git.ListRevisions(max ?? 800, skip ?? 0, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}", (string id, GitHost git, HttpContext ctx) =>
{
    try
    {
        return Results.Ok(git.GetCommit(id, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}/files", (string id, GitHost git, HttpContext ctx) =>
{
    try
    {
        return Results.Ok(git.ListFiles(id, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}/changes", (string id, GitHost git, int? context, bool? ws, bool? full, HttpContext ctx) =>
{
    try
    {
        return Results.Ok(git.GetChanges(id, context ?? 3, ws ?? false, full ?? false, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}/tree", (string id, string? path, GitHost git, HttpContext ctx) =>
{
    try
    {
        return Results.Ok(git.ListTree(id, path, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}/diff", (string id, string path, GitHost git, int? context, bool? ws, bool? full, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetDiff(id, path, context ?? 3, ws ?? false, full ?? false, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/commits/{id}/blob", (string id, string path, GitHost git, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetBlob(id, path, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/diff/worktree", (string path, bool staged, GitHost git, int? context, bool? ws, bool? full, HttpContext ctx) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetWorkTreeDiff(path, staged, context ?? 3, ws ?? false, full ?? false, ctx.RequestAborted));
    }
    catch (OperationCanceledException)
    {
        return Results.StatusCode(499);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/files/delete", (FilesDeleteRequest body, GitHost git) =>
{
    try
    {
        git.DeleteFiles(body.Paths);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/files/reset", (FilesResetRequest body, GitHost git) =>
{
    try
    {
        git.ResetFiles(body.Paths);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/difftool/worktree", (WorkTreeDifftoolRequest body, GitHost git) =>
{
    try
    {
        git.OpenWorkTreeDifftool(body.Path, body.Staged);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/ignore", (IgnoreRequest body, GitHost git) =>
{
    try
    {
        git.AddToIgnore(body.Pattern);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/ignore/preview", (IgnoreRequest body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.PreviewIgnore(body.Pattern));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/remotes", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.ListRemotes());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPut("/remotes", (RemoteUpdate body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.SaveRemote(body.Name, body.Url));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

// Job routes answer 202 with a session-qualified Location (v0.13.10: the
// old "/jobs/{id}" pointed outside the /repos/{repo} group).
repo.MapPost("/fetch", (FetchRequest body, GitHost git, string repo) =>
{
    if (string.IsNullOrWhiteSpace(body.Remote))
    {
        return Results.BadRequest(new ErrorResponse("remote is required"));
    }

    try
    {
        string id = git.StartJob("fetch", ct => git.FetchRemote(body.Remote, ct), $"git fetch --prune {body.Remote}");
        return Results.Accepted($"/repos/{repo}/jobs/{id}", new JobStartedDto(id, "fetch"));
    }
    catch (RepoBusyException busy)
    {
        return Results.Json(new BusyResponse(busy.Message, busy.Running), statusCode: StatusCodes.Status409Conflict);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/branches/create", (CreateRefRequest body, GitHost git) =>
{
    try
    {
        git.CreateBranch(body.Name, body.Commit);
        return Results.Ok(git.GetRefs());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/tags/create", (CreateRefRequest body, GitHost git) =>
{
    try
    {
        git.CreateTag(body.Name, body.Commit);
        return Results.Ok(git.GetRefs());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/branches/delete", (NameRequest body, GitHost git) =>
{
    try
    {
        git.DeleteBranch(body.Name);
        return Results.Ok(git.GetRefs());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/tags/delete", (NameRequest body, GitHost git) =>
{
    try
    {
        git.DeleteTag(body.Name);
        return Results.Ok(git.GetRefs());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/status", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/refs", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.GetRefs());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/config", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.GetConfig());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPut("/config", (GitConfigUpdate body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.SetConfig(body));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/tools/vscode", () => Results.Ok(VsCodeLocator.Detect()));

repo.MapPost("/tools/vscode", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.DetectAndMaybeApplyVsCode());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

// Opens a file's diff (commit^ vs commit) in the configured external diff
// tool (git difftool). The engine starts the tool detached and responds as
// soon as the process is launched, not when the tool window closes.
repo.MapPost("/difftool", (DifftoolRequest body, GitHost git) =>
{
    try
    {
        git.OpenDifftool(body.Commit, body.Path);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/stage", (StageRequest body, GitHost git) =>
{
    try
    {
        git.Stage(body.Paths, body.Unstage);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/commit", (CommitRequest body, GitHost git) =>
{
    try
    {
        string id = git.Commit(body.Message, body.Amend);
        return Results.Ok(new { id });
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/checkout", (CheckoutRequest body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.Checkout(body.Ref, body.Force));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/reset", (ResetRequest body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.ResetTo(body.Commit, body.Mode));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/rebase", (RebaseRequest body, GitHost git) =>
{
    try
    {
        return Results.Ok(git.Rebase(body.Onto));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/commits/{id}/cherry-pick", (string id, GitHost git) =>
{
    try
    {
        return Results.Ok(git.CherryPick(id));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/commits/{id}/revert", (string id, GitHost git) =>
{
    try
    {
        return Results.Ok(git.Revert(id));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/stashes", (GitHost git) =>
{
    try
    {
        return Results.Ok(git.ListStashes());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/stash", (StashRequest body, GitHost git) =>
{
    try
    {
        git.StashChanges(body.Message, body.KeepIndex, body.IncludeUntracked);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/stash/apply", (StashApplyRequest body, GitHost git) =>
{
    try
    {
        git.ApplyStash(body.Reference, body.Pop);
        return Results.Ok(git.GetStatus());
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/stash/drop", (NameRequest body, GitHost git) =>
{
    try
    {
        git.DropStash(body.Name);
        return Results.Ok(new { ok = true });
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/pull", (PullRequest? body, GitHost git, string repo) =>
{
    try
    {
        bool rebase = body?.Rebase ?? false;
        string id = git.StartJob("pull", ct => git.Pull(rebase, ct), rebase ? "git pull --rebase" : "git pull --ff-only");
        return Results.Accepted($"/repos/{repo}/jobs/{id}", new JobStartedDto(id, "pull"));
    }
    catch (RepoBusyException busy)
    {
        return Results.Json(new BusyResponse(busy.Message, busy.Running), statusCode: StatusCodes.Status409Conflict);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapPost("/push", (PushRequest? body, GitHost git, string repo) =>
{
    try
    {
        bool forceWithLease = body?.ForceWithLease ?? false;
        string id = git.StartJob("push", ct => git.Push(forceWithLease, ct), forceWithLease ? "git push --force-with-lease" : "git push");
        return Results.Accepted($"/repos/{repo}/jobs/{id}", new JobStartedDto(id, "push"));
    }
    catch (RepoBusyException busy)
    {
        return Results.Json(new BusyResponse(busy.Message, busy.Running), statusCode: StatusCodes.Status409Conflict);
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

repo.MapGet("/jobs/{id}", (string id, GitHost git) =>
    git.GetJob(id) is { } job ? Results.Ok(job) : Results.Json(new ErrorResponse("no such job"), statusCode: StatusCodes.Status404NotFound));

repo.MapGet("/jobs", (GitHost git) => Results.Ok(git.ListJobs()));

// Cancels a running job: the git process tree is killed and the job ends
// "failed" with cancelled=true. Listed with the job routes in the group
// filter so it does not queue behind the job's own write gate.
repo.MapPost("/jobs/{id}/cancel", (string id, GitHost git) =>
    git.CancelJob(id)
        ? Results.Ok(new { ok = true })
        : Results.Json(new ErrorResponse("no running job with that id"), statusCode: StatusCodes.Status404NotFound));

// Server-sent events: streams the repo's ChangeVersion whenever git metadata
// (HEAD, refs, packed-refs, index) changes on disk, so the UI live-refreshes
// on external git activity without polling the data endpoints.
repo.MapGet("/events", async (GitHost git, HttpContext ctx) =>
{
    ctx.Response.Headers.ContentType = "text/event-stream";
    ctx.Response.Headers.CacheControl = "no-cache";
    try
    {
        long last = git.ChangeVersion;
        await ctx.Response.WriteAsync($"data: {last}\n\n", ctx.RequestAborted);
        await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
        while (!ctx.RequestAborted.IsCancellationRequested)
        {
            await Task.Delay(500, ctx.RequestAborted);
            long version = git.ChangeVersion;
            if (version != last)
            {
                last = version;
                await ctx.Response.WriteAsync($"data: {version}\n\n", ctx.RequestAborted);
                await ctx.Response.Body.FlushAsync(ctx.RequestAborted);
            }
        }
    }
    catch (OperationCanceledException)
    {
        // Client disconnected; EventSource reconnects on its own.
    }
});

// Parent-death watchdog. If PowerGit's window process goes away without a
// clean shutdown - force-killed from Task Manager, `kill -9`, or a crash -
// Tauri never reaches RunEvent::Exit and so never kills this sidecar. The
// orphan keeps holding the engine port, and the NEXT launch fails with
// "address already in use": exactly the crash the owner reported on the
// v0.11.0 AppImage. Port probing (v0.12.0) recovers from it, but leaving a
// stray engine serving a dead UI is still wrong, so exit with our parent.
// No polling and no PID-reuse window: the handle is opened once, up front.
string? parentPidArg = builder.Configuration["parent-pid"];
if (int.TryParse(parentPidArg, out int parentPid))
{
    IHostApplicationLifetime lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
    _ = Task.Run(async () =>
    {
        try
        {
            using Process parent = Process.GetProcessById(parentPid);
            await parent.WaitForExitAsync();
        }
        catch
        {
            // Already exited, or not observable from here. Either way there
            // is no live parent to serve, so stop rather than linger.
        }

        lifetime.StopApplication();
    });
}

// v0.13.11: idle-session eviction. POWERGIT_SESSION_IDLE_MINUTES (default
// 30, 0 disables) — sessions with a running job and the last opened one are
// never evicted (RepoRegistry.PruneIdle).
int idleMinutes = int.TryParse(Environment.GetEnvironmentVariable("POWERGIT_SESSION_IDLE_MINUTES"), out int parsedIdle) ? parsedIdle : 30;
if (idleMinutes > 0)
{
    RepoRegistry registry = app.Services.GetRequiredService<RepoRegistry>();
    IHostApplicationLifetime pruneLifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
    _ = Task.Run(async () =>
    {
        using PeriodicTimer timer = new(TimeSpan.FromMinutes(1));
        try
        {
            while (await timer.WaitForNextTickAsync(pruneLifetime.ApplicationStopping))
            {
                foreach (string closed in registry.PruneIdle(TimeSpan.FromMinutes(idleMinutes)))
                {
                    Console.Error.WriteLine($"[engine] evicted idle session {closed}");
                }
            }
        }
        catch (OperationCanceledException)
        {
            // shutting down
        }
    });
}

app.Run();

public partial class Program;
