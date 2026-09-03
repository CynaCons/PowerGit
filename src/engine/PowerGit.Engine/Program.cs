using PowerGit.Engine;

const string engineVersion = "0.12.1"; // keep in sync with tauri.conf.json / package.json (see release skill)

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);

string? url = Environment.GetEnvironmentVariable("POWERGIT_ENGINE_URL");
if (!string.IsNullOrWhiteSpace(url))
{
    builder.WebHost.UseUrls(url);
}

builder.Services.AddSingleton<GitHost>(_ =>
{
    string? git = Environment.GetEnvironmentVariable("GIT_EXECUTABLE");
    GitHost host = string.IsNullOrWhiteSpace(git) ? new GitHost() : new GitHost(git);
    try
    {
        host.TryDiscover(Directory.GetCurrentDirectory());
        if (host.Current is null)
        {
            host.TryDiscover(AppContext.BaseDirectory);
        }
    }
    catch
    {
        // Discovery is best-effort.
    }

    return host;
});
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

WebApplication app = builder.Build();
app.UseCors();

app.MapGet("/health", (GitHost git) =>
{
    try
    {
        GitVersion version = git.Version();
        return Results.Ok(new HealthResponse(engineVersion, "ok", git.GitPath, version.Raw));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status503ServiceUnavailable);
    }
});

app.MapPost("/repos/open", (OpenRepoRequest body, GitHost git) =>
{
    if (string.IsNullOrWhiteSpace(body.Path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.Open(body.Path));
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

app.MapGet("/repos/current", (GitHost git) =>
    git.Current is null
        ? Results.Json(new ErrorResponse("no repository open"), statusCode: StatusCodes.Status404NotFound)
        : Results.Ok(git.Current));

app.MapGet("/repos/recents", () => Results.Ok(RecentsStore.List()));

app.MapGet("/revisions", (GitHost git, int? max, int? skip) =>
{
    try
    {
        return Results.Ok(git.ListRevisions(max ?? 800, skip ?? 0));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/commits/{id}", (string id, GitHost git) =>
{
    try
    {
        return Results.Ok(git.GetCommit(id));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/commits/{id}/files", (string id, GitHost git) =>
{
    try
    {
        return Results.Ok(git.ListFiles(id));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/commits/{id}/tree", (string id, string? path, GitHost git) =>
{
    try
    {
        return Results.Ok(git.ListTree(id, path));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/commits/{id}/diff", (string id, string path, GitHost git, int? context, bool? ws, bool? full) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetDiff(id, path, context ?? 3, ws ?? false, full ?? false));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/commits/{id}/blob", (string id, string path, GitHost git) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetBlob(id, path));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/diff/worktree", (string path, bool staged, GitHost git, int? context, bool? ws, bool? full) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetWorkTreeDiff(path, staged, context ?? 3, ws ?? false, full ?? false));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapPost("/files/delete", (FilesDeleteRequest body, GitHost git) =>
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

app.MapPost("/ignore", (IgnoreRequest body, GitHost git) =>
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

app.MapPost("/ignore/preview", (IgnoreRequest body, GitHost git) =>
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

app.MapGet("/remotes", (GitHost git) =>
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

app.MapPut("/remotes", (RemoteUpdate body, GitHost git) =>
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

app.MapPost("/fetch", (FetchRequest body, GitHost git) =>
{
    if (string.IsNullOrWhiteSpace(body.Remote))
    {
        return Results.BadRequest(new ErrorResponse("remote is required"));
    }

    try
    {
        string id = git.StartJob("fetch", () => git.FetchRemote(body.Remote));
        return Results.Accepted($"/jobs/{id}", new JobStartedDto(id, "fetch"));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapPost("/branches/create", (CreateRefRequest body, GitHost git) =>
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

app.MapPost("/tags/create", (CreateRefRequest body, GitHost git) =>
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

app.MapPost("/branches/delete", (NameRequest body, GitHost git) =>
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

app.MapPost("/tags/delete", (NameRequest body, GitHost git) =>
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

app.MapGet("/status", (GitHost git) =>
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

app.MapGet("/refs", (GitHost git) =>
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

app.MapGet("/config", (GitHost git) =>
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

app.MapPut("/config", (GitConfigUpdate body, GitHost git) =>
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

app.MapGet("/tools/vscode", () => Results.Ok(VsCodeLocator.Detect()));

app.MapPost("/tools/vscode", (GitHost git) =>
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
app.MapPost("/difftool", (DifftoolRequest body, GitHost git) =>
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

app.MapPost("/stage", (StageRequest body, GitHost git) =>
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

app.MapPost("/commit", (CommitRequest body, GitHost git) =>
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

app.MapPost("/checkout", (CheckoutRequest body, GitHost git) =>
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

app.MapPost("/reset", (ResetRequest body, GitHost git) =>
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

app.MapPost("/rebase", (RebaseRequest body, GitHost git) =>
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

app.MapPost("/commits/{id}/cherry-pick", (string id, GitHost git) =>
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

app.MapPost("/commits/{id}/revert", (string id, GitHost git) =>
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

app.MapGet("/stashes", (GitHost git) =>
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

app.MapPost("/stash", (StashRequest body, GitHost git) =>
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

app.MapPost("/stash/apply", (StashApplyRequest body, GitHost git) =>
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

app.MapPost("/stash/drop", (NameRequest body, GitHost git) =>
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

app.MapPost("/pull", (PullRequest? body, GitHost git) =>
{
    try
    {
        bool rebase = body?.Rebase ?? false;
        string id = git.StartJob("pull", () => git.Pull(rebase));
        return Results.Accepted($"/jobs/{id}", new JobStartedDto(id, "pull"));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapPost("/push", (PushRequest? body, GitHost git) =>
{
    try
    {
        bool forceWithLease = body?.ForceWithLease ?? false;
        string id = git.StartJob("push", () => git.Push(forceWithLease));
        return Results.Accepted($"/jobs/{id}", new JobStartedDto(id, "push"));
    }
    catch (Exception ex)
    {
        return Results.Json(new ErrorResponse(ex.Message), statusCode: StatusCodes.Status400BadRequest);
    }
});

app.MapGet("/jobs/{id}", (string id, GitHost git) =>
    git.GetJob(id) is { } job ? Results.Ok(job) : Results.Json(new ErrorResponse("no such job"), statusCode: StatusCodes.Status404NotFound));

app.MapGet("/jobs", (GitHost git) => Results.Ok(git.ListJobs()));

// Server-sent events: streams the repo's ChangeVersion whenever git metadata
// (HEAD, refs, packed-refs, index) changes on disk, so the UI live-refreshes
// on external git activity without polling the data endpoints.
app.MapGet("/events", async (GitHost git, HttpContext ctx) =>
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

app.Run();

public partial class Program;
