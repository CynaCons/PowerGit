using System.Net.Http.Json;
using System.Net.Http.Headers;
using Microsoft.AspNetCore.Mvc.Testing;

namespace PowerGit.Engine.Tests;

/// <summary>Every in-process client must present the engine token (EngineAuth.cs).</summary>
internal static class TestAuth
{
    public const string Token = "powergit-test-token";

    public static HttpClient CreateAuthedClient(this WebApplicationFactory<Program> factory)
    {
        // Program.cs reads the token when the host is built, which happens on
        // the first CreateClient; set it before that.
        Environment.SetEnvironmentVariable(EngineAuth.EnvVar, Token);
        HttpClient client = factory.CreateClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", Token);
        return client;
    }

    /// <summary>Opens a repo on the engine and returns its session id (routes live under /repos/{id}, v0.13.6).</summary>
    public static async Task<string> OpenSessionAsync(this HttpClient client, string root)
    {
        HttpResponseMessage opened = await client.PostAsJsonAsync("/repos/open", new OpenRepoRequest(root));
        opened.EnsureSuccessStatusCode();
        RepoInfo info = await opened.Content.ReadFromJsonAsync<RepoInfo>() ?? throw new InvalidOperationException("no repo info");
        return info.Id;
    }
}
