using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace PowerGit.Engine.Tests;

public sealed class ApiTests : IClassFixture<WebApplicationFactory<Program>>
{
    private readonly WebApplicationFactory<Program> _factory;

    public ApiTests(WebApplicationFactory<Program> factory)
    {
        _factory = factory.WithWebHostBuilder(_ => { });
    }

    [Fact]
    public async Task Health_ok()
    {
        HttpClient client = _factory.CreateClient();
        HttpResponseMessage response = await client.GetAsync("/health");
        response.EnsureSuccessStatusCode();
        HealthResponse? body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body.Status);
        Assert.Contains("git version", body.GitVersion, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Open_and_current_roundtrip()
    {
        HttpClient client = _factory.CreateClient();
        string root = FindRepoRoot();
        HttpResponseMessage opened = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(root));
        opened.EnsureSuccessStatusCode();
        RepoInfo? info = await opened.Content.ReadFromJsonAsync<RepoInfo>();
        Assert.NotNull(info);
        Assert.Equal("PowerGit", info.Name);

        HttpResponseMessage current = await client.GetAsync("/repos/current");
        current.EnsureSuccessStatusCode();
        RepoInfo? again = await current.Content.ReadFromJsonAsync<RepoInfo>();
        Assert.Equal(info.Root, again?.Root);
    }

    [Fact]
    public async Task Open_non_repo_is_400()
    {
        HttpClient client = _factory.CreateClient();
        string temp = Directory.CreateTempSubdirectory("powergit-api-not-repo-").FullName;
        try
        {
            HttpResponseMessage response = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(temp));
            Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        }
        finally
        {
            Directory.Delete(temp, recursive: true);
        }
    }

    private static string FindRepoRoot()
    {
        DirectoryInfo? cursor = new(AppContext.BaseDirectory);
        while (cursor is not null)
        {
            if (Directory.Exists(Path.Combine(cursor.FullName, ".git")))
            {
                return cursor.FullName;
            }

            cursor = cursor.Parent;
        }

        throw new DirectoryNotFoundException("Could not locate the PowerGit work tree.");
    }
}
