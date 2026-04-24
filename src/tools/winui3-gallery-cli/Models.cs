using System.Text.Json.Serialization;

[JsonSerializable(typeof(Scenario[]))]
[JsonSerializable(typeof(CorePattern[]))]
[JsonSerializable(typeof(Dictionary<string, string[]>))]
internal partial class JsonContext : JsonSerializerContext { }

internal sealed class Scenario
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("controlId")] public string ControlId { get; set; } = "";
    [JsonPropertyName("controlName")] public string ControlName { get; set; } = "";
    [JsonPropertyName("headerText")] public string HeaderText { get; set; } = "";
    [JsonPropertyName("xaml")] public string? Xaml { get; set; }
    [JsonPropertyName("csharp")] public string? CSharp { get; set; }
}

internal sealed class CorePattern
{
    [JsonPropertyName("id")] public string Id { get; set; } = "";
    [JsonPropertyName("scenario")] public string Scenario { get; set; } = "";
    [JsonPropertyName("tags")] public string[] Tags { get; set; } = [];
    [JsonPropertyName("description")] public string Description { get; set; } = "";
    [JsonPropertyName("prerequisites")] public string[] Prerequisites { get; set; } = [];
    [JsonPropertyName("xaml")] public string? Xaml { get; set; }
    [JsonPropertyName("csharp")] public string CSharp { get; set; } = "";
    [JsonPropertyName("notes")] public string[] Notes { get; set; } = [];
}
