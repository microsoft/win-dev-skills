using System.Collections.Immutable;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace WinUI3.Analyzer.Rules;

/// <summary>
/// WUI002: Detects WebView2 method calls (NavigateToString, CoreWebView2 access) without
/// a corresponding EnsureCoreWebView2Async() call in the same class.
/// 
/// WebView2 silently fails if you call NavigateToString() before initialization.
/// This is the #4 most frequent issue in WinUI3 benchmarks (4/15 sessions).
/// </summary>
[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class WebView2InitAnalyzer : DiagnosticAnalyzer
{
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticIds.WebView2NoInit,
        "WebView2 used without initialization",
        "'{0}' called but no EnsureCoreWebView2Async() found in this class — WebView2 will silently fail",
        "WinUI3.Runtime",
        DiagnosticSeverity.Warning,
        isEnabledByDefault: true,
        description: "WebView2.NavigateToString() and CoreWebView2 property access silently fail if " +
                     "EnsureCoreWebView2Async() hasn't completed. Always await initialization first.");

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics =>
        ImmutableArray.Create(Rule);

    private static readonly string[] WebView2Methods = {
        "NavigateToString", "Navigate", "PostWebMessageAsString",
        "PostWebMessageAsJson", "ExecuteScriptAsync"
    };

    public override void Initialize(AnalysisContext context)
    {
        context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        context.EnableConcurrentExecution();
        context.RegisterSyntaxNodeAction(AnalyzeClass, SyntaxKind.ClassDeclaration);
    }

    private static void AnalyzeClass(SyntaxNodeAnalysisContext context)
    {
        var classDecl = (ClassDeclarationSyntax)context.Node;

        // Check if the class contains EnsureCoreWebView2Async
        var hasInit = classDecl.DescendantNodes()
            .OfType<InvocationExpressionSyntax>()
            .Any(inv => inv.Expression.ToString().Contains("EnsureCoreWebView2Async"));

        if (hasInit) return;

        // Check if class has CoreWebView2Initialized event handler
        var hasInitEvent = classDecl.DescendantNodes()
            .OfType<MemberAccessExpressionSyntax>()
            .Any(ma => ma.Name.Identifier.Text == "CoreWebView2Initialized");

        if (hasInitEvent) return;

        // Find WebView2 method calls without init
        var webViewCalls = classDecl.DescendantNodes()
            .OfType<MemberAccessExpressionSyntax>()
            .Where(ma => WebView2Methods.Contains(ma.Name.Identifier.Text) ||
                         ma.Name.Identifier.Text == "CoreWebView2");

        foreach (var call in webViewCalls)
        {
            // Try to verify this is actually on a WebView2 via semantic model
            var exprType = context.SemanticModel.GetTypeInfo(call.Expression).Type;
            if (exprType != null)
            {
                var typeName = exprType.ToDisplayString();
                if (!typeName.Contains("WebView2") && !typeName.Contains("CoreWebView2"))
                    continue;
            }
            else
            {
                // Can't resolve type — use name heuristic
                var exprText = call.Expression.ToString().ToLowerInvariant();
                if (!exprText.Contains("webview") && !exprText.Contains("corewebview"))
                    continue;
            }

            context.ReportDiagnostic(Diagnostic.Create(
                Rule,
                call.GetLocation(),
                call.Name.Identifier.Text));
            break; // One warning per class is enough
        }
    }
}
