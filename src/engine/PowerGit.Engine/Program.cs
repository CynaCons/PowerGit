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

app.MapGet("/commits/{id}/diff", (string id, string path, GitHost git) =>
{
    if (string.IsNullOrWhiteSpace(path))
    {
        return Results.BadRequest(new ErrorResponse("path is required"));
    }

    try
    {
        return Results.Ok(git.GetDiff(id, path));
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

app.Run();

public partial class Program;
