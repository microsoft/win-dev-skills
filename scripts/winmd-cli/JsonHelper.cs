using System.Text.Json;
using System.Text.Json.Serialization;

internal static class JsonHelper
{
    public static readonly JsonSerializerOptions WriteOptions = new JsonSerializerOptions
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        TypeInfoResolver = WinMdJsonContext.Default,
    };

    public static readonly JsonSerializerOptions ReadOptions = new JsonSerializerOptions
    {
        PropertyNameCaseInsensitive = true,
        TypeInfoResolver = WinMdJsonContext.Default,
    };
}
