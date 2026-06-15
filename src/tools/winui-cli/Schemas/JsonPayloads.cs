using System.Text.Json.Serialization;

namespace WinUi.Cli.Schemas;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
internal sealed class WinUiJsonSchemaAttribute(string schema) : Attribute
{
    public string Schema { get; } = schema;
}

[WinUiJsonSchema("winui.api.search.v1")]
internal sealed record ApiSearchResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.controls.search.v1")]
internal sealed record ControlsSearchResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.project.build.v1")]
internal sealed record ProjectBuildResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("buildSucceeded")] bool BuildSucceeded,
    [property: JsonPropertyName("runAttempted")] bool RunAttempted,
    [property: JsonPropertyName("outputDirectory")] string? OutputDirectory,
    [property: JsonPropertyName("exitCode")] int ExitCode);

[WinUiJsonSchema("winui.analyzer.info.v1")]
internal sealed record AnalyzerInfoResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("version")] string Version,
    [property: JsonPropertyName("rules")] string[] Rules,
    [property: JsonPropertyName("embeddedPayloadAvailable")] bool EmbeddedPayloadAvailable);

[WinUiJsonSchema("winui.error.v1")]
internal sealed record ErrorEnvelopeV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("error")] ErrorBodyV1 Error);

internal sealed record ErrorBodyV1(
    [property: JsonPropertyName("code")] string Code,
    [property: JsonPropertyName("message")] string Message);

[WinUiJsonSchema("winui.help.v1")]
internal sealed record HelpEnvelopeV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("usage")] string Usage,
    [property: JsonPropertyName("verbs")] HelpVerbV1[] Verbs,
    [property: JsonPropertyName("examples")] string[] Examples,
    [property: JsonPropertyName("tip")] string? Tip);

internal sealed record HelpVerbV1(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("usage")] string? Usage,
    [property: JsonPropertyName("hidden")] bool Hidden);

[JsonSerializable(typeof(ApiSearchResultV1))]
[JsonSerializable(typeof(ControlsSearchResultV1))]
[JsonSerializable(typeof(ProjectBuildResultV1))]
[JsonSerializable(typeof(AnalyzerInfoResultV1))]
[JsonSerializable(typeof(ErrorEnvelopeV1))]
[JsonSerializable(typeof(HelpEnvelopeV1))]
internal partial class WinUiJsonContext : JsonSerializerContext { }
