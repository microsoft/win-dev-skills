using System.Text.Json;
using System.Text.Json.Serialization;

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(List<string>))]
[JsonSerializable(typeof(List<WinMdTypeInfo>))]
[JsonSerializable(typeof(ProjectManifest))]
[JsonSerializable(typeof(PackageMeta))]
internal partial class WinMdJsonContext : JsonSerializerContext
{
}

// Concrete type to replace anonymous type for meta.json
sealed class PackageMeta
{
    public required string PackageId { get; init; }
    public required string Version { get; init; }
    public required List<string> WinMdFiles { get; init; }
    public required int TotalTypes { get; init; }
    public required int TotalMembers { get; init; }
    public required int TotalNamespaces { get; init; }
    public required string GeneratedAt { get; init; }
}
