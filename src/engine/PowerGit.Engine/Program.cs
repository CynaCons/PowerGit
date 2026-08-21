using PowerGit.Engine;

const string engineVersion = "0.4.0";

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

app.MapGet("/revisions", (GitHost git, int? max) =>
{
    try
    {
        return Results.Ok(git.ListRevisions(max ?? 800));
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
    try
    {
        string output = git.FetchRemote(body.Remote);
        return Results.Ok(new { output });
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
        string id = git.Commit(body.Message);
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

app.Run();

public partial class Program;
