namespace WinUI3.Analyzer;

/// <summary>Diagnostic IDs for all WinUI 3 analyzer rules.</summary>
internal static class DiagnosticIds
{
    public const string TabViewRawContent = "WUI001";
    public const string WebView2NoInit = "WUI002";
    public const string UwpXamlNamespace = "WUI003";
    public const string WindowCurrent = "WUI004";
    public const string CoreDispatcher = "WUI005";
    public const string GetForCurrentView = "WUI006";
    public const string OldMvvmSyntax = "WUI008";
    public const string AttachedPropertyInitializer = "WUI012";
    public const string GenAiSetInputSequences = "WUI013";
    public const string GenAiComputeLogits = "WUI014";
    public const string GenAiTokenizerStreamCtor = "WUI015";
    public const string NullConverter = "WUI016";
}
