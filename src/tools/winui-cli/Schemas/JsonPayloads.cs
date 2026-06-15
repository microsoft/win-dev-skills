using System.Text.Json.Serialization;

namespace WinUi.Cli.Schemas;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Struct)]
internal sealed class WinUiJsonSchemaAttribute(string schema) : Attribute
{
    public string Schema { get; } = schema;
}

// Shared shape for verbs whose payload is just "the inner CLI's text output, with
// an exit code." Previously each such verb had its own [WinUiJsonSchema] record
// (15+ of them), all byte-identical except for the schema discriminator string.
// That was contract theater — distinct schema files conveying no distinct
// information. The honest model is one shape + a `verb` discriminator field.
// Consumers dispatch on `verb`; schema validators check shape via the single
// committed winui.text-result.v1 schema.
//
// If a specific verb's payload ever grows real structure (typed fields beyond
// opaque text), promote it out of this wrapper into its own [WinUiJsonSchema]
// record at that point.
[WinUiJsonSchema("winui.text-result.v1")]
internal sealed record TextResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("verb")] string Verb,
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

[JsonSerializable(typeof(TextResultV1))]
[JsonSerializable(typeof(ProjectBuildResultV1))]
[JsonSerializable(typeof(AnalyzerInfoResultV1))]
[JsonSerializable(typeof(ErrorEnvelopeV1))]
[JsonSerializable(typeof(HelpEnvelopeV1))]
internal partial class WinUiJsonContext : JsonSerializerContext { }
