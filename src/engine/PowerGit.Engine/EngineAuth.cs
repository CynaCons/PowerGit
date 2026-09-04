using System.Security.Cryptography;
using System.Text;

namespace PowerGit.Engine;

/// <summary>
/// Bearer-token gate for every route except <c>GET /health</c> (the Tauri
/// shell's port probe) and CORS preflights. The engine runs git with the
/// user's credentials on 127.0.0.1, which any web page can reach, so a
/// per-launch secret is what keeps a drive-by page from calling /reset.
/// <c>/events</c> is an EventSource and cannot send headers, so it accepts
/// the token as a <c>?token=</c> query parameter instead.
/// </summary>
public sealed class EngineAuth(RequestDelegate next, string token)
{
    public const string EnvVar = "POWERGIT_ENGINE_TOKEN";

    private readonly byte[] _token = Encoding.UTF8.GetBytes(token);

    public static string ResolveToken(string? cliToken)
    {
        string? fromEnv = Environment.GetEnvironmentVariable(EnvVar);
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv.Trim();
        }

        if (!string.IsNullOrWhiteSpace(cliToken))
        {
            return cliToken.Trim();
        }

        string generated = RandomNumberGenerator.GetHexString(64, lowercase: true);
        Console.Error.WriteLine($"[engine] {EnvVar} not set; generated token {generated}");
        Console.Error.WriteLine("[engine] clients must send it as 'Authorization: Bearer <token>'");
        return generated;
    }

    public async Task InvokeAsync(HttpContext ctx)
    {
        if (HttpMethods.IsOptions(ctx.Request.Method) || ctx.Request.Path == "/health")
        {
            await next(ctx);
            return;
        }

        string? presented = null;
        string auth = ctx.Request.Headers.Authorization.ToString();
        if (auth.StartsWith("Bearer ", StringComparison.Ordinal))
        {
            presented = auth["Bearer ".Length..].Trim();
        }
        else if (ctx.Request.Path.Value?.EndsWith("/events", StringComparison.Ordinal) == true) // /repos/{id}/events
        {
            presented = ctx.Request.Query["token"];
        }

        if (presented is null || !Matches(presented))
        {
            ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
            await ctx.Response.WriteAsJsonAsync(new ErrorResponse("missing or invalid engine token"));
            return;
        }

        await next(ctx);
    }

    private bool Matches(string presented)
    {
        byte[] bytes = Encoding.UTF8.GetBytes(presented);
        return bytes.Length == _token.Length && CryptographicOperations.FixedTimeEquals(bytes, _token);
    }
}
