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

// The remaining api verbs all wrap their underlying CLI's text output today.
// Modeling each as a distinct [WinUiJsonSchema] type so the `schema` discriminator
// in the JSON payload corresponds to a committed `.schema.json` file (and so the
// drift gate fires when a verb's shape changes — including future PRs that add
// structured fields to a specific verb without touching the others).

[WinUiJsonSchema("winui.api.update.v1")]
internal sealed record ApiUpdateResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.members.v1")]
internal sealed record ApiMembersResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.types.v1")]
internal sealed record ApiTypesResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.enums.v1")]
internal sealed record ApiEnumsResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.check-property.v1")]
internal sealed record ApiCheckPropertyResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.namespaces.v1")]
internal sealed record ApiNamespacesResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.packages.v1")]
internal sealed record ApiPackagesResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.projects.v1")]
internal sealed record ApiProjectsResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.api.stats.v1")]
internal sealed record ApiStatsResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.controls.search.v1")]
internal sealed record ControlsSearchResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.controls.get.v1")]
internal sealed record ControlsGetResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.controls.list.v1")]
internal sealed record ControlsListResultV1(
    [property: JsonPropertyName("schema")] string Schema,
    [property: JsonPropertyName("exitCode")] int ExitCode,
    [property: JsonPropertyName("output")] string Output);

[WinUiJsonSchema("winui.controls.update.v1")]
internal sealed record ControlsUpdateResultV1(
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
[JsonSerializable(typeof(ApiUpdateResultV1))]
[JsonSerializable(typeof(ApiMembersResultV1))]
[JsonSerializable(typeof(ApiTypesResultV1))]
[JsonSerializable(typeof(ApiEnumsResultV1))]
[JsonSerializable(typeof(ApiCheckPropertyResultV1))]
[JsonSerializable(typeof(ApiNamespacesResultV1))]
[JsonSerializable(typeof(ApiPackagesResultV1))]
[JsonSerializable(typeof(ApiProjectsResultV1))]
[JsonSerializable(typeof(ApiStatsResultV1))]
[JsonSerializable(typeof(ControlsSearchResultV1))]
[JsonSerializable(typeof(ControlsGetResultV1))]
[JsonSerializable(typeof(ControlsListResultV1))]
[JsonSerializable(typeof(ControlsUpdateResultV1))]
[JsonSerializable(typeof(ProjectBuildResultV1))]
[JsonSerializable(typeof(AnalyzerInfoResultV1))]
[JsonSerializable(typeof(ErrorEnvelopeV1))]
[JsonSerializable(typeof(HelpEnvelopeV1))]
internal partial class WinUiJsonContext : JsonSerializerContext { }
